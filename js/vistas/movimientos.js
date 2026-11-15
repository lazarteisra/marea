// Movimientos: todo lo anotado, por día, con búsqueda. Tocar uno lo abre para cambiarlo o borrarlo.
import { el } from '../dom.js';
import { aTexto } from '../dinero.js';
import { claveDia } from '../fechas.js';
import { filtrar, agruparPorDia } from '../movimientos.js';
import { avisoDeshacer, filaMovimiento, tituloDia, abrirMovimiento } from './piezas.js';

const TIPOS = [{ valor: 'todo', texto: 'Todo' }, { valor: 'gasto', texto: 'Gastos' }, { valor: 'ingreso', texto: 'Ingresos' }];
const TANDA = 120;

export function movimientos(ctx) {
  const { cuentas, movimientos: todos } = ctx.estado;
  // Se recuerda la búsqueda al volver de editar un movimiento.
  const filtro = (ctx.filtroMovimientos ??= { texto: '', tipo: 'todo' });
  const hoy = claveDia(ctx.ahora());
  let visibles = TANDA;

  const lista = el('div', { class: 'lista-movs', 'aria-live': 'polite' });
  const abrir = (m) => () => abrirMovimiento(ctx, m, 'movimientos');

  function pintar() {
    const encontrados = filtrar(todos, cuentas, filtro).sort((a, b) => b.fecha - a.fecha);
    if (!encontrados.length) {
      lista.replaceChildren(el('p', { class: 'vacio' }, todos.length
        ? 'Nada coincide con lo que buscas.'
        : 'Aún no anotaste nada. Lo que registres va a aparecer aquí.'));
      return;
    }
    const grupos = agruparPorDia(encontrados.slice(0, visibles)).map((g) => el('section', { class: 'dia' },
      el('h2', { class: 'dia-cab' },
        el('span', {}, tituloDia(g.dia, hoy)),
        el('span', {}, [g.gastado ? `−${aTexto(g.gastado)}` : null, g.entrado ? `+${aTexto(g.entrado)}` : null].filter(Boolean).join('  '))),
      el('div', { class: 'movs' }, g.movimientos.map((m) => filaMovimiento(m, cuentas, abrir(m))))));
    const mas = encontrados.length > visibles
      ? el('button', { class: 'boton boton-sec ver-mas', type: 'button', onclick: () => { visibles += TANDA; pintar(); } }, 'Ver más antiguos')
      : null;
    lista.replaceChildren(...grupos, ...(mas ? [mas] : []));
  }

  const buscar = el('input', {
    class: 'nota', type: 'search', maxlength: 60, placeholder: 'Buscar: baño, comida, BNB, un nombre…', 'aria-label': 'Buscar movimientos',
    autocomplete: 'off', enterkeyhint: 'search', value: filtro.texto || null,
    oninput: () => { filtro.texto = buscar.value; visibles = TANDA; pintar(); },
  });
  const tipos = TIPOS.map((t) => el('button', { class: 'chip chip-mini', type: 'button', 'aria-pressed': String(filtro.tipo === t.valor) }, t.texto));
  tipos.forEach((boton, i) => boton.addEventListener('click', () => {
    filtro.tipo = TIPOS[i].valor;
    tipos.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
    visibles = TANDA;
    pintar();
  }));

  pintar();
  return el('section', { class: 'pantalla' },
    el('h1', { class: 'titulo chico' }, 'Movimientos'),
    el('div', { class: 'buscador' }, buscar, el('div', { class: 'chips', role: 'group', 'aria-label': 'Mostrar' }, tipos)),
    avisoDeshacer(ctx, 'movimientos'),
    lista);
}
