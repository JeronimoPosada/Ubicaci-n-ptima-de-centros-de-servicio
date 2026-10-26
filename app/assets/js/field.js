/* ============================================================================
 *  field.js — Campo escalar de la función objetivo y curvas de nivel
 *
 *  Dibuja f(x,y) sobre el mapa como una superficie de color y traza sus
 *  isolíneas con marching squares (interpolación lineal en las aristas).
 *
 *  Nota matemática que la visualización deja a la vista: por la identidad
 *      Σ w_i |p − p_i|² = W |p − p̄|² + Σ w_i |p_i − p̄|²
 *  la función objetivo de la etapa 1 es un paraboloide de revolución, así que
 *  sus curvas de nivel son circunferencias concéntricas centradas en el
 *  centroide ponderado. Con la métrica de Weber (distancia sin elevar al
 *  cuadrado) las isolíneas dejan de ser circulares, y el contraste entre
 *  ambas superficies explica por qué el modelo cuadrático tiene solución
 *  cerrada y el de Weber no.
 * ==========================================================================*/
(function (global) {
  'use strict';

  /* --- Mapas de color (puntos de control interpolados en RGB) ------------ */
  const COLORMAPS = {
    inferno: [[0,0,4],[22,11,57],[66,10,104],[106,23,110],[147,38,103],[188,55,84],[221,81,58],[243,120,25],[252,165,10],[246,215,70],[252,255,164]],
    viridis: [[68,1,84],[72,40,120],[62,74,137],[49,104,142],[38,130,142],[31,158,137],[53,183,121],[109,205,89],[180,222,44],[253,231,37]],
    magma:   [[0,0,4],[28,16,68],[79,18,123],[129,37,129],[181,54,122],[229,80,100],[251,135,97],[254,194,135],[252,253,191]],
    turbo:   [[48,18,59],[70,107,227],[42,170,224],[48,219,158],[143,243,80],[219,214,46],[254,152,43],[232,80,19],[165,24,4]]
  };

  function muestrearColor(mapa, t) {
    const cps = COLORMAPS[mapa] || COLORMAPS.inferno;
    const u = Math.max(0, Math.min(1, t)) * (cps.length - 1);
    const i = Math.min(cps.length - 2, Math.floor(u));
    const fr = u - i;
    const a = cps[i], b = cps[i + 1];
    return [
      Math.round(a[0] + (b[0] - a[0]) * fr),
      Math.round(a[1] + (b[1] - a[1]) * fr),
      Math.round(a[2] + (b[2] - a[2]) * fr)
    ];
  }

  /* ----------------------------------------------------------------------
   *  Evaluadores del campo. Reciben (x, y) en km del plano local.
   * -------------------------------------------------------------------- */
  function evaluador(nodos, metrica) {
    if (metrica === 'weber') {
      // Suma ponderada de distancias (no al cuadrado): problema de Weber.
      return (x, y) => {
        let s = 0;
        for (const n of nodos) s += n.w * Math.hypot(x - n.x, y - n.y);
        return s;
      };
    }
    // Por defecto: suma ponderada de distancias al cuadrado (ec. 1).
    return (x, y) => {
      let s = 0;
      for (const n of nodos) {
        const dx = x - n.x, dy = y - n.y;
        s += n.w * (dx * dx + dy * dy);
      }
      return s;
    };
  }

  /**
   * Evalúa el campo sobre una malla regular en coordenadas de pantalla.
   * paso = tamaño de celda en píxeles (mayor = más rápido, menos detalle).
   */
  function calcular(vista, nodos, opciones = {}) {
    const { paso = 5, metrica = 'cuadratica' } = opciones;
    const w = Math.max(2, Math.ceil(vista.ancho / paso) + 1);
    const h = Math.max(2, Math.ceil(vista.alto / paso) + 1);
    const fn = evaluador(nodos, metrica);
    const datos = new Float64Array(w * h);

    let min = Infinity, max = -Infinity;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const km = vista.invKm(c * paso, r * paso);
        const v = fn(km.x, km.y);
        datos[r * w + c] = v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return { datos, w, h, paso, min, max, metrica };
  }

  /**
   * Pinta el campo. La normalización por raíz cuarta comprime el rango
   * dinámico del paraboloide y deja ver estructura cerca del óptimo, donde
   * de otro modo todo saldría del mismo color.
   */
  function pintar(ctx, campo, opciones = {}) {
    const { mapa = 'inferno', alpha = 0.55, gamma = 0.5, invertir = true, caida = 1.8 } = opciones;
    const { datos, w, h, paso, min, max } = campo;
    const rango = max - min || 1;

    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const octx = off.getContext('2d');
    const img = octx.createImageData(w, h);

    /*
     * La opacidad se modula con el propio valor normalizado: la superficie es
     * intensa en el entorno del óptimo —donde aporta información— y se
     * desvanece donde f ya es grande, de modo que el mapa de fondo queda
     * legible en vez de cubierto por una lámina de color uniforme.
     */
    /*
     * Un degradado muy suave cuantizado a 8 bits produce bandas visibles. Se
     * añade un dither ordenado (matriz de Bayer 4×4) de amplitud inferior a un
     * nivel de cuantización: rompe las bandas sin alterar el valor medio.
     */
    const BAYER = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5].map(v => v / 16 - 0.5);

    for (let i = 0; i < datos.length; i++) {
      const fila = (i / w) | 0, columna = i % w;
      const d = BAYER[(fila % 4) * 4 + (columna % 4)];

      let t = Math.pow((datos[i] - min) / rango, gamma);
      if (invertir) t = 1 - t;                  // el óptimo queda en el extremo cálido
      const [r, g, b] = muestrearColor(mapa, Math.max(0, Math.min(1, t + d * 0.012)));
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      /* El dither también se aplica al canal alfa. Sin él, el punto donde la
         opacidad cruza 1/255 produce un borde duro en escalera, muy visible
         sobre los fondos oscuros. */
      img.data[i * 4 + 3] = Math.max(0, Math.round(255 * alpha * Math.pow(t, caida) + d));
    }
    octx.putImageData(img, 0, 0);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(off, 0, 0, w * paso, h * paso);
    ctx.restore();
  }

  /* ----------------------------------------------------------------------
   *  Marching squares: segmentos de la isolínea f = nivel en cada celda.
   * -------------------------------------------------------------------- */
  function isolinea(campo, nivel) {
    const { datos, w, h, paso } = campo;
    const segs = [];
    const val = (c, r) => datos[r * w + c];
    const interp = (x1, y1, v1, x2, y2, v2) => {
      const t = Math.abs(v2 - v1) < 1e-15 ? 0.5 : (nivel - v1) / (v2 - v1);
      return { x: (x1 + (x2 - x1) * t) * paso, y: (y1 + (y2 - y1) * t) * paso };
    };

    for (let r = 0; r < h - 1; r++) {
      for (let c = 0; c < w - 1; c++) {
        const v0 = val(c, r), v1 = val(c + 1, r), v2 = val(c + 1, r + 1), v3 = val(c, r + 1);
        let caso = 0;
        if (v0 > nivel) caso |= 1;
        if (v1 > nivel) caso |= 2;
        if (v2 > nivel) caso |= 4;
        if (v3 > nivel) caso |= 8;
        if (caso === 0 || caso === 15) continue;

        const arriba  = () => interp(c, r, v0, c + 1, r, v1);
        const derecha = () => interp(c + 1, r, v1, c + 1, r + 1, v2);
        const abajo   = () => interp(c, r + 1, v3, c + 1, r + 1, v2);
        const izq     = () => interp(c, r, v0, c, r + 1, v3);

        switch (caso) {
          case 1: case 14: segs.push([izq(), arriba()]); break;
          case 2: case 13: segs.push([arriba(), derecha()]); break;
          case 3: case 12: segs.push([izq(), derecha()]); break;
          case 4: case 11: segs.push([derecha(), abajo()]); break;
          case 5:          segs.push([izq(), arriba()], [derecha(), abajo()]); break;
          case 6: case 9:  segs.push([arriba(), abajo()]); break;
          case 7: case 8:  segs.push([izq(), abajo()]); break;
          case 10:         segs.push([izq(), abajo()], [arriba(), derecha()]); break;
        }
      }
    }
    return segs;
  }

  /** Niveles repartidos geométricamente entre el mínimo y el máximo. */
  function niveles(campo, cantidad = 8) {
    const out = [];
    const { min, max } = campo;
    for (let k = 1; k <= cantidad; k++) {
      const t = k / (cantidad + 1);
      out.push(min + (max - min) * Math.pow(t, 2.2));
    }
    return out;
  }

  function dibujarContornos(ctx, campo, opciones = {}) {
    const { cantidad = 8, color = 'rgba(255,255,255,0.28)', grosor = 1, etiquetar = false, formato = (v) => v.toFixed(0) } = opciones;
    const ns = niveles(campo, cantidad);
    ctx.save();
    ctx.lineWidth = grosor;
    ctx.strokeStyle = color;
    for (let k = 0; k < ns.length; k++) {
      const segs = isolinea(campo, ns[k]);
      ctx.beginPath();
      for (const [a, b] of segs) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke();
      if (etiquetar && segs.length) {
        const p = segs[Math.floor(segs.length * 0.18)][0];
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillText(formato(ns[k]), p.x + 3, p.y - 3);
      }
    }
    ctx.restore();
  }

  global.Campo = { calcular, pintar, dibujarContornos, isolinea, niveles, muestrearColor, COLORMAPS, evaluador };
})(window);
