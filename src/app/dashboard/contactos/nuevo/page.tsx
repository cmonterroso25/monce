import { createClient } from '@/lib/supabase/server'
import { crearContacto } from '../acciones'
import { TIPOS_CONTACTO, ETIQUETAS_TIPO_CONTACTO, ORIGENES } from '../constantes'
import { TIPOS_PROPIEDAD } from '@/lib/tipos-propiedad'

export default async function NuevoContacto({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: perfiles } = await supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo')

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <h1 className="mb-6 text-xl font-bold text-[#2C3E50] sm:text-2xl">Nuevo contacto</h1>

      {params.error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {params.error}
        </div>
      )}

      <form action={crearContacto} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nombre completo</label>
          <input name="nombre_completo" required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Teléfono</label>
          <input name="telefono" required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de contacto</label>
            <select name="tipo_contacto" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="">Selecciona...</option>
              {TIPOS_CONTACTO.map((t) => <option key={t} value={t}>{ETIQUETAS_TIPO_CONTACTO[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Origen</label>
            <select name="origen" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="">Selecciona...</option>
              {ORIGENES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Presupuesto mín. (Q)</label>
            <input name="presupuesto_min" type="number" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Presupuesto máx. (Q)</label>
            <input name="presupuesto_max" type="number" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Zonas de interés</label>
          <input name="zonas_interes" placeholder="Zona 10, Zona 15, Cayalá (separadas por coma)" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de propiedad de interés</label>
          <select name="tipo_propiedad_interes" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="">Sin especificar</option>
            {TIPOS_PROPIEDAD.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Agente asignado</label>
          <select name="agente_asignado" defaultValue={user?.id} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            {(perfiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.nombre_completo}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="w-full rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF] sm:w-auto">
          Guardar contacto
        </button>
      </form>
    </div>
  )
}
