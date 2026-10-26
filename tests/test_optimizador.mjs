/* Verificación de las etapas 1 y 2 de optimizer.js.
 *
 *  Las soluciones son cerradas, así que se contrastan contra métodos
 *  numéricos independientes:
 *   A) Etapa 1: el centroide ponderado frente a una minimización por descenso.
 *   B) Etapa 2: el punto KKT frente a una búsqueda exhaustiva sobre la región.
 *   C) El multiplicador λ frente a la derivada numérica de f* respecto de R.
 *   D) Weiszfeld frente a una búsqueda refinada sobre malla.
 */
import { readFileSync } from 'fs';
import vm from 'vm';

const ctx = { console, Math };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync('app/assets/js/optimizer.js', 'utf8'), ctx, { filename: 'optimizer.js' });
const Opt = ctx.Opt;

function rng(s) { return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296); }

/** Mínimo en 1D por refinamiento sucesivo sobre [a, b]. */
function minimizar1D(f, a, b, niveles = 9, n = 200) {
  let mejor = null;
  for (let nivel = 0; nivel < niveles; nivel++) {
    mejor = null;
    for (let i = 0; i <= n; i++) {
      const t = a + (b - a) * i / n;
      const v = f(t);
      if (!mejor || v < mejor.v) mejor = { t, v };
    }
    const d = (b - a) / n * 2;
    a = mejor.t - d; b = mejor.t + d;
  }
  return mejor;
}

/** Mínimo por malla refinada sucesivamente; `dentro` filtra la región. */
function minimizarMalla(f, dentro, caja, niveles = 6, n = 60) {
  let { x0, x1, y0, y1 } = caja;
  let mejor = null;
  for (let nivel = 0; nivel < niveles; nivel++) {
    mejor = null;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const p = { x: x0 + (x1 - x0) * i / n, y: y0 + (y1 - y0) * j / n };
        if (dentro && !dentro(p)) continue;
        const v = f(p);
        if (!mejor || v < mejor.v) mejor = { p, v };
      }
    }
    if (!mejor) return null;
    const dx = (x1 - x0) / n * 2, dy = (y1 - y0) / n * 2;
    x0 = mejor.p.x - dx; x1 = mejor.p.x + dx;
    y0 = mejor.p.y - dy; y1 = mejor.p.y + dy;
  }
  return mejor;
}

let fallos = 0;
const reporte = [];
const check = (cond, msg) => { if (!cond) { fallos++; reporte.push(msg); } };

