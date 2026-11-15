// Arranque, estado y navegación.
import { abrirAlmacen } from './almacen.js';
import { el } from './dom.js';
import { primeraVez } from './vistas/primeraVez.js';
import { inicio } from './vistas/inicio.js';
import { registrar } from './vistas/registrar.js';
import { ingreso } from './vistas/ingreso.js';
import { ajustes } from './vistas/ajustes.js';
import { movimientos } from './vistas/movimientos.js';
import { presupuesto } from './vistas/presupuesto.js';
import { fijos, fijo, pagarFijo } from './vistas/fijos.js';
import { total } from './vistas/proximamente.js';
import { barraPestanas, VISTAS_CON_BARRA } from './vistas/piezas.js';

const vistas = { primeraVez, inicio, registrar, ingreso, ajustes, movimientos, presupuesto, fijos, fijo, pagarFijo, total };
const raiz = document.getElementById('app');
let actual = null;

const ctx = {
  estado: null,     // { cuentas, movimientos, ajustes }
  almacen: null,
  deshacer: null,   // { texto, accion } que Inicio muestra unos segundos
  ahora: () => Date.now(),
  ir,
  recargar,
};

function ir(nombre, parametros = {}) {
  actual = nombre;
  const conBarra = VISTAS_CON_BARRA.includes(nombre);
  let vista;
  try {
    vista = vistas[nombre](ctx, parametros);
  } catch {
    // Datos que una pantalla no sabe pintar: siempre queda el camino a Ajustes
    // para exportar, importar otro respaldo o empezar de cero.
    vista = el('section', { class: 'pantalla' },
      el('h1', { class: 'titulo chico' }, 'Algo no cuadra'),
      el('p', { class: 'parrafo' }, 'Marea no pudo mostrar esta pantalla con los datos guardados. Tus datos siguen en el teléfono.'),
      nombre === 'ajustes' ? null : el('div', { class: 'seccion' },
        el('button', { class: 'boton boton-sec', type: 'button', onclick: () => ir('ajustes') }, 'Ir a Ajustes')));
  }
  document.body.classList.toggle('con-barra', conBarra);
  raiz.replaceChildren(...[vista, conBarra ? barraPestanas(ctx, nombre) : null].filter(Boolean));
  window.scrollTo(0, 0);
  // Dentro del mismo toque, para que el iPhone abra el teclado.
  raiz.querySelector('[data-foco]')?.focus();
}

async function recargar() {
  ctx.estado = await ctx.almacen.cargar();
}

async function arrancar() {
  try {
    ctx.almacen = await abrirAlmacen();
    await recargar();
  } catch {
    raiz.replaceChildren(el('section', { class: 'pantalla' },
      el('h1', { class: 'titulo' }, 'Marea'),
      el('p', { class: 'parrafo' }, 'No se pudieron abrir tus datos en este navegador. Si estás en modo privado, sal de él y vuelve a abrir Marea.')));
    return;
  }
  ir(ctx.estado.ajustes.configurada ? 'inicio' : 'primeraVez');
  // Pide al navegador que no borre los datos por falta de espacio.
  navigator.storage?.persist?.().catch(() => {});
}

// Al volver a la app puede haber cambiado el día: Inicio se recalcula.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && actual === 'inicio') ir('inicio');
});

arrancar();

// Guarda la app en el teléfono para que abra sin internet.
if ('serviceWorker' in navigator) {
  const teniaVersion = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // Si llega una versión nueva mientras está en Inicio, la carga de una vez.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (teniaVersion && actual === 'inicio') location.reload();
  });
}
