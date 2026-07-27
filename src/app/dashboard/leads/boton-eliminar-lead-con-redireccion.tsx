'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { eliminarLead } from './acciones'

export default function BotonEliminarLeadConRedireccion({
  leadId,
  nombreContacto,
}: {
  leadId: string
  nombreContacto: string
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function manejarClick() {
    const confirmado = window.confirm(
      `¿Seguro que quieres eliminar el lead de "${nombreContacto}"?\n\nEsta acción no se puede deshacer. También se eliminarán sus actividades, tareas, recibos e informes de evaluación asociados.`
    )
    if (!confirmado) return

    startTransition(async () => {
      try {
        await eliminarLead(leadId)
        router.push('/dashboard/leads')
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
      className="flex items-center gap-1 rounded p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <X size={16} />
    </button>
  )
}
