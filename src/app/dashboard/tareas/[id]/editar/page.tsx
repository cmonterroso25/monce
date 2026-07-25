import { createClient } from '@/lib/supabase/server'
import { actualizarTarea } from '../../acciones'
import { PRIORIDADES, ETIQUETAS_PRIORIDAD, ESTADOS_TAREA, ETIQUETAS_ESTADO_TAREA } from '../../constantes'

export default async function EditarTarea({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: tarea } = await supabase.from('tareas').select('*').eq('id', id).single()
  const [{ data: perfiles }, { data: contactos }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
    supabase.from('contactos').select('id, nombre_completo').order('nombre_completo'),
  ])

  if (!tarea) return <div className="p-8">Tarea no encontrada.</div>

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <h1 className="mb-6 text-xl font-bold text-[#2C3E50] sm:text-2xl">Editar tarea</h1>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <form action={actualizarTarea} className="space-y-4">
        <input type="hidden" name="tarea_id" value={tarea.id} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Título</label>
          <input name="titulo" defaultValue={tarea.titulo} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Fecha límite</label>
            <input
              name="fecha_limite"
              type="datetime-local"
              defaultValue={tarea.fecha_limite ? tarea.fecha_limite.slice(0, 16) : ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Prioridad</label>
            <select name="prioridad" defaultValue={tarea.prioridad ?? 'media'} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>{ETIQUETAS_PRIORIDAD[p]}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Estado</label>
          <select name="estado" defaultValue={tarea.estado ?? 'pendiente'} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            {ESTADOS_TAREA.map((e) => (
              <option key={e} value={e}>{ETIQUETAS_ESTADO_TAREA[e]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Asignada a</label>
          <select name="asignado_a" defaultValue={tarea.asignado_a ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            {(perfiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.nombre_completo}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Contacto relacionado (opcional)</label>
          <select name="contacto_id" defaultValue={tarea.contacto_id ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="">Ninguno</option>
            {(contactos ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre_completo}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="w-full rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF] sm:w-auto">
          Guardar cambios
        </button>
      </form>
    </div>
  )
}
