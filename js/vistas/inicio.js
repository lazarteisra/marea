// Inicio: solo cuánto puedes gastar hoy, cuánto tienes y los botones para anotar.
// Lo demás vive en sus pestañas: Inicio no se carga con más bloques.
import { el } from '../dom.js';
import { resumen } from '../calculo.js';
import { avisoDeshacer } from './piezas.js';
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

export function inicio(ctx) {
  const { cuentas, movimientos, ajustes } = ctx.estado;
  const r = resumen(cuentas, movimientos, ajustes, ctx.ahora());
  const t = textosInicio(r);

  const avance = el('i');
  avance.style.width = (r.porDia > 0 ? Math.min(100, Math.round((r.gastadoHoy / r.porDia) * 100)) : (r.gastadoHoy > 0 ? 100 : 0)) + '%';

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

    el('div', { class: 'cuentas cuentas-inicio' }, cuentas.filter((x) => !x.archivada).map((x) =>
      el('div', { class: 'cta' }, el('span', {}, x.nombre), el('b', {}, aTexto(r.saldos.get(x.id)))))),

    el('div', { class: 'pie pie-pestana' },
      avisoDeshacer(ctx, 'inicio'),
      el('div', { class: 'acciones' },
        el('button', { class: 'boton boton-pri', type: 'button', onclick: () => ctx.ir('registrar') }, 'Registrar gasto'),
        el('button', { class: 'boton boton-sec', type: 'button', onclick: () => ctx.ir('ingreso') }, 'Me entró plata'))));
}
