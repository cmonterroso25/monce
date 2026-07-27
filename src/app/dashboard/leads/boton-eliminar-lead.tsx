'use client'

import { useTransition } from 'react'
import { X } from 'lucide-react'
import { eliminarLead } from './acciones'

export default function BotonEliminarLead({
  leadId,
  nombreContacto,
  className,
  onEliminado,
}: {
  leadId: string
  nombreContacto: string
  className?: string
  onEliminado?: () => void
}) {
  const [pending, startTransition] = useTransition()

  function manejarClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const confirmado = window.confirm(
      `¿Seguro que quieres eliminar el lead de "${nombreContacto}"?\n\nEsta acción no se puede deshacer. También se eliminarán sus actividades, tareas, recibos e informes de evaluación asociados.`
    )
    if (!confirmado) return

    startTransition(async () => {
      try {
        await eliminarLead(leadId)
        onEliminado?.()
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Ocurrió un error al eliminar el lead.')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={manejarClick}
      disabled={pending}
      title="Eliminar lead"
      className={
        className ??
        'flex items-center justify-center rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50'
      }
    >
      <X size={16} />
    </button>
  )
}
