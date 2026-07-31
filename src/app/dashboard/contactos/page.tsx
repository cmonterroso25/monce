import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Mail, Phone, MapPin } from 'lucide-react'
import FiltrosContactos from './filtros-contactos'
import BotonEliminarContacto from './boton-eliminar-contacto'

const coloresEstado: Record<string, string> = {
  nuevo: 'bg-blue-100 text-blue-700',
  contactado: 'bg-indigo-100 text-indigo-700',
  calificado: 'bg-purple-100 text-purple-700',
  negociando: 'bg-orange-100 text-orange-700',
  ganado: 'bg-green-100 text-green-700',
  perdido: 'bg-red-100 text-red-700',
}

const GRID_COLS = 'grid-cols-[2fr_1.4fr_1fr_1.2fr_1fr_120px_40px]'

export default async function ListadoContactos({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; tipo?: string; origen?: string; agente_asignado?: string; telefono?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: perfiles }, { data: miPerfil }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
    user
      ? supabase.from('perfiles').select('rol').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
  ])

  const esAdmin = miPerfil?.rol === 'administrador'
  const agentes = (perfiles ?? []).map((p) => ({ id: p.id, nombre: p.nombre_completo }))

  let query = supabase
    .from('contactos')
    .select('*')
    .order('creado_en', { ascending: false })

  if (params.estado) query = query.eq('estado', params.estado)
  if (params.tipo) query = query.eq('tipo_contacto', params.tipo)
  if (params.origen) query = query.eq('origen', params.origen)
  if (params.agente_asignado) query = query.eq('agente_asignado', params.agente_asignado)
  if (params.telefono) query = query.ilike('telefono', `%${params.telefono}%`)

  const { data: contactos } = await query

  const nombreAgente = (id: string | null) => agentes.find((a) => a.id === id)?.nombre ?? '—'

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-[#2C3E50] sm:text-2xl">Contactos</h1>
        <Link
          href="/dashboard/contactos/nuevo"
          className="rounded bg-[#2C3E50] px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-[#38B6FF] sm:w-auto"
        >
          + Nuevo contacto
        </Link>
      </div>

      <FiltrosContactos agentes={agentes} esAdmin={esAdmin} idPropio={user?.id ?? ''} />

      {(!contactos || contactos.length === 0) && (
        <p className="mt-6 text-sm text-slate-500">No se encontraron contactos con esos filtros.</p>
      )}

      {contactos && contactos.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[940px]">
            <div
              className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500`}
            >
              <div>Nombre</div>
              <div>Contacto</div>
              <div>Tipo</div>
              <div>Presupuesto</div>
              <div>Agente</div>
              <div>Estado</div>
              <div />
            </div>

            {contactos.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/contactos/${c.id}`}
                className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-100 px-3 py-2 transition hover:bg-slate-50 last:border-b-0`}
              >
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-[#2C3E50]">{c.nombre_completo}</h2>
                  {c.zonas_interes?.length > 0 && (
                    <p className="flex items-center gap-1 truncate text-xs text-slate-400">
                      <MapPin size={12} /> {c.zonas_interes.join(', ')}
                    </p>
                  )}
                </div>

                <div className="min-w-0 text-sm text-slate-600">
                  {c.telefono && (
                    <p className="flex items-center gap-1 truncate">
                      <Phone size={12} className="text-slate-400" /> {c.telefono}
                    </p>
                  )}
                  {c.correo && (
                    <p className="flex items-center gap-1 truncate text-xs text-slate-400">
                      <Mail size={12} /> {c.correo}
                    </p>
                  )}
                </div>

                <div className="text-sm capitalize text-slate-600">{c.tipo_contacto ?? '—'}</div>

                <div className="text-sm text-slate-600">
                  {c.presupuesto_min || c.presupuesto_max
                    ? `Q${Number(c.presupuesto_min ?? 0).toLocaleString()} - Q${Number(c.presupuesto_max ?? 0).toLocaleString()}`
                    : '—'}
                </div>

                <div className="truncate text-sm text-slate-600">{nombreAgente(c.agente_asignado)}</div>

                <div>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      coloresEstado[c.estado] || 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {c.estado}
                  </span>
                </div>

                <div className="flex justify-end">
                  {esAdmin && (
                    <BotonEliminarContacto contactoId={c.id} nombreContacto={c.nombre_completo} />
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
