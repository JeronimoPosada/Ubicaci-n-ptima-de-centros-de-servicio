/* ============================================================================
 *  ui.js — Capa de presentación
 *
 *  Traduce el estado del modelo a los paneles de resultados, los gráficos y
 *  los indicadores. No contiene matemática: solo lee lo que las tres etapas
 *  ya calcularon y lo presenta.
 * ==========================================================================*/
(function () {
  'use strict';

  const App = window.App;
  const { estado, $, $$, formatoCorto, miles, pct } = App;
  const col = Capas.col;

  /* ----------------------------- Utilidades --------------------------- */

  const dato = (et, vl, clase = '') =>
    `<div class="dato"><span class="et">${et}</span><span class="vl ${clase}">${vl}</span></div>`;

  const km = (v) => v.toFixed(3) + ' km';

  function geoTexto(p) {
    const g = Geo.toGeo(p.x, p.y);
    return `${g.lat.toFixed(5)}°, ${g.lon.toFixed(5)}°`;
  }

  /* ======================================================================
   *  ETAPA 1
   * ==================================================================== */
  function renderEtapa1() {
    const r = estado.r1;
    if (!r) return;

    $('#e1-datos').innerHTML =
      dato('Nodos de demanda <code>n</code>', estado.nodos.length) +
      dato('Peso total <code>W = Σ w<sub>i</sub></code>', miles(r.W) + ' Mbps') +
      dato('Óptimo <code>(x*, y*)</code>', `(${r.p.x.toFixed(3)}, ${r.p.y.toFixed(3)}) km`, 'acento') +
      dato('Coordenadas geográficas', geoTexto(r.p), 'acento') +
      dato('<code>f(x*, y*)</code>', formatoCorto(r.f) + ' Mbps·km²', 'grande') +
      dato('<code>‖∇f(x*, y*)‖</code>', r.normaGrad.toExponential(2), r.normaGrad < 1e-6 ? 'verde' : 'rosa');

    $('#e1-hessiana').innerHTML = `
      <div class="matriz-envoltura">
        <div class="matriz">
          <span>${formatoCorto(r.H[0][0])}</span><span>0</span>
          <span>0</span><span>${formatoCorto(r.H[1][1])}</span>
        </div>
        <div class="matriz-info">
          <div>∂²f/∂x² = <b>${formatoCorto(r.menorPrincipal1)}</b></div>
          <div>det H = <b>${formatoCorto(r.detH)}</b></div>
          <div>tr H = <b>${formatoCorto(r.traza)}</b></div>
          <div>autovalores = <b>{${formatoCorto(r.autovalores[0])}, ${formatoCorto(r.autovalores[1])}}</b></div>
        </div>
      </div>`;

    $('#e1-veredicto').className = 'veredicto' + (r.definidaPositiva ? '' : ' malo');
    $('#e1-veredicto').innerHTML =
      `<span class="icono">${r.definidaPositiva ? '✓' : '✕'}</span>
       <span>${r.criterio}. La Hessiana es <b>constante</b> (no depende de <code>x</code> ni de <code>y</code>),
       de modo que <code>f</code> es convexa en todo el plano y el mínimo local es también el global.</span>`;

    // --- Agrupamiento en m centros ---
    const M = estado.rMulti;
    $('#e1-m').textContent = M.centros.length;

    const unCentro = Opt.etapa1(estado.nodos).f;
    const mejora = unCentro > 0 ? (unCentro - M.costoTotal) / unCentro : 0;

    $('#e1-cooper').innerHTML =
      dato('Iteraciones hasta converger', M.iteraciones) +
      dato('Costo de ubicación <code>Σ w<sub>i</sub> d²</code>', formatoCorto(M.costoTotal) + ' Mbps·km²', 'acento') +
      dato('Con un solo centro', formatoCorto(unCentro) + ' Mbps·km²') +
      dato(`Reducción al pasar a ${M.centros.length} centros`, pct(mejora), 'verde') +
      dato('Nodos por centro', M.detalle.map(d => d.nNodos).join(' · '));

    dibujarConvergencia(M.historia);
  }

  function dibujarConvergencia(historia) {
    const c = $('#g-convergencia');
    const ctx = prepararLienzo(c);
    const w = c.clientWidth, h = c.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (!historia || historia.length < 2) return;

    const pad = { l: 8, r: 8, t: 10, b: 16 };
    const min = Math.min(...historia), max = Math.max(...historia);
    const rango = max - min || 1;
    const X = (i) => pad.l + (w - pad.l - pad.r) * i / (historia.length - 1);
    const Y = (v) => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / rango);

    // Rejilla
    ctx.strokeStyle = 'rgba(27,37,49,.8)';
    ctx.lineWidth = 1;
    for (let k = 0; k <= 3; k++) {
      const y = pad.t + (h - pad.t - pad.b) * k / 3;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    }

    // Área bajo la curva
    const g = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
    g.addColorStop(0, 'rgba(57,215,255,.28)');
    g.addColorStop(1, 'rgba(57,215,255,0)');
    ctx.beginPath();
    ctx.moveTo(X(0), h - pad.b);
    historia.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
    ctx.lineTo(X(historia.length - 1), h - pad.b);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();

    // Curva
    ctx.beginPath();
    historia.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)));
    ctx.strokeStyle = '#39d7ff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Puntos extremos
    historia.forEach((v, i) => {
      if (i !== 0 && i !== historia.length - 1) return;
      ctx.beginPath();
      ctx.arc(X(i), Y(v), 3.2, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#8b7bff' : '#3ddc84';
      ctx.fill();
    });

    ctx.fillStyle = 'rgba(110,127,149,.95)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText('iteración 1', pad.l, h - 4);
    ctx.textAlign = 'right';
    ctx.fillText(`${historia.length}`, w - pad.r, h - 4);
  }

  /* ======================================================================
   *  ETAPA 2
   * ==================================================================== */
  function renderEtapa2() {
    const R = estado.regionObj, r2 = estado.r2, r1 = estado.r1;

    if (!estado.region.activa || !r2) {
      $('#e2-g').textContent = 'Restricción desactivada — el problema coincide con la etapa 1.';
      $('#e2-condiciones').innerHTML = '';
      $('#e2-datos').innerHTML = dato('Estado', 'sin restricción geográfica');
      $('#e2-barras').innerHTML = '';
      $('#e2-tabla').innerHTML = '';
      return;
    }

    $('#e2-g').textContent = R.expresion;

    const C = r2.condiciones;
    const fila = (nombre, obj, formato) => `
      <div class="kkt-item ${obj.cumple ? '' : 'falla'}">
        <span class="marca-ok">${obj.cumple ? '✓' : '✕'}</span>
        <span class="nombre">${nombre}</span>
        <span class="valor">${formato(obj.valor)}</span>
      </div>`;

    $('#e2-condiciones').innerHTML =
      fila('Estacionariedad &nbsp;<code>∇f + λ∇g = 0</code>', C.estacionariedad, v => '‖·‖ = ' + v.toExponential(2)) +
      fila('Factibilidad primal &nbsp;<code>g ≤ 0</code>', C.factibilidadPrimal, v => 'g = ' + v.toExponential(2)) +
      fila('Factibilidad dual &nbsp;<code>λ ≥ 0</code>', C.factibilidadDual, v => 'λ = ' + formatoCorto(v)) +
      fila('Holgura complementaria &nbsp;<code>λ·g = 0</code>', C.holguraComplementaria, v => 'λg = ' + v.toExponential(2));

    const activa = r2.activa;
    $('#e2-datos').innerHTML =
      dato('Estado de la restricción',
        activa ? 'ACTIVA — el óptimo cae sobre la frontera' : 'INACTIVA — el óptimo libre ya era factible',
        activa ? 'ambar' : 'verde') +
      dato('Óptimo restringido', `(${r2.p.x.toFixed(3)}, ${r2.p.y.toFixed(3)}) km`, 'acento') +
      dato('Coordenadas geográficas', geoTexto(r2.p), 'acento') +
      dato('Multiplicador <code>λ*</code>', formatoCorto(r2.lambda), activa ? 'ambar' : '') +
      dato('Desplazamiento del óptimo', km(r2.desplazamiento), activa ? 'ambar' : '') +
      dato('<code>f</code> restringida', formatoCorto(r2.f) + ' Mbps·km²') +
      dato('Penalización <code>Δf</code>', '+' + formatoCorto(r2.deltaF) + `  (${pct(r2.deltaFrel)})`, activa ? 'rosa' : 'verde') +
      (r2.dfdR !== undefined && activa
        ? dato('Sensibilidad <code>df*/dR</code>', formatoCorto(r2.dfdR) + ' por km de radio', 'ambar')
        : '');

    const maxF = Math.max(r1.f, r2.f) || 1;
    $('#e2-barras').innerHTML = `
      ${barra('Etapa 1 — sin restricción', r1.f, maxF, '#39d7ff')}
      ${barra('Etapa 2 — con g(x,y) ≤ 0', r2.f, maxF, activa ? '#ffb43a' : '#3ddc84')}`;

    // --- Tabla por centro ---
    const D = estado.rMulti.detalle;
    const aplicada = estado.aplicarRegionMulti;
    let html = `<thead><tr><th>Centro</th><th>W servido</th><th>λ<sub>j</sub>${aplicada ? '' : ' (hipotético)'}</th><th>Desplaz.</th><th>Estado</th></tr></thead><tbody>`;
    for (const d of D) {
      const k = d.kkt;
      const act = k && k.activa;
      const desp = k && k.pSinRestriccion
        ? Math.hypot(d.p.x - k.pSinRestriccion.x, d.p.y - k.pSinRestriccion.y) : 0;
      html += `<tr>
        <td><span class="punto-color" style="background:${col(d.j)}"></span>S${d.j + 1}</td>
        <td>${miles(d.W)}</td>
        <td class="${act ? 'partido' : 'cero'}">${k ? formatoCorto(k.lambda) : '—'}</td>
        <td>${desp.toFixed(2)} km</td>
        <td>${act ? 'activa' : 'inactiva'}</td>
      </tr>`;
    }
    $('#e2-tabla').innerHTML = html + '</tbody>';
    $('#e2-nota-tabla').innerHTML = aplicada
      ? 'La proyección KKT se está aplicando a cada centro: los que aparecen como «activa» quedaron sobre la frontera g = 0.'
      : 'El interruptor «Restringir todos los centros» está apagado, así que los centros se ubican libremente. La columna λ indica qué multiplicador tendría cada uno <em>si</em> se le impusiera la región.';
  }

  function barra(etiqueta, valor, max, color) {
    return `<div class="barra-fila">
      <div class="cabeza"><span>${etiqueta}</span><b>${formatoCorto(valor)}</b></div>
      <div class="barra-pista"><div class="barra-relleno" style="width:${(valor / max * 100).toFixed(1)}%;background:${color}"></div></div>
    </div>`;
  }

  /* ======================================================================
   *  ETAPA 3
   * ==================================================================== */
  function renderEtapa3() {
    const lp = estado.rLP;

    if (!lp.factible) {
      const msg = `<div class="veredicto malo"><span class="icono">✕</span><span>${lp.mensaje}</span></div>`;
      $('#e3-datos').innerHTML = msg +
        dato('Demanda total <code>Σ d<sub>i</sub></code>', miles(lp.demandaTotal) + ' Mbps') +
        dato('Capacidad total <code>Σ B<sub>j</sub></code>', miles(lp.ofertaTotal) + ' Mbps', 'rosa') +
        dato('Déficit', miles(lp.deficit) + ' Mbps', 'rosa');
      $('#e3-duelo').innerHTML = '';
      $('#e3-comparacion').innerHTML = '';
      $('#e3-carga').innerHTML = '';
      $('#e3-matriz').innerHTML = '';
      return;
    }

    const utilMedia = lp.carga.reduce((a, b) => a + b, 0) / lp.ofertaTotal;
    const saturados = lp.utilizacion.filter(u => u > 0.999).length;

    $('#e3-datos').innerHTML =
      dato('Costo óptimo <code>Z*</code>', '$ ' + formatoCorto(lp.Z), 'grande acento') +
      dato('Demanda total <code>Σ d<sub>i</sub></code>', miles(lp.demandaTotal) + ' Mbps') +
      dato('Capacidad total <code>Σ B<sub>j</sub></code>', miles(lp.ofertaTotal) + ' Mbps') +
      dato('Capacidad ociosa', miles(lp.holgura) + ' Mbps  (' + pct(1 - utilMedia) + ')') +
      dato('Centros saturados', `${saturados} de ${lp.carga.length}`, saturados ? 'rosa' : 'verde') +
      dato('Iteraciones MODI', lp.iteracionesMODI) +
      dato('Celdas básicas', `${lp.basicas} / ${lp.requeridas} requeridas`,
        lp.basicas === lp.requeridas ? 'verde' : 'ambar') +
      dato('Nodos repartidos entre centros', lp.divididos.length, lp.divididos.length ? 'ambar' : '');

    // --- Duelo contra vecino más cercano ---
    const vmc = lp.vmc;
    $('#e3-duelo').innerHTML = `
      <div class="duelo-lado gana">
        <div class="titulo">Programación lineal</div>
        <div class="cifra">$ ${formatoCorto(lp.Z)}</div>
        <div class="pie">respeta todo <code>B<sub>j</sub></code></div>
      </div>
      <div class="duelo-vs">vs</div>
      <div class="duelo-lado ${vmc.factible ? '' : 'infactible'}">
        <div class="titulo">Vecino más cercano</div>
        <div class="cifra" ${vmc.factible ? '' : 'style="text-decoration:line-through;opacity:.75"'}>$ ${formatoCorto(vmc.Z)}</div>
        <div class="pie">${vmc.factible ? 'factible' : `viola ${vmc.sobrecargas.length} capacidad(es)`}</div>
      </div>`;

    let comp = vmc.factible
      ? dato('Ahorro <code>Z<sub>VMC</sub> − Z<sub>LP</sub></code>',
          '$ ' + formatoCorto(lp.diferencia), 'verde') +
        dato('Ahorro relativo', pct(lp.mejora), 'verde')
      : dato('Costo aparente del VMC', '$ ' + formatoCorto(vmc.Z) + '  (inadmisible)', 'rosa') +
        dato('Sobrecosto de respetar <code>B<sub>j</sub></code>',
          '$ ' + formatoCorto(-lp.diferencia) + '  (' + pct(-lp.mejora) + ')', 'ambar');

    if (!vmc.factible) {
      comp += dato('Centros sobrecargados por VMC',
        vmc.sobrecargas.map(s => `S${s.j + 1} (+${miles(s.exceso)} Mbps)`).join(', '), 'rosa');
      comp += `<div class="veredicto" style="margin-top:10px">
        <span class="icono">i</span>
        <span>El vecino más cercano parece más barato porque <b>no es una solución admisible</b>:
        excede el ancho de banda disponible. El modelo lineal es el costo mínimo entre las asignaciones
        que sí respetan <code>B<sub>j</sub></code>.</span></div>`;
    } else {
      comp += `<div class="veredicto" style="margin-top:10px">
        <span class="icono">✓</span>
        <span>Con esta capacidad el vecino más cercano resulta factible, y el modelo lineal lo iguala
        o lo mejora: ninguna asignación admisible puede costar menos que <code>Z*</code>.</span></div>`;
    }
    $('#e3-comparacion').innerHTML = comp;

    // --- Carga por centro ---
    let th = `<thead><tr><th>Centro</th><th>Carga</th><th>B<sub>j</sub></th><th>Uso</th><th>dZ/dB<sub>j</sub></th></tr></thead><tbody>`;
    lp.carga.forEach((c, j) => {
      const u = lp.utilizacion[j];
      th += `<tr>
        <td><span class="punto-color" style="background:${col(j)}"></span>S${j + 1}</td>
        <td>${miles(c)}</td>
        <td>${miles(lp.anchos[j])}</td>
        <td class="${u > 0.999 ? 'saturado' : ''}">${(u * 100).toFixed(1)} %</td>
        <td>${lp.dualB[j].toFixed(3)}</td>
      </tr>`;
    });
    $('#e3-carga').innerHTML = th + '</tbody>';

    // --- Matriz t_ij (nodos en filas, centros en columnas) ---
    const m = lp.carga.length;
    let mt = '<thead><tr><th>Nodo</th>';
    for (let j = 0; j < m; j++) mt += `<th style="color:${col(j)}">S${j + 1}</th>`;
    mt += '<th>d<sub>i</sub></th></tr></thead><tbody>';

    const partidos = new Set(lp.divididos.map(d => d.i));
    estado.nodos.forEach((n, i) => {
      mt += `<tr><td>${n.nombre}</td>`;
      for (let j = 0; j < m; j++) {
        const t = lp.t[j][i];
        const clase = t <= 1e-6 ? 'cero' : (partidos.has(i) ? 'partido' : '');
        mt += `<td class="${clase}">${t <= 1e-6 ? '·' : miles(t)}</td>`;
      }
      mt += `<td>${miles(n.d)}</td></tr>`;
    });
    $('#e3-matriz').innerHTML = mt + '</tbody>';
  }

  function prepararLienzo(c) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }


  /* ======================================================================
   *  SENSIBILIDAD
   * ==================================================================== */
  function renderSensibilidad() {
    const lp = estado.rLP;
    const tabla = $('#sens-duales');

    if (!lp.factible) {
      tabla.innerHTML = '<tbody><tr><td>Modelo infactible: no hay solución dual.</td></tr></tbody>';
      $('#sens-datos').innerHTML = '';
      $('#sens-infact').innerHTML = dato('Estado', 'infactible con la capacidad actual', 'rosa');
      dibujarSensibilidad(null);
      return;
    }

    /* --- Duales: potencial MODI frente a diferencia finita --- */
    const opciones = { tarifa: estado.tarifa, metrica: estado.metricaCosto };
    let html = `<thead><tr><th>Centro</th><th>Uso</th><th>dZ/dB<sub>j</sub> (MODI)</th><th>ΔZ/δ</th><th>Coincide</th></tr></thead><tbody>`;

    for (let j = 0; j < lp.carga.length; j++) {
      const delta = Math.max(1, Math.round(lp.anchos[j] * 0.02));
      const v = Transporte.verificarDual(estado.nodos, estado.rMulti.centros, lp.anchos, j, delta, opciones);
      const sat = lp.utilizacion[j] > 0.999;
      let coincide = '—', clase = 'cero';
      if (v) {
        const err = Math.abs(v.dualTeorico - v.dualNumerico);
        const rel = err / Math.max(1e-6, Math.abs(v.dualTeorico) || 1);
        coincide = rel < 0.02 ? '✓' : '≈';
        clase = rel < 0.02 ? 'partido' : '';
      }
      html += `<tr>
        <td><span class="punto-color" style="background:${col(j)}"></span>S${j + 1}</td>
        <td class="${sat ? 'saturado' : ''}">${(lp.utilizacion[j] * 100).toFixed(0)} %</td>
        <td>${lp.dualB[j].toFixed(4)}</td>
        <td>${v ? v.dualNumerico.toFixed(4) : '—'}</td>
        <td class="${clase}">${coincide}</td>
      </tr>`;
    }
    tabla.innerHTML = html + '</tbody>';

    /* --- Barrido de la capacidad total --- */
    const curva = barridoCapacidad();
    dibujarSensibilidad(curva);

    const actual = curva.find(p => Math.abs(p.h - estado.holgura) < 1e-9) || curva[0];
    const saturadosAhora = lp.utilizacion.filter(u => u > 0.999).length;
    const primeroLibre = curva.find(p => p.factible && p.saturados === 0);

    $('#sens-datos').innerHTML =
      dato('Factor actual <code>ΣB / Σd</code>', estado.holgura.toFixed(2) + '×', 'acento') +
      dato('<code>Z</code> en ese factor', '$ ' + formatoCorto(lp.Z)) +
      dato('Centros saturados ahora', saturadosAhora, saturadosAhora ? 'rosa' : 'verde') +
      (primeroLibre
        ? dato('Capacidad sin saturación desde', primeroLibre.h.toFixed(2) + '×', 'verde')
        : dato('Capacidad sin saturación', 'no se alcanza en el rango', 'ambar')) +
      (primeroLibre
        ? dato('<code>Z</code> sin restricción de capacidad', '$ ' + formatoCorto(primeroLibre.Z), 'verde')
        : '') +
      (primeroLibre
        ? dato('Sobrecosto por capacidad limitada',
            '$ ' + formatoCorto(lp.Z - primeroLibre.Z) + '  (' + pct((lp.Z - primeroLibre.Z) / primeroLibre.Z) + ')',
            lp.Z > primeroLibre.Z + 1e-9 ? 'ambar' : 'verde')
        : '');

    /* --- Frontera de infactibilidad --- */
    const critico = factorCritico();
    $('#sens-infact').innerHTML =
      dato('Demanda total <code>Σ d<sub>i</sub></code>', miles(lp.demandaTotal) + ' Mbps') +
      dato('Factor mínimo admisible', critico.toFixed(3) + '×', 'ambar') +
      dato('Margen actual', ((estado.holgura / critico - 1) * 100).toFixed(1) + ' %',
        estado.holgura > critico ? 'verde' : 'rosa') +
      `<div class="veredicto" style="margin-top:10px"><span class="icono">i</span><span>
        Por debajo de ese factor la restricción <code>Σ<sub>j</sub> t<sub>ij</sub> = d<sub>i</sub></code>
        no puede cumplirse para todos los nodos: el modelo deja de tener región factible y el símplex
        no entrega solución, por mucho que se redistribuya el tráfico.</span></div>`;
  }

  /** Barrido del factor ΣB/Σd resolviendo el modelo en cada punto. */
  function barridoCapacidad() {
    const puntos = [];
    const guardado = estado.holgura;
    const opciones = { tarifa: estado.tarifa, metrica: estado.metricaCosto };

    for (let k = 0; k <= 44; k++) {
      const h = 0.85 + (2.2 - 0.85) * k / 44;
      estado.holgura = h;
      const anchos = App.calcularAnchos();
      const r = Transporte.resolver(estado.nodos, estado.rMulti.centros, anchos, opciones);
      puntos.push({
        h,
        factible: r.factible,
        Z: r.factible ? r.Z : null,
        saturados: r.factible ? r.utilizacion.filter(u => u > 0.999).length : null
      });
    }
    // Se añade el punto exacto del escenario actual para marcarlo en el gráfico.
    estado.holgura = guardado;
    const anchos = App.calcularAnchos();
    const r = Transporte.resolver(estado.nodos, estado.rMulti.centros, anchos, opciones);
    puntos.push({
      h: guardado, factible: r.factible, Z: r.factible ? r.Z : null,
      saturados: r.factible ? r.utilizacion.filter(u => u > 0.999).length : null, actual: true
    });
    puntos.sort((a, b) => a.h - b.h);
    return puntos;
  }

  /** Búsqueda binaria del menor factor de holgura con solución factible. */
  function factorCritico() {
    const guardado = estado.holgura;
    const opciones = { tarifa: estado.tarifa, metrica: estado.metricaCosto };
    const factible = (h) => {
      estado.holgura = h;
      return Transporte.resolver(estado.nodos, estado.rMulti.centros, App.calcularAnchos(), opciones).factible;
    };
    let lo = 0.5, hi = 2.5;
    if (factible(lo)) { estado.holgura = guardado; return lo; }
    if (!factible(hi)) { estado.holgura = guardado; return hi; }
    for (let k = 0; k < 28; k++) {
      const mid = (lo + hi) / 2;
      if (factible(mid)) hi = mid; else lo = mid;
    }
    estado.holgura = guardado;
    return hi;
  }

  function dibujarSensibilidad(curva) {
    const c = $('#g-sensibilidad');
    const ctx = prepararLienzo(c);
    const w = c.clientWidth, h = c.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (!curva) return;

    const pad = { l: 46, r: 12, t: 14, b: 26 };
    const validos = curva.filter(p => p.factible);
    if (!validos.length) return;

    const hMin = curva[0].h, hMax = curva[curva.length - 1].h;
    const zMin = Math.min(...validos.map(p => p.Z));
    const zMax = Math.max(...validos.map(p => p.Z));
    const rango = zMax - zMin || 1;

    const X = (hh) => pad.l + (w - pad.l - pad.r) * (hh - hMin) / (hMax - hMin);
    const Y = (z) => pad.t + (h - pad.t - pad.b) * (1 - (z - zMin) / rango);

    // Rejilla y eje Y
    ctx.strokeStyle = 'rgba(27,37,49,.85)';
    ctx.fillStyle = 'rgba(110,127,149,.9)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const y = pad.t + (h - pad.t - pad.b) * k / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(formatoCorto(zMax - rango * k / 4), pad.l - 6, y + 3);
    }

    // Zona infactible
    const primeroFactible = curva.find(p => p.factible);
    if (primeroFactible && primeroFactible.h > hMin + 1e-9) {
      ctx.fillStyle = 'rgba(255,77,94,.09)';
      ctx.fillRect(pad.l, pad.t, X(primeroFactible.h) - pad.l, h - pad.t - pad.b);
      ctx.save();
      ctx.fillStyle = 'rgba(255,120,135,.8)';
      ctx.font = '9px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('infactible', (pad.l + X(primeroFactible.h)) / 2, pad.t + 12);
      ctx.restore();
    }

    // Curva Z(h)
    ctx.beginPath();
    validos.forEach((p, i) => i ? ctx.lineTo(X(p.h), Y(p.Z)) : ctx.moveTo(X(p.h), Y(p.Z)));
    ctx.strokeStyle = '#8b7bff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Tramo con centros saturados (capacidad activa)
    ctx.beginPath();
    let abierto = false;
    validos.forEach((p) => {
      if (p.saturados > 0) {
        if (!abierto) { ctx.moveTo(X(p.h), Y(p.Z)); abierto = true; }
        else ctx.lineTo(X(p.h), Y(p.Z));
      } else abierto = false;
    });
    ctx.strokeStyle = '#ff5d8f';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Marcador del escenario actual
    const act = curva.find(p => p.actual && p.factible);
    if (act) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(57,215,255,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(act.h), pad.t); ctx.lineTo(X(act.h), h - pad.b);
      ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(X(act.h), Y(act.Z), 4, 0, Math.PI * 2);
      ctx.fillStyle = '#39d7ff';
      ctx.fill();
    }

    // Eje X
    ctx.fillStyle = 'rgba(110,127,149,.9)';
    ctx.textAlign = 'center';
    ctx.font = '9px ui-monospace, monospace';
    for (const hh of [1.0, 1.4, 1.8, 2.2]) {
      if (hh < hMin || hh > hMax) continue;
      ctx.fillText(hh.toFixed(1) + '×', X(hh), h - 8);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,93,143,.9)';
    ctx.fillText('— capacidad activa', pad.l + 4, h - 8);
  }

  /* ======================================================================
   *  HIPÓTESIS
   * ==================================================================== */
  function renderHipotesis() {
    const r1 = estado.r1, r2 = estado.r2, lp = estado.rLP;

    /* H1 — unicidad del mínimo sin restricciones */
    let W = 0, sx = 0, sy = 0;
    for (const n of estado.nodos) { W += n.w; sx += n.w * n.x; sy += n.w * n.y; }
    const centroide = { x: sx / W, y: sy / W };
    const errCentroide = Math.hypot(r1.p.x - centroide.x, r1.p.y - centroide.y);
    const h1ok = r1.definidaPositiva && errCentroide < 1e-9 && r1.normaGrad < 1e-6;

    tarjetaHipotesis('#h1', h1ok, 'H₁ — Unicidad del mínimo sin restricciones',
      'La Hessiana de la suma ponderada de cuadrados es constante y definida positiva, luego el punto crítico es un mínimo global único que coincide con el centroide ponderado.',
      dato('H definida positiva', r1.definidaPositiva ? 'sí' : 'no', r1.definidaPositiva ? 'verde' : 'rosa') +
      dato('det H', formatoCorto(r1.detH), 'verde') +
      dato('‖∇f(x*,y*)‖', r1.normaGrad.toExponential(2), 'verde') +
      dato('‖(x*,y*) − centroide‖', errCentroide.toExponential(2) + ' km', 'verde') +
      dato('¿Depende H de (x,y)?', 'no — es 2W·I', 'verde'));

    /* H2 — desplazamiento del óptimo hacia la frontera */
    if (!estado.region.activa || !r2) {
      tarjetaHipotesis('#h2', null, 'H₂ — Desplazamiento del óptimo hacia la frontera',
        'Sin restricción activada no hay nada que verificar. Activa la región factible para ponerla a prueba.', '');
    } else {
      const libreFactible = estado.regionObj.g(r1.p) <= 1e-9;
      const h2ok = libreFactible
        ? (Math.abs(r2.lambda) < 1e-9 && r2.desplazamiento < 1e-9)
        : (Math.abs(estado.regionObj.g(r2.p)) < 1e-6 && r2.lambda > 0 && r2.f > r1.f);

      tarjetaHipotesis('#h2', h2ok, 'H₂ — Desplazamiento del óptimo hacia la frontera',
        libreFactible
          ? 'El óptimo sin restricciones ya cumple g ≤ 0: la restricción está inactiva, λ* = 0 y el punto no se mueve, tal como predice la holgura complementaria.'
          : 'El óptimo sin restricciones viola g ≤ 0, de modo que la solución restringida cae exactamente sobre g = 0, con λ* > 0 y un valor objetivo estrictamente mayor.',
        dato('g(x*,y*) sin restricción', formatoCorto(estado.regionObj.g(r1.p)),
          libreFactible ? 'verde' : 'ambar') +
        dato('g en el óptimo restringido', estado.regionObj.g(r2.p).toExponential(2), 'verde') +
        dato('λ*', formatoCorto(r2.lambda), r2.lambda > 0 ? 'ambar' : 'verde') +
        dato('Desplazamiento', km(r2.desplazamiento)) +
        dato('f₂ − f₁', '+' + formatoCorto(r2.deltaF), r2.deltaF > 0 ? 'ambar' : 'verde'));
    }

    /* H3 — el modelo lineal frente a la asignación directa */
    if (!lp.factible) {
      tarjetaHipotesis('#h3', null, 'H₃ — Mejora de la programación lineal',
        'Con la capacidad actual el modelo es infactible: no hay asignación que cubra toda la demanda. Aumenta el factor ΣB/Σd para volver a evaluar la hipótesis.', '');
    } else {
      const vmc = lp.vmc;
      const h3ok = vmc.factible ? (lp.Z <= vmc.Z + 1e-6) : true;
      tarjetaHipotesis('#h3', h3ok, 'H₃ — Mejora de la programación lineal frente a la asignación directa',
        vmc.factible
          ? 'Con esta capacidad el criterio del vecino más cercano no viola ningún ancho de banda, y el modelo lineal alcanza un costo menor o igual: ninguna asignación admisible puede costar menos que Z*.'
          : 'El criterio del vecino más cercano sobrecarga al menos un centro, así que no es una solución admisible. El modelo lineal redistribuye el excedente y entrega el mínimo entre las asignaciones que sí respetan Bⱼ.',
        dato('Z* (programación lineal)', '$ ' + formatoCorto(lp.Z), 'verde') +
        dato('Z (vecino más cercano)', '$ ' + formatoCorto(vmc.Z), vmc.factible ? '' : 'rosa') +
        dato('¿VMC admisible?', vmc.factible ? 'sí' : `no — ${vmc.sobrecargas.length} centro(s) sobrecargado(s)`,
          vmc.factible ? 'verde' : 'rosa') +
        dato('Capacidad violada por VMC',
          vmc.factible ? '0 Mbps' : miles(vmc.sobrecargas.reduce((a, s) => a + s.exceso, 0)) + ' Mbps',
          vmc.factible ? 'verde' : 'rosa') +
        dato('Nodos repartidos por el LP', lp.divididos.length, lp.divididos.length ? 'ambar' : ''));
    }

    const cumplidas = $$('.tarjeta.hipotesis.cumple').length;
    const falladas = $$('.tarjeta.hipotesis.falla').length;
    $('#hip-resumen').innerHTML =
      dato('Hipótesis verificadas', cumplidas, 'verde') +
      dato('Hipótesis refutadas', falladas, falladas ? 'rosa' : 'verde') +
      dato('No evaluables en este escenario', 3 - cumplidas - falladas) +
      dato('Escenario', `${estado.nodos.length} nodos · ${estado.m} centros · ${estado.holgura.toFixed(2)}× capacidad`);
  }

  function tarjetaHipotesis(sel, ok, titulo, texto, datos) {
    const el = $(sel);
    el.className = 'tarjeta hipotesis' + (ok === null ? '' : ok ? ' cumple' : ' falla');
    el.innerHTML = `
      <div class="hip-cabeza">
        ${ok === null ? '' : `<span class="hip-sello ${ok ? 'cumple' : 'falla'}">${ok ? 'se cumple' : 'no se cumple'}</span>`}
        <h3>${titulo}</h3>
      </div>
      <p class="hip-texto">${texto}</p>
      <div class="datos">${datos}</div>`;
  }

  /* ======================================================================
   *  INDICADORES, LEYENDA Y LISTA DE ANCHOS
   * ==================================================================== */
  function renderKPI() {
    const r1 = estado.r1, r2 = estado.r2, lp = estado.rLP;
    const demanda = estado.nodos.reduce((a, n) => a + n.d, 0);

    const kpi = (et, vl, clase = '') =>
      `<div class="kpi"><span class="et">${et}</span><span class="vl ${clase}">${vl}</span></div>`;

    let html =
      kpi('Nodos', estado.nodos.length) +
      kpi('Centros', estado.m) +
      kpi('Demanda total', miles(demanda) + '<small>Mbps</small>') +
      kpi('f₁* sin restricción', formatoCorto(r1.f), 'acento');

    if (estado.region.activa && r2) {
      html += kpi('λ*', formatoCorto(r2.lambda), r2.activa ? 'ambar' : 'verde');
      html += kpi('Δf por g ≤ 0', (r2.deltaF > 0 ? '+' : '') + pct(r2.deltaFrel), r2.activa ? 'rosa' : 'verde');
    } else {
      html += kpi('Restricción', 'desactivada');
    }

    if (lp.factible) {
      const sat = lp.utilizacion.filter(u => u > 0.999).length;
      html +=
        kpi('Z* transporte', '$ ' + formatoCorto(lp.Z), 'acento') +
        kpi('Z vecino cercano', '$ ' + formatoCorto(lp.vmc.Z), lp.vmc.factible ? '' : 'rosa') +
        kpi('Nodos repartidos', lp.divididos.length, lp.divididos.length ? 'ambar' : '') +
        kpi('Centros saturados', `${sat}/${lp.carga.length}`, sat ? 'rosa' : 'verde') +
        kpi('Iteraciones MODI', lp.iteracionesMODI);
    } else {
      html += kpi('Etapa 3', 'INFACTIBLE', 'rosa') +
              kpi('Déficit', miles(lp.deficit) + '<small>Mbps</small>', 'rosa');
    }

    $('#barra-kpi').innerHTML = html;
  }

  function renderLeyenda() {
    const lp = estado.rLP, M = estado.rMulti;
    if (!M) return;
    let html = '<h4>Centros de servicio</h4>';
    M.centros.forEach((c, j) => {
      const carga = lp && lp.factible ? `${(lp.utilizacion[j] * 100).toFixed(0)} %` : '—';
      html += `<div class="leyenda-item">
        <span class="leyenda-punto" style="background:${col(j)}"></span>
        <span>S${j + 1}</span>
        <span class="carga">${carga}</span>
      </div>`;
    });
    html += `<div class="leyenda-item" style="margin-top:7px;border-top:1px solid var(--borde-suave);padding-top:7px">
      <span class="leyenda-punto" style="background:#fff"></span><span>Óptimo etapa 1</span></div>`;
    if (estado.region.activa) {
      html += `<div class="leyenda-item">
        <span class="leyenda-punto" style="background:#3ddc84"></span><span>Frontera g = 0</span></div>`;
    }
    $('#leyenda').innerHTML = html;
  }

  function renderAnchos() {
    const lp = estado.rLP, M = estado.rMulti;
    if (!M) return;
    const cont = $('#lista-anchos');
    let html = '';
    M.centros.forEach((c, j) => {
      const B = estado.anchos ? estado.anchos[j] : 0;
      const u = lp && lp.factible ? lp.utilizacion[j] : 0;
      const sat = u > 0.999;
      html += `<div class="ancho-item ${sat ? 'saturado' : ''}" style="border-left-color:${col(j)}">
        <div class="ancho-cabeza">
          <strong style="color:${col(j)}">S${j + 1}</strong>
          <span class="util">${miles(B)} Mbps · ${(u * 100).toFixed(0)} %</span>
        </div>
        <input type="range" class="factor-b" data-j="${j}" min="0.2" max="2.5" step="0.01"
               value="${estado.factorB[j] || 1}">
      </div>`;
    });
    cont.innerHTML = html;

    cont.querySelectorAll('.factor-b').forEach((r) => {
      r.addEventListener('input', () => {
        estado.factorB[+r.dataset.j] = +r.value;
        App.recalcular();
      });
      r.addEventListener('change', () => App.programarSensibilidad());
    });
    App.sincronizarRangos();
  }

  /* ======================================================================
   *  INSPECTOR
   * ==================================================================== */
  function inspectorNodo(i) {
    const n = estado.nodos[i], lp = estado.rLP, M = estado.rMulti;
    const j = M ? M.asign[i] : -1;
    let fuentes = '';
    if (lp && lp.factible) {
      const partes = [];
      for (let k = 0; k < lp.carga.length; k++) {
        if (lp.t[k][i] > 1e-6) {
          partes.push(`<span style="color:${col(k)}">S${k + 1}</span>: ${miles(lp.t[k][i])} Mbps (${pct(lp.t[k][i] / n.d)})`);
        }
      }
      fuentes = partes.join('<br>');
    }
    const dj = j >= 0 ? Math.hypot(n.x - M.centros[j].x, n.y - M.centros[j].y) : 0;

    abrirInspector(`
      <h4>${n.nombre}</h4>
      <p class="sub">${n.tipo === 'comuna' ? 'Comuna de Medellín' : 'Municipio del Área Metropolitana'} · ${n.id}</p>
      <div class="datos">
        ${dato('Población de referencia', miles(n.pob) + ' hab')}
        ${dato('Demanda <code>d<sub>i</sub></code>', miles(n.d) + ' Mbps', 'acento')}
        ${dato('Peso <code>w<sub>i</sub></code>', miles(n.w))}
        ${dato('Posición', `(${n.x.toFixed(2)}, ${n.y.toFixed(2)}) km`)}
        ${dato('Coordenadas', `${n.lat.toFixed(4)}°, ${n.lon.toFixed(4)}°`)}
        ${j >= 0 ? dato('Centro más cercano', `<span style="color:${col(j)}">S${j + 1}</span> a ${dj.toFixed(2)} km`) : ''}
      </div>
      ${fuentes ? `<p class="sub" style="margin:10px 0 4px">Tráfico recibido</p><div style="font-size:11px;line-height:1.8;font-family:var(--mono)">${fuentes}</div>` : ''}
      <p class="pista" style="margin-top:10px">Arrastra este nodo sobre el mapa para ver cómo se mueve el óptimo.</p>`);
  }

  function inspectorCentro(j) {
    const M = estado.rMulti, lp = estado.rLP;
    const d = M.detalle[j];
    const c = M.centros[j];
    const k = d.kkt;

    abrirInspector(`
      <h4 style="color:${col(j)}">Centro de servicio S${j + 1}</h4>
      <p class="sub">${geoTexto(c)}</p>
      <div class="datos">
        ${dato('Posición', `(${c.x.toFixed(3)}, ${c.y.toFixed(3)}) km`)}
        ${dato('Nodos asignados', d.nNodos)}
        ${dato('Peso servido <code>W<sub>j</sub></code>', miles(d.W))}
        ${dato('Demanda del grupo', miles(d.demanda) + ' Mbps')}
        ${lp && lp.factible ? dato('Carga asignada', miles(lp.carga[j]) + ' Mbps', 'acento') : ''}
        ${lp && lp.factible ? dato('Ancho de banda <code>B<sub>j</sub></code>', miles(lp.anchos[j]) + ' Mbps') : ''}
        ${lp && lp.factible ? dato('Utilización', (lp.utilizacion[j] * 100).toFixed(1) + ' %',
            lp.utilizacion[j] > 0.999 ? 'rosa' : 'verde') : ''}
        ${lp && lp.factible ? dato('Precio sombra <code>dZ/dB<sub>j</sub></code>', lp.dualB[j].toFixed(4),
            lp.utilizacion[j] > 0.999 ? 'ambar' : 'verde') : ''}
        ${dato('Inercia del grupo', formatoCorto(d.inercia) + ' Mbps·km²')}
        ${k ? dato('Restricción', k.activa ? 'activa (λ > 0)' : 'inactiva (λ = 0)', k.activa ? 'ambar' : 'verde') : ''}
        ${k ? dato('λ<sub>j</sub>', formatoCorto(k.lambda), k.activa ? 'ambar' : '') : ''}
      </div>`);
  }

  function abrirInspector(html) {
    $('#inspector-cuerpo').innerHTML = html;
    $('#inspector').hidden = false;
  }

  /* ======================================================================
   *  RENDER GENERAL
   * ==================================================================== */
  function render() {
    renderEtapa1();
    renderEtapa2();
    renderEtapa3();
    renderHipotesis();
    renderKPI();
    renderLeyenda();
    renderAnchos();

    const lp = estado.rLP;
    const aviso = $('#aviso');
    if (!lp.factible) {
      aviso.hidden = false;
      aviso.innerHTML = `<b>Modelo infactible.</b> ${lp.mensaje} Déficit: ${miles(lp.deficit)} Mbps.`;
    } else {
      aviso.hidden = true;
    }
  }

  /* ======================================================================
   *  CONTROLES
   * ==================================================================== */
  function enlazarControles() {
    const recal = (sens) => App.recalcular({ sensibilidad: sens });

    const rango = (sel, fn, formato, salida) => {
      const el = $(sel);
      el.addEventListener('input', () => {
        fn(+el.value);
        if (salida) $(salida).textContent = formato(+el.value);
        App.sincronizarRangos();
        recal(false);
      });
      el.addEventListener('change', () => App.programarSensibilidad());
    };

    rango('#m-centros', (v) => { estado.m = v; estado.factorB = []; }, (v) => v, '#m-valor');
    rango('#intensidad', (v) => estado.intensidad = v, (v) => v.toFixed(1) + ' Mbps / 1000 hab', '#intensidad-valor');
    rango('#semilla', (v) => estado.semilla = v, (v) => '#' + v, '#semilla-valor');
    rango('#region-radio', (v) => estado.region.radioKm = v, (v) => v.toFixed(2) + ' km', '#radio-valor');
    rango('#region-angulo', (v) => estado.region.angulo = v, (v) => v + '°', '#angulo-valor');
    rango('#holgura', (v) => estado.holgura = v, (v) => v.toFixed(2) + '×', '#holgura-valor');
    rango('#tarifa', (v) => estado.tarifa = v, (v) => v.toFixed(2) + ' $/Mbps·km', '#tarifa-valor');
    rango('#alpha-campo', (v) => estado.alphaCampo = v / 100, (v) => v + ' %', '#alpha-valor');

    $('#btn-resembrar').addEventListener('click', () => {
      estado.semilla = 1 + Math.floor(Math.random() * 60);
      $('#semilla').value = estado.semilla;
      $('#semilla-valor').textContent = '#' + estado.semilla;
      App.sincronizarRangos();
      recal(true);
    });

    $('#region-activa').addEventListener('change', (e) => { estado.region.activa = e.target.checked; recal(true); });
    $('#region-multi').addEventListener('change', (e) => { estado.aplicarRegionMulti = e.target.checked; recal(true); });

    segmentado('#region-tipo', (v) => {
      estado.region.tipo = v;
      $('#ctrl-radio').hidden = v !== 'circulo';
      $('#ctrl-angulo').hidden = v !== 'semiplano';
      recal(true);
    });
    segmentado('#reparto', (v) => { estado.reparto = v; estado.factorB = []; recal(true); });
    segmentado('#metrica-costo', (v) => { estado.metricaCosto = v; recal(true); });
    segmentado('#campo-metrica', (v) => { estado.metricaCampo = v; App.motor.invalidar(); });
    segmentado('#colormap', (v) => { estado.colormap = v; App.motor.invalidar(); });
    segmentado('#estilo-mapa', (v) => App.motor.cambiarEstilo(v));

    const capa = (sel, clave, nombreCapa) => {
      $(sel).addEventListener('change', (e) => {
        estado.capas[clave] = e.target.checked;
        if (nombreCapa) App.motor.alternarCapa(nombreCapa, e.target.checked);
        if (clave === 'weber') recal(false); else App.motor.invalidar();
      });
    };
    capa('#cap-campo', 'campo');
    capa('#cap-contornos', 'contornos');
    capa('#cap-voronoi', 'voronoi', 'voronoi');
    capa('#cap-asign', 'asign', 'asignaciones');
    capa('#cap-ref', 'ref', 'referencia');
    capa('#cap-etiq', 'etiquetas');
    capa('#cap-optimos', 'optimos');
    capa('#cap-weber', 'weber');

    // Pestañas del panel de resultados
    $$('.pestana').forEach((p) => {
      p.addEventListener('click', () => irAPanel(p.dataset.panel));
    });
    $$('.etapa-chip').forEach((c) => {
      c.addEventListener('click', () => irAPanel(c.dataset.ir));
    });

    $('#btn-panel-izq').addEventListener('click', () => $('#panel-izq').classList.toggle('abierto'));
    $('#btn-panel-der').addEventListener('click', () => $('#panel-der').classList.toggle('abierto'));
    // Al tocar el mapa se repliegan los paneles superpuestos.
    $('#mapa').addEventListener('pointerdown', () => {
      if (window.innerWidth <= 1180) {
        $('#panel-izq').classList.remove('abierto');
        $('#panel-der').classList.remove('abierto');
      }
    });

    $('#inspector-cerrar').addEventListener('click', () => { $('#inspector').hidden = true; });
    $('#zoom-mas').addEventListener('click', () => App.motor.irA(App.motor.lat, App.motor.lon, App.motor.zoom + 1));
    $('#zoom-menos').addEventListener('click', () => App.motor.irA(App.motor.lat, App.motor.lon, App.motor.zoom - 1));
    $('#btn-encuadrar').addEventListener('click', encuadrar);
    $('#btn-ayuda').addEventListener('click', () => { $('#modal-ayuda').hidden = !$('#modal-ayuda').hidden; });
    $('#ayuda-cerrar').addEventListener('click', () => { $('#modal-ayuda').hidden = true; });
    $('#modal-ayuda').addEventListener('click', (e) => { if (e.target.id === 'modal-ayuda') $('#modal-ayuda').hidden = true; });

    $('#btn-gradiente').addEventListener('click', animarGradiente);
    $('#btn-cooper').addEventListener('click', animarCooper);
    $('#btn-png').addEventListener('click', exportarPNG);
    $('#btn-csv').addEventListener('click', exportarCSV);
    $('#btn-informe').addEventListener('click', exportarInforme);
    $('#btn-reset').addEventListener('click', restablecer);

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;
      const k = e.key.toLowerCase();
      if (k === '1') irAPanel('p-etapa1');
      else if (k === '2') irAPanel('p-etapa2');
      else if (k === '3') irAPanel('p-etapa3');
      else if (k === 'g') animarGradiente();
      else if (k === 'c') animarCooper();
      else if (k === 'r') restablecer();
      else if (k === 'f') encuadrar();
      else if (k === '?' || k === '/') $('#modal-ayuda').hidden = !$('#modal-ayuda').hidden;
      else if (k === 'escape') { $('#modal-ayuda').hidden = true; $('#inspector').hidden = true; }
    });
  }

  function segmentado(sel, fn) {
    const cont = $(sel);
    cont.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        cont.querySelectorAll('button').forEach(x => x.classList.remove('activo'));
        b.classList.add('activo');
        fn(b.dataset.valor);
      });
    });
  }

  function irAPanel(id) {
    estado.pestanaActiva = id;
    $$('.contenido-panel').forEach(p => p.classList.toggle('activo', p.id === id));
    $$('.pestana').forEach(p => p.classList.toggle('activa', p.dataset.panel === id));
    const mapaEtapa = { 'p-etapa1': 0, 'p-etapa2': 1, 'p-etapa3': 2 };
    $$('.etapa-chip').forEach((c, i) => c.classList.toggle('activa', mapaEtapa[id] === i));
    if (id === 'p-sens') App.programarSensibilidad();
  }

  function encuadrar() {
    const puntos = estado.nodos.map(n => ({ lat: n.lat, lon: n.lon }));
    App.motor.encuadrar(puntos, 80);
  }

  /* ======================================================================
   *  ANIMACIONES
   * ==================================================================== */
  function animarGradiente() {
    const r1 = estado.r1;
    // Arranque deliberadamente lejos del óptimo para que el camino se vea.
    const inicio = { x: r1.p.x - 9, y: r1.p.y + 7 };
    estado.trayectoria = Opt.trayectoriaGradiente(inicio, estado.nodos, 70, 0.22);
    estado.trayectoriaPaso = 0;
    irAPanel('p-etapa1');

    const paso = () => {
      estado.trayectoriaPaso++;
      App.motor.invalidar();
      if (estado.trayectoriaPaso < estado.trayectoria.length - 1) {
        setTimeout(paso, 26);
      } else {
        setTimeout(() => { estado.trayectoria = null; App.motor.invalidar(); }, 1600);
      }
    };
    paso();
  }

  function animarCooper() {
    irAPanel('p-etapa1');
    const total = estado.rMulti.iteraciones;
    let k = 1;
    const paso = () => {
      estado.rMulti = Opt.multicentro(estado.nodos, estado.m, {
        region: estado.region.activa ? estado.regionObj : null,
        aplicarRegion: estado.region.activa && estado.aplicarRegionMulti,
        semilla: estado.semilla,
        maxIter: k
      });
      render();
      App.motor.invalidar();
      if (k < total) { k++; setTimeout(paso, 420); }
      else App.recalcular();
    };
    paso();
  }

  /* ======================================================================
   *  EXPORTACIÓN
   * ==================================================================== */
  function descargar(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportarPNG() {
    try {
      const url = App.motor.canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `red-cobertura-valle-aburra-${sello()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      // Ocurre si el proveedor de teselas no envía cabeceras CORS.
      alert('El estilo de mapa actual no permite exportar la imagen por restricciones del proveedor de teselas. ' +
            'Cambia a «Sin conexión» o a «Oscuro» y vuelve a intentarlo.');
    }
  }

  function exportarCSV() {
    const lp = estado.rLP, M = estado.rMulti;
    const lineas = [];
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;

    lineas.push('# Proyecto de Aula - Optimizacion - USB Medellin');
    lineas.push(`# Escenario exportado: ${new Date().toISOString()}`);
    lineas.push(`# m=${estado.m}; intensidad=${estado.intensidad} Mbps/1000hab; tarifa=${estado.tarifa}; holgura=${estado.holgura}`);
    lineas.push('');

    lineas.push('## NODOS DE DEMANDA');
    lineas.push(['id', 'nombre', 'tipo', 'lat', 'lon', 'x_km', 'y_km', 'poblacion', 'd_i_Mbps', 'w_i', 'centro_mas_cercano'].join(','));
    estado.nodos.forEach((n, i) => {
      lineas.push([n.id, esc(n.nombre), n.tipo, n.lat.toFixed(6), n.lon.toFixed(6),
        n.x.toFixed(4), n.y.toFixed(4), n.pob, n.d, n.w, M ? 'S' + (M.asign[i] + 1) : ''].join(','));
    });
    lineas.push('');

    lineas.push('## ETAPA 1 - OPTIMO SIN RESTRICCIONES');
    lineas.push('x_km,y_km,lat,lon,f_optimo,W,detH,norma_gradiente');
    const g1 = Geo.toGeo(estado.r1.p.x, estado.r1.p.y);
    lineas.push([estado.r1.p.x.toFixed(6), estado.r1.p.y.toFixed(6), g1.lat.toFixed(6), g1.lon.toFixed(6),
      estado.r1.f.toFixed(4), estado.r1.W, estado.r1.detH, estado.r1.normaGrad.toExponential(3)].join(','));
    lineas.push('');

    if (estado.r2) {
      lineas.push('## ETAPA 2 - OPTIMO CON RESTRICCION g(x,y)<=0 (KKT)');
      lineas.push('x_km,y_km,lambda,restriccion_activa,desplazamiento_km,f_restringida,delta_f');
      lineas.push([estado.r2.p.x.toFixed(6), estado.r2.p.y.toFixed(6), estado.r2.lambda.toFixed(6),
        estado.r2.activa, estado.r2.desplazamiento.toFixed(4), estado.r2.f.toFixed(4), estado.r2.deltaF.toFixed(4)].join(','));
      lineas.push('');
    }

    lineas.push('## CENTROS DE SERVICIO');
    lineas.push('centro,x_km,y_km,lat,lon,nodos,W_servido,B_j_Mbps,carga_Mbps,utilizacion,u_j_dual');
    M.centros.forEach((c, j) => {
      const g = Geo.toGeo(c.x, c.y);
      lineas.push(['S' + (j + 1), c.x.toFixed(4), c.y.toFixed(4), g.lat.toFixed(6), g.lon.toFixed(6),
        M.detalle[j].nNodos, M.detalle[j].W,
        lp.factible ? lp.anchos[j] : '', lp.factible ? lp.carga[j].toFixed(2) : '',
        lp.factible ? lp.utilizacion[j].toFixed(4) : '', lp.factible ? lp.dualB[j].toFixed(6) : ''].join(','));
    });
    lineas.push('');

    if (lp.factible) {
      lineas.push('## ETAPA 3 - MATRIZ DE ASIGNACION t_ij (Mbps)');
      lineas.push(['nodo'].concat(M.centros.map((_, j) => 'S' + (j + 1))).concat(['d_i']).join(','));
      estado.nodos.forEach((n, i) => {
        lineas.push([esc(n.nombre)].concat(M.centros.map((_, j) => lp.t[j][i].toFixed(2))).concat([n.d]).join(','));
      });
      lineas.push('');
      lineas.push('## RESUMEN ETAPA 3');
      lineas.push('Z_programacion_lineal,Z_vecino_mas_cercano,diferencia,vmc_factible,iteraciones_MODI');
      lineas.push([lp.Z.toFixed(4), lp.vmc.Z.toFixed(4), lp.diferencia.toFixed(4), lp.vmc.factible, lp.iteracionesMODI].join(','));
    }

    descargar(`escenario-valle-aburra-${sello()}.csv`, lineas.join('\n'), 'text/csv;charset=utf-8');
  }

  function sello() {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function exportarInforme() {
    const r1 = estado.r1, r2 = estado.r2, lp = estado.rLP, M = estado.rMulti;
    const g1 = Geo.toGeo(r1.p.x, r1.p.y);

    const filasCentros = M.centros.map((c, j) => {
      const g = Geo.toGeo(c.x, c.y);
      return `<tr><td>S${j + 1}</td><td>${c.x.toFixed(3)}; ${c.y.toFixed(3)}</td>
        <td>${g.lat.toFixed(5)}°, ${g.lon.toFixed(5)}°</td>
        <td>${M.detalle[j].nNodos}</td><td>${miles(M.detalle[j].demanda)}</td>
        <td>${lp.factible ? miles(lp.anchos[j]) : '—'}</td>
        <td>${lp.factible ? (lp.utilizacion[j] * 100).toFixed(1) + ' %' : '—'}</td></tr>`;
    }).join('');

    const filasNodos = estado.nodos.map((n, i) => {
      const j = M.asign[i];
      const reparto = lp.factible
        ? M.centros.map((_, k) => lp.t[k][i] > 1e-6 ? `S${k + 1}: ${miles(lp.t[k][i])}` : null).filter(Boolean).join(' / ')
        : '—';
      return `<tr><td>${n.nombre}</td><td>${n.tipo}</td><td>${miles(n.pob)}</td>
        <td>${miles(n.d)}</td><td>S${j + 1}</td><td>${reparto}</td></tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Informe de resultados — Red de cobertura del Valle de Aburrá</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;max-width:900px;margin:40px auto;padding:0 28px;color:#17202b;line-height:1.6}
  h1{font-size:23px;border-bottom:2px solid #17202b;padding-bottom:9px;margin-bottom:5px}
  h2{font-size:16px;margin-top:34px;border-bottom:1px solid #c8d2dd;padding-bottom:5px}
  h3{font-size:13px;margin-top:22px;color:#39506b}
  .meta{color:#60738a;font-size:12px;margin-bottom:26px}
  table{width:100%;border-collapse:collapse;margin:14px 0;font-size:12px;font-family:ui-monospace,monospace}
  th{background:#eef2f6;text-align:left;padding:7px 9px;border:1px solid #ccd6e0;font-size:11px}
  td{padding:6px 9px;border:1px solid #dde4ec}
  .kv{display:grid;grid-template-columns:1fr auto;gap:3px 18px;font-size:13px;margin:12px 0}
  .kv .k{color:#50627a}.kv .v{font-family:ui-monospace,monospace;text-align:right}
  .caja{background:#f5f8fb;border-left:3px solid #2b6cb0;padding:12px 16px;margin:16px 0;font-size:13px}
  .ok{border-left-color:#2f855a}.no{border-left-color:#c53030}
  footer{margin-top:46px;padding-top:16px;border-top:1px solid #ccd6e0;font-size:11px;color:#60738a;text-align:center}
  @media print{body{margin:0;max-width:none}}
</style></head><body>

<h1>Ubicación óptima de centros de servicio y asignación de tráfico</h1>
<p class="meta">Caso de estudio: Área Metropolitana del Valle de Aburrá &nbsp;·&nbsp;
Informe generado el ${new Date().toLocaleString('es-CO')}<br>
Universidad de San Buenaventura Colombia — Facultad de Ingenierías, Medellín</p>

<h2>1. Escenario evaluado</h2>
<div class="kv">
  <span class="k">Nodos de demanda <i>n</i></span><span class="v">${estado.nodos.length}</span>
  <span class="k">Centros de servicio <i>m</i></span><span class="v">${estado.m}</span>
  <span class="k">Intensidad de demanda</span><span class="v">${estado.intensidad} Mbps / 1000 hab</span>
  <span class="k">Demanda total Σdᵢ</span><span class="v">${miles(lp.demandaTotal || estado.nodos.reduce((a, n) => a + n.d, 0))} Mbps</span>
  <span class="k">Tarifa de transporte</span><span class="v">${estado.tarifa} $/Mbps·km</span>
  <span class="k">Capacidad instalada ΣB/Σd</span><span class="v">${estado.holgura.toFixed(2)}×</span>
  <span class="k">Región factible</span><span class="v">${estado.region.activa ? estado.regionObj.expresion : 'desactivada'}</span>
</div>

<h2>2. Etapa 1 — Optimización sin restricciones</h2>
<p>Minimizando <i>f</i>(x,y) = Σ wᵢ[(x−xᵢ)² + (y−yᵢ)²] mediante la condición de primer orden ∇<i>f</i> = 0 se obtiene el centroide ponderado de los nodos de demanda.</p>
<div class="kv">
  <span class="k">Punto óptimo (plano local)</span><span class="v">(${r1.p.x.toFixed(4)}, ${r1.p.y.toFixed(4)}) km</span>
  <span class="k">Coordenadas geográficas</span><span class="v">${g1.lat.toFixed(5)}°, ${g1.lon.toFixed(5)}°</span>
  <span class="k">Peso total W = Σwᵢ</span><span class="v">${miles(r1.W)}</span>
  <span class="k">f(x*, y*)</span><span class="v">${r1.f.toExponential(5)} Mbps·km²</span>
  <span class="k">‖∇f(x*, y*)‖</span><span class="v">${r1.normaGrad.toExponential(3)}</span>
  <span class="k">Matriz Hessiana</span><span class="v">H = 2W·I = [[${formatoCorto(r1.H[0][0])}, 0], [0, ${formatoCorto(r1.H[1][1])}]]</span>
  <span class="k">det H</span><span class="v">${r1.detH.toExponential(5)}</span>
  <span class="k">Autovalores</span><span class="v">{${formatoCorto(r1.autovalores[0])}, ${formatoCorto(r1.autovalores[1])}}</span>
</div>
<div class="caja ${r1.definidaPositiva ? 'ok' : 'no'}"><b>Clasificación del punto crítico:</b> ${r1.criterio}.
La Hessiana es constante, luego <i>f</i> es convexa en todo ℝ² y el mínimo local es global y único.</div>

<h2>3. Etapa 2 — Restricción geográfica y condiciones de Kuhn-Tucker</h2>
${estado.region.activa && r2 ? `
<p>Restricción impuesta: <code>${estado.regionObj.expresion}</code></p>
<div class="kv">
  <span class="k">Estado de la restricción</span><span class="v">${r2.activa ? 'ACTIVA' : 'INACTIVA'}</span>
  <span class="k">Óptimo restringido</span><span class="v">(${r2.p.x.toFixed(4)}, ${r2.p.y.toFixed(4)}) km</span>
  <span class="k">Multiplicador λ*</span><span class="v">${r2.lambda.toExponential(5)}</span>
  <span class="k">Desplazamiento del óptimo</span><span class="v">${r2.desplazamiento.toFixed(4)} km</span>
  <span class="k">f con restricción</span><span class="v">${r2.f.toExponential(5)} Mbps·km²</span>
  <span class="k">Penalización Δf</span><span class="v">${r2.deltaF.toExponential(5)} (${pct(r2.deltaFrel)})</span>
  <span class="k">Estacionariedad ‖∇f + λ∇g‖</span><span class="v">${r2.condiciones.estacionariedad.valor.toExponential(3)}</span>
  <span class="k">Factibilidad primal g(x*,y*)</span><span class="v">${r2.condiciones.factibilidadPrimal.valor.toExponential(3)}</span>
  <span class="k">Holgura complementaria λ·g</span><span class="v">${r2.condiciones.holguraComplementaria.valor.toExponential(3)}</span>
</div>
<div class="caja ${r2.activa ? '' : 'ok'}">${r2.activa
  ? `La restricción está activa: el óptimo sin restricciones no pertenece a la región factible, de modo que la solución se desplaza <b>${r2.desplazamiento.toFixed(3)} km</b> hasta la frontera g = 0 y el objetivo empeora en <b>${pct(r2.deltaFrel)}</b>. El multiplicador λ* = ${formatoCorto(r2.lambda)} cuantifica ese costo marginal.`
  : 'La restricción está inactiva: el óptimo sin restricciones ya pertenece a la región factible, de modo que λ* = 0 y la solución no se desplaza, tal como exige la holgura complementaria.'}</div>`
: '<p>La restricción geográfica se encuentra desactivada en este escenario.</p>'}

<h2>4. Etapa 3 — Asignación de tráfico por programación lineal</h2>
${lp.factible ? `
<div class="kv">
  <span class="k">Costo óptimo Z*</span><span class="v">$ ${lp.Z.toFixed(4)}</span>
  <span class="k">Costo con vecino más cercano</span><span class="v">$ ${lp.vmc.Z.toFixed(4)}</span>
  <span class="k">¿Vecino más cercano admisible?</span><span class="v">${lp.vmc.factible ? 'sí' : 'no — viola ' + lp.vmc.sobrecargas.length + ' restricción(es) de capacidad'}</span>
  <span class="k">Diferencia</span><span class="v">$ ${lp.diferencia.toFixed(4)} (${pct(lp.mejora)})</span>
  <span class="k">Iteraciones del método MODI</span><span class="v">${lp.iteracionesMODI}</span>
  <span class="k">Celdas básicas</span><span class="v">${lp.basicas} de ${lp.requeridas}</span>
  <span class="k">Nodos repartidos entre centros</span><span class="v">${lp.divididos.length}</span>
</div>
<div class="caja ${lp.vmc.factible ? 'ok' : 'no'}">${lp.vmc.factible
  ? 'Con la capacidad instalada actual, asignar cada nodo a su centro más cercano resulta admisible, y el modelo lineal iguala o mejora ese costo. Ninguna asignación que respete los anchos de banda puede costar menos que Z*.'
  : `Asignar cada nodo a su centro más cercano <b>no es admisible</b>: sobrecarga ${lp.vmc.sobrecargas.map(s => 'S' + (s.j + 1) + ' en ' + miles(s.exceso) + ' Mbps').join(', ')}. El modelo lineal redistribuye ese excedente y entrega el costo mínimo entre las asignaciones factibles.`}</div>

<h3>4.1 Centros de servicio</h3>
<table><thead><tr><th>Centro</th><th>Posición (km)</th><th>Coordenadas</th><th>Nodos</th><th>Demanda (Mbps)</th><th>Bⱼ (Mbps)</th><th>Utilización</th></tr></thead><tbody>${filasCentros}</tbody></table>

<h3>4.2 Asignación por nodo</h3>
<table><thead><tr><th>Nodo</th><th>Tipo</th><th>Población</th><th>dᵢ (Mbps)</th><th>Más cercano</th><th>Reparto tᵢⱼ</th></tr></thead><tbody>${filasNodos}</tbody></table>`
: `<div class="caja no"><b>Modelo infactible.</b> ${lp.mensaje} Déficit de ${miles(lp.deficit)} Mbps.</div>`}

<h2>5. Nota sobre los datos</h2>
<p style="font-size:12.5px">Las coordenadas geográficas de las 16 comunas de Medellín y de los 9 municipios restantes del Área Metropolitana son reales. Las cifras de población son valores de referencia del orden de magnitud de las proyecciones oficiales, y la demanda en Mbps se deriva de ellas mediante un factor de intensidad configurable. Conforme a la limitación L2 del documento del proyecto, los resultados sirven para comparar métodos de optimización y no para tomar decisiones sobre una red existente.</p>

<footer>Leandro Zapata Muñoz · Thomas Jiménez Duque · Jerónimo Posada Gil<br>
Universidad de San Buenaventura Colombia — Facultad de Ingenierías — Medellín</footer>
</body></html>`;

    descargar(`informe-red-cobertura-${sello()}.html`, html, 'text/html;charset=utf-8');
  }

  function restablecer() {
    Object.assign(estado, App.DEFECTOS);
    estado.region.activa = true;
    estado.region.tipo = 'circulo';
    estado.region.centro = { ...Datos.REGION_DEFECTO.centro };
    estado.region.radioKm = Datos.REGION_DEFECTO.radioKm;
    estado.region.angulo = 0;
    estado.aplicarRegionMulti = false;
    estado.factorB = [];
    estado.trayectoria = null;
    App.construirNodos();

    // Devolver los controles a su posición inicial
    $('#m-centros').value = estado.m;          $('#m-valor').textContent = estado.m;
    $('#intensidad').value = estado.intensidad; $('#intensidad-valor').textContent = estado.intensidad.toFixed(1) + ' Mbps / 1000 hab';
    $('#semilla').value = estado.semilla;       $('#semilla-valor').textContent = '#' + estado.semilla;
    $('#region-radio').value = estado.region.radioKm; $('#radio-valor').textContent = estado.region.radioKm.toFixed(2) + ' km';
    $('#region-angulo').value = 0;              $('#angulo-valor').textContent = '0°';
    $('#holgura').value = estado.holgura;       $('#holgura-valor').textContent = estado.holgura.toFixed(2) + '×';
    $('#tarifa').value = estado.tarifa;         $('#tarifa-valor').textContent = estado.tarifa.toFixed(2) + ' $/Mbps·km';
    $('#alpha-campo').value = estado.alphaCampo * 100; $('#alpha-valor').textContent = Math.round(estado.alphaCampo * 100) + ' %';
    $('#region-activa').checked = true;
    $('#region-multi').checked = false;
    $('#ctrl-radio').hidden = false;
    $('#ctrl-angulo').hidden = true;
    reiniciarSegmentado('#region-tipo', 'circulo');
    reiniciarSegmentado('#reparto', 'uniforme');
    reiniciarSegmentado('#metrica-costo', 'euclidiana');
    reiniciarSegmentado('#campo-metrica', 'cuadratica');

    App.sincronizarRangos();
    App.recalcular({ sensibilidad: true });
    encuadrar();
  }

  function reiniciarSegmentado(sel, valor) {
    $(sel).querySelectorAll('button').forEach(b => b.classList.toggle('activo', b.dataset.valor === valor));
  }

  /* ======================================================================
   *  ARRANQUE
   * ==================================================================== */
  App.registrarUI({ render, renderSensibilidad, inspectorNodo, inspectorCentro });

  window.addEventListener('DOMContentLoaded', () => {
    App.construirNodos();
    App.iniciarMapa();
    enlazarControles();
    App.sincronizarRangos();
    App.recalcular({ sensibilidad: true });
    setTimeout(encuadrar, 120);
    window.addEventListener('resize', () => {
      renderEtapa1();
      if (estado.pestanaActiva === 'p-sens') App.programarSensibilidad();
    });
  });
})();
