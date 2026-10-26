/* ============================================================================
 *  transport.js — Etapa 3: programación lineal de asignación de tráfico
 *
 *      mín Z = Σ_i Σ_j c_ij t_ij
 *      s.a.  Σ_j t_ij = d_i      (toda la demanda del nodo i queda cubierta)
 *            Σ_i t_ij ≤ B_j      (ningún centro excede su ancho de banda)
 *            t_ij ≥ 0
 *
 *  El modelo es un problema de transporte. Se resuelve con el método símplex
 *  especializado para redes:
 *     1. Balanceo:   si Σ B_j > Σ d_i se agrega un destino ficticio de costo 0
 *                    que absorbe la capacidad ociosa.
 *     2. Solución básica factible inicial por aproximación de Vogel (VAM).
 *     3. Optimización por MODI (potenciales u_i, v_j): mientras exista un costo
 *        reducido negativo se construye el ciclo de la celda entrante y se
 *        pivotea. Al terminar, todos los costos reducidos son ≥ 0 y los
 *        potenciales son la solución dual (precios sombra).
 *
 *  Se implementa aquí en lugar de usar una librería porque los potenciales y
 *  los costos reducidos son precisamente lo que el proyecto necesita leer.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const EPS = 1e-9;

  /* ----------------------------------------------------------------------
   *  Matriz de costos: c_ij proporcional a la distancia centro ↔ nodo
   * -------------------------------------------------------------------- */
  function matrizCostos(nodos, centros, tarifa = 1, metrica = 'euclidiana') {
    return centros.map(c => nodos.map(n => {
      const d2 = (n.x - c.x) ** 2 + (n.y - c.y) ** 2;
      const d = metrica === 'cuadratica' ? d2 : Math.sqrt(d2);
      return tarifa * d;
    }));
  }

  /* ----------------------------------------------------------------------
   *  Asignación por vecino más cercano — la política «ingenua» de referencia
   *  contra la que la hipótesis H3 compara el modelo lineal.
   * -------------------------------------------------------------------- */
  function vecinoMasCercano(nodos, centros, costos) {
    const m = centros.length, n = nodos.length;
    const t = Array.from({ length: m }, () => new Array(n).fill(0));
    const carga = new Array(m).fill(0);
    let Z = 0;
    const asign = [];
    for (let i = 0; i < n; i++) {
      let mejor = 0, md = Infinity;
      for (let j = 0; j < m; j++) {
        const d = (nodos[i].x - centros[j].x) ** 2 + (nodos[i].y - centros[j].y) ** 2;
        if (d < md) { md = d; mejor = j; }
      }
      t[mejor][i] = nodos[i].d;
      carga[mejor] += nodos[i].d;
      Z += costos[mejor][i] * nodos[i].d;
      asign.push(mejor);
    }
    return { t, carga, Z, asign };
  }

  /* ----------------------------------------------------------------------
   *  Aproximación de Vogel (VAM) sobre el tablero balanceado
   * -------------------------------------------------------------------- */
  function vogel(costos, oferta, demanda) {
    const m = oferta.length, n = demanda.length;
    const t = Array.from({ length: m }, () => new Array(n).fill(0));
    const basica = Array.from({ length: m }, () => new Array(n).fill(false));
    const o = oferta.slice(), d = demanda.slice();
    const filaViva = new Array(m).fill(true), colViva = new Array(n).fill(true);
    let vivas = m + n;

    const penalizacion = (valores) => {
      const v = valores.filter(x => x !== null).sort((a, b) => a - b);
      if (v.length === 0) return -1;
      if (v.length === 1) return v[0];
      return v[1] - v[0];
    };

    while (vivas > 0) {
      let mejorPen = -1, mejorTipo = null, mejorIdx = -1;

      for (let i = 0; i < m; i++) {
        if (!filaViva[i]) continue;
        const p = penalizacion(costos[i].map((c, j) => colViva[j] ? c : null));
        if (p > mejorPen) { mejorPen = p; mejorTipo = 'f'; mejorIdx = i; }
      }
      for (let j = 0; j < n; j++) {
        if (!colViva[j]) continue;
        const p = penalizacion(costos.map((fila, i) => filaViva[i] ? fila[j] : null));
        if (p > mejorPen) { mejorPen = p; mejorTipo = 'c'; mejorIdx = j; }
      }
      if (mejorTipo === null) break;

      // Celda de costo mínimo dentro de la fila o columna seleccionada.
      let ci = -1, cj = -1, mc = Infinity;
      if (mejorTipo === 'f') {
        ci = mejorIdx;
        for (let j = 0; j < n; j++) if (colViva[j] && costos[ci][j] < mc) { mc = costos[ci][j]; cj = j; }
      } else {
        cj = mejorIdx;
        for (let i = 0; i < m; i++) if (filaViva[i] && costos[i][cj] < mc) { mc = costos[i][cj]; ci = i; }
      }
      if (ci < 0 || cj < 0) break;

      const q = Math.min(o[ci], d[cj]);
      t[ci][cj] = q; basica[ci][cj] = true;
      o[ci] -= q; d[cj] -= q;

      // Se desactiva fila o columna, nunca ambas a la vez (evita degeneración).
      if (o[ci] <= EPS && filaViva[ci] && vivas > 1) { filaViva[ci] = false; vivas--; }
      else if (d[cj] <= EPS && colViva[cj]) { colViva[cj] = false; vivas--; }
      else if (filaViva[ci]) { filaViva[ci] = false; vivas--; }
      if (vivas <= 1) {
        // Última celda: se cierra el tablero.
        for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
          if (filaViva[i] && colViva[j]) { t[i][j] += Math.min(o[i], d[j]); basica[i][j] = true; }
        }
        break;
      }
    }
    return { t, basica };
  }

  /** Garantiza m+n−1 celdas básicas insertando básicas degeneradas (valor 0). */
  function repararDegeneracion(t, basica, m, n) {
    let cuenta = 0;
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (basica[i][j]) cuenta++;
    const objetivo = m + n - 1;
    if (cuenta >= objetivo) return;

    // Se añaden celdas que no cierren ciclo con las ya básicas (union-find).
    const padre = new Array(m + n).fill(0).map((_, k) => k);
    const buscar = (a) => { while (padre[a] !== a) { padre[a] = padre[padre[a]]; a = padre[a]; } return a; };
    const unir = (a, b) => { const ra = buscar(a), rb = buscar(b); if (ra === rb) return false; padre[ra] = rb; return true; };

    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (basica[i][j]) unir(i, m + j);
    for (let i = 0; i < m && cuenta < objetivo; i++) {
      for (let j = 0; j < n && cuenta < objetivo; j++) {
        if (basica[i][j]) continue;
        if (unir(i, m + j)) { basica[i][j] = true; cuenta++; }
      }
    }
  }

  /** Potenciales MODI: u_i + v_j = c_ij sobre las celdas básicas. */
  function potenciales(costos, basica, m, n) {
    const u = new Array(m).fill(null), v = new Array(n).fill(null);
    u[0] = 0;
    for (let pasada = 0; pasada < m + n + 2; pasada++) {
      let avance = false;
      for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
        if (!basica[i][j]) continue;
        if (u[i] !== null && v[j] === null) { v[j] = costos[i][j] - u[i]; avance = true; }
        else if (u[i] === null && v[j] !== null) { u[i] = costos[i][j] - v[j]; avance = true; }
      }
      if (!avance) break;
    }
    // Componentes desconectadas (degeneración severa): se anclan en 0.
    for (let i = 0; i < m; i++) if (u[i] === null) u[i] = 0;
    for (let j = 0; j < n; j++) if (v[j] === null) v[j] = 0;
    return { u, v };
  }

  /** Ciclo cerrado alternante que parte de la celda entrante. */
  function buscarCiclo(basica, m, n, ri, rj) {
    const camino = [{ i: ri, j: rj }];
    const visitado = new Set();

    function dfs(i, j, horizontal, profundidad) {
      if (profundidad > 1 && i === ri && j === rj) return true;
      const clave = `${i},${j},${horizontal}`;
      if (visitado.has(clave)) return false;
      visitado.add(clave);

      if (horizontal) {
        for (let k = 0; k < n; k++) {
          if (k === j) continue;
          if (!basica[i][k] && !(i === ri && k === rj)) continue;
          if (i === ri && k === rj && profundidad < 2) continue;
          camino.push({ i, j: k });
          if (i === ri && k === rj) return true;
          if (dfs(i, k, false, profundidad + 1)) return true;
          camino.pop();
        }
      } else {
        for (let k = 0; k < m; k++) {
          if (k === i) continue;
          if (!basica[k][j] && !(k === ri && j === rj)) continue;
          if (k === ri && j === rj && profundidad < 2) continue;
          camino.push({ i: k, j });
          if (k === ri && j === rj) return true;
          if (dfs(k, j, true, profundidad + 1)) return true;
          camino.pop();
        }
      }
      return false;
    }

    if (dfs(ri, rj, true, 0) || (camino.length = 1, dfs(ri, rj, false, 0))) {
      if (camino.length > 1) {
        const ult = camino[camino.length - 1];
        if (ult.i === ri && ult.j === rj) camino.pop();
      }
      return camino.length >= 4 ? camino : null;
    }
    return null;
  }

  /* ----------------------------------------------------------------------
   *  Resolución completa de la etapa 3
   * -------------------------------------------------------------------- */
  function resolver(nodos, centros, anchos, opciones = {}) {
    const { tarifa = 1, metrica = 'euclidiana', maxIter = 500 } = opciones;
    const m = centros.length, n = nodos.length;

    const costosReales = matrizCostos(nodos, centros, tarifa, metrica);
    const demandaTotal = nodos.reduce((a, nd) => a + nd.d, 0);
    const ofertaTotal = anchos.reduce((a, b) => a + b, 0);

    if (ofertaTotal < demandaTotal - 1e-6) {
      return {
        factible: false,
        demandaTotal, ofertaTotal,
        deficit: demandaTotal - ofertaTotal,
        mensaje: 'Capacidad instalada insuficiente: Σ B_j < Σ d_i. El problema es infactible; ' +
                 'la restricción de cobertura total no puede satisfacerse.'
      };
    }

    /* --- Tablero balanceado: filas = centros, columnas = nodos (+ ficticio) --- */
    const holgura = ofertaTotal - demandaTotal;
    const usaFicticio = holgura > 1e-9;
    const nCols = n + (usaFicticio ? 1 : 0);
    const costos = costosReales.map(fila => usaFicticio ? fila.concat([0]) : fila.slice());
    const demanda = nodos.map(nd => nd.d).concat(usaFicticio ? [holgura] : []);
    const oferta = anchos.slice();

    /* --- Fase 1: solución básica factible inicial --- */
    const { t, basica } = vogel(costos, oferta, demanda);
    repararDegeneracion(t, basica, m, nCols);

    /* --- Fase 2: MODI --- */
    let iter = 0, u = null, v = null, reducidosFinales = null;
    const trazaZ = [];
    while (iter < maxIter) {
      ({ u, v } = potenciales(costos, basica, m, nCols));

      let mejorI = -1, mejorJ = -1, mejorR = -EPS;
      const reducidos = Array.from({ length: m }, () => new Array(nCols).fill(0));
      for (let i = 0; i < m; i++) for (let j = 0; j < nCols; j++) {
        if (basica[i][j]) continue;
        const r = costos[i][j] - u[i] - v[j];
        reducidos[i][j] = r;
        if (r < mejorR) { mejorR = r; mejorI = i; mejorJ = j; }
      }
      reducidosFinales = reducidos;
      trazaZ.push(evaluarZ(t, costos, m, nCols));
      if (mejorI < 0) break;                    // óptimo: todos los r_ij ≥ 0

      const ciclo = buscarCiclo(basica, m, nCols, mejorI, mejorJ);
      if (!ciclo) break;

      // Celdas en posición impar del ciclo (signo −): limitan el pivote.
      let theta = Infinity, salI = -1, salJ = -1;
      for (let k = 1; k < ciclo.length; k += 2) {
        const { i, j } = ciclo[k];
        if (t[i][j] < theta) { theta = t[i][j]; salI = i; salJ = j; }
      }
      if (!isFinite(theta)) break;
      for (let k = 0; k < ciclo.length; k++) {
        const { i, j } = ciclo[k];
        t[i][j] += (k % 2 === 0 ? theta : -theta);
      }
      basica[mejorI][mejorJ] = true;
      basica[salI][salJ] = false;
      iter++;
    }

    /* --- Resultados --- */
    const asignacion = costosReales.map((_, j) => nodos.map((__, i) => t[j][i]));
    const Z = evaluarZ(asignacion, costosReales, m, n);
    const carga = asignacion.map(fila => fila.reduce((a, b) => a + b, 0));
    const utilizacion = carga.map((c, j) => anchos[j] > 0 ? c / anchos[j] : 0);

    /* ----------------------------------------------------------------
     * Precios sombra del ancho de banda.
     *
     * Los potenciales de un problema de transporte están determinados salvo
     * una constante: (u + k, v − k) es igualmente válido. Por eso u_j por sí
     * solo NO es la derivada de Z respecto de B_j.
     *
     * Añadir δ de capacidad al centro j obliga, en el tablero balanceado, a
     * añadir δ al destino ficticio que absorbe la holgura. El efecto sobre el
     * objetivo es entonces
     *        dZ/dB_j = u_j + v_ficticio,
     * que fija la constante y hace que un centro con capacidad ociosa —el que
     * envía al ficticio— tenga precio sombra exactamente cero, como debe ser.
     * ---------------------------------------------------------------- */
    const vFicticio = usaFicticio ? v[nCols - 1] : 0;
    const dualB = u.slice(0, m).map((ui) => ui + vFicticio);
    const precioSombra = dualB.map((d, j) => utilizacion[j] > 1 - 1e-6 ? d : 0);

    // Nodos atendidos por más de un centro: el reparto que el LP introduce y
    // que la asignación al más cercano nunca produce.
    const divididos = [];
    for (let i = 0; i < n; i++) {
      const centrosDelNodo = [];
      for (let j = 0; j < m; j++) if (asignacion[j][i] > 1e-6) centrosDelNodo.push(j);
      if (centrosDelNodo.length > 1) divididos.push({ i, centros: centrosDelNodo });
    }

    const vmc = vecinoMasCercano(nodos, centros, costosReales);
    const sobrecargas = vmc.carga.map((c, j) => ({ j, exceso: c - anchos[j], carga: c, B: anchos[j] }))
      .filter(o => o.exceso > 1e-6);

    return {
      factible: true,
      t: asignacion,
      Z, carga, utilizacion, anchos,
      demandaTotal, ofertaTotal, holgura,
      iteracionesMODI: iter,
      trazaZ,
      u: u.slice(0, m), v: v.slice(0, n),
      vFicticio, dualB, precioSombra,
      costos: costosReales,
      divididos,
      basicas: contarBasicas(basica, m, nCols),
      requeridas: m + nCols - 1,
      reducidos: reducidosFinales,
      vmc: {
        Z: vmc.Z, carga: vmc.carga, asign: vmc.asign, t: vmc.t,
        sobrecargas,
        factible: sobrecargas.length === 0
      },
      mejora: vmc.Z > 0 ? (vmc.Z - Z) / vmc.Z : 0,
      diferencia: vmc.Z - Z
    };
  }

  function evaluarZ(t, costos, m, n) {
    let Z = 0;
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) Z += t[i][j] * costos[i][j];
    return Z;
  }

  function contarBasicas(basica, m, n) {
    let c = 0;
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (basica[i][j]) c++;
    return c;
  }

  /* ----------------------------------------------------------------------
   *  Validación numérica del precio sombra: se perturba B_j y se vuelve a
   *  resolver. Si el dual es correcto, ΔZ/δ ≈ u_j (OE7 del proyecto).
   * -------------------------------------------------------------------- */
  function verificarDual(nodos, centros, anchos, j, delta, opciones) {
    const base = resolver(nodos, centros, anchos, opciones);
    if (!base.factible) return null;
    const pert = anchos.slice();
    pert[j] += delta;
    const alt = resolver(nodos, centros, pert, opciones);
    if (!alt.factible) return null;
    return {
      dualTeorico: base.dualB[j],
      dualNumerico: (alt.Z - base.Z) / delta,
      deltaZ: alt.Z - base.Z,
      delta
    };
  }

  global.Transporte = {
    resolver, matrizCostos, vecinoMasCercano, verificarDual, vogel
  };
})(window);
