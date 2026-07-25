import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { LayoutGrid, List } from 'lucide-react'
import FiltrosLeads from './filtros-leads'
import TablaLeads from './tabla-leads'
import KanbanLeads from './kanban-leads'
export default async function ListadoLeads({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; etapa?: string; agente_id?: string }>
}) {
  const params = await searchParams
  const vista = params.vista === 'tabla' ? 'tabla' : 'kanban'
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
    .from('leads')
    .select(
      '*, contacto:contactos(id, nombre_completo, telefono), propiedad:propiedades(id, titulo, codigo), agente:perfiles(id, nombre_completo)'
    )
    .order('creado_en', { ascending: false })
  if (params.etapa) query = query.eq('etapa', params.etapa)
  if (params.agente_id) query = query.eq('agente_id', params.agente_id)
  const { data: leads } = await query
  const otrosParams = new URLSearchParams()
  if (params.etapa) otrosParams.set('etapa', params.etapa)
  if (params.agente_id) otrosParams.set('agente_id', params.agente_id)
  const sufijo = otrosParams.toString() ? `&${otrosParams.toString()}` : ''
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-xl font-bold text-[#2C3E50] sm:text-2xl">Leads</h1>
        <div className="flex flex-col gap-2 xs:flex-row xs:items-center sm:flex-row sm:items-center">
          <div className="flex overflow-hidden rounded border border-slate-300">
            <Link
              href={`/dashboard/leads?vista=kanban${sufijo}`}
              className={`flex flex-1 items-center justify-center gap-1 px-3 py-2 text-sm sm:flex-none ${vista === 'kanban' ? 'bg-[#2C3E50] text-white' : 'bg-white text-slate-600'}`}
            >
              <LayoutGrid size={15} /> Kanban
            </Link>
            <Link
              href={`/dashboard/leads?vista=tabla${sufijo}`}
              className={`flex flex-1 items-center justify-center gap-1 px-3 py-2 text-sm sm:flex-none ${vista === 'tabla' ? 'bg-[#2C3E50] text-white' : 'bg-white text-slate-600'}`}
            >
              <List size={15} /> Tabla
            </Link>
          </div>
          <Link
            href="/dashboard/leads/nuevo"
            className="rounded bg-[#2C3E50] px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-[#38B6FF]"
          >
            + Nuevo lead
          </Link>
        </div>
      </div>
      <FiltrosLeads agentes={agentes} esAdmin={esAdmin} />
      {(!leads || leads.length === 0) && vista === 'tabla' && (
        <p className="mt-6 text-sm text-slate-500">No se encontraron leads con esos filtros.</p>
      )}
      {vista === 'kanban' ? (
        <div className="mt-6">
          <KanbanLeads leadsIniciales={leads ?? []} />
        </div>
      ) : (
        <TablaLeads leads={leads ?? []} />
      )}
    </div>
  )
}
