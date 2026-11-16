// Cuadrar: escribir cuánto hay de verdad en cada cuenta y explicar las diferencias.
import { el } from '../dom.js';
import { aTexto } from '../dinero.js';
import { claveDia } from '../fechas.js';
import { saldos } from '../calculo.js';
import { deudas } from '../deudas.js';
import { leerReal, borradorVigente, diferencias, totalContado, ultimoValido, movimientoDeAjuste, AJUSTE_MAX } from '../cuadre.js';
import { crearGuardador } from '../registro.js';
import { avisoDeshacer, tituloDia } from './piezas.js';

/** "Cuadraste hace 4 días. Ya toca otra vez." Pura, para poder probarla. */
export function textoEstadoCuadre(e) {
  if (e.dias === null) return 'Aún no cuadraste. Cuenta tu plata y compárala con lo que dice Marea.';
  const cuando = e.dias === 0 ? 'hoy' : e.dias === 1 ? 'ayer' : `hace ${e.dias} días`;
  return `Cuadraste ${cuando}.` + (e.recordar ? ' Ya toca otra vez.' : '');
}

/** "Faltan 35 Bs", "Sobran 20 Bs" o "Cuadra". Pura. */
export function textoDiferencia(dif) {
  if (dif === 0) return { texto: 'Cuadra', clase: 'bien' };
  return dif < 0 ? { texto: `Faltan ${aTexto(-dif)} Bs`, clase: 'falta' } : { texto: `Sobran ${aTexto(dif)} Bs`, clase: 'sobra' };
}

/** "Desde tu último cuadre (Viernes 13 nov) tu plata bajó 320 Bs." Pura. */
export function textoDesdeUltimo(ultimo, totalAhora, hoyClave) {
  if (!ultimo) return null;
  const cambio = totalAhora - ultimo.total;
  const cuando = tituloDia(claveDia(ultimo.fecha), hoyClave).toLowerCase();
  const como = cambio === 0 ? 'sigue igual' : cambio > 0 ? `subió ${aTexto(cambio)} Bs` : `bajó ${aTexto(-cambio)} Bs`;
  return `Desde tu último cuadre (${cuando}), la plata de tus cuentas ${como}.`;
}

export function cuadrar(ctx) {
  const { cuentas, ajustes } = ctx.estado;
  const borrador = borradorVigente(ajustes, cuentas, ctx.ahora());
  return borrador ? comparar(ctx, borrador) : contar(ctx);
}

/** Paso 1: escribir lo que hay de verdad. Lo que se deje vacío no se compara. */
function contar(ctx) {
  const { cuentas, movimientos } = ctx.estado;
  const activas = cuentas.filter((c) => !c.archivada);
  const porCuenta = saldos(cuentas, movimientos);
  const error = el('p', { class: 'error', role: 'alert' });
  const campos = activas.map((cuenta) => ({
    cuenta,
    // Al corregir, el aviso anterior deja de valer.
    entrada: el('input', { id: 'real-' + cuenta.id, inputmode: 'decimal', autocomplete: 'off', maxlength: 11, placeholder: '—', oninput: () => { error.textContent = ''; } }),
  }));

  const comparar = crearGuardador(async () => {
    const reales = [];
    for (const { cuenta, entrada } of campos) {
      const monto = leerReal(entrada.value);
      if (monto === undefined) {
        error.textContent = `Revisa lo de ${cuenta.nombre}. Va un monto menor que un millón, solo con números: por ejemplo 85 o 12,50.`;
        entrada.focus();
        return;
      }
      if (monto !== null) reales.push({ cuentaId: cuenta.id, monto });
    }
    if (!reales.length) { error.textContent = 'Escribe cuánto tienes en al menos una cuenta.'; return; }
    await ctx.almacen.actualizarAjustes((a) => ({ ...a, cuadre: { fecha: ctx.ahora(), reales } }));
    await ctx.recargar();
    ctx.ir('cuadrar');
  }, () => { error.textContent = 'No se pudo guardar. Cierra Marea, vuelve a abrirla e inténtalo otra vez.'; });

  return el('form', { class: 'pantalla', novalidate: true, onsubmit: (e) => { e.preventDefault(); comparar(); } },
    el('div', { class: 'barra-sup' },
      el('button', { class: 'enlace', type: 'button', onclick: () => ctx.ir('total') }, 'Cancelar'),
      el('span', {}, 'Cuadrar')),
    el('h1', { class: 'titulo chico' }, '¿Cuánto tienes de verdad?'),
    el('p', { class: 'parrafo' }, 'Cuenta tu efectivo y mira tus saldos. Lo que no quieras revisar ahora, déjalo vacío.'),
    avisoDeshacer(ctx, 'cuadrar'),
    el('div', { class: 'campos' }, campos.map(({ cuenta, entrada }) =>
      el('div', { class: 'campo' },
        el('label', { for: entrada.id }, cuenta.nombre, el('small', { class: 'calcula' }, `Marea calcula ${aTexto(porCuenta.get(cuenta.id))}`)),
        el('span', {}, entrada, el('span', { class: 'uni' }, 'Bs'))))),
    error,
    el('div', { class: 'pie pie-fijo' }, el('button', { class: 'boton boton-pri', type: 'submit' }, 'Comparar')));
}

