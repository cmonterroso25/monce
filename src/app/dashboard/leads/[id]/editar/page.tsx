import { createClient } from '@/lib/supabase/server'
import { actualizarLead } from '../../acciones'

export default async function EditarLead({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: lead } = await supabase.from('leads').select('*').eq('id', id).single()
  const [{ data: propiedades }, { data: perfiles }] = await Promise.all([
    supabase.from('propiedades').select('id, titulo, codigo').order('titulo'),
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
  ])

  if (!lead) return <div className="p-8">Lead no encontrado.</div>

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-[#2C3E50]">Editar lead</h1>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <form action={actualizarLead} className="space-y-4">
        <input type="hidden" name="lead_id" value={lead.id} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Propiedad de interés</label>
          <select name="propiedad_id" defaultValue={lead.propiedad_id ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="">Sin propiedad específica</option>
            {(propiedades ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.codigo ? `[${p.codigo}] ` : ''}{p.titulo}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Agente responsable</label>
          <select name="agente_id" defaultValue={lead.agente_id ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            {(perfiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.nombre_completo}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Valor estimado (Q)</label>
            <input name="valor_negocio" type="number" defaultValue={lead.valor_negocio ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Probabilidad (%)</label>
            <input name="probabilidad" type="number" min="0" max="100" defaultValue={lead.probabilidad ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Fecha de cierre esperada</label>
          <input name="fecha_cierre_esperada" type="date" defaultValue={lead.fecha_cierre_esperada ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        {lead.etapa === 'perdido' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Motivo de pérdida</label>
            <textarea name="motivo_perdida" defaultValue={lead.motivo_perdida ?? ''} rows={2} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        )}

        <button type="submit" className="rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF]">
          Guardar cambios
        </button>
      </form>
    </div>
  )
}
