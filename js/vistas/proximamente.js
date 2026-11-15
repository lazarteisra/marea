// Pestañas que todavía no están hechas: dicen qué van a tener.
import { el } from '../dom.js';

const hecha = (titulo, texto) => () => el('section', { class: 'pantalla' },
  el('h1', { class: 'titulo chico' }, titulo),
  el('p', { class: 'parrafo' }, texto),
  el('p', { class: 'parrafo pronto' }, 'Todavía no está lista. Llega en uno de los próximos módulos.'));

export const fijos = hecha('Fijos', 'El gimnasio, Claude y otros pagos que se repiten: cuándo tocan y si ya los pagaste.');
export const total = hecha('Total', 'Toda tu plata junta (Efectivo, BNB y Altoke) y cómo sube o baja con el tiempo.');
