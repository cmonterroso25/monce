'use client'

import { useState } from 'react'

export default function Galeria({
  imagenes,
  titulo,
}: {
  imagenes: { id: string; url: string }[]
  titulo: string
}) {
  const [activa, setActiva] = useState(0)

  if (imagenes.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400">
        Sin imágenes
      </div>
    )
  }

  return (
    <div>
      <div className="h-80 w-full overflow-hidden rounded-lg bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagenes[activa].url}
          alt={titulo}
          className="h-full w-full object-cover"
        />
      </div>

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
    </div>
  )
}
