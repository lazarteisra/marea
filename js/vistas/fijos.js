// Fijos: pagos que se repiten cada ciclo (gimnasio, suscripciones…).
// Lo que falta pagar se aparta del monto por día hasta que se paga.
import { el } from '../dom.js';
import { aCentavos, aTexto, aBsEnteros } from '../dinero.js';
import { claveDia } from '../fechas.js';
import { resumen } from '../calculo.js';
import { textoToca } from '../fijos.js';
import { crearGuardador } from '../registro.js';
import { campoMonto, grupoChips, avisoDeshacer, tituloDia, abrirMovimiento } from './piezas.js';

const SUGERIDOS = ['Gimnasio', 'Suscripción', 'Internet', 'Parqueo'];
const MAX_FIJOS = 30;

export function fijos(ctx) {
  const { cuentas, movimientos, ajustes } = ctx.estado;
  const r = resumen(cuentas, movimientos, ajustes, ctx.ahora());
  const hoy = claveDia(ctx.ahora());
  const { lista, porPagar } = r.fijos;

  let frase;
  if (!lista.length) frase = 'Anota aquí el gimnasio, tus suscripciones y lo que pagas cada ciclo. Marea aparta esa plata para que no te la gastes sin querer.';
  else if (porPagar > 0) frase = `Te falta pagar ${aBsEnteros(porPagar)} Bs este ciclo. Esa plata ya está apartada.`;
  else frase = 'Todo pagado este ciclo.';

  const fila = (e) => {
    const { fijo: f, pago, faltan } = e;
    const detalle = pago
      ? `Pagaste ${aTexto(pago.monto)} Bs · ${tituloDia(claveDia(pago.fecha), hoy)}`
      : [`unos ${aTexto(f.estimado)} Bs`, textoToca(faltan)].filter(Boolean).join(' · ');
    return el('div', { class: 'fijo' + (pago ? ' pagado' : '') },
      el('button', { class: 'mov', type: 'button', 'aria-label': `Cambiar ${f.nombre}`, onclick: () => ctx.ir('fijo', { fijo: f }) },
        el('span', { class: 'mov-que' }, el('b', {}, f.nombre),
          el('small', { class: !pago && faltan !== null && faltan < 0 ? 'tarde' : null }, detalle))),
      pago
        ? el('button', { class: 'fijo-hecho', type: 'button', onclick: () => abrirMovimiento(ctx, pago, 'fijos') }, 'Pagado')
        : el('button', { class: 'chip', type: 'button', onclick: () => ctx.ir('pagarFijo', { fijo: f }) }, 'Pagar'));
  };

  return el('section', { class: 'pantalla' },
    el('h1', { class: 'titulo chico' }, 'Fijos'),
    el('p', { class: 'parrafo' }, frase),
    avisoDeshacer(ctx, 'fijos'),
    lista.length ? el('div', { class: 'fijos' }, lista.map(fila)) : null,
    lista.length < MAX_FIJOS
      ? el('button', { class: 'boton boton-sec agregar', type: 'button', onclick: () => ctx.ir('fijo') }, 'Agregar pago fijo')
      : null);
}

