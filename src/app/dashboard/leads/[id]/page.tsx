import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Pencil, Phone } from 'lucide-react'
import CambiarEtapaLead from './cambiar-etapa'
import GenerarRecibo from './generar-recibo'
import GenerarInforme from './generar-informe'
import EstadoInforme from './estado-informe'
import { ProveedorInforme } from './contexto-informe'
import { obtenerUltimoInforme } from './informes'
import FormularioArrendamiento from './formulario-arrendamiento'
import MarcarCompletada from '../../actividades/marcar-completada'
import { crearActividad } from '../acciones'
import { TIPOS_ACTIVIDAD, ETIQUETAS_ACTIVIDAD } from '../constantes'
import BotonEliminarLeadConRedireccion from '../boton-eliminar-lead-con-redireccion'
import BotonEnviar from '@/components/boton-enviar'

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

  const { data: miPerfil } = user
    ? await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
    : { data: null }
  const esAdmin = miPerfil?.rol === 'administrador'
  const puedeEliminar = esAdmin || lead.agente_id === user?.id

  const { data: agentes } = await supabase
    .from('perfiles')
    .select('id, nombre_completo')
    .eq('organization_id', lead.organization_id)
    .eq('activo', true)
    .order('nombre_completo')

  const { data: colegas } = await supabase
    .from('colegas')
    .select('id, nombre')
    .eq('organization_id', lead.organization_id)
    .order('nombre')

  const { data: actividades } = await supabase
    .from('actividades')
    .select('*, agente:perfiles(nombre_completo), colega:colegas(nombre)')
    .eq('lead_id', id)
    .order('creado_en', { ascending: false })

  const informeInicial = await obtenerUltimoInforme(id)

  const { data: solicitudArrendamiento } = await supabase
    .from('solicitudes_arrendamiento')
    .select('id, estado')
    .eq('lead_id', id)
    .maybeSingle()

  return (
    <ProveedorInforme informeInicial={informeInicial}>
    <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <Link href="/dashboard/leads" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#38B6FF]">
        <ArrowLeft size={16} /> Volver a leads
      </Link>

      <div className="mb-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-xl font-bold text-[#2C3E50] sm:text-2xl">{lead.contacto?.nombre_completo ?? 'Lead'}</h1>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
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
            <FormularioArrendamiento
              leadId={id}
              contactoId={lead.contacto_id}
              solicitudInicial={
                solicitudArrendamiento
                  ? {
                      id: solicitudArrendamiento.id,
                      estado: solicitudArrendamiento.estado,
                      link: `${process.env.NEXT_PUBLIC_SITE_URL}/formulario-arrendamiento/${solicitudArrendamiento.id}`,
                    }
                  : null
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/leads/${id}/editar`} className="flex items-center gap-1 rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-[#38B6FF]">
              <Pencil size={16} /> Editar
            </Link>
            {puedeEliminar && (
              <BotonEliminarLeadConRedireccion leadId={id} nombreContacto={lead.contacto?.nombre_completo ?? 'este lead'} />
            )}
          </div>
        </div>
      </div>

      {solicitudArrendamiento && (
        <div className="mb-4">
          <span
            className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
              solicitudArrendamiento.estado === 'completado'
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {solicitudArrendamiento.estado === 'completado'
              ? 'Formulario de arrendamiento: completado por el cliente'
              : 'Formulario de arrendamiento: pendiente de que el cliente lo complete'}
          </span>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <CambiarEtapaLead leadId={id} etapaActual={lead.etapa ?? 'contacto_inicial'} />
        </div>

        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <p className="flex items-center gap-2 text-slate-600">
            <Phone size={14} className="text-slate-400 flex-shrink-0" /> {lead.contacto?.telefono ?? '—'}
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
          {lead.etapa === 'perdida' && (
            <p className="sm:col-span-2 text-slate-600"><span className="font-medium">Motivo de pérdida:</span> {lead.motivo_perdida ?? '—'}</p>
          )}
        </div>
      </div>

      <EstadoInforme />

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Actividades</h2>

        <form action={crearActividad} className="mb-5 space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
          <input type="hidden" name="lead_id" value={id} />
          <input type="hidden" name="contacto_id" value={lead.contacto_id} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select name="tipo_actividad" required className="rounded border border-gray-300 px-3 py-2 text-sm">
              {TIPOS_ACTIVIDAD.map((t) => (
                <option key={t} value={t}>{ETIQUETAS_ACTIVIDAD[t]}</option>
              ))}
            </select>
            <input name="programada_en" type="datetime-local" className="rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Agente que atenderá</label>
              <select
                name="agente_id"
                defaultValue={user?.id ?? ''}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                {(agentes ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre_completo}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Colega</label>
              <select
                name="colega_id"
                defaultValue=""
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Sin colega</option>
                {(colegas ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          <textarea name="notas" placeholder="Notas de la actividad..." rows={2} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          <BotonEnviar className="rounded bg-[#2C3E50] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#38B6FF]">
            Registrar actividad
          </BotonEnviar>
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
                {a.colega?.nombre && <p className="text-xs text-slate-400">Colega: {a.colega.nombre}</p>}
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
