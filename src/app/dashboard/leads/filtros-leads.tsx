'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ETAPAS, ETIQUETAS_ETAPA } from './constantes'

export default function FiltrosLeads({
  agentes,
  esAdmin,
}: {
  agentes: { id: string; nombre: string }[]
  esAdmin: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function actualizarFiltro(clave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (valor) params.set(clave, valor)
    else params.delete(clave)
    router.push(`/dashboard/leads?${params.toString()}`)
  }

  const base = 'rounded border border-slate-300 px-3 py-2 text-sm text-[#2C3E50]'

  return (
    <div className="flex flex-wrap gap-2">
      <select className={base} defaultValue={searchParams.get('etapa') ?? ''} onChange={(e) => actualizarFiltro('etapa', e.target.value)}>
        <option value="">Todas las etapas</option>
        {ETAPAS.map((e) => (
          <option key={e} value={e}>{ETIQUETAS_ETAPA[e]}</option>
        ))}
      </select>

      {esAdmin ? (
        <select className={base} defaultValue={searchParams.get('agente_id') ?? ''} onChange={(e) => actualizarFiltro('agente_id', e.target.value)}>
          <option value="">Todos los agentes</option>
          {agentes.map((a) => (
            <option key={a.id} value={a.id}>{a.nombre}</option>
          ))}
        </select>
      ) : (
        <span className={`${base} bg-slate-50 text-slate-400`} title="Solo ves tus propios leads">
          Mis leads
        </span>
      )}
    </div>
  )
}
