/* ============================================================================
 *  layers.js — Capas de dibujo sobre el motor de mapa
 *
 *  Cada capa recibe (ctx, vista) y dibuja en coordenadas de pantalla. El
 *  estado del modelo se lee de un objeto compartido, de modo que recalcular
 *  la optimización y redibujar el mapa quedan desacoplados.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const PALETA = [
    '#39d7ff', '#ffb43a', '#8b7bff', '#3ddc84',
    '#ff5d8f', '#f4e04d', '#52e3c2', '#ff8a5b'
  ];

  const col = (j) => PALETA[j % PALETA.length];

  /* --- Utilidades de dibujo --------------------------------------------- */

  function texto(ctx, s, x, y, opciones = {}) {
    const {
      fuente = '12px "Inter", system-ui, sans-serif',
      color = '#e8eef6',
      halo = 'rgba(3,7,12,0.92)',
      grosorHalo = 3.5,
      align = 'left',
      baseline = 'alphabetic'
    } = opciones;
    ctx.save();
    ctx.font = fuente;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.lineJoin = 'round';
    ctx.lineWidth = grosorHalo;
    ctx.strokeStyle = halo;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  function polilinea(ctx, pts, estilo) {
    if (pts.length < 2) return;
    ctx.save();
    Object.assign(ctx, estilo);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }


  /* ======================================================================
   *  Gestor de etiquetas
   *
   *  Un mapa con 25 nodos, m centros, el óptimo de cada etapa y las capas de
   *  referencia acumula rótulos en la misma zona. Este gestor lleva los
   *  rectángulos ya ocupados en el fotograma, prueba varias posiciones
   *  candidatas alrededor del punto de anclaje y omite la etiqueta si ninguna
   *  queda libre. Las etiquetas importantes reservan su espacio antes de que
   *  se dibuje nada, de modo que siempre ganan el sitio.
   * ==================================================================== */
  const Etiquetas = {
    ocupados: [],

    reset() { this.ocupados = []; },

    _solapa(r) {
      for (const o of this.ocupados) {
        if (r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y) return true;
      }
      return false;
    },

    /** Reserva un rectángulo centrado en (x, y) sin dibujar nada. */
    reservar(x, y, w, h) {
      this.ocupados.push({ x: x - w / 2, y: y - h / 2, w, h });
    },

    /**
     * Dibuja la etiqueta en la primera posición candidata libre.
     * Devuelve true si se dibujó. Con forzar = true se dibuja igualmente.
     */
    intentar(ctx, s, x, y, opciones = {}) {
      const { fuente = '11px "Inter", system-ui, sans-serif', radio = 6, forzar = false } = opciones;
      ctx.save();
      ctx.font = fuente;
      const w = ctx.measureText(s).width + 6;
      const h = 14;
      ctx.restore();

      // Derecha, izquierda, arriba, abajo y las cuatro diagonales.
      const candidatos = [
        [x + radio + 5, y + 4, 'left'],
        [x - radio - 5, y + 4, 'right'],
        [x, y - radio - 6, 'center'],
        [x, y + radio + 14, 'center'],
        [x + radio + 5, y - radio - 3, 'left'],
        [x - radio - 5, y - radio - 3, 'right'],
        [x + radio + 5, y + radio + 12, 'left'],
        [x - radio - 5, y + radio + 12, 'right']
      ];

      for (const [cx, cy, align] of candidatos) {
        const rx = align === 'left' ? cx : align === 'right' ? cx - w : cx - w / 2;
        const r = { x: rx, y: cy - 11, w, h };
        if (this._solapa(r)) continue;
        this.ocupados.push(r);
        texto(ctx, s, cx, cy, Object.assign({ align }, opciones));
        return true;
      }
      if (forzar) {
        texto(ctx, s, x + radio + 5, y + 4, Object.assign({ align: 'left' }, opciones));
        return true;
      }
      return false;
    }
  };

  /**
   * Capa de apertura del fotograma: limpia el registro de etiquetas y reserva
   * el espacio de los rótulos que no pueden omitirse (centros y región).
   */
  function capaReservaEtiquetas(estado) {
    return (ctx, v) => {
      Etiquetas.reset();
      const M = estado.rMulti;
      if (M) {
        for (const c of M.centros) {
          const p = v.projKm(c.x, c.y);
          Etiquetas.reservar(p.x, p.y, 54, 72);       // marcador, «Sx» y el porcentaje
        }
      }
    };
  }

  /* ======================================================================
   *  Capa: cartografía de referencia (río Aburrá y líneas del Metro)
   * ==================================================================== */
  function capaReferencia(estado) {
    return (ctx, v) => {
      // Río Aburrá–Medellín: trazo doble para dar sensación de cauce.
      const rio = Datos.RIO.map(([la, lo]) => v.proj(la, lo));
      polilinea(ctx, rio, { lineWidth: 7, strokeStyle: 'rgba(38,120,190,0.25)', lineCap: 'round', lineJoin: 'round' });
      polilinea(ctx, rio, { lineWidth: 2.5, strokeStyle: 'rgba(96,180,240,0.55)', lineCap: 'round', lineJoin: 'round' });

      if (v.zoom >= 13) {
        const m = rio[Math.floor(rio.length * 0.28)];
        Etiquetas.intentar(ctx, 'Río Aburrá–Medellín', m.x, m.y, {
          radio: 4, fuente: 'italic 11px "Inter", system-ui, sans-serif', color: 'rgba(150,205,245,0.8)'
        });
      }

      // Metro: línea A y línea B con sus estaciones.
      const dibujarLinea = (est, color, etiqueta) => {
        const pts = est.map(e => v.proj(e.lat, e.lon));
        polilinea(ctx, pts, { lineWidth: 3.5, strokeStyle: color, lineCap: 'round', lineJoin: 'round' });
        if (v.zoom >= 12.5) {
          ctx.save();
          for (const p of pts) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
            ctx.fillStyle = '#0b1016';
            ctx.fill();
            ctx.lineWidth = 1.4;
            ctx.strokeStyle = color;
            ctx.stroke();
          }
          ctx.restore();
        }
        if (v.zoom >= 12.5 && pts.length) {
          Etiquetas.intentar(ctx, etiqueta, pts[0].x, pts[0].y, {
            radio: 4, fuente: '600 10px "Inter", system-ui, sans-serif', color
          });
        }
      };
      dibujarLinea(Datos.METRO_A, 'rgba(255,170,60,0.85)', 'Metro L-A');
      dibujarLinea(Datos.METRO_B, 'rgba(255,120,120,0.8)', 'Metro L-B');
    };
  }

  /* ======================================================================
   *  Capa: superficie de la función objetivo f(x,y) + curvas de nivel
   * ==================================================================== */
  function capaCampo(estado) {
    let cache = null, firma = '';
    return (ctx, v) => {
      if (!estado.nodos.length) return;
      // La firma incluye un punto de referencia proyectado, de modo que el
      // cache se invalida tanto al hacer zoom como al desplazar el mapa.
      const ref = v.proj(Geo.ORIGIN.lat, Geo.ORIGIN.lon);
      const f = [
        v.zoom.toFixed(3), v.ancho, v.alto,
        ref.x.toFixed(1), ref.y.toFixed(1),
        estado.firmaNodos, estado.metricaCampo
      ].join('|');
      if (f !== firma || !cache) {
        cache = Campo.calcular(v, estado.nodos, { paso: 6, metrica: estado.metricaCampo });
        firma = f;
      }
      if (estado.capas.campo) {
        Campo.pintar(ctx, cache, { mapa: estado.colormap, alpha: estado.alphaCampo, gamma: 0.5, caida: 3.0 });
      }
      if (estado.capas.contornos) {
        Campo.dibujarContornos(ctx, cache, {
          cantidad: 7,
          color: 'rgba(255,255,255,0.16)',
          grosor: 1
        });
      }
      estado.campoCache = cache;
    };
  }

  /* ======================================================================
   *  Capa: regiones de influencia (Voronoi ponderado por cercanía)
   * ==================================================================== */
  function capaVoronoi(estado) {
    return (ctx, v) => {
      const C = estado.rMulti && estado.rMulti.centros;
      if (!C || C.length < 2) return;
      const paso = 5;
      const w = Math.ceil(v.ancho / paso) + 1, h = Math.ceil(v.alto / paso) + 1;
      const idx = new Int16Array(w * h);

      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          const km = v.invKm(c * paso, r * paso);
          let mejor = 0, md = Infinity;
          for (let j = 0; j < C.length; j++) {
            const d = (km.x - C[j].x) ** 2 + (km.y - C[j].y) ** 2;
            if (d < md) { md = d; mejor = j; }
          }
          idx[r * w + c] = mejor;
        }
      }

      // Relleno translúcido
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      const octx = off.getContext('2d');
      const img = octx.createImageData(w, h);
      for (let i = 0; i < idx.length; i++) {
        const hex = col(idx[i]);
        img.data[i * 4] = parseInt(hex.slice(1, 3), 16);
        img.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
        img.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
        img.data[i * 4 + 3] = 34;
      }
      octx.putImageData(img, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, w * paso, h * paso);
      ctx.restore();

      // Fronteras: celdas donde cambia el centro asignado
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (let r = 0; r < h - 1; r++) {
        for (let c = 0; c < w - 1; c++) {
          const a = idx[r * w + c];
          if (idx[r * w + c + 1] !== a) { ctx.moveTo((c + 1) * paso, r * paso); ctx.lineTo((c + 1) * paso, (r + 1) * paso); }
          if (idx[(r + 1) * w + c] !== a) { ctx.moveTo(c * paso, (r + 1) * paso); ctx.lineTo((c + 1) * paso, (r + 1) * paso); }
        }
      }
      ctx.stroke();
      ctx.restore();
    };
  }

  /* ======================================================================
   *  Capa: región factible g(x,y) ≤ 0
   * ==================================================================== */
  function capaRegion(estado) {
    return (ctx, v) => {
      if (!estado.region.activa || !estado.regionObj) return;
      const R = estado.regionObj;
      ctx.save();

      if (R.tipo === 'circulo') {
        const c = v.projKm(R.centro.x, R.centro.y);
        const rPx = R.R * v.pxPorKm;

        // Exterior oscurecido: lo que queda fuera de la región es no factible.
        ctx.beginPath();
        ctx.rect(0, 0, v.ancho, v.alto);
        ctx.arc(c.x, c.y, rPx, 0, Math.PI * 2, true);
        ctx.fillStyle = 'rgba(2,6,12,0.45)';
        ctx.fill('evenodd');

        // Frontera g = 0
        ctx.beginPath();
        ctx.arc(c.x, c.y, rPx, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = estado.r2 && estado.r2.activa ? '#3ddc84' : 'rgba(140,160,185,0.75)';
        ctx.setLineDash(estado.r2 && estado.r2.activa ? [] : [7, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Anillo de brillo cuando la restricción está activa
        if (estado.r2 && estado.r2.activa) {
          ctx.beginPath();
          ctx.arc(c.x, c.y, rPx, 0, Math.PI * 2);
          ctx.lineWidth = 9;
          ctx.strokeStyle = 'rgba(61,220,132,0.12)';
          ctx.stroke();
        }

        // Manija de redimensionado sobre la frontera (este)
        const hx = c.x + rPx, hy = c.y;
        ctx.beginPath();
        ctx.arc(hx, hy, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#0d141c';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#3ddc84';
        ctx.stroke();
        estado._handleRegion = { x: hx, y: hy, cx: c.x, cy: c.y };

        // La etiqueta se ancla sobre la frontera en el cuadrante superior
        // izquierdo, lejos del centro donde se acumulan los marcadores.
        const ang = -2.36;                                   // ≈ 135°
        Etiquetas.intentar(ctx, `g(x,y) ≤ 0   ·   R = ${R.R.toFixed(2)} km`,
          c.x + rPx * Math.cos(ang), c.y + rPx * Math.sin(ang), {
          radio: 5, forzar: true,
          fuente: '600 11px "JetBrains Mono", ui-monospace, monospace',
          color: estado.r2 && estado.r2.activa ? '#6bf0a6' : 'rgba(190,205,225,0.9)'
        });
      } else if (R.tipo === 'poligono') {
        const pts = R.vertices.map(p => v.projKm(p.x, p.y));
        ctx.beginPath();
        ctx.rect(0, 0, v.ancho, v.alto);
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = pts.length - 1; i >= 1; i--) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(2,6,12,0.45)';
        ctx.fill('evenodd');

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = estado.r2 && estado.r2.activa ? '#3ddc84' : 'rgba(140,160,185,0.75)';
        ctx.stroke();
      } else if (R.tipo === 'semiplano') {
        // Se traza la recta a·p = c y se sombrea el lado no factible.
        const a = R.a, cc = R.c;
        const puntos = [];
        const esquinas = [[0, 0], [v.ancho, 0], [v.ancho, v.alto], [0, v.alto]];
        for (let i = 0; i < 4; i++) {
          const p1 = v.invKm(esquinas[i][0], esquinas[i][1]);
          const p2 = v.invKm(esquinas[(i + 1) % 4][0], esquinas[(i + 1) % 4][1]);
          const g1 = a.x * p1.x + a.y * p1.y - cc;
          const g2 = a.x * p2.x + a.y * p2.y - cc;
          if (g1 * g2 < 0) {
            const t = g1 / (g1 - g2);
            puntos.push(v.projKm(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t));
          }
        }
        if (puntos.length >= 2) {
          polilinea(ctx, puntos, {
            lineWidth: 2,
            strokeStyle: estado.r2 && estado.r2.activa ? '#3ddc84' : 'rgba(140,160,185,0.75)'
          });
        }
      }
      ctx.restore();
    };
  }

  /* ======================================================================
   *  Capa: asignaciones de tráfico (etapa 3)
   * ==================================================================== */
  function capaAsignaciones(estado) {
    return (ctx, v) => {
      const lp = estado.rLP, C = estado.rMulti && estado.rMulti.centros;
      if (!lp || !lp.factible || !C) return;

      const maxT = Math.max(...lp.t.flat(), 1);
      ctx.save();
      ctx.lineCap = 'round';

      for (let j = 0; j < C.length; j++) {
        const pc = v.projKm(C[j].x, C[j].y);
        for (let i = 0; i < estado.nodos.length; i++) {
          const t = lp.t[j][i];
          if (t <= 1e-6) continue;
          const nodo = estado.nodos[i];
          const pn = v.projKm(nodo.x, nodo.y);
          const frac = t / nodo.d;                  // porción del nodo servida por j
          const ancho = 0.8 + 4.2 * Math.sqrt(t / maxT);

          ctx.beginPath();
          // Arco suave: separa visualmente los enlaces que comparten extremos.
          const mx = (pc.x + pn.x) / 2, my = (pc.y + pn.y) / 2;
          const dx = pn.x - pc.x, dy = pn.y - pc.y;
          const curv = 0.12 * (j % 2 === 0 ? 1 : -1);
          ctx.moveTo(pc.x, pc.y);
          ctx.quadraticCurveTo(mx - dy * curv, my + dx * curv, pn.x, pn.y);
          ctx.lineWidth = ancho;
          ctx.strokeStyle = col(j);
          ctx.globalAlpha = frac < 0.999 ? 0.9 : 0.55;   // los enlaces partidos resaltan
          if (frac < 0.999) ctx.setLineDash([9, 5]); else ctx.setLineDash([]);
          ctx.stroke();
        }
      }
      ctx.restore();
    };
  }

  /* ======================================================================
   *  Capa: nodos de demanda
   * ==================================================================== */
  function capaNodos(estado) {
    return (ctx, v) => {
      const dMax = Math.max(...estado.nodos.map(n => n.d), 1);
      const asign = estado.rMulti ? estado.rMulti.asign : null;
      const pendientes = [];          // las etiquetas se resuelven al final

      for (let i = 0; i < estado.nodos.length; i++) {
        const n = estado.nodos[i];
        const p = v.projKm(n.x, n.y);
        if (p.x < -60 || p.x > v.ancho + 60 || p.y < -60 || p.y > v.alto + 60) continue;

        const r = 4 + 11 * Math.sqrt(n.d / dMax);
        const color = asign ? col(asign[i]) : '#8fa7c4';
        const resaltado = estado.nodoActivo === i || estado.nodoArrastrado === i;

        // Halo proporcional a la demanda
        ctx.save();
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
        grad.addColorStop(0, color + '55');
        grad.addColorStop(1, color + '00');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = resaltado ? color : color + 'cc';
        ctx.fill();
        ctx.lineWidth = resaltado ? 2.6 : 1.4;
        ctx.strokeStyle = resaltado ? '#ffffff' : 'rgba(8,14,22,0.85)';
        ctx.stroke();

        // Marca distinta para municipios frente a comunas
        if (n.tipo === 'municipio') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(2, r * 0.38), 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(8,14,22,0.9)';
          ctx.fill();
        }

        pendientes.push({ n, p, r, color, resaltado });
      }

      /* Segunda pasada: los rótulos. Se ordenan por prioridad —el nodo bajo el
         cursor primero, luego los municipios, luego las comunas por demanda—
         de modo que si falta sitio se omiten los menos relevantes. */
      if (!estado.capas.etiquetas) return;
      pendientes.sort((a, b) => {
        if (a.resaltado !== b.resaltado) return a.resaltado ? -1 : 1;
        if ((a.n.tipo === 'municipio') !== (b.n.tipo === 'municipio')) return a.n.tipo === 'municipio' ? -1 : 1;
        return b.n.d - a.n.d;
      });

      for (const { n, p, r, resaltado } of pendientes) {
        if (!resaltado && v.zoom < 11.5 && n.tipo !== 'municipio') continue;
        Etiquetas.intentar(ctx, n.nombre, p.x, p.y, {
          radio: r,
          forzar: resaltado,
          fuente: resaltado ? '600 12px "Inter", system-ui, sans-serif' : '11px "Inter", system-ui, sans-serif',
          color: resaltado ? '#ffffff' : 'rgba(225,235,248,0.9)'
        });
      }
    };
  }

  /* ======================================================================
   *  Capa: centros de servicio, óptimos de etapa 1 y 2
   * ==================================================================== */
  function capaCentros(estado) {
    return (ctx, v) => {
      /* --- Óptimo sin restricciones (etapa 1): cruz fina --- */
      if (estado.r1 && estado.capas.optimos) {
        const p = v.projKm(estado.r1.p.x, estado.r1.p.y);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p.x - 18, p.y); ctx.lineTo(p.x + 18, p.y);
        ctx.moveTo(p.x, p.y - 18); ctx.lineTo(p.x, p.y + 18);
        ctx.stroke();
        // Si no hay sitio se omite: el valor sigue estando en el panel lateral.
        Etiquetas.intentar(ctx, 'E1 · ∇f = 0', p.x, p.y, {
          radio: 18,
          fuente: '600 10px "JetBrains Mono", ui-monospace, monospace',
          color: 'rgba(255,255,255,0.9)'
        });
        ctx.restore();

        /* --- Desplazamiento hacia la frontera (etapa 2) --- */
        if (estado.r2 && estado.r2.activa && estado.region.activa) {
          const q = v.projKm(estado.r2.p.x, estado.r2.p.y);
          ctx.save();
          ctx.strokeStyle = '#3ddc84';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
          ctx.stroke();
          ctx.setLineDash([]);
          // Punta de flecha
          const ang = Math.atan2(q.y - p.y, q.x - p.x);
          ctx.beginPath();
          ctx.moveTo(q.x, q.y);
          ctx.lineTo(q.x - 10 * Math.cos(ang - 0.4), q.y - 10 * Math.sin(ang - 0.4));
          ctx.lineTo(q.x - 10 * Math.cos(ang + 0.4), q.y - 10 * Math.sin(ang + 0.4));
          ctx.closePath();
          ctx.fillStyle = '#3ddc84';
          ctx.fill();
          // Se desplaza perpendicularmente al segmento para no pisarlo.
          const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
          const L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
          const nx = -(q.y - p.y) / L, ny = (q.x - p.x) / L;
          // El desplazamiento perpendicular crece cuando la flecha es corta,
          // que es justo cuando el centro de la escena está más congestionado.
          const sep = L < 60 ? 34 : 20;
          Etiquetas.intentar(ctx, `λ* = ${estado.r2.lambda.toFixed(1)}`, mx + nx * sep, my + ny * sep, {
            radio: 4,
            fuente: '600 11px "JetBrains Mono", ui-monospace, monospace', color: '#6bf0a6'
          });
          ctx.restore();
        }
      }

      /* --- Punto de Weber (comparación) --- */
      if (estado.rWeber && estado.capas.weber) {
        const p = v.projKm(estado.rWeber.p.x, estado.rWeber.p.y);
        ctx.save();
        ctx.strokeStyle = '#ffb43a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x - 7, p.y - 7); ctx.lineTo(p.x + 7, p.y + 7);
        ctx.moveTo(p.x + 7, p.y - 7); ctx.lineTo(p.x - 7, p.y + 7);
        ctx.stroke();
        texto(ctx, 'Weber', p.x + 10, p.y - 8, {
          fuente: '600 10px "Inter", system-ui, sans-serif', color: '#ffb43a'
        });
        ctx.restore();
      }

      /* --- Centros de servicio resueltos --- */
      const R = estado.rMulti;
      if (!R) return;
      const lp = estado.rLP;

      for (let j = 0; j < R.centros.length; j++) {
        const c = R.centros[j];
        const p = v.projKm(c.x, c.y);
        const color = col(j);
        const util = lp && lp.factible ? lp.utilizacion[j] : 0;
        const saturado = util > 0.999;

        // Anillo de utilización del ancho de banda
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, util));
        ctx.lineWidth = 4;
        ctx.strokeStyle = saturado ? '#ff5d8f' : color;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p.x, p.y, 17, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.stroke();
        ctx.restore();

        // Cuerpo del centro
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#060a10';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.restore();

        // Icono de antena
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + 4); ctx.lineTo(p.x, p.y - 5);
        ctx.moveTo(p.x - 3.5, p.y + 4); ctx.lineTo(p.x + 3.5, p.y + 4);
        ctx.stroke();
        ctx.restore();

        const etiqueta = `S${j + 1}`;
        texto(ctx, etiqueta, p.x, p.y - 24, {
          fuente: '700 12px "Inter", system-ui, sans-serif',
          color, align: 'center'
        });
        if (lp && lp.factible) {
          texto(ctx, `${(util * 100).toFixed(0)} %`, p.x, p.y + 32, {
            fuente: '600 10px "JetBrains Mono", ui-monospace, monospace',
            color: saturado ? '#ff8aae' : 'rgba(225,235,248,0.8)', align: 'center'
          });
        }
      }

      /* --- Trayectoria del descenso por gradiente (animación) --- */
      if (estado.trayectoria && estado.trayectoria.length > 1) {
        const pts = estado.trayectoria.slice(0, estado.trayectoriaPaso + 1).map(q => v.projKm(q.x, q.y));
        polilinea(ctx, pts, { lineWidth: 2, strokeStyle: 'rgba(255,255,255,0.85)', lineCap: 'round' });
        const ult = pts[pts.length - 1];
        if (ult) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(ult.x, ult.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.restore();
        }
      }
    };
  }

  /* ======================================================================
   *  Capa: escala gráfica, norte y atribución
   * ==================================================================== */
  function capaDecoracion(estado, motor) {
    return (ctx, v) => {
      /* Escala: se elige una longitud «redonda» cercana a 110 px. */
      const objetivoPx = 110;
      const kmObjetivo = objetivoPx / v.pxPorKm;
      const magnitud = Math.pow(10, Math.floor(Math.log10(kmObjetivo)));
      let km = magnitud;
      for (const mult of [1, 2, 5, 10]) {
        if (magnitud * mult <= kmObjetivo) km = magnitud * mult;
      }
      const px = km * v.pxPorKm;
      const x0 = 18, y0 = v.alto - 26;

      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(5,9,15,0.75)';
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x0 + px, y0);
      ctx.moveTo(x0, y0 - 5); ctx.lineTo(x0, y0 + 5);
      ctx.moveTo(x0 + px, y0 - 5); ctx.lineTo(x0 + px, y0 + 5);
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(235,242,250,0.9)';
      ctx.stroke();
      ctx.restore();
      texto(ctx, `${km} km`, x0 + px / 2, y0 - 9, {
        fuente: '600 10px "JetBrains Mono", ui-monospace, monospace', align: 'center'
      });

      /* Rosa de los vientos simplificada */
      const nx = v.ancho - 34, ny = 36;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(nx, ny - 14); ctx.lineTo(nx + 5, ny + 5); ctx.lineTo(nx, ny + 1); ctx.lineTo(nx - 5, ny + 5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(235,242,250,0.85)';
      ctx.fill();
      ctx.restore();
      texto(ctx, 'N', nx, ny + 18, { fuente: '700 10px "Inter", sans-serif', align: 'center' });

      /* Atribución de la cartografía */
      texto(ctx, motor.atribucion(), v.ancho - 10, v.alto - 8, {
        fuente: '10px "Inter", system-ui, sans-serif',
        color: 'rgba(205,218,235,0.6)', align: 'right'
      });
    };
  }

  global.Capas = {
    PALETA, col, texto, Etiquetas, capaReservaEtiquetas,
    capaReferencia, capaCampo, capaVoronoi, capaRegion,
    capaAsignaciones, capaNodos, capaCentros, capaDecoracion
  };
})(window);
