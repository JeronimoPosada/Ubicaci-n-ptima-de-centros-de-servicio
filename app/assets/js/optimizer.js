/* ============================================================================
 *  optimizer.js — Etapas 1 y 2 del modelo
 *
 *  ETAPA 1 · Optimización sin restricciones
 *     f(x,y) = Σ w_i [(x-x_i)² + (y-y_i)²]            (ec. 1 del documento)
 *     ∇f = 0  ⇒  (x*, y*) = centroide ponderado
 *     H = [[2W,0],[0,2W]] con W = Σ w_i  ⇒  definida positiva ⇒ mínimo global
 *
 *  ETAPA 2 · Optimización con restricción geográfica g(x,y) ≤ 0 vía KKT
 *     Se resuelven en forma cerrada los tres tipos de región soportados
 *     (disco, semiplano y polígono convexo) y se reporta el multiplicador λ*,
 *     la holgura complementaria y el incremento Δf del objetivo.
 *
 *  ETAPA 1-m · Extensión a m centros (heurística de Cooper / Lloyd ponderado)
 *     Alterna «asignar al más cercano» y «recolocar en el centroide ponderado»,
 *     proyectando cada centro a la región factible. El costo decrece de forma
 *     monótona, por lo que el procedimiento termina en un óptimo local.
 * ==========================================================================*/
