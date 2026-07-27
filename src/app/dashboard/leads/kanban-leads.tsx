'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { cambiarEtapaLead } from './acciones'
import { ETAPAS, ETIQUETAS_ETAPA } from './constantes'
import BotonEliminarLead from './boton-eliminar-lead'

type Lead = {
  id: string
  etapa: string
  valor_negocio: number | null
  contacto: { nombre_completo: string } | null
  propiedad: { titulo: string } | null
  agente: { id: string; nombre_completo: string } | null
}

function TarjetaLead({
  lead,
  puedeEliminar,
  onCambiarEtapa,
}: {
  lead: Lead
  puedeEliminar: boolean
  onCambiarEtapa: (leadId: string, nuevaEtapa: string) => void
}) {
  return (
    <div className="mb-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-sm font-semibold text-[#2C3E50]">{lead.contacto?.nombre_completo ?? 'Sin contacto'}</p>
      {lead.propiedad && <p className="truncate text-xs text-slate-500">{lead.propiedad.titulo}</p>}
      {lead.valor_negocio ? (
        <p className="mt-1 text-xs font-medium text-slate-600">Q{Number(lead.valor_negocio).toLocaleString()}</p>
      ) : null}
      {lead.agente && <p className="mt-1 text-[11px] text-slate-400">{lead.agente.nombre_completo}</p>}
      <select
        value={lead.etapa}
        onChange={(e) => onCambiarEtapa(lead.id, e.target.value)}
        className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-xs text-[#2C3E50] focus:border-[#38B6FF] focus:outline-none"
      >
        {ETAPAS.map((e) => (
          <option key={e} value={e}>{ETIQUETAS_ETAPA[e]}</option>
        ))}
      </select>
      <div className="mt-2 flex items-center justify-between">
        <Link href={`/dashboard/leads/${lead.id}`} className="text-[11px] text-[#38B6FF] hover:underline">
          Ver detalle
        </Link>
        {puedeEliminar && (
          <BotonEliminarLead
            leadId={lead.id}
            nombreContacto={lead.contacto?.nombre_completo ?? 'este lead'}
            className="rounded p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
          />
        )}
      </div>
    </div>
  )
}

function Columna({
  etapa,
  leads,
  userId,
  esAdmin,
  onCambiarEtapa,
}: {
  etapa: string
  leads: Lead[]
  userId: string
  esAdmin: boolean
  onCambiarEtapa: (leadId: string, nuevaEtapa: string) => void
}) {
  return (
    <div className="flex w-64 flex-shrink-0 snap-start flex-col rounded-lg bg-slate-100 p-3 sm:w-72">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{ETIQUETAS_ETAPA[etapa]}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">{leads.length}</span>
      </div>
      <div className="min-h-[60px] flex-1">
        {leads.map((lead) => (
          <TarjetaLead
            key={lead.id}
            lead={lead}
            puedeEliminar={esAdmin || lead.agente?.id === userId}
            onCambiarEtapa={onCambiarEtapa}
          />
        ))}
      </div>
    </div>
  )
}

export default function KanbanLeads({
  leadsIniciales,
  esAdmin,
  userId,
}: {
  leadsIniciales: Lead[]
  esAdmin: boolean
  userId: string
}) {
  const [leads, setLeads] = useState(leadsIniciales)
  const [, startTransition] = useTransition()
  function handleCambiarEtapa(leadId: string, nuevaEtapa: string) {
    const leadActual = leads.find((l) => l.id === leadId)
    if (!leadActual || leadActual.etapa === nuevaEtapa) return
    const etapaAnterior = leadActual.etapa
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, etapa: nuevaEtapa } : l)))
    startTransition(async () => {
      const resultado = await cambiarEtapaLead(leadId, nuevaEtapa)
      if (!resultado.ok) {
        setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, etapa: etapaAnterior } : l)))
      }
    })
  }
  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 sm:gap-4">
      {ETAPAS.map((etapa) => (
        <Columna
          key={etapa}
          etapa={etapa}
          leads={leads.filter((l) => l.etapa === etapa)}
          userId={userId}
          esAdmin={esAdmin}
          onCambiarEtapa={handleCambiarEtapa}
        />
      ))}
    </div>
  )
}
