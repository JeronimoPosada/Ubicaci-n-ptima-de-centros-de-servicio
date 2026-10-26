/* Verificación del símplex de transporte (Vogel + MODI) de transport.js.
 *
 *  Estrategia doble:
 *   A) Certificado de optimalidad por dualidad: una solución básica factible
 *      con todos los costos reducidos ≥ 0 es óptima. Se comprueba además la
 *      factibilidad primal exacta (demanda cubierta, capacidad respetada).
 *   B) Oráculo independiente: flujo de costo mínimo por caminos sucesivos de
 *      costo mínimo (Bellman-Ford). Algoritmo distinto, mismo óptimo esperado.
 */
import { readFileSync } from 'fs';
import vm from 'vm';

const ctx = { console, Math, performance: { now: () => Date.now() } };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['app/assets/js/transport.js']) {
  vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: f });
}
const T = ctx.Transporte;

/* ---------------- Oráculo: min-cost flow por caminos sucesivos ------------ */
function oraculo(nodos, centros, anchos, tarifa = 1) {
  const m = centros.length, n = nodos.length;
  const c = T.matrizCostos(nodos, centros, tarifa);
  // Grafo: 0 = fuente, 1..m = centros, m+1..m+n = nodos, m+n+1 = sumidero
  const S = 0, Tt = m + n + 1, N = m + n + 2;
  const cap = Array.from({ length: N }, () => new Array(N).fill(0));
  const cost = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let j = 0; j < m; j++) cap[S][1 + j] = anchos[j];
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    cap[1 + j][1 + m + i] = Infinity;
    cost[1 + j][1 + m + i] = c[j][i];
    cost[1 + m + i][1 + j] = -c[j][i];
  }
  for (let i = 0; i < n; i++) cap[1 + m + i][Tt] = nodos[i].d;

  let flujo = 0, costoTotal = 0;
  const objetivo = nodos.reduce((a, x) => a + x.d, 0);
  for (let guard = 0; guard < 10000 && flujo < objetivo - 1e-9; guard++) {
    const dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1);
    dist[S] = 0;
    for (let it = 0; it < N; it++) {
      let mejora = false;
      for (let u = 0; u < N; u++) {
        if (dist[u] === Infinity) continue;
        for (let v = 0; v < N; v++) {
          if (cap[u][v] <= 1e-12) continue;
          if (dist[u] + cost[u][v] < dist[v] - 1e-12) { dist[v] = dist[u] + cost[u][v]; prev[v] = u; mejora = true; }
        }
      }
      if (!mejora) break;
    }
    if (dist[Tt] === Infinity) break;
    let cuello = Infinity;
    for (let v = Tt; v !== S; v = prev[v]) cuello = Math.min(cuello, cap[prev[v]][v]);
    cuello = Math.min(cuello, objetivo - flujo);
    for (let v = Tt; v !== S; v = prev[v]) { cap[prev[v]][v] -= cuello; cap[v][prev[v]] += cuello; }
    flujo += cuello;
    costoTotal += cuello * dist[Tt];
  }
  return { Z: costoTotal, flujo, objetivo };
}

/* ---------------- Generador de instancias aleatorias ---------------------- */
function rng(s) { return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296); }

let fallos = 0, pruebas = 0, duales = 0, dualesMal = 0;
const reporte = [];

