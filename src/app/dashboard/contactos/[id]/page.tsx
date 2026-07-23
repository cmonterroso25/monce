import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Pencil, Mail, Phone, ArrowLeft, ArrowUpRight } from 'lucide-react'
import CambiarEstadoContacto from './cambiar-estado'
import { BuscarCoincidencias, MarcarNotificada } from '../buscar-coincidencias'
import { CompartirPropiedad } from '../compartir-propiedad'
import { ETIQUETAS_ETAPA, COLORES_ETAPA } from '../../leads/constantes'

const R2_PUBLIC_URL = 'https://pub-55c4b2ef6141404ea53237416303a621.r2.dev'

function urlImagen(ruta: string) {
  if (ruta.startsWith('http')) return ruta
  return `${R2_PUBLIC_URL}/${ruta}`
}

export default async function DetalleContacto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: contacto } = await supabase.from('contactos').select('*').eq('id', id).single()
  const { data: agente } = contacto?.agente_asignado
    ? await supabase.from('perfiles').select('nombre_completo').eq('id', contacto.agente_asignado).single()
    : { data: null }

  if (!contacto) return <div className="p-8">Contacto no encontrado.</div>

  const { data: leads } = await supabase
    .from('leads')
    .select('id, etapa, valor_negocio, propiedad:propiedades(titulo)')
    .eq('contacto_id', id)
    .order('creado_en', { ascending: false })

  const { data: coincidenciasData } = await supabase
    .from('coincidencias_propiedad')
    .select(
      'id, puntaje_coincidencia, notificado, propiedad:propiedades(id, titulo, slug, precio, moneda, imagenes_propiedad(ruta_almacenamiento, es_portada))'
    )
    .eq('contacto_id', id)
    .order('puntaje_coincidencia', { ascending: false })

  const coincidencias = (coincidenciasData ?? []) as any[]

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
          {contacto.tipo_propiedad_interes && (
            <p className="text-slate-600"><span className="font-medium">Busca:</span> {contacto.tipo_propiedad_interes}</p>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Leads relacionados</h2>

        {(!leads || leads.length === 0) && (
          <p className="text-sm text-slate-400">Este contacto aún no tiene leads abiertos.</p>
        )}

        <div className="space-y-2">
          {(leads ?? []).map((lead: any) => (
            <Link
              key={lead.id}
              href={`/dashboard/leads/${lead.id}`}
              className="flex items-center justify-between rounded border border-slate-100 px-3 py-2 text-sm transition hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-[#2C3E50]">{lead.propiedad?.titulo ?? 'Sin propiedad específica'}</p>
                {lead.valor_negocio ? (
                  <p className="text-xs text-slate-500">Q{Number(lead.valor_negocio).toLocaleString()}</p>
                ) : null}
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${COLORES_ETAPA[lead.etapa] || 'bg-slate-100 text-slate-700'}`}>
                  {ETIQUETAS_ETAPA[lead.etapa] ?? lead.etapa}
                </span>
                <ArrowUpRight size={14} className="text-slate-400" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Propiedades sugeridas</h2>
          <BuscarCoincidencias contactoId={id} />
        </div>

        {coincidencias.length === 0 && (
          <p className="text-sm text-slate-400">
            Aún no se ha buscado ninguna coincidencia para este contacto.
          </p>
        )}

        <div className="space-y-2">
          {coincidencias.map((c) => {
            const propiedad = c.propiedad
            if (!propiedad) return null
            const portada = propiedad.imagenes_propiedad?.find((img: any) => img.es_portada)
              ?? propiedad.imagenes_propiedad?.[0]

            return (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded border border-slate-100 px-3 py-2 text-sm"
              >
                <Link
                  href={`/dashboard/propiedades/${propiedad.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 hover:text-[#38B6FF]"
                >
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-slate-100">
                    {portada ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={urlImagen(portada.ruta_almacenamiento)}
                        alt={propiedad.titulo}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#2C3E50]">{propiedad.titulo}</p>
                    <p className="text-xs text-slate-500">
                      {propiedad.moneda} {Number(propiedad.precio ?? 0).toLocaleString()}
                    </p>
                  </div>
                </Link>

                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="rounded-full bg-[#38B6FF]/10 px-2 py-0.5 text-[10px] font-medium text-[#38B6FF]">
                    {c.puntaje_coincidencia}%
                  </span>
                  {propiedad.slug && (
                    <CompartirPropiedad
                      slug={propiedad.slug}
                      titulo={propiedad.titulo}
                      telefonoContacto={contacto.telefono}
                    />
                  )}
                  {c.notificado ? (
                    <span className="text-xs text-green-600">Notificado</span>
                  ) : (
                    <MarcarNotificada coincidenciaId={c.id} contactoId={id} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
