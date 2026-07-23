import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Pencil, Phone, Building2, Target } from 'lucide-react'
import { ETAPAS, ETIQUETAS_ETAPA, COLORES_ETAPA } from '../../leads/constantes'

const ETAPAS_ABIERTAS = ['contacto_inicial', 'visita_agendada', 'visita_realizada', 'reservada']

const ETIQUETAS_ESTADO_PROPIEDAD: Record<string, string> = {
  disponible: 'Disponible',
  reservada: 'Reservada',
  vendida: 'Vendida',
  rentada: 'Rentada',
  inactiva: 'Inactiva',
}

function inicioDeMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

export default async function DetalleAgente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: miPerfil } = user
    ? await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
    : { data: null }
  const esAdmin = miPerfil?.rol === 'administrador'

  const { data: agente } = await supabase.from('perfiles').select('*').eq('id', id).single()
  if (!agente) return <div className="p-8">Agente no encontrado.</div>

  const [{ data: propiedades }, { data: leads }, { data: actividades }] = await Promise.all([
    supabase
      .from('propiedades')
      .select('id, codigo, titulo, estado, precio, moneda')
      .eq('captado_por', id)
      .order('creado_en', { ascending: false }),
    supabase.from('leads').select('id, etapa, valor_negocio, actualizado_en').eq('agente_id', id),
    supabase
      .from('actividades')
      .select('id, tipo_actividad, notas, creado_en, completada_en')
      .eq('agente_id', id)
      .order('creado_en', { ascending: false })
      .limit(10),
  ])

  const inicioMes = inicioDeMes()
  const leadsPorEtapa = ETAPAS.reduce<Record<string, number>>((acc, etapa) => {
    acc[etapa] = (leads ?? []).filter((l) => l.etapa === etapa).length
    return acc
  }, {})
  const maxLeadsEtapa = Math.max(1, ...Object.values(leadsPorEtapa))

  const valorEnNegociacion = (leads ?? [])
    .filter((l) => ETAPAS_ABIERTAS.includes(l.etapa))
    .reduce((sum, l) => sum + Number(l.valor_negocio ?? 0), 0)
  const valorCerradoTotal = (leads ?? [])
    .filter((l) => l.etapa === 'ganada')
    .reduce((sum, l) => sum + Number(l.valor_negocio ?? 0), 0)
  const leadsCerradosMes = (leads ?? []).filter(
    (l) => l.etapa === 'ganada' && l.actualizado_en && l.actualizado_en >= inicioMes
  ).length

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link href="/dashboard/agentes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#38B6FF]">
        <ArrowLeft size={16} /> Volver a agentes
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#2C3E50]">{agente.nombre_completo}</h1>
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <span className="capitalize">{agente.rol}</span>
            {agente.telefono && (
              <span className="flex items-center gap-1">
                <Phone size={12} /> {agente.telefono}
              </span>
            )}
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                agente.activo === false ? 'bg-slate-200 text-slate-600' : 'bg-green-100 text-green-700'
              }`}
            >
              {agente.activo === false ? 'Inactivo' : 'Activo'}
            </span>
          </p>
        </div>
        {esAdmin && (
          <Link
            href={`/dashboard/agentes/${id}/editar`}
            className="flex items-center gap-1 rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-[#38B6FF]"
          >
            <Pencil size={16} /> Editar
          </Link>
        )}
      </div>

      <div className="mb-6 grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-1 text-xs text-slate-400">
            <Building2 size={12} /> Propiedades activas
          </p>
          <p className="mt-1 text-xl font-bold text-[#2C3E50]">
            {(propiedades ?? []).filter((p) => p.estado === 'disponible' || p.estado === 'reservada').length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-1 text-xs text-slate-400">
            <Target size={12} /> Leads abiertos
          </p>
          <p className="mt-1 text-xl font-bold text-[#2C3E50]">
            {(leads ?? []).filter((l) => ETAPAS_ABIERTAS.includes(l.etapa)).length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">Cerrados este mes</p>
          <p className="mt-1 text-xl font-bold text-[#2C3E50]">{leadsCerradosMes}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">En negociación</p>
          <p className="mt-1 text-xl font-bold text-[#2C3E50]">Q{valorEnNegociacion.toLocaleString()}</p>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-[#2C3E50]">Leads por etapa</h2>
        <div className="space-y-2">
          {ETAPAS.map((etapa) => (
            <div key={etapa} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs text-slate-500">{ETIQUETAS_ETAPA[etapa]}</span>
              <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                <div
                  className={`h-full rounded ${COLORES_ETAPA[etapa]?.split(' ')[0] ?? 'bg-slate-300'}`}
                  style={{ width: `${(leadsPorEtapa[etapa] / maxLeadsEtapa) * 100}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right text-xs font-medium text-slate-600">{leadsPorEtapa[etapa]}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">Valor total cerrado histórico: Q{valorCerradoTotal.toLocaleString()}</p>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-[#2C3E50]">Propiedades captadas ({(propiedades ?? []).length})</h2>
        {(!propiedades || propiedades.length === 0) && <p className="text-sm text-slate-400">Sin propiedades captadas.</p>}
        {propiedades && propiedades.length > 0 && (
          <div className="space-y-2">
            {propiedades.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/propiedades/${p.id}`}
                className="flex items-center justify-between rounded border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
              >
                <div>
                  <span className="font-medium text-[#2C3E50]">{p.titulo}</span>
                  <span className="ml-2 text-xs text-slate-400">{p.codigo}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">
                    {p.moneda ?? 'Q'} {Number(p.precio ?? 0).toLocaleString()}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-600">
                    {ETIQUETAS_ESTADO_PROPIEDAD[p.estado] ?? p.estado}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-[#2C3E50]">Actividad reciente</h2>
        {(!actividades || actividades.length === 0) && <p className="text-sm text-slate-400">Sin actividad registrada.</p>}
        {actividades && actividades.length > 0 && (
          <div className="space-y-2">
            {actividades.map((a) => (
              <div key={a.id} className="flex items-start justify-between border-b border-slate-100 pb-2 text-sm last:border-b-0">
                <div>
                  <span className="font-medium capitalize text-[#2C3E50]">{a.tipo_actividad}</span>
                  {a.notas && <span className="ml-2 text-slate-500">{a.notas}</span>}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {a.creado_en && new Date(a.creado_en).toLocaleDateString('es-GT')}
                  {a.completada_en && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">Completada</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
