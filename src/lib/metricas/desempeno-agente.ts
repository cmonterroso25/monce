export type RangoTiempo = 'mes' | 'trimestre' | 'anio' | 'historico'

export const RANGOS: { valor: RangoTiempo; etiqueta: string }[] = [
  { valor: 'mes', etiqueta: 'Este mes' },
  { valor: 'trimestre', etiqueta: 'Trimestre actual' },
  { valor: 'anio', etiqueta: 'Año actual' },
  { valor: 'historico', etiqueta: 'Histórico' },
]

export function esRangoValido(valor: string | undefined): valor is RangoTiempo {
  return valor === 'mes' || valor === 'trimestre' || valor === 'anio' || valor === 'historico'
}

/** Devuelve el inicio del rango en ISO string, o null si es histórico (sin límite inferior). */
export function inicioDeRango(rango: RangoTiempo): string | null {
  const ahora = new Date()
  switch (rango) {
    case 'mes':
      return new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString()
    case 'trimestre': {
      const trimestre = Math.floor(ahora.getMonth() / 3)
      return new Date(ahora.getFullYear(), trimestre * 3, 1).toISOString()
    }
    case 'anio':
      return new Date(ahora.getFullYear(), 0, 1).toISOString()
    case 'historico':
      return null
  }
}

type LeadParaMetricas = {
  etapa: string | null
  creado_en: string | null
  actualizado_en: string | null
}

/**
 * Conversión = ganados / (ganados + perdidos) dentro del rango, ignorando los que siguen abiertos.
 * Tiempo de cierre = promedio de (actualizado_en - creado_en) en días, solo para leads
 * ganados DENTRO del rango seleccionado (aproximación: no existe historial de cambio de
 * etapa, así que se usa actualizado_en como proxy de la fecha de cierre).
 */
export function calcularMetricasDesempeno(leads: LeadParaMetricas[], desde: string | null) {
  const enRango = (l: LeadParaMetricas) => {
    if (!desde) return true
    return !!l.actualizado_en && l.actualizado_en >= desde
  }

  const ganados = leads.filter((l) => l.etapa === 'ganada' && enRango(l))
  const perdidos = leads.filter((l) => l.etapa === 'perdida' && enRango(l))

  const totalDecididos = ganados.length + perdidos.length
  const conversion = totalDecididos > 0 ? (ganados.length / totalDecididos) * 100 : null

  const diasCierre = ganados
    .filter((l) => l.creado_en && l.actualizado_en)
    .map((l) => {
      const inicio = new Date(l.creado_en as string).getTime()
      const fin = new Date(l.actualizado_en as string).getTime()
      return (fin - inicio) / (1000 * 60 * 60 * 24)
    })

  const tiempoCierrePromedio =
    diasCierre.length > 0 ? diasCierre.reduce((a, b) => a + b, 0) / diasCierre.length : null

  return {
    ganados: ganados.length,
    perdidos: perdidos.length,
    conversion,
    tiempoCierrePromedio,
  }
}
