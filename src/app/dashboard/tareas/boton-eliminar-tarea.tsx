'use client'
import { useTransition } from 'react'
import { X } from 'lucide-react'
import { eliminarTarea } from './acciones'

export default function BotonEliminarTarea({
  tareaId,
  tituloTarea,
}: {
  tareaId: string
  tituloTarea: string
}) {
  const [isPending, startTransition] = useTransition()

  function eliminar() {
    if (!window.confirm(`¿Eliminar la tarea "${tituloTarea}"? Esta acción no se puede deshacer.`)) return
    startTransition(async () => {
      const resultado = await eliminarTarea(tareaId)
      if (!resultado.ok) {
        window.alert(resultado.mensaje || 'No se pudo eliminar la tarea.')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={eliminar}
      disabled={isPending}
      title="Eliminar tarea"
      className="flex items-center justify-center rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
    >
      <X size={16} />
    </button>
  )
}
