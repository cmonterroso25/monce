'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { ESTADOS_CONTACTO, TIPOS_CONTACTO, ORIGENES } from './constantes'

export default function FiltrosContactos({
  agentes,
  esAdmin,
  idPropio,
}: {
  agentes: { id: string; nombre: string }[]
  esAdmin: boolean
  idPropio: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [telefono, setTelefono] = useState(searchParams.get('telefono') ?? '')

  function actualizarFiltro(clave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (valor) params.set(clave, valor)
    else params.delete(clave)
    router.push(`/dashboard/contactos?${params.toString()}`)
  }

  function buscarTelefono() {
    actualizarFiltro('telefono', telefono)
  }

  const base = 'rounded border border-slate-300 px-3 py-2 text-sm text-[#2C3E50]'

  return (
    <div className="flex flex-wrap gap-2">
      <div className="relative">
        <input
          type="text"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && buscarTelefono()}
          onBlur={buscarTelefono}
          placeholder="Buscar por teléfono"
          className={`${base} pr-8`}
        />
        <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>

      <select className={base} defaultValue={searchParams.get('estado') ?? ''} onChange={(e) => actualizarFiltro('estado', e.target.value)}>
        <option value="">Todos los estados</option>
        {ESTADOS_CONTACTO.map((e) => (
          <option key={e} value={e}>{e}</option>
        ))}
      </select>

      <select className={base} defaultValue={searchParams.get('tipo') ?? ''} onChange={(e) => actualizarFiltro('tipo', e.target.value)}>
        <option value="">Todos los tipos</option>
        {TIPOS_CONTACTO.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <select className={base} defaultValue={searchParams.get('origen') ?? ''} onChange={(e) => actualizarFiltro('origen', e.target.value)}>
        <option value="">Todos los orígenes</option>
        {ORIGENES.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>

      {esAdmin ? (
        <select className={base} defaultValue={searchParams.get('agente_asignado') ?? ''} onChange={(e) => actualizarFiltro('agente_asignado', e.target.value)}>
          <option value="">Todos los agentes</option>
          {agentes.map((a) => (
            <option key={a.id} value={a.id}>{a.nombre}</option>
          ))}
        </select>
      ) : (
        <span className={`${base} bg-slate-50 text-slate-400`} title="Solo ves tus propios contactos">
          Mis contactos
        </span>
      )}
    </div>
  )
}
