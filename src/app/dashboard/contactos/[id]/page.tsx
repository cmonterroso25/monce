import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Pencil, Mail, Phone, ArrowLeft } from 'lucide-react'
import CambiarEstadoContacto from './cambiar-estado'

export default async function DetalleContacto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: contacto } = await supabase.from('contactos').select('*').eq('id', id).single()
  const { data: agente } = contacto?.agente_asignado
    ? await supabase.from('perfiles').select('nombre_completo').eq('id', contacto.agente_asignado).single()
    : { data: null }

  if (!contacto) return <div className="p-8">Contacto no encontrado.</div>

  return (
    <div className="mx-auto max-w-3xl p-8">
      <Link
        href="/dashboard/contactos"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#38B6FF]"
      >
        <ArrowLeft size={16} /> Volver a contactos
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#2C3E50]">{contacto.nombre_completo}</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/leads/nuevo?contacto_id=${id}`}
            className="rounded bg-[#2C3E50] px-3 py-2 text-sm font-medium text-white hover:bg-[#38B6FF]"
          >
            + Nuevo lead
          </Link>
          <Link
            href={`/dashboard/contactos/${id}/editar`}
            className="flex items-center gap-1 rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-[#38B6FF]"
          >
            <Pencil size={16} /> Editar
          </Link>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <CambiarEstadoContacto contactoId={id} estadoActual={contacto.estado ?? 'nuevo'} />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <p className="flex items-center gap-2 text-slate-600"><Phone size={14} className="text-slate-400" /> {contacto.telefono ?? '—'}</p>
          <p className="flex items-center gap-2 text-slate-600"><Mail size={14} className="text-slate-400" /> {contacto.correo ?? '—'}</p>
          <p className="text-slate-600"><span className="font-medium">Tipo:</span> {contacto.tipo_contacto ?? '—'}</p>
          <p className="text-slate-600"><span className="font-medium">Origen:</span> {contacto.origen ?? '—'}</p>
          <p className="text-slate-600">
            <span className="font-medium">Presupuesto:</span>{' '}
            {contacto.presupuesto_min || contacto.presupuesto_max
              ? `Q${Number(contacto.presupuesto_min ?? 0).toLocaleString()} - Q${Number(contacto.presupuesto_max ?? 0).toLocaleString()}`
              : '—'}
          </p>
          <p className="text-slate-600"><span className="font-medium">Agente:</span> {agente?.nombre_completo ?? '—'}</p>
          {contacto.zonas_interes?.length > 0 && (
            <p className="col-span-2 text-slate-600"><span className="font-medium">Zonas de interés:</span> {contacto.zonas_interes.join(', ')}</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-400">
        Leads relacionados — próximamente en la siguiente sesión.
      </div>
    </div>
  )
}