/** Agregar un pago fijo o cambiar uno que ya existe. */
export function fijo(ctx, { fijo: actual = null } = {}) {
  const { ajustes } = ctx.estado;
  const otros = ajustes.fijos.filter((f) => f.id !== actual?.id);
  const error = el('p', { class: 'error', role: 'alert' });
  const guardarBoton = el('button', { class: 'boton boton-pri', type: 'submit', disabled: true }, actual ? 'Guardar cambios' : 'Agregar');

  const monto = campoMonto(actualizar, actual ? aTexto(actual.estimado) : '');
  const nombre = el('input', { class: 'nota', maxlength: 40, placeholder: 'Ej.: Gimnasio', 'aria-label': '¿Qué pago es?', autocomplete: 'off', enterkeyhint: 'done', value: actual?.nombre || null, oninput: actualizar });
  const libres = SUGERIDOS.filter((s) => !otros.some((f) => f.nombre.toLowerCase() === s.toLowerCase()));
  const sugeridos = el('div', { class: 'chips chips-mini' }, actual ? [] : libres.map((texto) =>
    el('button', { class: 'chip chip-mini', type: 'button', onclick: () => { nombre.value = texto; actualizar(); } }, texto)));
  const dia = el('input', { id: 'fijo-dia', class: 'campo-dia', inputmode: 'numeric', autocomplete: 'off', maxlength: 2, placeholder: '—', value: actual?.dia ?? null, oninput: actualizar });

  function leer() {
    const estimado = aCentavos(monto.entrada.value);
    const texto = nombre.value.trim();
    const crudo = dia.value.trim();
    const numero = crudo === '' ? null : Number(crudo);
    const diaVale = crudo === '' || (/^\d{1,2}$/.test(crudo) && numero >= 1 && numero <= 28);
    return { estimado, texto, numero, diaVale };
  }

  function actualizar() {
    const { estimado, texto, diaVale } = leer();
    guardarBoton.disabled = estimado === null || texto === '';
    error.textContent = diaVale ? '' : 'El día va entre 1 y 28. Si no tiene día fijo, déjalo vacío.';
  }

  const guardar = crearGuardador(async () => {
    const { estimado, texto, numero, diaVale } = leer();
    if (estimado === null || texto === '') return;
    if (!diaVale) { dia.focus(); return; }
    const nuevo = { id: actual?.id ?? crypto.randomUUID(), nombre: texto.slice(0, 40), estimado, dia: numero };
    await ctx.almacen.actualizarAjustes((a) => ({
      ...a,
      fijos: a.fijos.some((f) => f.id === nuevo.id) ? a.fijos.map((f) => (f.id === nuevo.id ? nuevo : f)) : [...a.fijos, nuevo],
    }));
    await ctx.recargar();
    ctx.ir('fijos');
  }, () => { error.textContent = 'No se pudo guardar. Cierra Marea, vuelve a abrirla e inténtalo otra vez.'; });

  // Quitar pide un segundo toque. Los pagos ya anotados se quedan como gastos.
  let pedidoEn = null;
  const quitarBoton = el('button', { class: 'enlace peligro', type: 'button' }, 'Quitar este pago fijo');
  const quitar = crearGuardador(async () => {
    await ctx.almacen.actualizarAjustes((a) => ({ ...a, fijos: a.fijos.filter((f) => f.id !== actual.id) }));
    await ctx.recargar();
    ctx.deshacer = {
      texto: `${actual.nombre} quitado.`,
      accion: () => ctx.almacen.actualizarAjustes((a) => ({ ...a, fijos: [...a.fijos.filter((f) => f.id !== actual.id), actual] })),
    };
    ctx.ir('fijos');
  }, () => { quitarBoton.textContent = 'No se pudo quitar. Toca para intentarlo otra vez'; });
  quitarBoton.addEventListener('click', () => {
    if (pedidoEn === null) { pedidoEn = Date.now(); quitarBoton.textContent = '¿Seguro? Toca otra vez para quitarlo'; return; }
    if (Date.now() - pedidoEn < 500) return;
    quitar();
  });

  actualizar();
  return el('form', { class: 'pantalla', novalidate: true, onsubmit: (e) => { e.preventDefault(); guardar(); } },
    el('div', { class: 'barra-sup' },
      el('button', { class: 'enlace', type: 'button', onclick: () => ctx.ir('fijos') }, 'Cancelar'),
      el('span', {}, actual ? 'Pago fijo' : 'Pago fijo nuevo')),
    monto.nodo,
    el('p', { class: 'resto' }, 'Más o menos cuánto es. Al pagarlo anotas lo que costó de verdad.'),
    el('div', {}, el('h2', { class: 'preg' }, '¿Qué pago es?'), nombre, sugeridos),
    el('div', {}, el('h2', { class: 'preg' }, '¿Qué día del mes toca? (opcional)'),
      el('div', { class: 'campos campo-suelto' }, el('div', { class: 'campo' },
        el('label', { for: 'fijo-dia' }, 'Día'), dia))),
    error,
    actual ? el('div', { class: 'borrar' }, quitarBoton) : null,
    el('div', { class: 'pie pie-fijo' }, guardarBoton));
}

/** Pagar un fijo: el monto viene con el estimado y se corrige a lo que costó. */
export function pagarFijo(ctx, { fijo: f }) {
  const { cuentas, ajustes } = ctx.estado;
  const activas = cuentas.filter((c) => !c.archivada);
  const cuentaInicial = activas.some((c) => c.id === ajustes.ultimaCuentaId) ? ajustes.ultimaCuentaId : activas[0].id;
  const aviso = el('p', { class: 'aviso', 'aria-live': 'polite' });
  const guardarBoton = el('button', { class: 'boton boton-pri', type: 'submit' }, 'Guardar pago');

  const monto = campoMonto(actualizar, aTexto(f.estimado));
  const conQue = grupoChips('¿Con qué pagaste?', activas.map((c) => ({ valor: c.id, texto: c.nombre })), cuentaInicial, actualizar);

  function actualizar() {
    const centavos = aCentavos(monto.entrada.value);
    guardarBoton.disabled = centavos === null;
    if (centavos === null) { aviso.replaceChildren(); return; }
    const dif = centavos - f.estimado;
    aviso.replaceChildren(dif === 0 ? 'Justo lo que habías apartado.'
      : dif > 0 ? `${aTexto(dif)} Bs más de lo apartado: salen de lo que te queda para gastar.`
        : `${aTexto(-dif)} Bs menos de lo apartado: vuelven a lo que te queda para gastar.`);
  }

  const idNuevo = crypto.randomUUID();
  const guardar = crearGuardador(async () => {
    const centavos = aCentavos(monto.entrada.value);
    if (centavos === null) return;
    const mov = {
      id: idNuevo, tipo: 'gasto', monto: centavos, cuentaId: conQue.valor(), fecha: ctx.ahora(),
      categoria: 'Pagos fijos', paraQuien: 'mi', nota: f.nombre, fijoId: f.id,
    };
    await ctx.almacen.agregarMovimiento(mov);
    await ctx.recargar();
    ctx.deshacer = { texto: `${f.nombre} pagado.`, accion: () => ctx.almacen.borrarMovimiento(mov.id) };
    ctx.ir('fijos');
  }, () => {
    aviso.replaceChildren(el('b', { class: 'pasa' }, 'No se pudo guardar.'), ' Cierra Marea, vuelve a abrirla e inténtalo otra vez.');
  });

  actualizar();
  return el('form', { class: 'pantalla', novalidate: true, onsubmit: (e) => { e.preventDefault(); guardar(); } },
    el('div', { class: 'barra-sup' },
      el('button', { class: 'enlace', type: 'button', onclick: () => ctx.ir('fijos') }, 'Cancelar'),
      el('span', {}, `Pagar ${f.nombre}`)),
    monto.nodo, conQue.nodo,
    el('div', { class: 'pie pie-fijo' }, aviso, guardarBoton));
}
