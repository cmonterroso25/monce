'use client'

import { useState, useTransition } from 'react'
import { actualizarEstadoContacto } from '../acciones'
import { ESTADOS_CONTACTO } from '../constantes'

const ETIQUETAS: Record<string, string> = {
  nuevo: 'Nuevo',
  en_seguimiento: 'En seguimiento',
  calificado: 'Calificado',
  descartado: 'Descartado',
}

export default function CambiarEstadoContacto({
  contactoId,
  estadoActual,
}: {
  contactoId: string
  estadoActual: string
}) {
  const [estado, setEstado] = useState(estadoActual)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleChange(nuevoEstado: string) {
    setEstado(nuevoEstado)
    setMensaje(null)
    startTransition(async () => {
      const resultado = await actualizarEstadoContacto(contactoId, nuevoEstado)
      if (!resultado.ok) {
        setMensaje(resultado.mensaje || 'Error al actualizar')
        setEstado(estadoActual)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={estado}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded border border-slate-300 px-3 py-2 text-sm text-[#2C3E50] focus:border-[#38B6FF] focus:outline-none disabled:opacity-50"
      >
        {ESTADOS_CONTACTO.map((e) => (
          <option key={e} value={e}>
            {ETIQUETAS[e]}
          </option>
        ))}
      </select>
      {isPending && <span className="text-xs text-slate-400">Guardando...</span>}
      {mensaje && <span className="text-xs text-red-500">{mensaje}</span>}
    </div>
  )
}
