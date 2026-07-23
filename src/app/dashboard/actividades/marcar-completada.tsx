'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { marcarActividadCompletada } from '../leads/acciones'

export default function MarcarCompletada({
  actividadId,
  leadId,
}: {
  actividadId: string
  leadId?: string | null
}) {
  const [hecha, setHecha] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (hecha) {
    return <span className="whitespace-nowrap text-xs font-medium text-green-600">Completada</span>
  }

  function marcar() {
    setError(null)
    startTransition(async () => {
      const resultado = await marcarActividadCompletada(actividadId, leadId)
      if (resultado.ok) {
        setHecha(true)
      } else {
        setError(resultado.mensaje || 'Error al actualizar')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={marcar}
        className="flex items-center gap-1 whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-[#38B6FF] hover:text-[#38B6FF] disabled:opacity-50"
      >
        <CheckCircle2 size={13} />
        {isPending ? 'Guardando...' : 'Completar'}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
