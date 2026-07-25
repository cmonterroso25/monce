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

  const { data: lead } = await supabase
    .from('leads')
    .select('*, propiedad:propiedades(codigo)')
    .eq('id', id)
    .single()
  const { data: perfiles } = await supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo')

  if (!lead) return <div className="p-8">Lead no encontrado.</div>

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <h1 className="mb-6 text-xl font-bold text-[#2C3E50] sm:text-2xl">Editar lead</h1>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <form action={actualizarLead} className="space-y-4">
        <input type="hidden" name="lead_id" value={lead.id} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Código de propiedad de interés (opcional)</label>
          <input
            name="propiedad_codigo"
            defaultValue={lead.propiedad?.codigo ?? ''}
            placeholder="Ej. PROP-0123"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Agente responsable</label>
          <select name="agente_id" defaultValue={lead.agente_id ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            {(perfiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.nombre_completo}</option>
            ))}
          </select>
        </div>

        {lead.etapa === 'perdida' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Motivo de pérdida</label>
            <textarea name="motivo_perdida" defaultValue={lead.motivo_perdida ?? ''} rows={2} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        )}

        <button type="submit" className="w-full rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF] sm:w-auto">
          Guardar cambios
        </button>
      </form>
    </div>
  )
}
