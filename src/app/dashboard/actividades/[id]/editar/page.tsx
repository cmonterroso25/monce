import { createClient } from '@/lib/supabase/server'
import { actualizarActividad } from '../../../leads/acciones'
import { TIPOS_ACTIVIDAD, ETIQUETAS_ACTIVIDAD } from '../../../leads/constantes'
import BotonEnviar from '@/components/boton-enviar'
function aInputLocal(valor: string | null): string {
  if (!valor) return ''
  const fecha = new Date(valor)
  const offsetMs = fecha.getTimezoneOffset() * 60000
  return new Date(fecha.getTime() - offsetMs).toISOString().slice(0, 16)
}
export default async function EditarActividad({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: actividad } = await supabase.from('actividades').select('*').eq('id', id).single()
  if (!actividad) return <div className="p-8">Actividad no encontrada.</div>
  // Se necesita la organización de la actividad para limitar los selectores
  // de agente y colega a los de la misma organización.
  const { data: agentes } = actividad.organization_id
    ? await supabase
        .from('perfiles')
        .select('id, nombre_completo')
        .eq('organization_id', actividad.organization_id)
        .eq('activo', true)
        .order('nombre_completo')
    : { data: [] }
  const { data: colegas } = actividad.organization_id
    ? await supabase
        .from('colegas')
        .select('id, nombre')
        .eq('organization_id', actividad.organization_id)
        .order('nombre')
    : { data: [] }
  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <h1 className="mb-6 text-xl font-bold text-[#2C3E50] sm:text-2xl">Editar actividad</h1>
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}
      <form action={actualizarActividad} className="space-y-4">
        <input type="hidden" name="actividad_id" value={actividad.id} />
        {actividad.lead_id && <input type="hidden" name="lead_id" value={actividad.lead_id} />}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Tipo</label>
          <select name="tipo_actividad" defaultValue={actividad.tipo_actividad} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            {TIPOS_ACTIVIDAD.map((t) => (
              <option key={t} value={t}>{ETIQUETAS_ACTIVIDAD[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Fecha y hora programada</label>
          <input
            name="programada_en"
            type="datetime-local"
            defaultValue={aInputLocal(actividad.programada_en)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Agente que atenderá</label>
            <select
              name="agente_id"
              defaultValue={actividad.agente_id ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {(agentes ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.nombre_completo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Colega</label>
            <select
              name="colega_id"
              defaultValue={actividad.colega_id ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Sin colega</option>
              {(colegas ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Notas</label>
          <textarea name="notas" defaultValue={actividad.notas ?? ''} rows={3} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <BotonEnviar className="w-full rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF] sm:w-auto">
          Guardar cambios
        </BotonEnviar>
      </form>
    </div>
  )
}
