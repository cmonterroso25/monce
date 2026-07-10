import { createClient } from '@/lib/supabase/server'
import { actualizarContacto } from '../../acciones'
import { TIPOS_CONTACTO, ORIGENES } from '../../constantes'

export default async function EditarContacto({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: contacto } = await supabase.from('contactos').select('*').eq('id', id).single()
  const { data: perfiles } = await supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo')

  if (!contacto) return <div className="p-8">Contacto no encontrado.</div>

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-[#2C3E50]">Editar contacto</h1>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <form action={actualizarContacto} className="space-y-4">
        <input type="hidden" name="contacto_id" value={contacto.id} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nombre completo</label>
          <input name="nombre_completo" defaultValue={contacto.nombre_completo} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Teléfono</label>
            <input name="telefono" defaultValue={contacto.telefono ?? ''} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Correo</label>
            <input name="correo" type="email" defaultValue={contacto.correo ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de contacto</label>
            <select name="tipo_contacto" defaultValue={contacto.tipo_contacto ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="">Selecciona...</option>
              {TIPOS_CONTACTO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Origen</label>
            <select name="origen" defaultValue={contacto.origen ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="">Selecciona...</option>
              {ORIGENES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Presupuesto mín. (Q)</label>
            <input name="presupuesto_min" type="number" defaultValue={contacto.presupuesto_min ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Presupuesto máx. (Q)</label>
            <input name="presupuesto_max" type="number" defaultValue={contacto.presupuesto_max ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Zonas de interés</label>
          <input name="zonas_interes" defaultValue={contacto.zonas_interes?.join(', ') ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Agente asignado</label>
          <select name="agente_asignado" defaultValue={contacto.agente_asignado ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            {(perfiles ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
          </select>
        </div>

        <button type="submit" className="rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF]">
          Guardar cambios
        </button>
      </form>
    </div>
  )
}
