import { createClient } from '@/lib/supabase/server'
import { crearTarea } from '../acciones'
import { PRIORIDADES, ETIQUETAS_PRIORIDAD } from '../constantes'

export default async function NuevaTarea({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; contacto_id?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: perfiles }, { data: contactos }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
    supabase.from('contactos').select('id, nombre_completo').order('nombre_completo'),
  ])

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <h1 className="mb-6 text-xl font-bold text-[#2C3E50] sm:text-2xl">Nueva tarea</h1>

      {params.error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {params.error}
        </div>
      )}

      <form action={crearTarea} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Título</label>
          <input name="titulo" required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Llamar a Doña Marta para confirmar oferta" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Fecha límite</label>
            <input name="fecha_limite" type="datetime-local" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Prioridad</label>
            <select name="prioridad" defaultValue="media" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>{ETIQUETAS_PRIORIDAD[p]}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Asignada a</label>
          <select name="asignado_a" defaultValue={user?.id} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            {(perfiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.nombre_completo}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Contacto relacionado (opcional)</label>
          <select name="contacto_id" defaultValue={params.contacto_id ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="">Ninguno</option>
            {(contactos ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre_completo}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="w-full rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF] sm:w-auto">
          Crear tarea
        </button>
      </form>
    </div>
  )
}
