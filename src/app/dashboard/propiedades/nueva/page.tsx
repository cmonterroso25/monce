import { createClient } from '@/lib/supabase/server'
import { crearPropiedad } from '../acciones'
import SelectConNuevo from '@/components/select-con-nuevo'

export default async function NuevaPropiedad({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [
    { data: municipios },
    { data: colegas },
    { data: perfiles },
  ] = await Promise.all([
    supabase.from('municipios').select('id, nombre').order('nombre'),
    supabase.from('colegas').select('id, nombre').order('nombre'),
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
  ])

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Nueva propiedad</h1>

      {params.error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{params.error}</p>
      )}

      <form action={crearPropiedad} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Título</label>
          <input
            type="text"
            name="titulo"
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Casa moderna en zona 10"
          />
        </div>

        {/* Ubicación */}
        <div className="grid grid-cols-2 gap-4">
          <SelectConNuevo
            name="municipio_id"
            label="Municipio"
            opciones={municipios ?? []}
            placeholder="Selecciona municipio"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Sector</label>
            <input
              type="text"
              name="sector"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Condominio</label>
          <input
            type="text"
            name="condominio"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Zona</label>
          <input
            type="text"
            name="zona"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <input type="hidden" name="ciudad" value="Guatemala" />

        {/* Tipo de inmueble y negocio */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Inmueble</label>
            <select
              name="tipo_propiedad"
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="casa">Casa</option>
              <option value="apartamento">Apartamento</option>
              <option value="terreno">Terreno</option>
              <option value="comercial">Comercial</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Negocio</label>
            <select
              name="tipo_operacion"
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="venta">Venta</option>
              <option value="renta">Renta</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Modalidad de captación</label>
          <select
            name="modalidad_captacion"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="Directo">Directo</option>
            <option value="Compartida">Compartida</option>
          </select>
        </div>

        {/* Distribución */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Niveles</label>
            <input
              type="number"
              name="niveles"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Habitaciones</label>
            <input
              type="number"
              name="dormitorios"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Baños</label>
            <input
              type="number"
              step="0.5"
              name="banos"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            ['sala', 'Sala'],
            ['comedor', 'Comedor'],
            ['cocina', 'Cocina'],
            ['estudio', 'Estudio'],
            ['sala_familiar', 'Sala Familiar'],
            ['habitacion_servicio', 'Habitación de servicio'],
            ['lavanderia', 'Lavandería'],
            ['jardin', 'Jardín'],
          ].map(([campo, etiqueta]) => (
            <div key={campo}>
              <label className="mb-1 block text-sm font-medium text-gray-700">{etiqueta}</label>
              <input
                type="text"
                name={campo}
                placeholder="Detalle (opcional)"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Parqueos</label>
            <input
              type="number"
              name="parqueos"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Extras</label>
            <input
              type="text"
              name="extras"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Áreas */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">M² construcción</label>
            <input
              type="number"
              name="area_construccion_m2"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">M² terreno</label>
            <input
              type="number"
              name="area_terreno_m2"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Medidas del terreno</label>
          <input
            type="text"
            name="medidas_terreno"
            placeholder='Ej. 10m x 20m'
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {/* Financiero */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Precio</label>
            <input
              type="number"
              name="precio"
              required
              step="0.01"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Moneda</label>
            <select
              name="moneda"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="GTQ">GTQ</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Mantenimiento</label>
            <input
              type="number"
              name="mantenimiento"
              step="0.01"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">IUSI</label>
            <input
              type="number"
              name="iusi"
              step="0.01"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Comisión</label>
            <input
              type="number"
              name="comision"
              step="0.01"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Hipoteca</label>
            <select
              name="hipoteca"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Selecciona</option>
              <option value="Si">Sí</option>
              <option value="No">No</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Valor hipoteca</label>
            <input
              type="number"
              name="valor_hipoteca"
              step="0.01"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Mascota</label>
            <input
              type="text"
              name="mascota"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Acceso</label>
            <select
              name="acceso"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Selecciona</option>
              <option value="Carlos Monterroso">Carlos Monterroso</option>
              <option value="Laura Ceballos">Laura Ceballos</option>
              <option value="Lucy Aguilar">Lucy Aguilar</option>
              <option value="Vivi Gonzalez">Vivi Gonzalez</option>
              <option value="Adan Suret">Adan Suret</option>
              <option value="Yenni Ceballos">Yenni Ceballos</option>
              <option value="Pamela Aguilar">Pamela Aguilar</option>
            </select>
          </div>
        </div>

        {/* Personas involucradas */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Propietario</label>
          <input
            type="text"
            name="propietario_nombre"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Nombre del propietario"
          />
        </div>

        <SelectConNuevo
          name="colega_id"
          label="Colega"
          opciones={colegas ?? []}
          placeholder="Selecciona colega (opcional)"
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Captado por</label>
          <select
            name="captado_por"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Selecciona agente</option>
            {(perfiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre_completo}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Descripción</label>
          <textarea
            name="descripcion"
            rows={4}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">No Publicar</label>
          <textarea
            name="comentarios"
            rows={3}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Fotos (la primera será la portada)
          </label>
          <input
            type="file"
            name="imagenes"
            accept="image/*"
            multiple
            className="w-full text-sm text-slate-500 file:mr-4 file:rounded file:border-0 file:bg-[#2C3E50] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white file:transition-colors hover:file:bg-[#38B6FF]"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Guardar propiedad
        </button>
      </form>
    </div>
  )
}
