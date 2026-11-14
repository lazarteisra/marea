// Primera vez: cuánto hay ahora en cada cuenta.
import { el } from '../dom.js';
import { aCentavos } from '../dinero.js';
import { claveDia } from '../fechas.js';

export function primeraVez(ctx) {
  const error = el('p', { class: 'error', role: 'alert' });
  const campos = ctx.estado.cuentas.map((cuenta) => {
    const entrada = el('input', { id: 'saldo-' + cuenta.id, inputmode: 'decimal', autocomplete: 'off', placeholder: '0', maxlength: 9 });
    return { cuenta, entrada };
  });

  async function empezar(evento) {
    evento.preventDefault();
    const cuentas = [];
    for (const { cuenta, entrada } of campos) {
      const texto = entrada.value.trim();
      const monto = texto === '' || /^0+([.,]0*)?$/.test(texto) ? 0 : aCentavos(texto);
      if (monto === null) {
        error.textContent = `Revisa el monto de ${cuenta.nombre}. Solo números, por ejemplo 85 o 12,50.`;
        entrada.focus();
        return;
      }
      cuentas.push({ ...cuenta, saldoInicial: monto });
    }
    await ctx.almacen.guardarCuentas(cuentas);
    await ctx.almacen.guardarAjustes({ ...ctx.estado.ajustes, configurada: true, inicio: claveDia(ctx.ahora()) });
    await ctx.recargar();
    ctx.ir('inicio');
  }

  return el('form', { class: 'pantalla', onsubmit: empezar, novalidate: true },
    el('h1', { class: 'titulo' }, 'Marea'),
    el('p', { class: 'parrafo' }, 'Para empezar, cuenta cuánto tienes ahora mismo en cada lugar. Lo que esté en cero, déjalo en blanco.'),
    el('div', { class: 'campos' }, campos.map(({ cuenta, entrada }) =>
      el('div', { class: 'campo' },
        el('label', { for: entrada.id }, cuenta.nombre),
        el('span', {}, entrada, el('span', { class: 'uni' }, 'Bs'))))),
    error,
    el('div', { class: 'pie' }, el('button', { class: 'boton boton-pri', type: 'submit' }, 'Empezar')));
}