(function (global) {
  'use strict';

  /* ======================================================================
   *  Identidad de descomposición del momento de segundo orden
   *  Σ w_i |p - p_i|² = W |p - p̄|² + Σ w_i |p_i - p̄|²
   *  El segundo término es la inercia residual: el mínimo alcanzable.
   * ==================================================================== */

  /** Evalúa f(x,y) sobre el conjunto de nodos. */
  function f(p, nodos) {
    let s = 0;
    for (const n of nodos) {
      const dx = p.x - n.x, dy = p.y - n.y;
      s += n.w * (dx * dx + dy * dy);
    }
    return s;
  }

  /** ∇f(x,y) = 2 Σ w_i (p - p_i). */
  function grad(p, nodos) {
    let gx = 0, gy = 0;
    for (const n of nodos) { gx += n.w * (p.x - n.x); gy += n.w * (p.y - n.y); }
    return { x: 2 * gx, y: 2 * gy };
  }

  /* ----------------------------------------------------------------------
   *  ETAPA 1
   * -------------------------------------------------------------------- */
  function etapa1(nodos) {
    let W = 0, sx = 0, sy = 0;
    for (const n of nodos) { W += n.w; sx += n.w * n.x; sy += n.w * n.y; }
    if (W <= 0) return null;

    const p = { x: sx / W, y: sy / W };

    // Hessiana constante: H = 2W·I. Se reporta explícitamente porque el
    // objetivo OE2 del proyecto pide demostrar que el crítico es un mínimo.
    const H = [[2 * W, 0], [0, 2 * W]];
    const detH = H[0][0] * H[1][1] - H[0][1] * H[1][0];
    const traza = H[0][0] + H[1][1];
    // Para H = 2W·I los autovalores coinciden y valen 2W.
    const autovalores = [2 * W, 2 * W];

    const g = grad(p, nodos);
    return {
      p,
      W,
      f: f(p, nodos),
      grad: g,
      normaGrad: Math.hypot(g.x, g.y),
      H, detH, traza, autovalores,
      menorPrincipal1: H[0][0],
      definidaPositiva: H[0][0] > 0 && detH > 0,
      criterio: H[0][0] > 0 && detH > 0
        ? 'H definida positiva (∂²f/∂x² > 0 y det H > 0) ⇒ mínimo global único'
        : 'H no definida positiva ⇒ el punto crítico no es un mínimo'
    };
  }

  /* ----------------------------------------------------------------------
   *  Descenso por gradiente — solo con fines de visualización.
   *  Permite animar la convergencia hacia el punto que ya se conoce en
   *  forma cerrada; el paso óptimo exacto para esta f es α = 1/(2W).
   * -------------------------------------------------------------------- */
  function trayectoriaGradiente(inicio, nodos, pasos = 60, factor = 0.35) {
    let W = 0; for (const n of nodos) W += n.w;
    const alfa = factor / (2 * W);
    let p = { x: inicio.x, y: inicio.y };
    const tray = [{ x: p.x, y: p.y, f: f(p, nodos) }];
    for (let k = 0; k < pasos; k++) {
      const g = grad(p, nodos);
      p = { x: p.x - alfa * g.x, y: p.y - alfa * g.y };
      tray.push({ x: p.x, y: p.y, f: f(p, nodos) });
      if (Math.hypot(g.x, g.y) < 1e-9) break;
    }
    return tray;
  }

  /* ----------------------------------------------------------------------
   *  Regiones factibles g(x,y) ≤ 0
   *  Cada región expone: g(p), gradG(p), y proyectar(p̄, W) con el análisis KKT.
   * -------------------------------------------------------------------- */

  const Regiones = {
    /** Disco: g(x,y) = (x-cx)² + (y-cy)² - R² ≤ 0. */
    circulo(centro, R) {
      return {
        tipo: 'circulo',
        centro, R,
        expresion: `g(x,y) = (x − ${centro.x.toFixed(2)})² + (y − ${centro.y.toFixed(2)})² − ${R.toFixed(2)}² ≤ 0`,
        g: (p) => (p.x - centro.x) ** 2 + (p.y - centro.y) ** 2 - R * R,
        gradG: (p) => ({ x: 2 * (p.x - centro.x), y: 2 * (p.y - centro.y) }),
        resolverKKT(pBar, W) {
          const vx = pBar.x - centro.x, vy = pBar.y - centro.y;
          const D = Math.hypot(vx, vy);
          if (D <= R + 1e-12) {
            // El óptimo sin restricciones ya es factible: restricción inactiva.
            return { p: { ...pBar }, lambda: 0, activa: false, D, distFrontera: R - D };
          }
          /*  Estacionariedad:  2W(p* − p̄) + λ·2(p* − c) = 0
           *  ⇒  p* = (W p̄ + λ c)/(W + λ)  ⇒  |p*−c| = W·D/(W+λ) = R
           *  ⇒  λ* = W (D − R)/R > 0,  y p* cae sobre la frontera.          */
          const lambda = W * (D - R) / R;
          const p = { x: centro.x + R * vx / D, y: centro.y + R * vy / D };
          return {
            p, lambda, activa: true, D, distFrontera: 0,
            // Sensibilidad directa del radio: d f*/dR = −2W(D−R).
            dfdR: -2 * W * (D - R)
          };
        }
      };
    },

    /** Semiplano: g(x,y) = a·(x,y) − c ≤ 0, con a = (ax, ay). */
    semiplano(a, c) {
      const na2 = a.x * a.x + a.y * a.y;
      return {
        tipo: 'semiplano',
        a, c,
        expresion: `g(x,y) = ${a.x.toFixed(3)}·x + ${a.y.toFixed(3)}·y − ${c.toFixed(3)} ≤ 0`,
        g: (p) => a.x * p.x + a.y * p.y - c,
        gradG: () => ({ ...a }),
        resolverKKT(pBar, W) {
          const viol = a.x * pBar.x + a.y * pBar.y - c;
          if (viol <= 1e-12) return { p: { ...pBar }, lambda: 0, activa: false, distFrontera: -viol / Math.sqrt(na2) };
          /*  p* = p̄ − t·a con t = (a·p̄ − c)/|a|²  (proyección ortogonal)
           *  2W(p* − p̄) + λ a = 0 ⇒ λ* = 2W t > 0                            */
          const t = viol / na2;
          return {
            p: { x: pBar.x - t * a.x, y: pBar.y - t * a.y },
            lambda: 2 * W * t,
            activa: true,
            distFrontera: 0
          };
        }
      };
    },

    /**
     * Polígono convexo: intersección de semiplanos a_k·p ≤ c_k con normales
     * unitarias exteriores. Se asume el polígono dado en orden antihorario.
     */
    poligono(vertices) {
      const caras = [];
      const nV = vertices.length;
      for (let k = 0; k < nV; k++) {
        const p0 = vertices[k], p1 = vertices[(k + 1) % nV];
        const ex = p1.x - p0.x, ey = p1.y - p0.y;
        const L = Math.hypot(ex, ey) || 1;
        const a = { x: ey / L, y: -ex / L };          // normal exterior unitaria (CCW)
        caras.push({ a, c: a.x * p0.x + a.y * p0.y, p0, p1 });
      }
      return {
        tipo: 'poligono',
        vertices, caras,
        expresion: `g_k(x,y) = aₖ·(x,y) − cₖ ≤ 0,  k = 1…${nV} (intersección de semiplanos)`,
        g: (p) => Math.max(...caras.map(f_ => f_.a.x * p.x + f_.a.y * p.y - f_.c)),
        gradG: (p) => {
          let mejor = caras[0], v = -Infinity;
          for (const f_ of caras) {
            const t = f_.a.x * p.x + f_.a.y * p.y - f_.c;
            if (t > v) { v = t; mejor = f_; }
          }
          return { ...mejor.a };
        },
        resolverKKT(pBar, W) {
          const violadas = caras.filter(f_ => f_.a.x * pBar.x + f_.a.y * pBar.y - f_.c > 1e-12);
          if (!violadas.length) {
            const holg = Math.min(...caras.map(f_ => f_.c - (f_.a.x * pBar.x + f_.a.y * pBar.y)));
            return { p: { ...pBar }, lambda: 0, activa: false, distFrontera: holg, activas: [] };
          }
          // Punto más cercano del polígono convexo: el mínimo sobre las aristas.
          let mejor = null;
          for (const f_ of caras) {
            const q = proyectarSegmento(pBar, f_.p0, f_.p1);
            const d = Math.hypot(q.x - pBar.x, q.y - pBar.y);
            if (!mejor || d < mejor.d) mejor = { q, d, cara: f_ };
          }
          // Caras activas en p*: las que se cumplen con igualdad.
          const activas = caras
            .map((f_, k) => ({ k, f_, r: f_.a.x * mejor.q.x + f_.a.y * mejor.q.y - f_.c }))
            .filter(o => Math.abs(o.r) < 1e-7);

          /*  2W(p* − p̄) + Σ λ_k a_k = 0. Con una sola cara activa λ = 2W·d.
           *  En un vértice se resuelve el sistema 2×2 de las dos normales.   */
          const rhs = { x: 2 * W * (pBar.x - mejor.q.x), y: 2 * W * (pBar.y - mejor.q.y) };
          let lambdas;
          if (activas.length >= 2) {
            const A = activas.slice(0, 2).map(o => o.f_.a);
            const det = A[0].x * A[1].y - A[0].y * A[1].x;
            if (Math.abs(det) > 1e-12) {
              lambdas = [
                (rhs.x * A[1].y - rhs.y * A[1].x) / det,
                (A[0].x * rhs.y - A[0].y * rhs.x) / det
              ];
            } else lambdas = [2 * W * mejor.d, 0];
          } else {
            lambdas = [2 * W * mejor.d];
          }
          return {
            p: mejor.q,
            lambda: lambdas.reduce((a_, b) => a_ + Math.max(0, b), 0),
            lambdas,
            activa: true,
            distFrontera: 0,
            activas: activas.map(o => o.k)
          };
        }
      };
    }
  };

  function proyectarSegmento(p, a, b) {
    const ex = b.x - a.x, ey = b.y - a.y;
    const L2 = ex * ex + ey * ey;
    if (L2 < 1e-15) return { x: a.x, y: a.y };
    let t = ((p.x - a.x) * ex + (p.y - a.y) * ey) / L2;
    t = Math.max(0, Math.min(1, t));
    return { x: a.x + t * ex, y: a.y + t * ey };
  }

  /* ----------------------------------------------------------------------
   *  ETAPA 2 — resultado completo con verificación de las cuatro condiciones
   * -------------------------------------------------------------------- */
  function etapa2(nodos, region, res1) {
    const base = res1 || etapa1(nodos);
    const kkt = region.resolverKKT(base.p, base.W);
    const fRes = f(kkt.p, nodos);

    const gVal = region.g(kkt.p);
    const gg = region.gradG(kkt.p);
    const gf = grad(kkt.p, nodos);
    // Residuo de estacionariedad ‖∇f + λ∇g‖, debe ser ≈ 0.
    const resid = Math.hypot(gf.x + kkt.lambda * gg.x, gf.y + kkt.lambda * gg.y);

    return {
      p: kkt.p,
      f: fRes,
      lambda: kkt.lambda,
      activa: kkt.activa,
      lambdas: kkt.lambdas,
      dfdR: kkt.dfdR,
      desplazamiento: Math.hypot(kkt.p.x - base.p.x, kkt.p.y - base.p.y),
      deltaF: fRes - base.f,
      deltaFrel: base.f > 0 ? (fRes - base.f) / base.f : 0,
      condiciones: {
        estacionariedad: { valor: resid, cumple: resid < 1e-6 * Math.max(1, base.W) },
        factibilidadPrimal: { valor: gVal, cumple: gVal <= 1e-6 * Math.max(1, Math.abs(gVal) + 1) },
        factibilidadDual: { valor: kkt.lambda, cumple: kkt.lambda >= -1e-9 },
        holguraComplementaria: { valor: kkt.lambda * gVal, cumple: Math.abs(kkt.lambda * gVal) < 1e-5 }
      },
      gradF: gf,
      gradG: gg
    };
  }

  /* ----------------------------------------------------------------------
   *  Inicialización k-means++ ponderada (siembra determinista por semilla)
   * -------------------------------------------------------------------- */
  function rngLCG(semilla) {
    let s = semilla >>> 0 || 1;
    return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296);
  }

  function sembrar(nodos, m, semilla) {
    const rnd = rngLCG(semilla);
    const centros = [];
    // Primer centro: el nodo de mayor peso (arranque estable y reproducible).
    let mejor = nodos[0];
    for (const n of nodos) if (n.w > mejor.w) mejor = n;
    centros.push({ x: mejor.x, y: mejor.y });

    while (centros.length < m) {
      const d2 = nodos.map(n => {
        let md = Infinity;
        for (const c of centros) md = Math.min(md, (n.x - c.x) ** 2 + (n.y - c.y) ** 2);
        return md * n.w;                       // ponderación por demanda
      });
      const tot = d2.reduce((a, b) => a + b, 0);
      if (tot <= 0) break;
      let r = rnd() * tot, i = 0;
      while (i < d2.length - 1 && (r -= d2[i]) > 0) i++;
      centros.push({ x: nodos[i].x, y: nodos[i].y });
    }
    return centros;
  }

  /* ----------------------------------------------------------------------
   *  ETAPA 1-m / 2-m — m centros por alternancia de Cooper
   * -------------------------------------------------------------------- */
  function multicentro(nodos, m, opciones = {}) {
    const { region = null, aplicarRegion = false, semilla = 7, maxIter = 100 } = opciones;
    let centros = sembrar(nodos, Math.min(m, nodos.length), semilla);
    let asign = new Array(nodos.length).fill(-1);
    const historia = [];

    for (let it = 0; it < maxIter; it++) {
      // --- Paso de asignación: cada nodo al centro más cercano ---
      let cambio = false, costo = 0;
      for (let i = 0; i < nodos.length; i++) {
        let mejor = 0, md = Infinity;
        for (let j = 0; j < centros.length; j++) {
          const d = (nodos[i].x - centros[j].x) ** 2 + (nodos[i].y - centros[j].y) ** 2;
          if (d < md) { md = d; mejor = j; }
        }
        if (asign[i] !== mejor) { asign[i] = mejor; cambio = true; }
        costo += nodos[i].w * md;
      }
      historia.push(costo);

      // --- Paso de recolocación: centroide ponderado de cada grupo ---
      const sx = new Array(centros.length).fill(0);
      const sy = new Array(centros.length).fill(0);
      const sw = new Array(centros.length).fill(0);
      for (let i = 0; i < nodos.length; i++) {
        const j = asign[i];
        sx[j] += nodos[i].w * nodos[i].x;
        sy[j] += nodos[i].w * nodos[i].y;
        sw[j] += nodos[i].w;
      }
      const nuevos = centros.map((c, j) => {
        if (sw[j] <= 0) return { ...c };               // grupo vacío: se conserva
        let p = { x: sx[j] / sw[j], y: sy[j] / sw[j] };
        if (aplicarRegion && region) p = region.resolverKKT(p, sw[j]).p;  // proyección KKT
        return p;
      });
      const movimiento = Math.max(...nuevos.map((p, j) => Math.hypot(p.x - centros[j].x, p.y - centros[j].y)));
      centros = nuevos;
      if (!cambio && movimiento < 1e-9) break;
    }

    // --- Diagnóstico por centro: peso servido, inercia y análisis KKT ---
    const detalle = centros.map((c, j) => {
      const grupo = nodos.filter((_, i) => asign[i] === j);
      const W = grupo.reduce((a, n) => a + n.w, 0);
      const demanda = grupo.reduce((a, n) => a + n.d, 0);
      let kkt = null;
      if (region && W > 0) {
        const pBar = {
          x: grupo.reduce((a, n) => a + n.w * n.x, 0) / W,
          y: grupo.reduce((a, n) => a + n.w * n.y, 0) / W
        };
        kkt = region.resolverKKT(pBar, W);
        kkt.pSinRestriccion = pBar;
      }
      return {
        j, p: c, W, demanda,
        nNodos: grupo.length,
        inercia: f(c, grupo),
        kkt
      };
    });

    return {
      centros, asign, detalle, historia,
      iteraciones: historia.length,
      costoTotal: historia[historia.length - 1]
    };
  }


  /* ----------------------------------------------------------------------
   *  Comparación: punto de Weber (suma de distancias SIN elevar al cuadrado)
   *  resuelto con el algoritmo de Weiszfeld. No tiene solución cerrada, y por
   *  eso el proyecto adopta la métrica cuadrática. Se incluye para mostrar
   *  cuánto se separan ambos óptimos sobre el mismo conjunto de nodos.
   * -------------------------------------------------------------------- */
  function weiszfeld(nodos, maxIter = 300, tol = 1e-10) {
    let W = 0, sx = 0, sy = 0;
    for (const n of nodos) { W += n.w; sx += n.w * n.x; sy += n.w * n.y; }
    let p = { x: sx / W, y: sy / W };                 // arranque: centroide
    let iter = 0;
    for (; iter < maxIter; iter++) {
      let num = { x: 0, y: 0 }, den = 0, coincide = false;
      for (const n of nodos) {
        const d = Math.hypot(p.x - n.x, p.y - n.y);
        if (d < 1e-12) { coincide = true; break; }    // el óptimo cae sobre un nodo
        const peso = n.w / d;
        num.x += peso * n.x; num.y += peso * n.y; den += peso;
      }
      if (coincide || den === 0) break;
      const q = { x: num.x / den, y: num.y / den };
      const paso = Math.hypot(q.x - p.x, q.y - p.y);
      p = q;
      if (paso < tol) break;
    }
    let costo = 0;
    for (const n of nodos) costo += n.w * Math.hypot(p.x - n.x, p.y - n.y);
    return { p, costo, iteraciones: iter };
  }

  global.Opt = {
    f, grad, etapa1, etapa2, multicentro, trayectoriaGradiente, Regiones, sembrar, weiszfeld
  };
})(window);
