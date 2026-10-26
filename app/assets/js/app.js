/* ============================================================================
 *  app.js — Orquestación del laboratorio
 *
 *  Mantiene el estado del escenario, encadena las tres etapas del modelo en
 *  cada recálculo y sincroniza mapa, paneles e indicadores.
 *
 *      nodos ──► Etapa 1  ∇f = 0, Hessiana
 *            ──► Etapa 1-m  alternancia de Cooper (m centros)
 *            ──► Etapa 2  KKT sobre g(x,y) ≤ 0
 *            ──► Etapa 3  transporte (Vogel + MODI) y comparación con VMC
 * ==========================================================================*/
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ======================================================================
   *  Estado
   * ==================================================================== */
  const DEFECTOS = {
    m: 4,
    semilla: 7,
    intensidad: 2.5,          // Mbps por cada 1000 habitantes
    holgura: 1.15,            // ΣB / Σd
    reparto: 'uniforme',
    tarifa: 0.08,             // $ por Mbps·km
    metricaCosto: 'euclidiana',
    alphaCampo: 0.55,
    colormap: 'inferno',
    metricaCampo: 'cuadratica'
  };

  const estado = {
    nodos: [],
    ...DEFECTOS,
    region: {
      activa: true,
      tipo: 'circulo',
      centro: { ...Datos.REGION_DEFECTO.centro },   // en grados
      radioKm: Datos.REGION_DEFECTO.radioKm,
      angulo: 0
    },
    regionObj: null,
    aplicarRegionMulti: false,
    factorB: [],
    capas: {
      campo: true, contornos: true, voronoi: true, asign: true,
      ref: true, etiquetas: true, optimos: true, weber: false
    },
    r1: null, r2: null, rMulti: null, rLP: null, rWeber: null,
    nodoActivo: null, nodoArrastrado: null,
    trayectoria: null, trayectoriaPaso: 0,
    firmaNodos: '',
    campoCache: null,
    seleccion: null,
    pestanaActiva: 'p-etapa1'
  };

  let motor = null;
  let temporizadorSensibilidad = null;

  /* ======================================================================
   *  Preparación de los nodos: geografía -> plano local, población -> tráfico
   * ==================================================================== */
  function construirNodos() {
    estado.nodos = Datos.NODOS.map((n) => {
      const l = Geo.toLocal(n.lat, n.lon);
      return { ...n, x: l.x, y: l.y, d: 0, w: 0 };
    });
    actualizarDemanda();
  }

  function actualizarDemanda() {
    for (const n of estado.nodos) {
      n.d = Math.round(n.pob / 1000 * estado.intensidad);
      n.w = n.d;                    // el documento permite tomar w_i = d_i
      const g = Geo.toGeo(n.x, n.y);
      n.lat = g.lat; n.lon = g.lon; // coherencia tras arrastrar un nodo
    }
    estado.firmaNodos = estado.nodos.map(n => `${n.x.toFixed(3)},${n.y.toFixed(3)},${n.d}`).join(';');
  }

  /* ======================================================================
   *  Construcción del objeto de región factible
   * ==================================================================== */
  function construirRegion() {
    const c = Geo.toLocal(estado.region.centro.lat, estado.region.centro.lon);
    if (estado.region.tipo === 'circulo') {
      estado.regionObj = Opt.Regiones.circulo(c, estado.region.radioKm);
    } else {
      // Semiplano a·p ≤ a·c, con a girando según el control de orientación.
      const th = estado.region.angulo * Math.PI / 180;
      const a = { x: Math.cos(th), y: Math.sin(th) };
      estado.regionObj = Opt.Regiones.semiplano(a, a.x * c.x + a.y * c.y);
    }
  }

  /* ======================================================================
   *  Cadena de recálculo
   * ==================================================================== */
  function recalcular(opciones = {}) {
    const { sensibilidad = false } = opciones;

    actualizarDemanda();
    construirRegion();

    // --- Etapa 1 ---
    estado.r1 = Opt.etapa1(estado.nodos);
    estado.rWeber = estado.capas.weber ? Opt.weiszfeld(estado.nodos) : null;

    // --- Etapa 2 ---
    estado.r2 = estado.region.activa
      ? Opt.etapa2(estado.nodos, estado.regionObj, estado.r1)
      : null;

    // --- Etapa 1-m / 2-m: ubicación de los m centros ---
    estado.rMulti = Opt.multicentro(estado.nodos, estado.m, {
      region: estado.region.activa ? estado.regionObj : null,
      aplicarRegion: estado.region.activa && estado.aplicarRegionMulti,
      semilla: estado.semilla
    });

    // --- Anchos de banda ---
    const anchos = calcularAnchos();

    // --- Etapa 3 ---
    estado.rLP = Transporte.resolver(estado.nodos, estado.rMulti.centros, anchos, {
      tarifa: estado.tarifa,
      metrica: estado.metricaCosto
    });
    estado.anchos = anchos;

    pintarTodo();
    if (sensibilidad || estado.pestanaActiva === 'p-sens') programarSensibilidad();
    motor && motor.invalidar();
  }

  function calcularAnchos() {
    const m = estado.rMulti.centros.length;
    if (estado.factorB.length !== m) estado.factorB = new Array(m).fill(1);

    const demandaTotal = estado.nodos.reduce((a, n) => a + n.d, 0);
    const capacidadTotal = demandaTotal * estado.holgura;

    let base;
    if (estado.reparto === 'uniforme') {
      base = new Array(m).fill(capacidadTotal / m);
    } else {
      // Proporcional a la demanda que cada centro atrae por cercanía.
      const cargas = estado.rMulti.detalle.map(d => Math.max(d.demanda, 1));
      const suma = cargas.reduce((a, b) => a + b, 0);
      base = cargas.map(c => capacidadTotal * c / suma);
    }
    return base.map((b, j) => Math.max(1, Math.round(b * estado.factorB[j])));
  }

  /* ======================================================================
   *  Mapa y capas
   * ==================================================================== */
  function iniciarMapa() {
    motor = new MapEngine($('#mapa'), {
      lat: Datos.VISTA.lat, lon: Datos.VISTA.lon, zoom: Datos.VISTA.zoom,
      minZoom: 9, maxZoom: 16, estilo: 'oscuro'
    });

    motor.agregarCapa('reserva-etiquetas', Capas.capaReservaEtiquetas(estado));
    motor.agregarCapa('campo', Capas.capaCampo(estado));
    motor.agregarCapa('voronoi', Capas.capaVoronoi(estado), estado.capas.voronoi);
    motor.agregarCapa('referencia', Capas.capaReferencia(estado), estado.capas.ref);
    motor.agregarCapa('region', Capas.capaRegion(estado));
    motor.agregarCapa('manijas', capaManijas(), true);
    motor.agregarCapa('asignaciones', Capas.capaAsignaciones(estado), estado.capas.asign);
    motor.agregarCapa('nodos', Capas.capaNodos(estado));
    motor.agregarCapa('centros', Capas.capaCentros(estado));
    motor.agregarCapa('decoracion', Capas.capaDecoracion(estado, motor));

    instalarInteraccion();
  }

  /** Marcador arrastrable del centro de la región factible. */
  function capaManijas() {
    return (ctx, v) => {
      if (!estado.region.activa) return;
      const c = Geo.toLocal(estado.region.centro.lat, estado.region.centro.lon);
      const p = v.projKm(c.x, c.y);
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,16,23,.9)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3ddc84';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 3.5, p.y); ctx.lineTo(p.x + 3.5, p.y);
      ctx.moveTo(p.x, p.y - 3.5); ctx.lineTo(p.x, p.y + 3.5);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
      estado._centroRegionPx = p;
    };
  }

  /* ----------------------------------------------------------------------
   *  Interacción sobre el lienzo
   * -------------------------------------------------------------------- */
  function radioNodo(n) {
    const dMax = Math.max(...estado.nodos.map(k => k.d), 1);
    return 4 + 11 * Math.sqrt(n.d / dMax);
  }

  function nodoEn(p, v) {
    for (let i = estado.nodos.length - 1; i >= 0; i--) {
      const n = estado.nodos[i];
      const q = v.projKm(n.x, n.y);
      if (Math.hypot(q.x - p.px, q.y - p.py) <= radioNodo(n) + 4) return i;
    }
    return -1;
  }

  function centroEn(p, v) {
    if (!estado.rMulti) return -1;
    for (let j = 0; j < estado.rMulti.centros.length; j++) {
      const q = v.projKm(estado.rMulti.centros[j].x, estado.rMulti.centros[j].y);
      if (Math.hypot(q.x - p.px, q.y - p.py) <= 13) return j;
    }
    return -1;
  }

  function instalarInteraccion() {
    let modo = null, movido = false, inicio = null;

    motor.on('down', (p) => {
      const v = motor.vista();
      movido = false; inicio = { x: p.px, y: p.py };

      if (estado.region.activa) {
        // Manija de radio (solo en el disco)
        const h = estado._handleRegion;
        if (estado.region.tipo === 'circulo' && h && Math.hypot(h.x - p.px, h.y - p.py) <= 10) {
          modo = { tipo: 'radio' };
          return true;
        }
        const c = estado._centroRegionPx;
        if (c && Math.hypot(c.x - p.px, c.y - p.py) <= 11) {
          modo = { tipo: 'region' };
          return true;
        }
      }

      const i = nodoEn(p, v);
      if (i >= 0) {
        modo = { tipo: 'nodo', i };
        estado.nodoArrastrado = i;
        return true;
      }

      const j = centroEn(p, v);
      if (j >= 0) { modo = { tipo: 'centro', j }; return true; }

      modo = null;
      return false;
    });

    motor.on('move', (p) => {
      if (!modo) return;
      if (inicio && Math.hypot(p.px - inicio.x, p.py - inicio.y) > 3) movido = true;

      if (modo.tipo === 'nodo') {
        const n = estado.nodos[modo.i];
        n.x = p.km.x; n.y = p.km.y;
        recalcular();
      } else if (modo.tipo === 'region') {
        estado.region.centro = { lat: p.lat, lon: p.lon };
        recalcular();
      } else if (modo.tipo === 'radio') {
        const c = Geo.toLocal(estado.region.centro.lat, estado.region.centro.lon);
        const r = Math.hypot(p.km.x - c.x, p.km.y - c.y);
        estado.region.radioKm = Math.max(0.5, Math.min(25, r));
        $('#region-radio').value = estado.region.radioKm.toFixed(1);
        sincronizarRangos();
        $('#radio-valor').textContent = estado.region.radioKm.toFixed(2) + ' km';
        recalcular();
      }
    });

    motor.on('up', (p) => {
      if (modo && !movido) {
        if (modo.tipo === 'nodo') mostrarInspectorNodo(modo.i);
        else if (modo.tipo === 'centro') mostrarInspectorCentro(modo.j);
      }
      if (modo && movido) recalcular({ sensibilidad: true });
      estado.nodoArrastrado = null;
      modo = null;
      motor.invalidar();
    });

    motor.on('hover', (p) => {
      const v = motor.vista();
      const i = nodoEn(p, v);
      if (i !== estado.nodoActivo) { estado.nodoActivo = i >= 0 ? i : null; motor.invalidar(); }
      $('#mapa').style.cursor = i >= 0 ? 'pointer' : 'grab';

      $('#hud-geo').textContent = `${p.lat.toFixed(5)}°, ${p.lon.toFixed(5)}°`;
      $('#hud-km').textContent = `x = ${p.km.x.toFixed(2)} km   y = ${p.km.y.toFixed(2)} km`;
      const fv = Campo.evaluador(estado.nodos, estado.metricaCampo)(p.km.x, p.km.y);
      $('#hud-f').textContent = formatoCorto(fv) + (estado.metricaCampo === 'weber' ? ' Mbps·km' : ' Mbps·km²');
    });
  }

  /* ======================================================================
   *  Formato
   * ==================================================================== */
  function formatoCorto(v) {
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(2) + ' G';
    if (a >= 1e6) return (v / 1e6).toFixed(2) + ' M';
    if (a >= 1e3) return (v / 1e3).toFixed(2) + ' k';
    if (a >= 1) return v.toFixed(2);
    if (a === 0) return '0';
    return v.toPrecision(3);
  }

  function miles(v) { return Math.round(v).toLocaleString('es-CO'); }

  function pct(v) { return (v * 100).toFixed(1) + ' %'; }

  /* ======================================================================
   *  Registro de la capa de presentación
   *  app.js no sabe cómo se dibujan los paneles; ui.js registra aquí sus
   *  funciones de render. Así el núcleo de cálculo queda independiente del DOM.
   * ==================================================================== */
  const ui = {
    render: () => {},
    renderSensibilidad: () => {},
    inspectorNodo: () => {},
    inspectorCentro: () => {}
  };

  function registrarUI(fns) { Object.assign(ui, fns); }

  function programarSensibilidad() {
    clearTimeout(temporizadorSensibilidad);
    temporizadorSensibilidad = setTimeout(() => ui.renderSensibilidad(), 160);
  }

  function pintarTodo() { ui.render(); }

  function mostrarInspectorNodo(i) { ui.inspectorNodo(i); }
  function mostrarInspectorCentro(j) { ui.inspectorCentro(j); }

  /** Repinta el relleno de los deslizadores según su valor actual. */
  function sincronizarRangos() {
    $$('input[type=range]').forEach((r) => {
      const p = (r.value - r.min) / (r.max - r.min) * 100;
      r.style.setProperty('--pct', p + '%');
    });
  }

  /* ======================================================================
   *  API pública del núcleo
   * ==================================================================== */
  window.App = {
    estado, DEFECTOS,
    construirNodos, iniciarMapa, recalcular, calcularAnchos,
    registrarUI, sincronizarRangos, programarSensibilidad,
    formatoCorto, miles, pct,
    get motor() { return motor; },
    $, $$
  };
})();
