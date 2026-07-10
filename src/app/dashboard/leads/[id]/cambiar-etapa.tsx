'use client'

import { useState, useTransition } from 'react'
import { cambiarEtapaLead } from '../acciones'
import { ETAPAS, ETIQUETAS_ETAPA } from '../constantes'

export default function CambiarEtapaLead({ leadId, etapaActual }: { leadId: string; etapaActual: string }) {
  const [etapa, setEtapa] = useState(etapaActual)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleChange(nuevaEtapa: string) {
    setEtapa(nuevaEtapa)
    setMensaje(null)
    startTransition(async () => {
      const resultado = await cambiarEtapaLead(leadId, nuevaEtapa)
      if (!resultado.ok) {
        setMensaje(resultado.mensaje || 'Error al actualizar')
        setEtapa(etapaActual)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={etapa}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded border border-slate-300 px-3 py-2 text-sm text-[#2C3E50] focus:border-[#38B6FF] focus:outline-none disabled:opacity-50"
      >
        {ETAPAS.map((e) => (
          <option key={e} value={e}>{ETIQUETAS_ETAPA[e]}</option>
        ))}
      </select>
      {isPending && <span className="text-xs text-slate-400">Guardando...</span>}
      {mensaje && <span className="text-xs text-red-500">{mensaje}</span>}
    </div>
  )
}
