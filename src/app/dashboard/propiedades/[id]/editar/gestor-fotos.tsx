'use client'

import { useEffect, useState, useTransition } from 'react'
import { Star, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { establecerPortada, eliminarImagenPropiedad, reordenarImagenes } from '../../acciones'

const R2_PUBLIC_URL = 'https://pub-55c4b2ef6141404ea53237416303a621.r2.dev'

function urlImagen(ruta: string) {
  if (ruta.startsWith('http')) return ruta
  return `${R2_PUBLIC_URL}/${ruta}`
}

type Imagen = {
  id: string
  ruta_almacenamiento: string
  es_portada: boolean | null
  orden: number | null
}

function ordenar(imagenes: Imagen[]) {
  return [...imagenes].sort((a, b) => {
    if (a.es_portada && !b.es_portada) return -1
    if (!a.es_portada && b.es_portada) return 1
    return (a.orden ?? 0) - (b.orden ?? 0)
  })
}

function FotoTile({
  img,
  ocupado,
  onPortada,
  onEliminar,
}: {
  img: Imagen
  ocupado: boolean
  onPortada: () => void
  onEliminar: () => void
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-lg border ${
        img.es_portada ? 'border-[#38B6FF] ring-2 ring-[#38B6FF]/30' : 'border-slate-200'
      }`}
    >
      <img
        src={urlImagen(img.ruta_almacenamiento)}
        alt=""
        className={`h-24 w-full object-cover transition-opacity ${ocupado ? 'opacity-40' : ''}`}
        draggable={false}
      />

      {img.es_portada && (
        <span className="absolute left-1 top-1 rounded bg-[#38B6FF] px-1.5 py-0.5 text-[10px] font-medium text-white">
          Portada
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-black/60 px-1 py-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          disabled={ocupado || img.es_portada === true}
          onClick={onPortada}
          className="rounded p-1 text-white disabled:opacity-30"
          title="Hacer portada"
        >
          <Star size={14} fill={img.es_portada ? 'currentColor' : 'none'} />
        </button>

        <button
          type="button"
          disabled={ocupado}
          onClick={onEliminar}
          className="rounded p-1 text-red-300 hover:text-red-200"
          title="Eliminar foto"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function FotoSortable({
  img,
  ocupado,
  onPortada,
  onEliminar,
}: {
  img: Imagen
  ocupado: boolean
  onPortada: () => void
  onEliminar: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: img.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="touch-none cursor-grab active:cursor-grabbing"
    >
      <FotoTile img={img} ocupado={ocupado} onPortada={onPortada} onEliminar={onEliminar} />
    </div>
  )
}

export default function GestorFotos({
  propiedadId,
  imagenesIniciales,
}: {
  propiedadId: string
  imagenesIniciales: Imagen[]
}) {
  const [isPending, startTransition] = useTransition()
  const [pendienteId, setPendienteId] = useState<string | null>(null)
  const [imagenes, setImagenes] = useState<Imagen[]>(() => ordenar(imagenesIniciales))

  // Vuelve a sincronizar el estado local cuando el servidor manda datos
  // frescos (tras revalidatePath por establecerPortada, eliminar, o el
  // propio reordenarImagenes). Así el arrastre nunca queda desincronizado
  // de lo que realmente hay en la base de datos.
  useEffect(() => {
    setImagenes(ordenar(imagenesIniciales))
  }, [imagenesIniciales])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  )

  function manejarPortada(imagenId: string) {
    setPendienteId(imagenId)
    startTransition(async () => {
      await establecerPortada(propiedadId, imagenId)
      setPendienteId(null)
    })
  }

  function manejarEliminar(imagen: Imagen) {
    if (!confirm('¿Eliminar esta foto? Esta acción no se puede deshacer.')) return
    setPendienteId(imagen.id)
    startTransition(async () => {
      await eliminarImagenPropiedad(propiedadId, imagen.id, imagen.ruta_almacenamiento)
      setPendienteId(null)
    })
  }

  function manejarDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setImagenes((prev) => {
      const oldIndex = prev.findIndex((img) => img.id === active.id)
      const newIndex = prev.findIndex((img) => img.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev

      const reordenadas = arrayMove(prev, oldIndex, newIndex)

      startTransition(async () => {
        await reordenarImagenes(propiedadId, reordenadas.map((img) => img.id))
      })

      return reordenadas
    })
  }

  if (imagenes.length === 0) {
    return <p className="text-sm text-slate-500">Esta propiedad todavía no tiene fotos.</p>
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={manejarDragEnd}>
      <SortableContext items={imagenes.map((img) => img.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {imagenes.map((img) => (
            <FotoSortable
              key={img.id}
              img={img}
              ocupado={isPending && pendienteId === img.id}
              onPortada={() => manejarPortada(img.id)}
              onEliminar={() => manejarEliminar(img)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
