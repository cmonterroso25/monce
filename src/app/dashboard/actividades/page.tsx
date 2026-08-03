import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Phone, ArrowUpRight, Pencil } from 'lucide-react'
import MarcarCompletada from './marcar-completada'
import { ETIQUETAS_ACTIVIDAD } from '../leads/constantes'

type Actividad = {
  id: string
  tipo_actividad: string
  notas: string | null
  programada_en: string | null
  completada_en: string | null
  creado_en: string
  lead_id: string | null
  contacto: { nombre_completo: string; telefono: string | null } | null
  lead: { id: string; etapa: string } | null
  agente: { nombre_completo: string } | null
}

const COLORES_ESTADO_ACTIVIDAD: Record<string, string> = {
  vencida: 'bg-red-100 text-red-700',
  hoy: 'bg-blue-100 text-blue-700',
  proxima: 'bg-slate-100 text-slate-700',
  sin_fecha: 'bg-slate-100 text-slate-500',
  completada: 'bg-green-100 text-green-700',
}

const ETIQUETAS_ESTADO_ACTIVIDAD: Record<string, string> = {
  vencida: 'Vencida',
  hoy: 'Hoy',
  proxima: 'Próxima',
  sin_fecha: 'Sin fecha',
  completada: 'Completada',
}

function calcularEstado(a: Actividad, inicioHoy: Date, finHoy: Date): string {
  if (a.completada_en) return 'completada'
  if (!a.programada_en) return 'sin_fecha'
  const fecha = new Date(a.programada_en)
  if (fecha < inicioHoy) return 'vencida'
  if (fecha < finHoy) return 'hoy'
  return 'proxima'
}

export default async function ListadoActividades() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle()
  const esAdmin = miPerfil?.rol === 'administrador'

  let query = supabase
    .from('actividades')
    .select(
      '*, contacto:contactos(nombre_completo, telefono), lead:leads(id, etapa), agente:perfiles(nombre_completo)'
    )

  if (!esAdmin) query = query.eq('agente_id', user.id)

  const { data: actividadesData } = await query
  const actividades = (actividadesData ?? []) as unknown as Actividad[]

  const ahora = new Date()
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  const finHoy = new Date(inicioHoy.getTime() + 24 * 60 * 60 * 1000)

  const filasConEstado = actividades.map((a) => ({
    ...a,
    estadoCalculado: calcularEstado(a, inicioHoy, finHoy),
  }))

  const ordenEstado: Record<string, number> = {
    vencida: 0,
    hoy: 1,
    proxima: 2,
    sin_fecha: 3,
    completada: 4,
  }

  filasConEstado.sort((a, b) => {
    const ordenDiff = ordenEstado[a.estadoCalculado] - ordenEstado[b.estadoCalculado]
    if (ordenDiff !== 0) return ordenDiff
    const fechaA = a.programada_en ?? a.creado_en
    const fechaB = b.programada_en ?? b.creado_en
    return fechaA.localeCompare(fechaB)
  })

  const totalPendientes = filasConEstado.filter((a) => a.estadoCalculado !== 'completada').length

  const GRID_COLS = esAdmin
    ? 'grid-cols-[100px_140px_100px_1.6fr_1fr_1.1fr_140px]'
    : 'grid-cols-[100px_140px_100px_1.8fr_1.2fr_140px]'

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#2C3E50] sm:text-2xl">{esAdmin ? 'Actividades' : 'Mis actividades'}</h1>
          <p className="text-sm text-slate-500">
            {totalPendientes === 0
              ? 'No tienes actividades pendientes.'
              : `${totalPendientes} actividad(es) pendiente(s).`}
          </p>
        </div>
      </div>

      {filasConEstado.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">
          Aún no hay actividades registradas. Se crean desde el detalle de un lead.
        </p>
      )}

      {filasConEstado.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[900px]">
            <div
              className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500`}
            >
              <div>Estado</div>
              <div>Fecha</div>
              <div>Tipo</div>
              <div>Contacto</div>
              <div>Lead</div>
              {esAdmin && <div>Agente</div>}
              <div className="text-right">Acción</div>
            </div>

            {filasConEstado.map((a) => (
              <div
                key={a.id}
                className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-100 px-3 py-2 transition hover:bg-slate-50 last:border-b-0`}
              >
                <div>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${COLORES_ESTADO_ACTIVIDAD[a.estadoCalculado]}`}
                  >
                    {ETIQUETAS_ESTADO_ACTIVIDAD[a.estadoCalculado]}
                  </span>
                </div>

                <div className="text-sm text-slate-600">
                  {a.programada_en
                    ? new Date(a.programada_en).toLocaleString('es-GT', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'America/Guatemala',
                      })
                    : '—'}
                </div>

                <div className="text-sm capitalize text-slate-600">
                  {ETIQUETAS_ACTIVIDAD[a.tipo_actividad] ?? a.tipo_actividad}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#2C3E50]">
                    {a.contacto?.nombre_completo ?? 'Sin contacto'}
                  </p>
                  {a.contacto?.telefono && (
                    <p className="flex items-center gap-1 truncate text-xs text-slate-400">
                      <Phone size={11} /> {a.contacto.telefono}
                    </p>
                  )}
                  {a.notas && <p className="truncate text-xs text-slate-400">{a.notas}</p>}
                </div>

                <div className="min-w-0 text-sm">
                  {a.lead_id ? (
                    <Link
                      href={`/dashboard/leads/${a.lead_id}`}
                      className="inline-flex items-center gap-1 text-[#38B6FF] hover:underline"
                    >
                      Ver lead <ArrowUpRight size={11} />
                    </Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </div>

                {esAdmin && (
                  <div className="truncate text-sm text-slate-600">
                    {a.agente?.nombre_completo ?? '—'}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Link
                    href={`/dashboard/actividades/${a.id}/editar`}
                    className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#38B6FF]"
                    title="Editar actividad"
                  >
                    <Pencil size={14} />
                  </Link>
                  {a.completada_en ? (
                    <span className="whitespace-nowrap text-xs font-medium text-green-600">Completada</span>
                  ) : (
                    <MarcarCompletada actividadId={a.id} leadId={a.lead_id} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
