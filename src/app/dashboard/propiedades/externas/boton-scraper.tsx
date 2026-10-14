'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import {
  solicitarScrapingExternas,
  obtenerUltimoTrabajoScraperExternas,
  type TrabajoScraperExternas,
} from './acciones'

const POLL_MS = 4000

export default function BotonScraper({
  trabajoInicial,
}: {
  trabajoInicial: TrabajoScraperExternas | null
}) {
  const [trabajo, setTrabajo] = useState<TrabajoScraperExternas | null>(trabajoInicial)
  const [error, setError] = useState<string | null>(null)

  const enCurso = trabajo?.estado === 'SOLICITADO' || trabajo?.estado === 'EN_PROGRESO'

  useEffect(() => {
    if (!enCurso) return
    const intervalo = setInterval(async () => {
      const actualizado = await obtenerUltimoTrabajoScraperExternas()
      setTrabajo(actualizado)
    }, POLL_MS)
    return () => clearInterval(intervalo)
  }, [enCurso])

  async function manejarClic() {
    setError(null)
    const resultado = await solicitarScrapingExternas()
    if (!resultado.ok) {
      setError(resultado.mensaje ?? 'No se pudo solicitar el scraping.')
      return
    }
    const actualizado = await obtenerUltimoTrabajoScraperExternas()
    setTrabajo(actualizado)
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={manejarClic}
        disabled={enCurso}
        className="flex items-center gap-2 rounded bg-[#38B6FF] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#2A9FE8] disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {enCurso ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        {enCurso ? 'Scrapeando Encuentra24…' : 'Scrapear Encuentra24'}
      </button>

      {error && <span className="text-xs text-red-600">{error}</span>}

      {!enCurso && trabajo?.estado === 'COMPLETADO' && (
        <span className="flex items-center gap-1 text-xs text-green-700">
          <CheckCircle2 size={14} />
          Última corrida: {trabajo.resultado?.guardadas ?? 0} nuevas/actualizadas
          {trabajo.resultado?.posiblesBajas ? `, ${trabajo.resultado.posiblesBajas} posible baja` : ''}
          {trabajo.resultado?.eliminadas ? `, ${trabajo.resultado.eliminadas} eliminadas` : ''}
          {trabajo.resultado?.errores && trabajo.resultado.errores.length > 0
            ? `, ${trabajo.resultado.errores.length} categoría(s) fallaron`
            : ''}
          {' · '}
          {new Date(trabajo.completado_en!).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}
        </span>
      )}

      {!enCurso && trabajo?.estado === 'FALLIDO' && (
        <span className="flex items-center gap-1 text-xs text-red-600">
          <XCircle size={14} />
          Falló: {trabajo.mensaje_error ?? 'Error desconocido'}
        </span>
      )}
    </div>
  )
}
