import { createClient } from '@/lib/supabase/server'
import { actualizarRequerimiento } from '../../acciones'
import { TIPOS_OPERACION, ETIQUETAS_TIPO_OPERACION, CARACTERISTICAS_DESEADAS, ESTADOS_REQUERIMIENTO, ETIQUETAS_ESTADO_REQUERIMIENTO } from '../../constantes'
import { TIPOS_PROPIEDAD } from '@/lib/tipos-propiedad'

export default async function EditarRequerimiento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: requerimiento } = await supabase.from('requerimientos').select('*').eq('id', id).single()
  const [{ data: contactos }, { data: municipios }] = await Promise.all([
    supabase.from('contactos').select('id, nombre_completo').order('nombre_completo'),
    supabase.from('municipios').select('id, nombre').order('nombre'),
  ])

  if (!requerimiento) return <div className="p-8">Requerimiento no encontrado.</div>

  const caracteristicasActuales: string[] = requerimiento.caracteristicas_deseadas ?? []

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <h1 className="mb-6 text-xl font-bold text-[#2C3E50] sm:text-2xl">Editar requerimiento</h1>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <form action={actualizarRequerimiento} className="space-y-4">
        <input type="hidden" name="requerimiento_id" value={requerimiento.id} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Estado</label>
          <select name="estado" defaultValue={requerimiento.estado ?? 'abierto'} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            {ESTADOS_REQUERIMIENTO.map((e) => (
              <option key={e} value={e}>{ETIQUETAS_ESTADO_REQUERIMIENTO[e]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Contacto</label>
          <select name="contacto_id" required defaultValue={requerimiento.contacto_id} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            {(contactos ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre_completo}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Negocio</label>
            <select name="tipo_operacion" defaultValue={requerimiento.tipo_operacion ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="">Cualquiera</option>
              {TIPOS_OPERACION.map((t) => (
                <option key={t} value={t}>{ETIQUETAS_TIPO_OPERACION[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de inmueble</label>
            <select name="tipo_propiedad" defaultValue={requerimiento.tipo_propiedad ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
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
            <input type="number" name="precio_min" min="0" step="any" defaultValue={requerimiento.precio_min ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Precio máximo</label>
            <input type="number" name="precio_max" min="0" step="any" defaultValue={requerimiento.precio_max ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Moneda</label>
            <select name="moneda" defaultValue={requerimiento.moneda ?? 'GTQ'} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="GTQ">GTQ</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Municipio</label>
            <select name="municipio_id" defaultValue={requerimiento.municipio_id ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="">Cualquiera</option>
              {(municipios ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Zona</label>
            <input type="text" name="zona" defaultValue={requerimiento.zona ?? ''} placeholder="Ej. 14" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Sector</label>
            <input type="text" name="sector" defaultValue={requerimiento.sector ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Habitaciones mín.</label>
            <input type="number" name="dormitorios_min" min="0" defaultValue={requerimiento.dormitorios_min ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Baños mín.</label>
            <input type="number" name="banos_min" min="0" step="0.5" defaultValue={requerimiento.banos_min ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Niveles mín.</label>
            <input type="number" name="niveles_min" min="0" defaultValue={requerimiento.niveles_min ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Parqueos mín.</label>
            <input type="number" name="parqueos_min" min="0" defaultValue={requerimiento.parqueos_min ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Área mínima (m²)</label>
          <input type="number" name="area_min" min="0" step="any" defaultValue={requerimiento.area_min ?? ''} className="w-full max-w-[200px] rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Características deseadas</label>
          <div className="grid grid-cols-2 gap-2 rounded border border-gray-300 p-3 sm:grid-cols-3">
            {CARACTERISTICAS_DESEADAS.map((c) => (
              <label key={c.value} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="caracteristicas_deseadas"
                  value={c.value}
                  defaultChecked={caracteristicasActuales.includes(c.value)}
                />
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
            defaultValue={requerimiento.otras_caracteristicas ?? ''}
            placeholder="Cualquier otra característica que no esté en la lista de arriba"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Notas</label>
          <textarea name="notas" rows={3} defaultValue={requerimiento.notas ?? ''} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <button type="submit" className="w-full rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF] sm:w-auto">
          Guardar cambios
        </button>
      </form>
    </div>
  )
}
