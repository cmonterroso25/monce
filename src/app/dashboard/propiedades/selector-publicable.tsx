'use client'
import { useState } from 'react'

export default function SelectorPublicable({
  defaultValue = true,
}: {
  defaultValue?: boolean
}) {
  const [seleccion, setSeleccion] = useState<boolean>(defaultValue)
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">¿Se puede publicar?</label>
      <div className="flex flex-wrap gap-4 rounded border border-gray-200 p-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="radio"
            name="publicable"
            value="true"
            checked={seleccion === true}
            onChange={() => setSeleccion(true)}
            className="h-4 w-4"
          />
          Sí
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="radio"
            name="publicable"
            value="false"
            checked={seleccion === false}
            onChange={() => setSeleccion(false)}
            className="h-4 w-4"
          />
          No
        </label>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Uso interno: indica al equipo si esta propiedad puede compartirse en redes sociales.
      </p>
    </div>
  )
}
