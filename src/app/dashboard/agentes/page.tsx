import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Phone, Building2, Target, TrendingUp } from 'lucide-react'

const GRID_COLS = 'grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_100px]'
const ETAPAS_ABIERTAS = ['contacto_inicial', 'visita_agendada', 'visita_realizada', 'reservada']

function inicioDeMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

export default async function ListadoAgentes() {
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
    supabase.from('leads').select('id, agente_id, etapa, valor_negocio, actualizado_en'),
  ])

  // Un agente/invitado solo se ve a sí mismo; solo el admin ve a todos
  const perfiles = esAdmin ? perfilesRaw : (perfilesRaw ?? []).filter((p) => p.id === user.id)

  const inicioMes = inicioDeMes()

  const agentes = (perfiles ?? []).map((p) => {
    const propiedadesAgente = (propiedades ?? []).filter((pr) => pr.captado_por === p.id)
    const propiedadesActivas = propiedadesAgente.filter(
      (pr) => pr.estado === 'disponible' || pr.estado === 'reservada'
    ).length

    const leadsAgente = (leads ?? []).filter((l) => l.agente_id === p.id)
    const leadsAbiertos = leadsAgente.filter((l) => ETAPAS_ABIERTAS.includes(l.etapa)).length
    const leadsCerradosMes = leadsAgente.filter(
      (l) => l.etapa === 'ganada' && l.actualizado_en && l.actualizado_en >= inicioMes
    ).length
    const valorEnNegociacion = leadsAgente
      .filter((l) => ETAPAS_ABIERTAS.includes(l.etapa))
      .reduce((sum, l) => sum + Number(l.valor_negocio ?? 0), 0)

    return { ...p, propiedadesActivas, leadsAbiertos, leadsCerradosMes, valorEnNegociacion }
  })

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#2C3E50]">{esAdmin ? 'Agentes' : 'Mi actividad'}</h1>
      </div>

      {agentes.length === 0 && <p className="mt-6 text-sm text-slate-500">No hay agentes registrados.</p>}

      {agentes.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[900px]">
            <div
              className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500`}
            >
              <div>Nombre</div>
              <div>Rol</div>
              <div>Propiedades activas</div>
              <div>Leads abiertos</div>
              <div>Cerrados este mes</div>
              <div>En negociación</div>
              <div>Estado</div>
            </div>

            {agentes.map((a) => (
              <Link
                key={a.id}
                href={`/dashboard/agentes/${a.id}`}
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
                <div className="text-sm text-slate-600">{a.leadsCerradosMes}</div>
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
