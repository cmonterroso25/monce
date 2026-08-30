// Da formato al precio de una propiedad agregando la información de
// mantenimiento cuando se trata de una renta. Reglas:
// - Si no es renta: solo se muestra el precio, sin nota de mantenimiento.
// - Si es renta y `mantenimiento` es null, vacío o 0: se asume incluido
//   en el precio ("(mantenimiento incluido)").
// - Si es renta y `mantenimiento` tiene un monto > 0: se muestra aparte
//   ("+ Q450 de mantenimiento").
//
// IMPORTANTE: el mantenimiento SIEMPRE se cobra en quetzales (Q),
// independientemente de la moneda del precio de renta (que puede ser
// GTQ o USD). Por eso el monto de mantenimiento usa el prefijo "Q" fijo
// y nunca la moneda de la propiedad.
export function formatearPrecioRenta(
  precio: number | null | undefined,
  moneda: string | null | undefined,
  mantenimiento: number | null | undefined,
  tipoOperacion: string | null | undefined
): { precioPrincipal: string; notaMantenimiento: string | null } {
  const precioNum = Number(precio ?? 0)
  const monedaTexto = moneda ?? ''
  const precioPrincipal = `${monedaTexto} ${precioNum.toLocaleString()}`.trim()

  if (tipoOperacion !== 'renta') {
    return { precioPrincipal, notaMantenimiento: null }
  }

  const montoMantenimiento = mantenimiento ? Number(mantenimiento) : 0

  if (!montoMantenimiento || montoMantenimiento <= 0) {
    return { precioPrincipal, notaMantenimiento: '(mantenimiento incluido)' }
  }

  return {
    precioPrincipal,
    notaMantenimiento: `+ Q${montoMantenimiento.toLocaleString()} de mantenimiento`,
  }
}
