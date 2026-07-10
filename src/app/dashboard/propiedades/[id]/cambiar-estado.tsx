'use client'

import { useState, useTransition } from 'react'
import { actualizarEstadoPropiedad } from './acciones'

export default function CambiarEstado({
  propiedadId,
  estadoActual,
  estados,
}: {
  propiedadId: string
  estadoActual: string
  estados: string[]
}) {
  const [estado, setEstado] = useState(estadoActual)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleChange(nuevoEstado: string) {
    setEstado(nuevoEstado)
    setMensaje(null)
    startTransition(async () => {
      const resultado = await actualizarEstadoPropiedad(propiedadId, nuevoEstado)
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
        {estados.map((e) => (
          <option key={e} value={e}>
            {e.charAt(0).toUpperCase() + e.slice(1)}
          </option>
        ))}
      </select>
      {isPending && <span className="text-xs text-slate-400">Guardando...</span>}
      {mensaje && <span className="text-xs text-red-500">{mensaje}</span>}
    </div>
  )
}
