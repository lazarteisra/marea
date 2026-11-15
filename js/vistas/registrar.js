// Registrar gasto: monto y tres toques. También sirve para cambiar uno ya guardado.
import { el } from '../dom.js';
import { aCentavos, aTexto } from '../dinero.js';
import { resumen, avisoGasto } from '../calculo.js';
import { ordenarPorUso, partesAviso, crearGuardador, detallesRecientes } from '../registro.js';
import { deudas } from '../deudas.js';
import { campoMonto, grupoChips, horaCorta, fechaHora, botonBorrar } from './piezas.js';

export function registrar(ctx, { mov = null, volver = 'inicio' } = {}) {
  const { cuentas, movimientos, ajustes } = ctx.estado;
  const activas = cuentas.filter((c) => !c.archivada);
  const r = resumen(cuentas, movimientos, ajustes, ctx.ahora());
  const cuentaInicial = mov?.cuentaId ?? (activas.some((c) => c.id === ajustes.ultimaCuentaId) ? ajustes.ultimaCuentaId : activas[0].id);
  const categorias = ordenarPorUso(ajustes.categorias, movimientos, 'categoria');
  if (mov && !categorias.includes(mov.categoria)) categorias.push(mov.categoria);

  const aviso = el('p', { class: 'aviso', 'aria-live': 'polite' });
  const guardarBoton = el('button', { class: 'boton boton-pri', type: 'submit', disabled: true }, mov ? 'Guardar cambios' : 'Guardar gasto');

  const monto = campoMonto(actualizar, mov ? aTexto(mov.monto) : '');
  const enQue = grupoChips('¿En qué?', categorias.map((c) => ({ valor: c, texto: c })), mov?.categoria ?? null, actualizar);
  const paraQuien = grupoChips('¿Para quién?', [{ valor: 'mi', texto: 'Para mí' }, { valor: 'invite', texto: 'Invité yo' }, { valor: 'devuelven', texto: 'Me lo devuelven' }], mov?.paraQuien ?? 'mi', actualizar);
  const conQue = grupoChips('¿Con qué pagaste?', activas.map((c) => ({ valor: c.id, texto: c.nombre })), cuentaInicial, actualizar);

  // "¿Qué fue?": siempre a la vista y opcional. Lo ya escrito antes se repite con un toque.
  const nota = el('input', { class: 'nota', maxlength: 200, placeholder: 'Ej.: baño, pollo, cadena de la moto', 'aria-label': '¿Qué fue exactamente? (opcional)', autocomplete: 'off', enterkeyhint: 'done', value: mov?.nota || null });
  const sugeridos = el('div', { class: 'chips chips-mini' });
  let categoriaVista;
  function pintarSugeridos() {
    if (categoriaVista === enQue.valor()) return;
    categoriaVista = enQue.valor();
    sugeridos.replaceChildren(...detallesRecientes(movimientos, categoriaVista).map((texto) =>
      el('button', { class: 'chip chip-mini', type: 'button', onclick: () => { nota.value = texto; } }, texto)));
  }

  // "Me lo devuelven": quién y cuánto. Solo aparece si se elige esa opción.
  const persona = el('input', { class: 'nota', maxlength: 40, placeholder: 'Nombre', 'aria-label': '¿Quién te lo devuelve?', autocomplete: 'off', enterkeyhint: 'done', value: mov?.persona || null, oninput: actualizar });
  const conocidos = el('div', { class: 'chips chips-mini' }, deudas(movimientos).recientes.slice(0, 6).map((nombre) =>
    el('button', { class: 'chip chip-mini', type: 'button', onclick: () => { persona.value = nombre; actualizar(); } }, nombre)));
  // Viene con el monto completo; si la cuenta fue compartida, se baja.
  let devTocado = Boolean(mov?.devuelven);
  const devuelven = el('input', { id: 'devuelven', inputmode: 'decimal', autocomplete: 'off', maxlength: 9, placeholder: '0', value: mov?.devuelven ? aTexto(mov.devuelven) : null,
    oninput: () => { devTocado = true; actualizar(); } });
  const bloqueDevuelven = el('div', { hidden: true },
    el('h2', { class: 'preg' }, '¿Quién te lo devuelve?'), persona, conocidos,
    el('div', { class: 'campos campo-suelto campo-dev' }, el('div', { class: 'campo' },
      el('label', { for: 'devuelven' }, '¿Cuánto te devuelve?'), el('span', {}, devuelven, el('span', { class: 'uni' }, 'Bs')))));

  /** Lo que te devuelven, o null si falta algo o es más que el gasto. */
  function leerDevuelven(centavos) {
    if (paraQuien.valor() !== 'devuelven') return { vale: true, persona: null, devuelven: 0 };
    const cuanto = aCentavos(devuelven.value);
    const quien = persona.value.trim();
    return { vale: quien !== '' && cuanto !== null && centavos !== null && cuanto <= centavos, persona: quien, devuelven: cuanto ?? 0 };
  }

  function actualizar() {
    pintarSugeridos();
    const centavos = aCentavos(monto.entrada.value);
    const loDevuelven = paraQuien.valor() === 'devuelven';
    bloqueDevuelven.hidden = !loDevuelven;
    if (loDevuelven && !devTocado) devuelven.value = centavos === null ? '' : aTexto(centavos);
    const dev = leerDevuelven(centavos);
    guardarBoton.disabled = centavos === null || enQue.valor() === null || !dev.vale;
    if (centavos !== null && loDevuelven && aCentavos(devuelven.value) > centavos) { aviso.replaceChildren('No te pueden devolver más de lo que costó.'); return; }
    if (centavos === null || mov) { aviso.replaceChildren(); return; }
    aviso.replaceChildren(...partesAviso(avisoGasto(r, centavos, centavos - dev.devuelven), r.dias > 1).map((p) =>
      p.tipo ? el('b', { class: p.tipo === 'pasa' ? 'pasa' : null }, p.texto) : p.texto));
  }

  // Fuera del guardador: si algo falla después de guardar, reintentar no crea otro.
  const idNuevo = crypto.randomUUID();
  const guardar = crearGuardador(async () => {
    const centavos = aCentavos(monto.entrada.value);
    const dev = leerDevuelven(centavos);
    if (centavos === null || enQue.valor() === null || !dev.vale) return;
    const nuevo = {
      ...(mov ?? { id: idNuevo, tipo: 'gasto', fecha: ctx.ahora() }),
      monto: centavos, cuentaId: conQue.valor(),
      categoria: enQue.valor(), paraQuien: paraQuien.valor(), nota: nota.value.trim().slice(0, 200),
    };
    delete nuevo.persona;
    delete nuevo.devuelven;
    if (paraQuien.valor() === 'devuelven') { nuevo.persona = dev.persona.slice(0, 40); nuevo.devuelven = dev.devuelven; }
    await ctx.almacen.agregarMovimiento(nuevo);
    if (!mov && ajustes.ultimaCuentaId !== nuevo.cuentaId) await ctx.almacen.actualizarAjustes((a) => ({ ...a, ultimaCuentaId: nuevo.cuentaId }));
    await ctx.recargar();
    ctx.deshacer = mov
      ? { texto: 'Cambios guardados.', accion: () => ctx.almacen.agregarMovimiento(mov) }
      : { texto: 'Gasto guardado.', accion: () => ctx.almacen.borrarMovimiento(nuevo.id) };
    ctx.ir(volver);
  }, () => {
    aviso.replaceChildren(el('b', { class: 'pasa' }, 'No se pudo guardar.'), ' Cierra Marea, vuelve a abrirla e inténtalo otra vez.');
  });

  actualizar();
  return el('form', { class: 'pantalla', novalidate: true, onsubmit: (e) => { e.preventDefault(); guardar(); } },
    el('div', { class: 'barra-sup' },
      el('button', { class: 'enlace', type: 'button', onclick: () => ctx.ir(volver) }, 'Cancelar'),
      el('span', {}, mov ? fechaHora(mov.fecha, ctx.ahora()) : horaCorta(ctx.ahora()))),
    monto.nodo, enQue.nodo,
    el('div', {}, el('h2', { class: 'preg' }, '¿Qué fue exactamente? (opcional)'), nota, sugeridos),
    paraQuien.nodo, bloqueDevuelven, conQue.nodo,
    mov ? el('div', { class: 'borrar' }, botonBorrar(ctx, mov, volver)) : null,
    el('div', { class: 'pie pie-fijo' }, aviso, guardarBoton));
}
