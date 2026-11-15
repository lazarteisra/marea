// Inicio: cuánto puedes gastar hoy, cómo va el ciclo, tus cuentas y lo último anotado.
import { el, svg } from '../dom.js';
import { resumen, gastoPorCiclo } from '../calculo.js';
import { avisoDeshacer, filaMovimiento } from './piezas.js';
import { aTexto, aBsEnteros } from '../dinero.js';

/** Textos de Inicio a partir del resumen. Pura, para poder probarla. */
export function textosInicio(r) {
  let resto;
  const sinPlata = r.disponible <= 0;
  if (sinPlata) resto = 'No te queda para gastar este ciclo';
  else if (r.esperando) resto = 'Esperando tu mensualidad';
  else resto = `Te quedan ${aBsEnteros(r.disponible)} Bs para ${r.dias} ${r.dias === 1 ? 'día' : 'días'}`;
  const pasado = r.excesoHoy > 0;
  return {
    numero: sinPlata ? '0' : aBsEnteros(r.porDia),
    resto,
    hoy: `Llevas ${aTexto(r.gastadoHoy)} Bs hoy`,
    sobra: pasado ? `te pasaste ${aBsEnteros(r.excesoHoy)}` : `te sobran ${aBsEnteros(r.sobraHoy)}`,
    pasado,
  };
}

function fechaLarga(ms) {
  const texto = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ms));
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace(',', '');
}

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

export function inicio(ctx) {
  const { cuentas, movimientos, ajustes } = ctx.estado;
  const r = resumen(cuentas, movimientos, ajustes, ctx.ahora());
  const t = textosInicio(r);
  const g = gastoPorCiclo(movimientos, ajustes, ctx.ahora());
  const c = textosCiclo(g);

  const avance = el('i');
  avance.style.width = (r.porDia > 0 ? Math.min(100, Math.round((r.gastadoHoy / r.porDia) * 100)) : (r.gastadoHoy > 0 ? 100 : 0)) + '%';

  const ultimos = [...movimientos].sort((a, b) => b.fecha - a.fecha).slice(0, 5);
  const abrir = (m) => () => ctx.ir(m.tipo === 'gasto' ? 'registrar' : 'ingreso', { mov: m, volver: 'inicio' });

  return el('section', { class: 'pantalla' },
    el('div', { class: 'barra-sup' },
      el('span', {}, fechaLarga(ctx.ahora())),
      el('button', { class: 'enlace', type: 'button', onclick: () => ctx.ir('ajustes') }, 'Ajustes')),

    el('p', { class: 'frase' }, 'Hoy puedes gastar'),
    el('p', { class: 'num' + (t.numero.length > 3 ? ' largo' : '') }, t.numero, el('span', { class: 'bs' }, 'Bs')),
    el('p', { class: 'resto' }, t.resto),

    el('div', { class: 'hoy' },
      el('div', { class: 'pista' }, avance),
      el('p', {}, el('span', {}, t.hoy), el('span', { class: t.pasado ? 'pasa' : null }, t.sobra))),

    el('section', { class: 'bloque' },
      el('h2', { class: 'bloque-titulo' }, 'Este ciclo'),
      el('p', { class: 'ciclo-gastado' }, c.gastado),
      el('p', { class: 'ciclo-compara' + (c.mas ? ' pasa' : '') }, c.compara),
      graficoCiclo(g, g.actual.length - 1 + r.dias),
      g.anterior ? el('p', { class: 'leyenda' }, el('span', { class: 'l-ahora' }, 'Este ciclo'), el('span', { class: 'l-antes' }, 'El anterior')) : null),

    el('section', { class: 'bloque' },
      el('h2', { class: 'bloque-titulo' }, 'Tus cuentas'),
      el('div', { class: 'cuentas' }, cuentas.filter((x) => !x.archivada).map((x) =>
        el('div', { class: 'cta' }, el('span', {}, x.nombre), el('b', {}, aTexto(r.saldos.get(x.id))))))),

    el('section', { class: 'bloque' },
      el('div', { class: 'bloque-cab' },
        el('h2', { class: 'bloque-titulo' }, 'Lo último'),
        ultimos.length ? el('button', { class: 'enlace mar', type: 'button', onclick: () => ctx.ir('movimientos') }, 'Ver todo') : null),
      ultimos.length
        ? el('div', { class: 'movs' }, ultimos.map((m) => filaMovimiento(m, cuentas, abrir(m))))
        : el('p', { class: 'vacio' }, 'Aún no anotaste nada. Tu primer gasto va a aparecer aquí.')),

    el('div', { class: 'pie pie-pestana' },
      avisoDeshacer(ctx, 'inicio'),
      el('div', { class: 'acciones' },
        el('button', { class: 'boton boton-pri', type: 'button', onclick: () => ctx.ir('registrar') }, 'Registrar gasto'),
        el('button', { class: 'boton boton-sec', type: 'button', onclick: () => ctx.ir('ingreso') }, 'Me entró plata'))));
}
