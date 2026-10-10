'use client'

import { useState } from 'react'
import { agregarComentario } from './acciones'

type FormularioComentarioProps = {
  actividadId: string
}

export default function FormularioComentario({ actividadId }: FormularioComentarioProps) {
  const [contenido, setContenido] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contenido.trim()) return

    setCargando(true)
    setError('')

    try {
      await agregarComentario(actividadId, contenido)
      setContenido('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setCargando(false)
    }
  }

  return (
    <form onSubmit={manejarEnvio} className="space-y-2">
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <textarea
        value={contenido}
        onChange={(e) => setContenido(e.target.value)}
        placeholder="Agregar seguimiento..."
        rows={2}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs resize-none focus:border-[#38B6FF] focus:outline-none"
        disabled={cargando}
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!contenido.trim() || cargando}
          className="rounded bg-[#2C3E50] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#38B6FF] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {cargando ? 'Guardando...' : 'Agregar'}
        </button>
      </div>
    </form>
  )
}
