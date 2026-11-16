// Piezas que comparten las pantallas de registro.
import { el, svg } from '../dom.js';
import { aTexto } from '../dinero.js';
import { claveDia, diasEntre } from '../fechas.js';
import { crearGuardador } from '../registro.js';

/** Campo grande de monto. Devuelve el nodo y la entrada. */
export function campoMonto(alCambiar, inicial = '') {
  const entrada = el('input', {
    inputmode: 'decimal', autocomplete: 'off', placeholder: '0', maxlength: 9,
    'aria-label': 'Monto en bolivianos', 'data-foco': true, enterkeyhint: 'done',
  });
  const nodo = el('label', { class: 'monto' }, entrada, el('span', { class: 'bs' }, 'Bs'));
  const ajustarAncho = () => {
    const largo = Math.max(1, entrada.value.length);
    entrada.style.width = (largo * 0.8 + 0.15).toFixed(2) + 'ch';
    nodo.classList.toggle('largo', largo > 4);
  };
  entrada.addEventListener('input', () => { ajustarAncho(); alCambiar(); });
  if (inicial) { entrada.value = inicial; ajustarAncho(); }
  return { nodo, entrada };
}

/**
 * Pregunta con opciones para tocar. `opciones` es [{ valor, texto }].
 * Devuelve el nodo y `valor()` con lo elegido (o null).
 */
export function grupoChips(pregunta, opciones, inicial, alCambiar) {
  let elegido = inicial;
  const botones = opciones.map((o) => {
    const boton = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(o.valor === elegido) }, o.texto);
    boton.addEventListener('click', () => {
      elegido = o.valor;
      for (const [i, b] of botones.entries()) b.setAttribute('aria-pressed', String(opciones[i].valor === elegido));
      alCambiar();
    });
    return boton;
  });
  const nodo = el('div', { role: 'group', 'aria-label': pregunta },
    el('h2', { class: 'preg' }, pregunta), el('div', { class: 'chips' }, botones));
  return { nodo, valor: () => elegido };
}

export function horaCorta(ms) {
  return 'Hoy, ' + new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}

const horaDe = (ms) => new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));

/** "Hoy", "Ayer" o "Viernes 13 nov" para una clave de día. */
export function tituloDia(clave, hoyClave) {
  const lejos = diasEntre(clave, hoyClave);
  if (lejos === 0) return 'Hoy';
  if (lejos === 1) return 'Ayer';
  const [a, m, d] = clave.split('-').map(Number);
  const texto = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(a, m - 1, d)).replace(',', '');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "Hoy, 07:52" o "Viernes 13 nov, 20:10": cuándo fue un movimiento ya guardado. */
export function fechaHora(ms, ahoraMs) {
  return tituloDia(claveDia(ms), claveDia(ahoraMs)) + ', ' + horaDe(ms);
}

/** Una línea de la lista de movimientos; al tocarla se abre para editar. Con `ahoraMs` la fila dice también el día ("Ayer, 20:10"). */
export function filaMovimiento(m, cuentas, alTocar, ahoraMs = null) {
  const nombre = (id) => cuentas.find((c) => c.id === id)?.nombre;
  const cuenta = nombre(m.cuentaId);
  const hora = ahoraMs === null ? horaDe(m.fecha) : fechaHora(m.fecha, ahoraMs);
  let titulo;
  let partes;
  let signo = '';
  let clase = '';
  if (m.tipo === 'gasto') {
    titulo = m.nota || m.categoria;
    partes = [m.nota ? m.categoria : null, m.ajuste ? 'ajuste de cuadre' : null, m.alCuadrar ? 'anotado al cuadrar' : null, m.paraQuien === 'invite' ? 'invité yo' : null,
      m.paraQuien === 'devuelven' ? `${m.persona} te devuelve ${aTexto(m.devuelven)}` : null, cuenta, hora];
  } else if (m.tipo === 'ingreso') {
    titulo = m.origen; partes = [m.ajuste ? 'ajuste de cuadre' : null, cuenta, hora]; signo = '+'; clase = ' entra';
  } else if (m.tipo === 'paso') {
    titulo = `${cuenta ?? '?'} → ${nombre(m.cuentaDestinoId) ?? '?'}`; partes = ['Paso entre cuentas', hora]; clase = ' neutro';
  } else if (m.tipo === 'prestamo') {
    titulo = `Le prestaste a ${m.persona}`; partes = [cuenta, hora];
  } else if (m.tipo === 'cobro') {
    titulo = `${m.persona} te pagó`; partes = [cuenta, hora]; signo = '+'; clase = ' entra';
  } else {
    titulo = 'Movimiento'; partes = [cuenta, hora]; clase = ' neutro';
  }
  return el('button', { class: 'mov', type: 'button', onclick: alTocar },
    el('span', { class: 'mov-que' }, el('b', {}, titulo), el('small', {}, partes.filter(Boolean).join(' · '))),
    el('span', { class: 'mov-monto' + clase }, signo + aTexto(m.monto)));
}

