'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { eliminarContacto } from './acciones'

export default function BotonEliminarContacto({
  contactoId,
  nombreContacto,
  redirectTo,
  className,
}: {
  contactoId: string
  nombreContacto: string
  redirectTo?: string
  className?: string
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function manejarClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const confirmado = window.confirm(
      `¿Seguro que quieres eliminar a "${nombreContacto}"?\n\nEsta acción no se puede deshacer. También se eliminarán sus leads, actividades, tareas, recibos, informes de evaluación y coincidencias asociadas.`
    )
    if (!confirmado) return
    startTransition(async () => {
      try {
        await eliminarContacto(contactoId)
        if (redirectTo) router.push(redirectTo)
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Ocurrió un error al eliminar el contacto.')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={manejarClick}
      disabled={pending}
      title="Eliminar contacto"
      className={
        className ??
        'flex items-center justify-center rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50'
      }
    >
      <Trash2 size={16} />
    </button>
  )
}
