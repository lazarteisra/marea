// Una categoría: cuánto va en el ciclo, su tope (opcional) y sus gastos.
import { el } from '../dom.js';
import { aCentavos, aTexto } from '../dinero.js';
import { gastoPorCategoria, gastosDeCategoria, conTope } from '../categorias.js';
import { filaMovimiento, abrirMovimiento } from './piezas.js';

export function categoria(ctx, { categoria: nombre }) {
  const { cuentas, movimientos, ajustes } = ctx.estado;
  const fila = gastoPorCategoria(movimientos, ajustes, ctx.ahora()).lista.find((f) => f.categoria === nombre)
    ?? { categoria: nombre, gastado: 0, antes: null, tope: null };
  const gastos = gastosDeCategoria(movimientos, ajustes, nombre, ctx.ahora());

  const estado = el('p', { class: 'estado', 'aria-live': 'polite' });
  const tope = el('input', { id: 'tope', inputmode: 'decimal', autocomplete: 'off', maxlength: 9, placeholder: 'Sin tope', value: fila.tope !== null ? aTexto(fila.tope) : null });
  let guardado = fila.tope;
  let enCurso = Promise.resolve(true);

  /** Guarda lo que haya en el campo. Devuelve false si lo escrito no vale o no se pudo guardar. */
  async function guardarAhora() {
    const texto = tope.value.trim();
    const monto = texto === '' ? null : aCentavos(texto);
    if (texto !== '' && monto === null) {
      estado.textContent = 'Escribe un monto mayor que cero y menor que un millón, por ejemplo 300. Para quitar el tope, deja el campo vacío.';
      return false;
    }
    if (monto === guardado) { estado.textContent = ''; return true; }
    try {
      await ctx.almacen.actualizarAjustes((a) => ({ ...a, topes: conTope(a.topes, nombre, monto) }));
    } catch {
      estado.textContent = 'No se pudo guardar. Cierra Marea, vuelve a abrirla e inténtalo otra vez.';
      return false;
    }
    guardado = monto;
    estado.textContent = monto === null ? 'Tope quitado.'
      : fila.gastado > monto ? `Guardado. Ya vas ${aTexto(fila.gastado - monto)} Bs por encima.`
        : `Guardado. Te quedan ${aTexto(monto - fila.gastado)} Bs en ${nombre} este ciclo.`;
    // Si recargar falla, el tope igual quedó guardado: se verá al volver a abrir.
    try { await ctx.recargar(); } catch { /* ya guardado */ }
    return true;
  }
  // Los guardados van en fila, uno tras otro, para que el último escrito sea el que queda.
  const guardarTope = () => (enCurso = enCurso.then(guardarAhora, guardarAhora));
  // Se guarda al salir del campo, como el día de la mensualidad en Ajustes.
  tope.addEventListener('change', guardarTope);
  // Y también antes de irse de la pantalla: en el teléfono, tocar un botón con
  // el teclado abierto puede no avisar a tiempo de que el campo cambió.
  const salir = (destino) => async () => { if (await guardarTope()) destino(); };

  let compara = null;
  if (fila.antes !== null) compara = fila.antes === 0 ? 'El ciclo pasado, a esta altura, no habías gastado nada aquí.' : `El ciclo pasado, a esta altura, llevabas ${aTexto(fila.antes)} Bs.`;

  return el('section', { class: 'pantalla' },
    el('div', { class: 'barra-sup' },
      el('button', { class: 'enlace', type: 'button', onclick: salir(() => ctx.ir('presupuesto')) }, 'Volver'),
      el('span', {}, 'Este ciclo')),
    el('h1', { class: 'titulo chico' }, nombre),
    el('p', { class: 'ciclo-gastado' }, `Llevas ${aTexto(fila.gastado)} Bs`),
    compara ? el('p', { class: 'ciclo-compara' }, compara) : null,

    el('div', { class: 'campos' }, el('div', { class: 'campo' },
      el('label', { for: 'tope' }, 'Tope por ciclo'),
      el('span', {}, tope, el('span', { class: 'uni' }, 'Bs')))),
    estado,
    el('p', { class: 'vacio' }, 'El tope es opcional. Si lo pones, Marea te avisa al registrar un gasto que lo pase.'),

    el('section', { class: 'bloque' },
      el('h2', { class: 'bloque-titulo' }, 'Gastos de este ciclo'),
      gastos.length
        ? el('div', { class: 'movs' }, gastos.map((m) => filaMovimiento(m, cuentas, salir(() => abrirMovimiento(ctx, m, 'presupuesto')), ctx.ahora())))
        : el('p', { class: 'vacio' }, 'Ninguno todavía.')));
}