const VISTA_DE = { gasto: 'registrar', ingreso: 'ingreso', paso: 'paso', prestamo: 'prestamo', cobro: 'cobro' };

/** Abre un movimiento ya guardado en la pantalla que sabe cambiarlo. */
export function abrirMovimiento(ctx, m, volver) {
  ctx.ir(VISTA_DE[m.tipo] ?? 'registrar', { mov: m, volver });
}

/** Aviso con "Deshacer" tras guardar, cambiar o borrar. Devuelve null si no hay nada que avisar. */
export function avisoDeshacer(ctx, vista) {
  if (!ctx.deshacer) return null;
  const { texto, accion } = ctx.deshacer;
  ctx.deshacer = null;
  const mensaje = el('span', {}, texto);
  let enCurso = false;
  const deshacer = crearGuardador(async () => {
    enCurso = true;
    await accion();
    await ctx.recargar();
    ctx.ir(vista);
  }, () => {
    enCurso = false;
    mensaje.textContent = 'No se pudo deshacer. Inténtalo otra vez.';
  });
  const toast = el('div', { class: 'toast', role: 'status' }, mensaje,
    el('button', { class: 'enlace mar', type: 'button', onclick: deshacer }, 'Deshacer'));
  // No desaparece a mitad de un deshacer.
  const quitar = () => (enCurso ? setTimeout(quitar, 1000) : toast.remove());
  setTimeout(quitar, 6000);
  return toast;
}

/** Borrar pide un segundo toque en vez de una ventana de confirmación. */
export function botonBorrar(ctx, mov, volver) {
  let pedidoEn = null;
  const boton = el('button', { class: 'enlace peligro', type: 'button' }, 'Borrar este movimiento');
  const borrar = crearGuardador(async () => {
    await ctx.almacen.borrarMovimiento(mov.id);
    await ctx.recargar();
    ctx.deshacer = { texto: 'Movimiento borrado.', accion: () => ctx.almacen.agregarMovimiento(mov) };
    ctx.ir(volver);
  }, () => { boton.textContent = 'No se pudo borrar. Toca para intentarlo otra vez'; });
  boton.addEventListener('click', () => {
    if (pedidoEn === null) { pedidoEn = Date.now(); boton.textContent = '¿Seguro? Toca otra vez para borrarlo'; return; }
    // Un doble toque sin querer no cuenta como confirmación.
    if (Date.now() - pedidoEn < 500) return;
    borrar();
  });
  return boton;
}

const PESTANAS = [
  { vista: 'inicio', texto: 'Inicio', trazo: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z' },
  { vista: 'presupuesto', texto: 'Presupuesto', trazo: 'M5 17a8 8 0 1 1 14 0M12 13l4-5' },
  { vista: 'movimientos', texto: 'Movimientos', trazo: 'M5 7h14M5 12h14M5 17h9' },
  { vista: 'fijos', texto: 'Fijos', trazo: 'M5 6h14v14H5zM5 10h14M9 4v4M15 4v4' },
  { vista: 'total', texto: 'Total', trazo: 'M4 18l5-6 4 3 7-9' },
];
export const VISTAS_CON_BARRA = PESTANAS.map((p) => p.vista);

/** Barra de abajo con las cinco pestañas. */
export function barraPestanas(ctx, actual) {
  return el('nav', { class: 'pestanas', 'aria-label': 'Secciones' }, PESTANAS.map((p) =>
    el('button', { type: 'button', 'aria-current': p.vista === actual ? 'page' : null, onclick: () => ctx.ir(p.vista) },
      svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, svg('path', { d: p.trazo })),
      el('span', {}, p.texto))));
}
