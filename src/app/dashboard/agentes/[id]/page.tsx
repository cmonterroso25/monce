import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Pencil, Phone, Mail, Building2, Target } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ETAPAS, ETIQUETAS_ETAPA, COLORES_ETAPA } from '../../leads/constantes'
import {
  RANGOS,
  esRangoValido,
  inicioDeRango,
  calcularMetricasDesempeno,
  type RangoTiempo,
} from '@/lib/metricas/desempeno-agente'

const ETAPAS_ABIERTAS = ['contacto_inicial', 'visita_agendada', 'visita_realizada', 'reservada']

const ETIQUETAS_ESTADO_PROPIEDAD: Record<string, string> = {
  disponible: 'Disponible',
  reservada: 'Reservada',
  vendida: 'Vendida',
  rentada: 'Rentada',
  inactiva: 'Inactiva',
}

export default async function DetalleAgente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ rango?: string }>
}) {
  const { id } = await params
  const { rango: rangoParam } = await searchParams
  const rango: RangoTiempo = esRangoValido(rangoParam) ? rangoParam : 'mes'
  const desde = inicioDeRango(rango)

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

  if (!esAdmin && user?.id !== id) {
    return (
      <div className="p-8">
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No tienes permiso para ver la información de este agente.
        </p>
      </div>
    )
  }

  const { data: usuarioAuth } = await supabaseAdmin.auth.admin.getUserById(id)
  const correo = usuarioAuth?.user?.email ?? null

  const [{ data: propiedades }, { data: leads }, { data: actividades }] = await Promise.all([
    supabase
      .from('propiedades')
      .select('id, codigo, titulo, estado, precio, moneda')
      .eq('captado_por', id)
      .order('creado_en', { ascending: false }),
    supabase
      .from('leads')
      .select('id, etapa, valor_negocio, creado_en, actualizado_en')
      .eq('agente_id', id),
    supabase
      .from('actividades')
      .select('id, tipo_actividad, notas, creado_en, completada_en')
      .eq('agente_id', id)
      .order('creado_en', { ascending: false })
      .limit(10),
  ])

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

  const metricas = calcularMetricasDesempeno(leads ?? [], desde)

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <Link href="/dashboard/agentes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#38B6FF]">
        <ArrowLeft size={16} /> Volver a agentes
      </Link>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-[#2C3E50] sm:text-2xl">{agente.nombre_completo}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="capitalize">{agente.rol}</span>
            {agente.telefono && (
              <span className="flex items-center gap-1">
                <Phone size={12} /> {agente.telefono}
              </span>
            )}
            {correo && (
              <span className="flex items-center gap-1">
                <Mail size={12} /> {correo}
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
            className="flex flex-shrink-0 items-center gap-1 rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-[#38B6FF]"
          >
            <Pencil size={16} /> Editar
          </Link>
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {RANGOS.map((r) => (
          <Link
            key={r.valor}
            href={`/dashboard/agentes/${id}?rango=${r.valor}`}
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

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
          <p className="text-xs text-slate-400">Cerrados (rango)</p>
          <p className="mt-1 text-xl font-bold text-[#2C3E50]">{metricas.ganados}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">Conversión</p>
          <p className="mt-1 text-xl font-bold text-[#2C3E50]">
            {metricas.conversion !== null ? `${Math.round(metricas.conversion)}%` : '-'}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">
            {metricas.ganados} ganados / {metricas.perdidos} perdidos
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">Tiempo de cierre</p>
          <p className="mt-1 text-xl font-bold text-[#2C3E50]">
            {metricas.tiempoCierrePromedio !== null ? `${Math.round(metricas.tiempoCierrePromedio)} d` : '-'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">En negociación</p>
          <p className="mt-1 text-xl font-bold text-[#2C3E50]">Q{valorEnNegociacion.toLocaleString()}</p>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-[#2C3E50]">Leads por etapa (snapshot actual)</h2>
        <div className="space-y-2">
          {ETAPAS.map((etapa) => (
            <div key={etapa} className="flex items-center gap-3">
              <span className="w-20 shrink-0 truncate text-xs text-slate-500 sm:w-24">{ETIQUETAS_ETAPA[etapa]}</span>
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
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-[#2C3E50]">{p.titulo}</span>
                  <span className="ml-2 text-xs text-slate-400">{p.codigo}</span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
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
              <div key={a.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-b-0">
                <div className="min-w-0">
                  <span className="font-medium capitalize text-[#2C3E50]">{a.tipo_actividad}</span>
                  {a.notas && <span className="ml-2 text-slate-500">{a.notas}</span>}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2 text-xs text-slate-400">
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
