// Piezas que comparten las pantallas de registro.
import { el } from '../dom.js';

/** Campo grande de monto. Devuelve el nodo y la entrada. */
export function campoMonto(alCambiar) {
  const entrada = el('input', {
    inputmode: 'decimal', autocomplete: 'off', placeholder: '0', maxlength: 9,
    'aria-label': 'Monto en bolivianos', 'data-foco': true, enterkeyhint: 'done',
  });
  const nodo = el('label', { class: 'monto' }, entrada, el('span', { class: 'bs' }, 'Bs'));
  entrada.addEventListener('input', () => {
    const largo = Math.max(1, entrada.value.length);
    entrada.style.width = (largo * 0.8 + 0.15).toFixed(2) + 'ch';
    nodo.classList.toggle('largo', largo > 4);
    alCambiar();
  });
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
