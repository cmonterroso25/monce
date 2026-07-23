'use client'
import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

export default function Galeria({
  imagenes,
  titulo,
}: {
  imagenes: { id: string; url: string }[]
  titulo: string
}) {
  const [activa, setActiva] = useState(0)
  const [abierta, setAbierta] = useState(false)

  useEffect(() => {
    if (!abierta) return
    function alPresionarTecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierta(false)
      if (e.key === 'ArrowRight') setActiva((i) => (i + 1) % imagenes.length)
      if (e.key === 'ArrowLeft') setActiva((i) => (i - 1 + imagenes.length) % imagenes.length)
    }
    window.addEventListener('keydown', alPresionarTecla)
    return () => window.removeEventListener('keydown', alPresionarTecla)
  }, [abierta, imagenes.length])

  if (imagenes.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400">
        Sin imágenes
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="block h-80 w-full cursor-zoom-in overflow-hidden rounded-lg bg-slate-100"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagenes[activa].url}
          alt={titulo}
          className="h-full w-full object-cover"
        />
      </button>

      {imagenes.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {imagenes.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setActiva(i)}
              className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded border-2 ${
                i === activa ? 'border-[#38B6FF]' : 'border-transparent'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {abierta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setAbierta(false)}
        >
          <button
            type="button"
            onClick={() => setAbierta(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Cerrar"
          >
            <X size={24} />
          </button>

          {imagenes.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setActiva((i) => (i - 1 + imagenes.length) % imagenes.length)
              }}
              className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Anterior"
            >
              <ChevronLeft size={28} />
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagenes[activa].url}
            alt={titulo}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {imagenes.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setActiva((i) => (i + 1) % imagenes.length)
              }}
              className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Siguiente"
            >
              <ChevronRight size={28} />
            </button>
          )}

          {imagenes.length > 1 && (
            <span className="absolute bottom-4 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
              {activa + 1} / {imagenes.length}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