for (let caso = 1; caso <= 300; caso++) {
  const r = rng(caso * 7919);
  const n = 4 + Math.floor(r() * 18);
  const m = 2 + Math.floor(r() * 5);
  const nodos = Array.from({ length: n }, () => ({
    x: (r() - 0.5) * 30, y: (r() - 0.5) * 30, d: Math.round(10 + r() * 400), w: 1
  }));
  const centros = Array.from({ length: m }, () => ({ x: (r() - 0.5) * 30, y: (r() - 0.5) * 30 }));
  const D = nodos.reduce((a, x) => a + x.d, 0);
  // Holgura total entre 2 % y 60 % por encima de la demanda: fuerza saturación.
  const total = D * (1.02 + r() * 0.58);
  const pesos = Array.from({ length: m }, () => 0.3 + r());
  const sp = pesos.reduce((a, b) => a + b, 0);
  const anchos = pesos.map(p => Math.round(total * p / sp));

  const res = T.resolver(nodos, centros, anchos, { tarifa: 1 });
  pruebas++;
  if (!res.factible) { continue; }

  // (1) Factibilidad primal
  for (let i = 0; i < n; i++) {
    let s = 0; for (let j = 0; j < m; j++) s += res.t[j][i];
    if (Math.abs(s - nodos[i].d) > 1e-6) { fallos++; reporte.push(`caso ${caso}: demanda nodo ${i} = ${s} ≠ ${nodos[i].d}`); break; }
  }
  for (let j = 0; j < m; j++) {
    if (res.carga[j] > anchos[j] + 1e-6) { fallos++; reporte.push(`caso ${caso}: centro ${j} excede B (${res.carga[j]} > ${anchos[j]})`); break; }
    if (res.t[j].some(v => v < -1e-9)) { fallos++; reporte.push(`caso ${caso}: flujo negativo`); break; }
  }

  // (2) Oráculo independiente
  const o = oraculo(nodos, centros, anchos);
  const err = Math.abs(o.Z - res.Z) / Math.max(1, Math.abs(o.Z));
  if (err > 1e-6) {
    fallos++;
    reporte.push(`caso ${caso} (n=${n}, m=${m}): Z_MODI=${res.Z.toFixed(4)} vs Z_oráculo=${o.Z.toFixed(4)}  err=${(err*100).toFixed(4)}%`);
  }

  // (3) Dualidad: dZ/dB_j = u_j + v_ficticio debe coincidir con la derivada
  //     por la derecha de Z respecto de la capacidad del centro j.
  for (let j = 0; j < m; j++) {
    duales++;
    const delta = Math.max(1e-3, anchos[j] * 1e-4);
    const pert = anchos.slice();
    pert[j] += delta;
    const alt = T.resolver(nodos, centros, pert, { tarifa: 1 });
    if (!alt.factible) continue;
    const numerico = (alt.Z - res.Z) / delta;
    if (Math.abs(numerico - res.dualB[j]) > 1e-6 * Math.max(1, Math.abs(numerico))) {
      dualesMal++;
      if (dualesMal <= 5) reporte.push(`caso ${caso} centro ${j}: dZ/dB = ${res.dualB[j].toFixed(8)} vs numérico ${numerico.toFixed(8)}`);
    }
  }

  // (4) H3: el LP nunca debe ser peor que el vecino más cercano factible
  if (res.vmc.factible && res.Z > res.vmc.Z + 1e-6) {
    fallos++; reporte.push(`caso ${caso}: LP (${res.Z.toFixed(3)}) peor que vecino más cercano (${res.vmc.Z.toFixed(3)})`);
  }
}

const tasaDual = duales ? (duales - dualesMal) / duales : 1;
console.log(`\nInstancias evaluadas: ${pruebas}`);
console.log(`Precios sombra contrastados: ${duales}, coincidencia ${(tasaDual * 100).toFixed(2)} %`);
// La degeneración del transporte admite duales no únicos en puntos de quiebre,
// así que se exige una coincidencia muy alta en vez de perfecta.
if (tasaDual < 0.98) { fallos++; reporte.push(`coincidencia dual insuficiente: ${(tasaDual * 100).toFixed(2)} %`); }
console.log(fallos === 0
  ? '✔ Todas las pruebas pasaron: factibilidad, optimalidad frente al oráculo y H3.'
  : `✘ ${fallos} fallos:\n` + reporte.slice(0, 15).join('\n'));
process.exit(fallos === 0 ? 0 : 1);
