'use client'

import { useTransition } from 'react'
import { X } from 'lucide-react'
import { eliminarPropiedad } from './acciones'

export default function BotonEliminarPropiedad({
  propiedadId,
  titulo,
}: {
  propiedadId: string
  titulo: string
}) {
  const [pending, startTransition] = useTransition()

  function manejarClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const confirmado = window.confirm(
      `¿Seguro que quieres eliminar "${titulo}"?\n\nEsta acción no se puede deshacer. También se eliminarán sus fotos, leads, actividades, tareas y coincidencias asociadas.`
    )
    if (!confirmado) return

    startTransition(async () => {
      try {
        await eliminarPropiedad(propiedadId)
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Ocurrió un error al eliminar la propiedad.')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={manejarClick}
      disabled={pending}
      title="Eliminar propiedad"
      className="flex items-center justify-center rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <X size={16} />
    </button>
  )
}
