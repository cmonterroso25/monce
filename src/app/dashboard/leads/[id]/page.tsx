import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Pencil, Phone, Mail } from 'lucide-react'
import CambiarEtapaLead from './cambiar-etapa'
import GenerarRecibo from './generar-recibo'
import GenerarInforme from './generar-informe'
import EstadoInforme from './estado-informe'
import { ProveedorInforme } from './contexto-informe'
import { obtenerUltimoInforme } from './informes'
import MarcarCompletada from '../../actividades/marcar-completada'
import { crearActividad } from '../acciones'
import { TIPOS_ACTIVIDAD, ETIQUETAS_ACTIVIDAD } from '../constantes'

export default async function DetalleLead({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select(
      '*, contacto:contactos(id, nombre_completo, telefono, correo), propiedad:propiedades(id, titulo, codigo), agente:perfiles(id, nombre_completo)'
    )
    .eq('id', id)
    .single()

  if (!lead) return <div className="p-8">Lead no encontrado.</div>

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: agentes } = await supabase
    .from('perfiles')
    .select('id, nombre_completo')
    .eq('organization_id', lead.organization_id)
    .eq('activo', true)
    .order('nombre_completo')

  const { data: actividades } = await supabase
    .from('actividades')
    .select('*, agente:perfiles(nombre_completo)')
    .eq('lead_id', id)
    .order('creado_en', { ascending: false })

  const informeInicial = await obtenerUltimoInforme(id)

  return (
    <ProveedorInforme informeInicial={informeInicial}>
    <div className="mx-auto max-w-3xl p-8">
      <Link href="/dashboard/leads" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#38B6FF]">
        <ArrowLeft size={16} /> Volver a leads
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#2C3E50]">{lead.contacto?.nombre_completo ?? 'Lead'}</h1>
        <div className="flex items-center gap-2">
          <GenerarRecibo
            leadId={id}
            contactoId={lead.contacto_id}
            contactoNombre={lead.contacto?.nombre_completo ?? 'Contacto'}
            agentes={agentes ?? []}
            agenteActualId={user?.id ?? ''}
          />
          <GenerarInforme
            leadId={id}
            contactoId={lead.contacto_id}
            contactoNombre={lead.contacto?.nombre_completo ?? 'Contacto'}
          />
          <Link href={`/dashboard/leads/${id}/editar`} className="flex items-center gap-1 rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-[#38B6FF]">
            <Pencil size={16} /> Editar
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <CambiarEtapaLead leadId={id} etapaActual={lead.etapa ?? 'contacto_inicial'} />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <p className="flex items-center gap-2 text-slate-600">
            <Phone size={14} className="text-slate-400" /> {lead.contacto?.telefono ?? '—'}
          </p>
          <p className="flex items-center gap-2 text-slate-600">
            <Mail size={14} className="text-slate-400" /> {lead.contacto?.correo ?? '—'}
          </p>
          <p className="text-slate-600">
            <span className="font-medium">Propiedad:</span>{' '}
            {lead.propiedad ? (
              <Link href={`/dashboard/propiedades/${lead.propiedad.id}`} className="text-[#38B6FF] hover:underline">
                {lead.propiedad.titulo}
              </Link>
            ) : '—'}
          </p>
          <p className="text-slate-600"><span className="font-medium">Agente:</span> {lead.agente?.nombre_completo ?? '—'}</p>
          <p className="text-slate-600">
            <span className="font-medium">Valor negocio:</span>{' '}
            {lead.valor_negocio ? `Q${Number(lead.valor_negocio).toLocaleString()}` : '—'}
          </p>
          <p className="text-slate-600"><span className="font-medium">Probabilidad:</span> {lead.probabilidad ? `${lead.probabilidad}%` : '—'}</p>
          <p className="text-slate-600"><span className="font-medium">Cierre esperado:</span> {lead.fecha_cierre_esperada ?? '—'}</p>
          {lead.etapa === 'perdida' && (
            <p className="col-span-2 text-slate-600"><span className="font-medium">Motivo de pérdida:</span> {lead.motivo_perdida ?? '—'}</p>
          )}
        </div>
      </div>

      <EstadoInforme />

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Actividades</h2>

        <form action={crearActividad} className="mb-5 space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
          <input type="hidden" name="lead_id" value={id} />
          <input type="hidden" name="contacto_id" value={lead.contacto_id} />
          <div className="grid grid-cols-2 gap-2">
            <select name="tipo_actividad" required className="rounded border border-gray-300 px-3 py-2 text-sm">
              {TIPOS_ACTIVIDAD.map((t) => (
                <option key={t} value={t}>{ETIQUETAS_ACTIVIDAD[t]}</option>
              ))}
            </select>
            <input name="programada_en" type="datetime-local" className="rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <textarea name="notas" placeholder="Notas de la actividad..." rows={2} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded bg-[#2C3E50] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#38B6FF]">
            Registrar actividad
          </button>
        </form>

        {(!actividades || actividades.length === 0) && (
          <p className="text-sm text-slate-400">Aún no hay actividades registradas.</p>
        )}

        <div className="space-y-3">
          {(actividades ?? []).map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 border-l-2 border-slate-200 pl-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[#2C3E50]">
                  {ETIQUETAS_ACTIVIDAD[a.tipo_actividad] ?? a.tipo_actividad}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {new Date(a.creado_en).toLocaleString('es-GT')}
                  </span>
                </p>
                {a.notas && <p className="text-slate-600">{a.notas}</p>}
                {a.agente?.nombre_completo && <p className="text-xs text-slate-400">{a.agente.nombre_completo}</p>}
              </div>
              <div className="shrink-0">
                {a.completada_en ? (
                  <span className="whitespace-nowrap text-xs text-green-600">Completada</span>
                ) : (
                  <MarcarCompletada actividadId={a.id} leadId={id} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    </ProveedorInforme>
  )
}
