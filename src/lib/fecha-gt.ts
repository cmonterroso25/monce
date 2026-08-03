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
