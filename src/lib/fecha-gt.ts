const ZONA_GT = 'America/Guatemala'
export function componentesGT(fecha: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_GT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha)
  const obtener = (tipo: string) => partes.find((p) => p.type === tipo)?.value
  return {
    anio: Number(obtener('year')),
    mes: Number(obtener('month')),
    dia: Number(obtener('day')),
  }
}
// Guatemala no usa horario de verano, siempre UTC-6
export function inicioDeMesGT(anio: number, mes: number) {
  return new Date(`${anio}-${String(mes).padStart(2, '0')}-01T00:00:00-06:00`)
}
export function finDeMesGT(anio: number, mes: number) {
  let mesSig = mes + 1
  let anioSig = anio
  if (mesSig > 12) {
    mesSig = 1
    anioSig += 1
  }
  return inicioDeMesGT(anioSig, mesSig)
}
const OFFSET_GT_MS = 6 * 60 * 60 * 1000 // Guatemala es UTC-6 fijo, sin horario de verano
// Convierte un timestamp UTC (de la BD) al string que espera <input type="datetime-local">,
// representando la hora local de Guatemala.
export function aInputLocalGT(valor: string | null): string {
  if (!valor) return ''
  const fechaUTC = new Date(valor)
  const fechaGT = new Date(fechaUTC.getTime() - OFFSET_GT_MS)
  return fechaGT.toISOString().slice(0, 16)
}
// Convierte el string de <input type="datetime-local"> (interpretado como hora de Guatemala)
// de vuelta a un ISO string en UTC para guardar en la BD.
export function deInputLocalGT(valorInput: string | null | undefined): string | null {
  if (!valorInput) return null
  const fechaGT = new Date(`${valorInput}:00`)
  const fechaUTC = new Date(fechaGT.getTime() + OFFSET_GT_MS)
  return fechaUTC.toISOString()
}
const MESES_GT = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
// Formatea un timestamp UTC (de la BD) como fecha legible en hora de
// Guatemala, ej. "2 de septiembre de 2026". Usado para mostrar fechas de
// registro (creado_en) en el dashboard, donde no se necesita la hora.
export function formatearFechaLargaGT(valor: string | null | undefined): string | null {
  if (!valor) return null
  const { anio, mes, dia } = componentesGT(new Date(valor))
  return `${dia} de ${MESES_GT[mes - 1]} de ${anio}`
}