/** Paso 2: por cada cuenta, la diferencia y cómo explicarla. */
function comparar(ctx, borrador) {
  const { cuentas, movimientos, ajustes } = ctx.estado;
  const activas = cuentas.filter((c) => !c.archivada);
  const porCuenta = saldos(cuentas, movimientos);
  const difs = diferencias(cuentas, porCuenta, borrador.reales);
  const pendientes = difs.filter((d) => d.dif !== 0);
  const deudores = deudas(movimientos).lista;
  const estado = el('p', { class: 'error', role: 'alert' });
  const fallo = () => { estado.textContent = 'No se pudo guardar. Cierra Marea, vuelve a abrirla e inténtalo otra vez.'; };

  /** Las diferencias con lo guardado en este instante; null si el borrador ya no existe. */
  async function diferenciasFrescas() {
    await ctx.recargar();
    const e = ctx.estado;
    const b = borradorVigente(e.ajustes, e.cuentas, ctx.ahora());
    return b ? diferencias(e.cuentas, saldos(e.cuentas, e.movimientos), b.reales) : null;
  }

  const bloque = (d) => {
    const t = textoDiferencia(d.dif);
    const id = d.cuenta.id;
    const monto = Math.abs(d.dif);
    const opcion = (texto, alTocar) => el('button', { class: 'chip', type: 'button', onclick: alTocar }, texto);

    // "No sé": queda anotado como sin explicar y el saldo pasa a ser el real.
    const idAjuste = crypto.randomUUID();
    const noSe = crearGuardador(async () => {
      // Con los datos de ahora mismo: si la diferencia ya no es la que se ve, se vuelve a pintar.
      const fresca = await diferenciasFrescas();
      const ahora = fresca?.find((x) => x.cuenta.id === id);
      if (!ahora || ahora.dif !== d.dif) { ctx.ir('cuadrar'); return; }
      if (Math.abs(d.dif) > AJUSTE_MAX) { estado.textContent = `La diferencia de ${d.cuenta.nombre} es demasiado grande. Revisa lo que contaste con "Volver a contar".`; return; }
      const mov = movimientoDeAjuste(idAjuste, id, d.dif, ctx.ahora());
      await ctx.almacen.agregarMovimiento(mov);
      await ctx.recargar();
      ctx.deshacer = { texto: 'Anotado como sin explicar.', accion: () => ctx.almacen.borrarMovimiento(mov.id) };
      ctx.ir('cuadrar');
    }, fallo);

    let opciones = null;
    let quienPago = null;
    if (d.dif < 0) {
      opciones = [
        opcion('Fue un gasto que no anoté', () => ctx.ir('registrar', { volver: 'cuadrar', sugerido: { monto, cuentaId: id } })),
        activas.length > 1 ? opcion('Pasé plata a otra cuenta', () => ctx.ir('paso', { volver: 'cuadrar', sugerido: { monto, de: id } })) : null,
        opcion('Presté plata', () => ctx.ir('prestamo', { volver: 'cuadrar', sugerido: { monto, cuentaId: id } })),
        opcion('No sé', noSe),
      ];
    } else if (d.dif > 0) {
      quienPago = el('div', { hidden: true },
        el('h2', { class: 'preg' }, '¿Quién te pagó?'),
        el('div', { class: 'chips' }, deudores.map((p) => opcion(`${p.persona} (${aTexto(p.debe)})`,
          () => ctx.ir('cobro', { persona: p.persona, debe: p.debe, volver: 'cuadrar', sugerido: { monto, cuentaId: id } })))));
      opciones = [
        opcion('Me entró plata que no anoté', () => ctx.ir('ingreso', { volver: 'cuadrar', sugerido: { monto, cuentaId: id } })),
        deudores.length ? opcion('Me pagaron una deuda', () => { quienPago.hidden = false; }) : null,
        activas.length > 1 ? opcion('Pasé plata desde otra cuenta', () => ctx.ir('paso', { volver: 'cuadrar', sugerido: { monto, a: id } })) : null,
        opcion('No sé', noSe),
      ];
    }
    return el('section', { class: 'dif' },
      el('div', { class: 'dif-cab' }, el('b', {}, d.cuenta.nombre), el('span', { class: t.clase }, t.texto)),
      el('small', {}, `Marea calcula ${aTexto(d.calcula)} · tienes ${aTexto(d.real)}`),
      opciones ? el('div', { class: 'chips' }, opciones) : null,
      quienPago);
  };

  const terminar = crearGuardador(async () => {
    const fresca = await diferenciasFrescas();
    if (!fresca || fresca.some((x) => x.dif !== 0)) { ctx.ir('cuadrar'); return; }
    // Ya sin diferencias, lo que Marea calcula es lo real.
    const todo = totalContado(ctx.estado.cuentas, saldos(ctx.estado.cuentas, ctx.estado.movimientos), []);
    await ctx.almacen.actualizarAjustes((a) => ({ ...a, cuadre: null, ultimoCuadre: { fecha: ctx.ahora(), total: todo } }));
    await ctx.recargar();
    ctx.ir('total');
  }, fallo);
  const contarDeNuevo = crearGuardador(async () => {
    await ctx.almacen.actualizarAjustes((a) => ({ ...a, cuadre: null }));
    await ctx.recargar();
    ctx.ir('cuadrar');
  }, fallo);

  const desde = textoDesdeUltimo(ultimoValido(ajustes.ultimoCuadre), totalContado(cuentas, porCuenta, borrador.reales), claveDia(ctx.ahora()));
  return el('section', { class: 'pantalla' },
    el('div', { class: 'barra-sup' },
      el('button', { class: 'enlace', type: 'button', onclick: () => ctx.ir('total') }, pendientes.length ? 'Dejar para después' : 'Cerrar'),
      el('span', {}, 'Cuadrar')),
    el('h1', { class: 'titulo chico' }, pendientes.length ? 'Lo que no cuadra' : 'Todo cuadra'),
    el('p', { class: 'parrafo' }, pendientes.length
      ? 'Dile a Marea qué pasó con cada diferencia. Si no te acuerdas, toca "No sé".'
      : 'Lo que dice Marea es igual a lo que tienes.'),
    desde ? el('p', { class: 'parrafo' }, desde) : null,
    avisoDeshacer(ctx, 'cuadrar'),
    difs.map(bloque),
    estado,
    el('div', { class: 'salidas' },
      el('button', { class: 'enlace', type: 'button', onclick: contarDeNuevo }, 'Volver a contar')),
    el('div', { class: 'pie pie-fijo' },
      el('button', { class: 'boton boton-pri', type: 'button', disabled: pendientes.length > 0, onclick: terminar },
        pendientes.length ? `Falta explicar ${pendientes.length === 1 ? 'una diferencia' : pendientes.length + ' diferencias'}` : 'Terminar')));
}
