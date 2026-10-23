import { createClient } from '@/lib/supabase/server'
import { crearRequerimiento } from '../acciones'
import { TIPOS_OPERACION, ETIQUETAS_TIPO_OPERACION, CARACTERISTICAS_DESEADAS } from '../constantes'
import { TIPOS_PROPIEDAD } from '@/lib/tipos-propiedad'

export default async function NuevoRequerimiento({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; contacto_id?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const [{ data: contactos }, { data: municipios }] = await Promise.all([
    supabase.from('contactos').select('id, nombre_completo').order('nombre_completo'),
    supabase.from('municipios').select('id, nombre').order('nombre'),
  ])

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <h1 className="mb-6 text-xl font-bold text-[#2C3E50] sm:text-2xl">Nuevo requerimiento</h1>

      {params.error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {params.error}
        </div>
      )}

      <form action={crearRequerimiento} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Contacto</label>
          <select name="contacto_id" required defaultValue={params.contacto_id ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="">Selecciona un contacto</option>
            {(contactos ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre_completo}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Negocio</label>
            <select name="tipo_operacion" defaultValue="" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="">Cualquiera</option>
              {TIPOS_OPERACION.map((t) => (
                <option key={t} value={t}>{ETIQUETAS_TIPO_OPERACION[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de inmueble</label>
            <select name="tipo_propiedad" defaultValue="" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="">Cualquiera</option>
              {TIPOS_PROPIEDAD.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Precio mínimo</label>
            <input type="number" name="precio_min" min="0" step="any" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Precio máximo</label>
            <input type="number" name="precio_max" min="0" step="any" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Moneda</label>
            <select name="moneda" defaultValue="GTQ" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="GTQ">GTQ</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Municipio</label>
            <select name="municipio_id" defaultValue="" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="">Cualquiera</option>
              {(municipios ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Zona</label>
            <input type="text" name="zona" placeholder="Ej. 14" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Sector</label>
            <input type="text" name="sector" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Habitaciones mín.</label>
            <input type="number" name="dormitorios_min" min="0" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Baños mín.</label>
            <input type="number" name="banos_min" min="0" step="0.5" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Niveles mín.</label>
            <input type="number" name="niveles_min" min="0" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Parqueos mín.</label>
            <input type="number" name="parqueos_min" min="0" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Área mínima (m²)</label>
          <input type="number" name="area_min" min="0" step="any" className="w-full max-w-[200px] rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Características deseadas</label>
          <div className="grid grid-cols-2 gap-2 rounded border border-gray-300 p-3 sm:grid-cols-3">
            {CARACTERISTICAS_DESEADAS.map((c) => (
              <label key={c.value} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="caracteristicas_deseadas" value={c.value} />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Otras características</label>
          <input
            type="text"
            name="otras_caracteristicas"
            placeholder="Cualquier otra característica que no esté en la lista de arriba"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Notas</label>
          <textarea name="notas" rows={3} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <button type="submit" className="w-full rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF] sm:w-auto">
          Crear requerimiento
        </button>
      </form>
    </div>
  )
}
