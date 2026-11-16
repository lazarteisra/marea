// Presupuesto: cuánto queda para gastar en el ciclo, pagos fijos, ingresos y la línea del gasto.
import { el, svg } from '../dom.js';
import { resumenCiclo, gastoPorCiclo } from '../calculo.js';
import { aTexto, aBsEnteros } from '../dinero.js';
import { gastoPorCategoria } from '../categorias.js';

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

/** Textos de Presupuesto a partir de `resumenCiclo`. Pura, para poder probarla. */
export function textosPresupuesto(c) {
  const dias = `${c.dias} ${c.dias === 1 ? 'día' : 'días'}`;
  let ritmo;
  if (c.queda <= 0) ritmo = 'No te queda para gastar este ciclo';
  else if (c.esperando) ritmo = 'Esperando tu mensualidad';
  else ritmo = `${aBsEnteros(c.porDia)} Bs por día para ${dias}`;
  const hayFijos = c.fijosPorPagar > 0 || c.fijosPagado > 0;
  return {
    queda: aBsEnteros(c.queda),
    ritmo,
    gastado: `Gastaste ${aTexto(c.gastado)}`,
    de: `de ${aBsEnteros(c.presupuesto)}`,
    avance: c.presupuesto > 0 ? Math.min(100, Math.round((c.gastado / c.presupuesto) * 100)) : (c.gastado > 0 ? 100 : 0),
    fijos: !hayFijos ? 'Ninguno' : c.fijosPorPagar > 0 ? `${aBsEnteros(c.fijosPorPagar)} por pagar` : 'Todo pagado',
    fijosDetalle: !hayFijos ? 'Agrega el gimnasio o tus suscripciones' : `${aTexto(c.fijosPagado)} pagado`,
    entrado: `${aTexto(c.entrado)} entró`,
    entradoDetalle: c.entrado === 0 ? 'Nada todavía en este ciclo'
      : [c.mensualidad ? `Mensualidad ${aTexto(c.mensualidad)}` : null, c.sueltos ? `sueltos ${aTexto(c.sueltos)}` : null].filter(Boolean).join(' · '),
  };
}

/** Texto y barra de una fila de categoría. Pura, para poder probarla. */
export function textosCategoria(f, mayor) {
  let detalle;
  if (f.tope !== null) {
    const resto = f.tope - f.gastado;
    detalle = resto >= 0 ? `de ${aTexto(f.tope)} · te quedan ${aTexto(resto)}` : `de ${aTexto(f.tope)} · te pasaste ${aTexto(-resto)}`;
  } else if (f.antes === null) detalle = '';
  else if (f.antes === 0) detalle = 'nada el ciclo pasado a esta altura';
  else detalle = `${aTexto(f.antes)} el ciclo pasado a esta altura`;
  const base = f.tope ?? mayor;
  return {
    monto: aTexto(f.gastado),
    detalle,
    avance: base > 0 ? Math.min(100, Math.round((f.gastado / base) * 100)) : 0,
    pasado: f.tope !== null && f.gastado > f.tope,
  };
}

function filaCategoria(ctx, f, mayor) {
  const t = textosCategoria(f, mayor);
  const avance = el('i');
  avance.style.width = t.avance + '%';
  return el('button', { class: 'cat' + (t.pasado ? ' pasada' : ''), type: 'button', onclick: () => ctx.ir('categoria', { categoria: f.categoria }) },
    el('span', { class: 'cat-cab' }, el('b', {}, f.categoria), el('span', {}, t.monto)),
    el('span', { class: 'pista' }, avance),
    t.detalle ? el('small', {}, t.detalle) : null);
}

export function presupuesto(ctx) {
  const { cuentas, movimientos, ajustes } = ctx.estado;
  const c = resumenCiclo(cuentas, movimientos, ajustes, ctx.ahora());
  const t = textosPresupuesto(c);
  const g = gastoPorCiclo(movimientos, ajustes, ctx.ahora());
  const tc = textosCiclo(g);
  const cat = gastoPorCategoria(movimientos, ajustes, ctx.ahora());
  const mayor = cat.lista.reduce((max, f) => Math.max(max, f.gastado), 0);

  const avance = el('i');
  avance.style.width = t.avance + '%';

  return el('section', { class: 'pantalla' },
    el('h1', { class: 'titulo chico' }, 'Presupuesto'),

    el('p', { class: 'frase' }, 'Te queda para gastar'),
    el('p', { class: 'num medio' }, t.queda, el('span', { class: 'bs' }, 'Bs')),
    el('p', { class: 'resto' }, t.ritmo),
    el('div', { class: 'hoy' },
      el('div', { class: 'pista' }, avance),
      el('p', {}, el('span', {}, t.gastado), el('span', {}, t.de))),

    el('div', { class: 'tarjetas' },
      el('button', { class: 'tarjeta', type: 'button', onclick: () => ctx.ir('fijos') },
        el('small', {}, 'Pagos fijos'), el('b', {}, t.fijos), el('span', {}, t.fijosDetalle)),
      el('div', { class: 'tarjeta' },
        el('small', {}, 'Ingresos'), el('b', {}, t.entrado), el('span', {}, t.entradoDetalle))),

    el('section', { class: 'bloque' },
      el('h2', { class: 'bloque-titulo' }, 'En qué se fue'),
      cat.lista.length
        ? el('div', { class: 'cats' }, cat.lista.map((f) => filaCategoria(ctx, f, mayor)))
        : el('p', { class: 'vacio' }, 'Aún no hay gastos en este ciclo.'),
      cat.invite > 0 ? el('p', { class: 'vacio' }, `De eso, ${aTexto(cat.invite)} Bs fue invitando tú.`) : null,
      cat.lista.length ? el('p', { class: 'vacio' }, 'Toca una categoría para ver sus gastos o ponerle un tope.') : null),

    el('section', { class: 'bloque' },
      el('h2', { class: 'bloque-titulo' }, 'Este ciclo'),
      el('p', { class: 'ciclo-gastado' }, tc.gastado),
      el('p', { class: 'ciclo-compara' + (tc.mas ? ' pasa' : '') }, tc.compara),
      graficoCiclo(g, g.actual.length - 1 + c.dias),
      g.anterior ? el('p', { class: 'leyenda' }, el('span', { class: 'l-ahora' }, 'Este ciclo'), el('span', { class: 'l-antes' }, 'El anterior')) : null));
}
