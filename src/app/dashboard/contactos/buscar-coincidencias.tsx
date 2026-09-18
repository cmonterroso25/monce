'use client'

import { useState, useTransition } from 'react'
import { Search, Check } from 'lucide-react'
import {
  buscarCoincidencias,
  marcarCoincidenciaNotificada,
  marcarCoincidenciaExternaNotificada,
} from './coincidencias'

export function BuscarCoincidencias({ contactoId }: { contactoId: string }) {
  const [isPending, startTransition] = useTransition()
  const [mensaje, setMensaje] = useState<string | null>(null)

  function buscar() {
    setMensaje(null)
    startTransition(async () => {
      const resultado = await buscarCoincidencias(contactoId)
      if (!resultado.ok) {
        setMensaje(resultado.mensaje || 'Error al buscar')
        return
      }
      setMensaje(
        `${resultado.totalInterno ?? resultado.total} interna(s), ${resultado.totalExterno ?? 0} externa(s).`
      )
    })
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={buscar}
        disabled={isPending}
        className="flex items-center gap-1 rounded bg-[#2C3E50] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#38B6FF] disabled:opacity-50"
      >
        <Search size={13} />
        {isPending ? 'Buscando...' : 'Buscar coincidencias'}
      </button>
      {mensaje && <span className="text-xs text-slate-500">{mensaje}</span>}
    </div>
  )
}

export function MarcarNotificada({
  coincidenciaId,
  contactoId,
}: {
  coincidenciaId: string
  contactoId: string
}) {
  const [hecho, setHecho] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (hecho) return <span className="text-xs text-green-600">Notificado</span>

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const r = await marcarCoincidenciaNotificada(coincidenciaId, contactoId)
          if (r.ok) setHecho(true)
        })
      }
      className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-[#38B6FF] hover:text-[#38B6FF] disabled:opacity-50"
    >
      <Check size={12} /> Marcar notificado
    </button>
  )
}

export function MarcarNotificadaExterna({
  coincidenciaId,
  contactoId,
}: {
  coincidenciaId: string
  contactoId: string
}) {
  const [hecho, setHecho] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (hecho) return <span className="text-xs text-green-600">Notificado</span>

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const r = await marcarCoincidenciaExternaNotificada(coincidenciaId, contactoId)
          if (r.ok) setHecho(true)
        })
      }
      className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-[#38B6FF] hover:text-[#38B6FF] disabled:opacity-50"
    >
      <Check size={12} /> Marcar notificado
    </button>
  )
}
