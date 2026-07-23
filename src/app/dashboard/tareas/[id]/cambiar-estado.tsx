'use client'

import { useState, useTransition } from 'react'
import { cambiarEstadoTarea } from '../acciones'
import { ESTADOS_TAREA, ETIQUETAS_ESTADO_TAREA } from '../constantes'

export default function CambiarEstadoTarea({
  tareaId,
  estadoActual,
}: {
  tareaId: string
  estadoActual: string
}) {
  const [estado, setEstado] = useState(estadoActual)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleChange(nuevoEstado: string) {
    setEstado(nuevoEstado)
    setMensaje(null)
    startTransition(async () => {
      const resultado = await cambiarEstadoTarea(tareaId, nuevoEstado)
      if (!resultado.ok) {
        setMensaje(resultado.mensaje || 'Error al actualizar')
        setEstado(estadoActual)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={estado}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-[#2C3E50] focus:border-[#38B6FF] focus:outline-none disabled:opacity-50"
      >
        {ESTADOS_TAREA.map((e) => (
          <option key={e} value={e}>{ETIQUETAS_ESTADO_TAREA[e]}</option>
        ))}
      </select>
      {mensaje && <span className="text-xs text-red-500">{mensaje}</span>}
    </div>
  )
}
