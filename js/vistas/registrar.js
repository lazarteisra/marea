// Registrar gasto: monto y tres toques.
import { el } from '../dom.js';
import { aCentavos } from '../dinero.js';
import { resumen, avisoGasto } from '../calculo.js';
import { ordenarPorUso, partesAviso, crearGuardador } from '../registro.js';
import { campoMonto, grupoChips, horaCorta } from './piezas.js';

export function registrar(ctx) {
  const { cuentas, movimientos, ajustes } = ctx.estado;
  const activas = cuentas.filter((c) => !c.archivada);
  const r = resumen(cuentas, movimientos, ajustes, ctx.ahora());
  const cuentaInicial = activas.some((c) => c.id === ajustes.ultimaCuentaId) ? ajustes.ultimaCuentaId : activas[0].id;

  const aviso = el('p', { class: 'aviso', 'aria-live': 'polite' });
  const guardarBoton = el('button', { class: 'boton boton-pri', type: 'submit', disabled: true }, 'Guardar gasto');

  const monto = campoMonto(actualizar);
  const enQue = grupoChips('¿En qué?', ordenarPorUso(ajustes.categorias, movimientos, 'categoria').map((c) => ({ valor: c, texto: c })), null, actualizar);
  const paraQuien = grupoChips('¿Para quién?', [{ valor: 'mi', texto: 'Para mí' }, { valor: 'invite', texto: 'Invité yo' }], 'mi', actualizar);
  const conQue = grupoChips('¿Con qué pagaste?', activas.map((c) => ({ valor: c.id, texto: c.nombre })), cuentaInicial, actualizar);

  const nota = el('input', { class: 'nota', maxlength: 200, placeholder: 'Nota (opcional)', 'aria-label': 'Nota', autocomplete: 'off', hidden: true });
  const abrirNota = el('button', { class: 'enlace', type: 'button', onclick: () => { nota.hidden = false; abrirNota.hidden = true; nota.focus(); } }, 'Añadir una nota');

  function actualizar() {
    const centavos = aCentavos(monto.entrada.value);
    guardarBoton.disabled = centavos === null || enQue.valor() === null;
    if (centavos === null) { aviso.replaceChildren(); return; }
    aviso.replaceChildren(...partesAviso(avisoGasto(r, centavos), r.dias > 1).map((p) =>
      p.tipo ? el('b', { class: p.tipo === 'pasa' ? 'pasa' : null }, p.texto) : p.texto));
  }

  const guardar = crearGuardador(async () => {
    const centavos = aCentavos(monto.entrada.value);
    if (centavos === null || enQue.valor() === null) return;
    const mov = {
      id: crypto.randomUUID(), tipo: 'gasto', monto: centavos, cuentaId: conQue.valor(), fecha: ctx.ahora(),
      categoria: enQue.valor(), paraQuien: paraQuien.valor(), nota: nota.value.trim().slice(0, 200),
    };
    await ctx.almacen.agregarMovimiento(mov);
    if (ajustes.ultimaCuentaId !== mov.cuentaId) await ctx.almacen.guardarAjustes({ ...ajustes, ultimaCuentaId: mov.cuentaId });
    await ctx.recargar();
    ctx.deshacer = { texto: 'Gasto guardado.', accion: () => ctx.almacen.borrarMovimiento(mov.id) };
    ctx.ir('inicio');
  }, () => {
    aviso.replaceChildren(el('b', { class: 'pasa' }, 'No se pudo guardar.'), ' Cierra Marea, vuelve a abrirla e inténtalo otra vez.');
  });

  return el('form', { class: 'pantalla', novalidate: true, onsubmit: (e) => { e.preventDefault(); guardar(); } },
    el('div', { class: 'barra-sup' },
      el('button', { class: 'enlace', type: 'button', onclick: () => ctx.ir('inicio') }, 'Cancelar'),
      el('span', {}, horaCorta(ctx.ahora()))),
    monto.nodo, enQue.nodo, paraQuien.nodo, conQue.nodo,
    el('div', {}, abrirNota, nota),
    el('div', { class: 'pie' }, aviso, guardarBoton));
}
