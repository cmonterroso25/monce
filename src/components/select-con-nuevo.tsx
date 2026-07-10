'use client'

import { useState } from 'react'

type Opcion = { id: string; nombre: string }

export default function SelectConNuevo({
  name,
  label,
  opciones,
  placeholder,
  defaultValue = '',
}: {
  name: string
  label: string
  opciones: Opcion[]
  placeholder: string
  defaultValue?: string
}) {
  const [valor, setValor] = useState(defaultValue)

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <select
        name={name}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="">{placeholder}</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
        <option value="__nuevo__">+ Agregar nuevo...</option>
      </select>
      {valor === '__nuevo__' && (
        <input
          type="text"
          name={`${name}_nombre_nuevo`}
          placeholder="Escribe el nombre nuevo"
          required
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      )}
    </div>
  )
}