for (let caso = 1; caso <= 160; caso++) {
  const r = rng(caso * 104729);
  const n = 5 + Math.floor(r() * 20);
  const nodos = Array.from({ length: n }, () => ({
    x: (r() - 0.5) * 40, y: (r() - 0.5) * 40, w: 1 + Math.round(r() * 500)
  }));
  const f = (p) => Opt.f(p, nodos);
  const caja = { x0: -30, x1: 30, y0: -30, y1: 30 };

  /* --- A) Etapa 1 --- */
  const r1 = Opt.etapa1(nodos);
  const num1 = minimizarMalla(f, null, caja);
  check(Math.hypot(r1.p.x - num1.p.x, r1.p.y - num1.p.y) < 2e-3,
    `caso ${caso}: etapa 1 analítica (${r1.p.x.toFixed(4)}, ${r1.p.y.toFixed(4)}) vs numérica (${num1.p.x.toFixed(4)}, ${num1.p.y.toFixed(4)})`);
  check(r1.definidaPositiva && r1.detH > 0, `caso ${caso}: Hessiana no definida positiva`);
  check(r1.normaGrad < 1e-6, `caso ${caso}: gradiente no nulo en el óptimo`);

  /* --- B) Etapa 2, disco --- */
  const centro = { x: (r() - 0.5) * 30, y: (r() - 0.5) * 30 };
  const R = 0.5 + r() * 12;
  const reg = Opt.Regiones.circulo(centro, R);
  const r2 = Opt.etapa2(nodos, reg, r1);
  // Si la restricción está activa el óptimo cae sobre la circunferencia, así
  // que se parametriza la frontera por el ángulo y se minimiza en una variable.
  const fRef = r2.activa
    ? minimizar1D((t) => f({ x: centro.x + R * Math.cos(t), y: centro.y + R * Math.sin(t) }), 0, 2 * Math.PI).v
    : r1.f;
  check(Math.abs(r2.f - fRef) / Math.max(1, fRef) < 1e-7,
    `caso ${caso}: disco f* KKT = ${r2.f.toFixed(4)} vs numérico ${fRef.toFixed(4)}`);
  for (const [k, c] of Object.entries(r2.condiciones)) {
    check(c.cumple, `caso ${caso}: condición KKT «${k}» no se cumple (valor ${c.valor})`);
  }
  check(r2.lambda >= -1e-9, `caso ${caso}: λ negativo`);
  check(r2.activa ? r2.f >= r1.f - 1e-6 : Math.abs(r2.f - r1.f) < 1e-6,
    `caso ${caso}: f restringida incoherente con el estado de la restricción`);

  /* --- C) λ frente a la derivada numérica de f* respecto de R --- */
  if (r2.activa && R > 1) {
    const h = 1e-4;
    const fMas = Opt.etapa2(nodos, Opt.Regiones.circulo(centro, R + h), r1).f;
    const fMenos = Opt.etapa2(nodos, Opt.Regiones.circulo(centro, R - h), r1).f;
    const dfdR = (fMas - fMenos) / (2 * h);
    check(Math.abs(dfdR - r2.dfdR) / Math.max(1, Math.abs(dfdR)) < 1e-4,
      `caso ${caso}: df*/dR analítico ${r2.dfdR.toFixed(4)} vs numérico ${dfdR.toFixed(4)}`);
    // λ debe coincidir con −df*/d(R²)
    const lambdaNum = -(fMas - fMenos) / ((R + h) ** 2 - (R - h) ** 2);
    check(Math.abs(lambdaNum - r2.lambda) / Math.max(1, r2.lambda) < 1e-4,
      `caso ${caso}: λ = ${r2.lambda.toFixed(4)} vs −df*/d(R²) = ${lambdaNum.toFixed(4)}`);
  }

  /* --- B2) Etapa 2, semiplano --- */
  const th = r() * Math.PI * 2;
  const a = { x: Math.cos(th), y: Math.sin(th) };
  const cc = (r() - 0.5) * 20;
  const reg2 = Opt.Regiones.semiplano(a, cc);
  const r2b = Opt.etapa2(nodos, reg2, r1);
  // La frontera es la recta a·p = c; se recorre con el vector director u ⊥ a.
  const p0 = { x: a.x * cc, y: a.y * cc };          // ‖a‖ = 1
  const u = { x: -a.y, y: a.x };
  const fRefB = r2b.activa
    ? minimizar1D((t) => f({ x: p0.x + t * u.x, y: p0.y + t * u.y }), -200, 200).v
    : r1.f;
  check(Math.abs(r2b.f - fRefB) / Math.max(1, fRefB) < 1e-7,
    `caso ${caso}: semiplano f* KKT = ${r2b.f.toFixed(4)} vs numérico ${fRefB.toFixed(4)}`);
  for (const [k, c] of Object.entries(r2b.condiciones)) {
    check(c.cumple, `caso ${caso}: semiplano, condición «${k}» no se cumple`);
  }

  /* --- D) Weiszfeld --- */
  const wz = Opt.weiszfeld(nodos);
  const fw = (p) => { let s = 0; for (const nd of nodos) s += nd.w * Math.hypot(p.x - nd.x, p.y - nd.y); return s; };
  const numW = minimizarMalla(fw, null, caja);
  check(Math.abs(wz.costo - numW.v) / Math.max(1, numW.v) < 1e-5,
    `caso ${caso}: Weiszfeld ${wz.costo.toFixed(4)} vs numérico ${numW.v.toFixed(4)}`);

  /* --- E) Cooper: el costo debe decrecer de forma monótona --- */
  const mc = Opt.multicentro(nodos, 3, { semilla: caso });
  for (let k = 1; k < mc.historia.length; k++) {
    check(mc.historia[k] <= mc.historia[k - 1] + 1e-6,
      `caso ${caso}: Cooper aumentó el costo en la iteración ${k}`);
  }
}

console.log(fallos === 0
  ? '\n✔ Etapas 1 y 2 verificadas: óptimo analítico, condiciones KKT, sensibilidad de λ,\n  Weiszfeld y monotonía de Cooper coinciden con los métodos numéricos.'
  : `\n✘ ${fallos} fallos:\n` + reporte.slice(0, 12).join('\n'));
process.exit(fallos === 0 ? 0 : 1);
