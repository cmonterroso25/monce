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
import SelectorPropiedadesVisita from '@/components/selector-propiedades-visita'
import SelectorColegasActividad from '@/components/selector-colegas-actividad'
import { obtenerPropiedadesEnviadas } from '@/lib/propiedades-enviadas'

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
      '*, contacto:contactos(id, nombre_completo, telefono, correo), propiedad:propiedades(id, titulo, codigo), agente:perfiles(id, nombre_completo), propiedades_lead:lead_propiedades(propiedad:propiedades(id, titulo, codigo))'
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

  const { data: actividades, error: errorActividades } = await supabase
    .from('actividades')
    .select('*, agente:perfiles!actividades_agente_id_fkey(nombre_completo), colega:colegas(nombre), colegas_cita:actividad_colegas(colega:colegas(nombre)), propiedades_visita:actividad_propiedades(propiedad:propiedades(id, titulo, codigo))')
    .eq('lead_id', id)
    .order('creado_en', { ascending: false })

  if (errorActividades) {
    console.error('--- ERROR AL CARGAR ACTIVIDADES DEL LEAD ---', errorActividades)
  }

  const informeInicial = await obtenerUltimoInforme(id)

  const propiedadesEnviadas = lead.contacto_id
    ? await obtenerPropiedadesEnviadas(supabase, lead.contacto_id)
    : []

  // Opciones del informe: propiedad del lead + vinculadas al lead + enviadas al contacto.
  const opcionesInforme = (() => {
    const mapa = new Map<string, { id: string; titulo: string; codigo: string | null }>()
    const agregar = (p: any) => {
      if (p?.id && !mapa.has(p.id)) mapa.set(p.id, { id: p.id, titulo: p.titulo, codigo: p.codigo ?? null })
    }
    agregar(lead.propiedad)
    for (const pl of (lead.propiedades_lead ?? []) as any[]) agregar(pl.propiedad)
    for (const p of propiedadesEnviadas) agregar(p)
    return [...mapa.values()]
  })()

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

      <div className="relative mb-1 pr-20 sm:pr-28">
        <h1 className="text-xl font-bold text-[#2C3E50] sm:text-2xl">{lead.contacto?.nombre_completo ?? 'Lead'}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <GenerarRecibo
            leadId={id}
            contactoId={lead.contacto_id}
            contactoNombre={lead.contacto?.nombre_completo ?? 'Contacto'}
            agentes={agentes ?? []}
            agenteActualId={user?.id ?? ''}
          />
          <GenerarInforme
            propiedades={opcionesInforme}
            propiedadInicialId={lead.propiedad_id ?? null}
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
        <div className="absolute right-0 top-0 flex items-center gap-1">
          <Link href={`/dashboard/leads/${id}/editar`} className="flex items-center gap-1 rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-[#38B6FF]">
            <Pencil size={16} /> Editar
          </Link>
          {puedeEliminar && (
            <BotonEliminarLeadConRedireccion leadId={id} nombreContacto={lead.contacto?.nombre_completo ?? 'este lead'} />
          )}
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
          {(lead.propiedades_lead ?? []).length > 0 && (
            <div className="sm:col-span-2 text-slate-600">
              <span className="font-medium">Propiedades de interés:</span>
              <ul className="mt-1 space-y-0.5">
                {(lead.propiedades_lead as any[]).map((pl) =>
                  pl.propiedad ? (
                    <li key={pl.propiedad.id}>
                      <Link href={`/dashboard/propiedades/${pl.propiedad.id}`} className="text-[#38B6FF] hover:underline">
                        {pl.propiedad.codigo ? `${pl.propiedad.codigo} · ` : ''}{pl.propiedad.titulo}
                      </Link>
                    </li>
                  ) : null
                )}
              </ul>
            </div>
          )}
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
            <SelectorColegasActividad colegas={colegas ?? []} />
          </div>
          <SelectorPropiedadesVisita opciones={propiedadesEnviadas} />
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
                {(() => {
                  const nombres = ((a.colegas_cita ?? []) as any[]).map((c) => c.colega?.nombre).filter(Boolean) as string[]
                  const lista = nombres.length > 0 ? nombres : a.colega?.nombre ? [a.colega.nombre] : []
                  return lista.length > 0 ? (
                    <p className="text-xs text-slate-400">{lista.length > 1 ? 'Colegas' : 'Colega'}: {lista.join(', ')}</p>
                  ) : null
                })()}
                {(a.propiedades_visita ?? []).length > 0 && (
                  <p className="text-xs text-slate-400">
                    Propiedades: {(a.propiedades_visita as any[]).map((pv) => pv.propiedad?.titulo).filter(Boolean).join(' · ')}
                  </p>
                )}
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
