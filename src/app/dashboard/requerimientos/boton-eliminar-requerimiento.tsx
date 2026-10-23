'use client'
import { useTransition } from 'react'
import { X } from 'lucide-react'
import { eliminarRequerimiento } from './acciones'

export default function BotonEliminarRequerimiento({
  requerimientoId,
  etiqueta,
}: {
  requerimientoId: string
  etiqueta: string
}) {
  const [isPending, startTransition] = useTransition()

  function eliminar() {
    if (!window.confirm(`¿Eliminar el requerimiento "${etiqueta}"? Esta acción no se puede deshacer.`)) return
    startTransition(async () => {
      const resultado = await eliminarRequerimiento(requerimientoId)
      if (!resultado.ok) {
        window.alert(resultado.mensaje || 'No se pudo eliminar el requerimiento.')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={eliminar}
      disabled={isPending}
      title="Eliminar requerimiento"
      className="flex items-center justify-center rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
    >
      <X size={16} />
    </button>
  )
}
