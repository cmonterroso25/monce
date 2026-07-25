import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Phone, Building2, Target, TrendingUp } from 'lucide-react'
import {
  RANGOS,
  esRangoValido,
  inicioDeRango,
  calcularMetricasDesempeno,
  type RangoTiempo,
} from '@/lib/metricas/desempeno-agente'

const GRID_COLS = 'grid-cols-[2fr_0.8fr_1fr_1fr_1fr_1fr_1fr_1fr_100px]'
const ETAPAS_ABIERTAS = ['contacto_inicial', 'visita_agendada', 'visita_realizada', 'reservada']

export default async function ListadoAgentes({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string }>
}) {
  const { rango: rangoParam } = await searchParams
  const rango: RangoTiempo = esRangoValido(rangoParam) ? rangoParam : 'mes'
  const desde = inicioDeRango(rango)

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

  const [{ data: perfilesRaw }, { data: propiedades }, { data: leads }] = await Promise.all([
    supabase.from('perfiles').select('*').order('nombre_completo'),
    supabase.from('propiedades').select('id, captado_por, estado'),
    supabase.from('leads').select('id, agente_id, etapa, valor_negocio, creado_en, actualizado_en'),
  ])

  // Un agente/invitado solo se ve a sí mismo; solo el admin ve a todos
  const perfiles = esAdmin ? perfilesRaw : (perfilesRaw ?? []).filter((p) => p.id === user.id)

  const agentes = (perfiles ?? []).map((p) => {
    const propiedadesAgente = (propiedades ?? []).filter((pr) => pr.captado_por === p.id)
    const propiedadesActivas = propiedadesAgente.filter(
      (pr) => pr.estado === 'disponible' || pr.estado === 'reservada'
    ).length

    const leadsAgente = (leads ?? []).filter((l) => l.agente_id === p.id)
    const leadsAbiertos = leadsAgente.filter((l) => ETAPAS_ABIERTAS.includes(l.etapa)).length
    const valorEnNegociacion = leadsAgente
      .filter((l) => ETAPAS_ABIERTAS.includes(l.etapa))
      .reduce((sum, l) => sum + Number(l.valor_negocio ?? 0), 0)

    const metricas = calcularMetricasDesempeno(leadsAgente, desde)

    return { ...p, propiedadesActivas, leadsAbiertos, valorEnNegociacion, metricas }
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#2C3E50] sm:text-2xl">{esAdmin ? 'Agentes' : 'Mi actividad'}</h1>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {RANGOS.map((r) => (
          <Link
            key={r.valor}
            href={`/dashboard/agentes?rango=${r.valor}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              rango === r.valor
                ? 'bg-[#2C3E50] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {r.etiqueta}
          </Link>
        ))}
      </div>

      {agentes.length === 0 && <p className="mt-6 text-sm text-slate-500">No hay agentes registrados.</p>}

      {agentes.length > 0 && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[1200px]">
            <div
              className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500`}
            >
              <div>Nombre</div>
              <div>Rol</div>
              <div>Propiedades activas</div>
              <div>Leads abiertos</div>
              <div>Cerrados (rango)</div>
              <div>Conversión</div>
              <div>Tiempo cierre</div>
              <div>En negociación</div>
              <div>Estado</div>
            </div>

            {agentes.map((a) => (
              <Link
                key={a.id}
                href={`/dashboard/agentes/${a.id}?rango=${rango}`}
                className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-100 px-3 py-2 transition hover:bg-slate-50 last:border-b-0`}
              >
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-[#2C3E50]">{a.nombre_completo}</h2>
                  {a.telefono && (
                    <p className="flex items-center gap-1 truncate text-xs text-slate-400">
                      <Phone size={12} /> {a.telefono}
                    </p>
                  )}
                </div>
                <div className="text-sm capitalize text-slate-600">{a.rol}</div>
                <div className="flex items-center gap-1 text-sm text-slate-600">
                  <Building2 size={14} className="text-slate-400" /> {a.propiedadesActivas}
                </div>
                <div className="flex items-center gap-1 text-sm text-slate-600">
                  <Target size={14} className="text-slate-400" /> {a.leadsAbiertos}
                </div>
                <div className="text-sm text-slate-600">{a.metricas.ganados}</div>
                <div className="text-sm text-slate-600">
                  {a.metricas.conversion !== null ? `${Math.round(a.metricas.conversion)}%` : '-'}
                </div>
                <div className="text-sm text-slate-600">
                  {a.metricas.tiempoCierrePromedio !== null
                    ? `${Math.round(a.metricas.tiempoCierrePromedio)} d`
                    : '-'}
                </div>
                <div className="flex items-center gap-1 text-sm text-slate-600">
                  <TrendingUp size={14} className="text-slate-400" /> Q{a.valorEnNegociacion.toLocaleString()}
                </div>
                <div>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      a.activo === false ? 'bg-slate-200 text-slate-600' : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {a.activo === false ? 'Inactivo' : 'Activo'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
