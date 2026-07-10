'use client'

import { useState, useTransition } from 'react'
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import Link from 'next/link'
import { cambiarEtapaLead } from './acciones'
import { ETAPAS, ETIQUETAS_ETAPA } from './constantes'

type Lead = {
  id: string
  etapa: string
  valor_negocio: number | null
  contacto: { nombre_completo: string } | null
  propiedad: { titulo: string } | null
  agente: { nombre_completo: string } | null
}

function TarjetaLead({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id })
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: isDragging ? 50 : undefined }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`mb-2 cursor-grab touch-none rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <p className="text-sm font-semibold text-[#2C3E50]">{lead.contacto?.nombre_completo ?? 'Sin contacto'}</p>
      {lead.propiedad && <p className="truncate text-xs text-slate-500">{lead.propiedad.titulo}</p>}
      {lead.valor_negocio ? (
        <p className="mt-1 text-xs font-medium text-slate-600">Q{Number(lead.valor_negocio).toLocaleString()}</p>
      ) : null}
      {lead.agente && <p className="mt-1 text-[11px] text-slate-400">{lead.agente.nombre_completo}</p>}
      <Link href={`/dashboard/leads/${lead.id}`} className="mt-1 inline-block text-[11px] text-[#38B6FF] hover:underline">
        Ver detalle
      </Link>
    </div>
  )
}

function Columna({ etapa, leads }: { etapa: string; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa })
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 flex-shrink-0 flex-col rounded-lg bg-slate-100 p-3 ${isOver ? 'ring-2 ring-[#38B6FF]' : ''}`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{ETIQUETAS_ETAPA[etapa]}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">{leads.length}</span>
      </div>
      <div className="min-h-[60px] flex-1">
        {leads.map((lead) => (
          <TarjetaLead key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  )
}

export default function KanbanLeads({ leadsIniciales }: { leadsIniciales: Lead[] }) {
  const [leads, setLeads] = useState(leadsIniciales)
  const [, startTransition] = useTransition()

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const leadId = active.id as string
    const nuevaEtapa = over.id as string

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
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {ETAPAS.map((etapa) => (
          <Columna key={etapa} etapa={etapa} leads={leads.filter((l) => l.etapa === etapa)} />
        ))}
      </div>
    </DndContext>
  )
}
