'use client'

import { useState, useTransition } from 'react'
import { Star, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { establecerPortada, eliminarImagenPropiedad, moverImagen } from '../../acciones'

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

export default function GestorFotos({
  propiedadId,
  imagenesIniciales,
}: {
  propiedadId: string
  imagenesIniciales: Imagen[]
}) {
  const [isPending, startTransition] = useTransition()
  const [pendienteId, setPendienteId] = useState<string | null>(null)

  const imagenes = [...imagenesIniciales].sort((a, b) => {
    if (a.es_portada && !b.es_portada) return -1
    if (!a.es_portada && b.es_portada) return 1
    return (a.orden ?? 0) - (b.orden ?? 0)
  })

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

  function manejarMover(imagenId: string, direccion: 'izquierda' | 'derecha') {
    setPendienteId(imagenId)
    startTransition(async () => {
      await moverImagen(propiedadId, imagenId, direccion)
      setPendienteId(null)
    })
  }

  if (imagenes.length === 0) {
    return <p className="text-sm text-slate-500">Esta propiedad todavía no tiene fotos.</p>
  }

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {imagenes.map((img, index) => {
        const ocupado = isPending && pendienteId === img.id
        return (
          <div
            key={img.id}
            className={`group relative overflow-hidden rounded-lg border ${
              img.es_portada ? 'border-[#38B6FF] ring-2 ring-[#38B6FF]/30' : 'border-slate-200'
            }`}
          >
            <img
              src={urlImagen(img.ruta_almacenamiento)}
              alt=""
              className={`h-24 w-full object-cover transition-opacity ${ocupado ? 'opacity-40' : ''}`}
            />

            {img.es_portada && (
              <span className="absolute left-1 top-1 rounded bg-[#38B6FF] px-1.5 py-0.5 text-[10px] font-medium text-white">
                Portada
              </span>
            )}

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-1 py-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                disabled={isPending || index === 0}
                onClick={() => manejarMover(img.id, 'izquierda')}
                className="rounded p-1 text-white disabled:opacity-30"
                title="Mover a la izquierda"
              >
                <ChevronLeft size={14} />
              </button>

              <button
                type="button"
                disabled={isPending || img.es_portada === true}
                onClick={() => manejarPortada(img.id)}
                className="rounded p-1 text-white disabled:opacity-30"
                title="Hacer portada"
              >
                <Star size={14} fill={img.es_portada ? 'currentColor' : 'none'} />
              </button>

              <button
                type="button"
                disabled={isPending}
                onClick={() => manejarEliminar(img)}
                className="rounded p-1 text-red-300 hover:text-red-200"
                title="Eliminar foto"
              >
                <Trash2 size={14} />
              </button>

              <button
                type="button"
                disabled={isPending || index === imagenes.length - 1}
                onClick={() => manejarMover(img.id, 'derecha')}
                className="rounded p-1 text-white disabled:opacity-30"
                title="Mover a la derecha"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
