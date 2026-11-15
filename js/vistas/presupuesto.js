// Presupuesto: por ahora, cómo va el gasto del ciclo. Lo demás llega en el módulo siguiente.
import { el, svg } from '../dom.js';
import { resumen, gastoPorCiclo } from '../calculo.js';
import { aTexto } from '../dinero.js';

/** Textos de la tarjeta "Este ciclo". Pura, para poder probarla. */
export function textosCiclo(g) {
  const gastado = `Llevas ${aTexto(g.total)} Bs gastados`;
  if (g.anteriorMismoDia === null) return { gastado, compara: 'Cuando empiece otro ciclo vas a poder compararlos.', mas: false };
  const dif = g.total - g.anteriorMismoDia;
  if (dif === 0) return { gastado, compara: 'Igual que el ciclo pasado a esta altura.', mas: false };
  return {
    gastado,
    compara: `${aTexto(Math.abs(dif))} Bs ${dif > 0 ? 'más' : 'menos'} que el ciclo pasado a esta altura.`,
    mas: dif > 0,
  };
}

/** Puntos "x,y" de una línea de gasto acumulado. Empieza en cero, a la izquierda. */
export function puntosLinea(acumulado, dias, tope, ancho, alto) {
  const x = (i) => ((i + 1) / dias) * ancho;
  const y = (v) => alto - (v / tope) * alto;
  return [[0, alto], ...acumulado.map((v, i) => [x(i), y(v)])].map(([a, b]) => `${+a.toFixed(1)},${+b.toFixed(1)}`).join(' ');
}

const ANCHO = 300;
const ALTO = 84;

/** Línea del ciclo actual sobre la del anterior (punteada). */
function graficoCiclo(g, diasDelCiclo) {
  const dias = Math.max(2, diasDelCiclo, g.anterior?.length ?? 0);
  const tope = Math.max(1, g.total, g.anterior?.at(-1) ?? 0) * 1.08;
  const actual = puntosLinea(g.actual, dias, tope, ANCHO, ALTO);
  const [fx, fy] = actual.split(' ').at(-1).split(',');
  return svg('svg', { class: 'grafico', viewBox: `0 -6 ${ANCHO} ${ALTO + 12}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Gasto acumulado de este ciclo comparado con el anterior' },
    svg('line', { class: 'g-base', x1: 0, y1: ALTO, x2: ANCHO, y2: ALTO }),
    g.anterior ? svg('polyline', { class: 'g-antes', points: puntosLinea(g.anterior, dias, tope, ANCHO, ALTO) }) : null,
    svg('polyline', { class: 'g-ahora', points: actual }),
    svg('circle', { class: 'g-punto', cx: fx, cy: fy, r: 3.5 }));
}

export function presupuesto(ctx) {
  const { cuentas, movimientos, ajustes } = ctx.estado;
  const r = resumen(cuentas, movimientos, ajustes, ctx.ahora());
  const g = gastoPorCiclo(movimientos, ajustes, ctx.ahora());
  const c = textosCiclo(g);

  return el('section', { class: 'pantalla' },
    el('h1', { class: 'titulo chico' }, 'Presupuesto'),
    el('section', { class: 'bloque' },
      el('h2', { class: 'bloque-titulo' }, 'Este ciclo'),
      el('p', { class: 'ciclo-gastado' }, c.gastado),
      el('p', { class: 'ciclo-compara' + (c.mas ? ' pasa' : '') }, c.compara),
      graficoCiclo(g, g.actual.length - 1 + r.dias),
      g.anterior ? el('p', { class: 'leyenda' }, el('span', { class: 'l-ahora' }, 'Este ciclo'), el('span', { class: 'l-antes' }, 'El anterior')) : null),
    el('p', { class: 'parrafo pronto' }, 'Aquí también van a estar cuánto te queda para gastar, tus pagos fijos y lo que te entró. Llega en el próximo módulo.'));
}
