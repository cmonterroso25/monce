import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { actualizarPropiedad } from '../../acciones'
import SelectConNuevo from '@/components/select-con-nuevo'
import GestorFotos from './gestor-fotos'

export default async function EditarPropiedad({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [
    { data: propiedadData },
    { data: municipios },
    { data: colegas },
    { data: perfiles },
    { data: imagenes },
    { data: miPerfil },
  ] = await Promise.all([
    supabase.from('propiedades').select('*').eq('id', id).single(),
    supabase.from('municipios').select('id, nombre').order('nombre'),
    supabase.from('colegas').select('id, nombre').order('nombre'),
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
    supabase
      .from('imagenes_propiedad')
      .select('id, ruta_almacenamiento, es_portada, orden')
      .eq('propiedad_id', id)
      .order('orden', { ascending: true }),
    supabase.from('perfiles').select('rol').eq('id', user.id).single(),
  ])

  if (!propiedadData) {
    notFound()
  }

  const propiedad: any = propiedadData
  const esAdmin = miPerfil?.rol === 'administrador'
  const puedeEditar = esAdmin || propiedad.captado_por === user.id

  if (!puedeEditar) {
    const nombreCaptador = (perfiles ?? []).find((p) => p.id === propiedad.captado_por)
      ?.nombre_completo

    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <h1 className="mb-2 text-lg font-semibold text-amber-800">
            No tienes permiso para editar esta propiedad
          </h1>
          <p className="text-sm text-amber-700">
            {nombreCaptador
              ? `Esta propiedad fue capturada por ${nombreCaptador}. Solo esa persona o un administrador puede editarla.`
              : 'Solo quien capturó esta propiedad o un administrador puede editarla.'}
          </p>
          <Link
            href={`/dashboard/propiedades/${propiedad.id}`}
            className="mt-4 inline-block rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#38B6FF]"
          >
            Volver al detalle
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold">
        Editar propiedad {propiedad.codigo ? `· ${propiedad.codigo}` : ''}
      </h1>

      {sp.error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{sp.error}</p>
      )}

      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-700">Fotos actuales</label>
        <GestorFotos propiedadId={propiedad.id} imagenesIniciales={imagenes ?? []} />
      </div>

      <form action={actualizarPropiedad} className="space-y-4">
        <input type="hidden" name="propiedad_id" value={propiedad.id} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Título</label>
          <input
            type="text"
            name="titulo"
            required
            defaultValue={propiedad.titulo ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <SelectConNuevo
            name="municipio_id"
            label="Municipio"
            opciones={municipios ?? []}
            placeholder="Selecciona municipio"
            defaultValue={propiedad.municipio_id ?? ''}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Sector</label>
            <input
              type="text"
              name="sector"
              defaultValue={propiedad.sector ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Condominio</label>
          <input
            type="text"
            name="condominio"
            defaultValue={propiedad.condominio ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Zona</label>
          <input
            type="text"
            name="zona"
            defaultValue={propiedad.zona ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <input type="hidden" name="ciudad" value={propiedad.ciudad ?? 'Guatemala'} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Inmueble</label>
            <select
              name="tipo_propiedad"
              required
              defaultValue={propiedad.tipo_propiedad ?? 'casa'}
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
              defaultValue={propiedad.tipo_operacion ?? 'venta'}
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
            defaultValue={propiedad.modalidad_captacion ?? 'Directo'}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="Directo">Directo</option>
            <option value="Compartida">Compartida</option>
          </select>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Niveles</label>
            <input
              type="number"
              name="niveles"
              defaultValue={propiedad.niveles ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Habitaciones</label>
            <input
              type="number"
              name="dormitorios"
              defaultValue={propiedad.dormitorios ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Baños</label>
            <input
              type="number"
              step="0.5"
              name="banos"
              defaultValue={propiedad.banos ?? ''}
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
                defaultValue={propiedad[campo] ?? ''}
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
              defaultValue={propiedad.parqueos ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Extras</label>
            <input
              type="text"
              name="extras"
              defaultValue={propiedad.extras ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">M² construcción</label>
            <input
              type="number"
              name="area_construccion_m2"
              defaultValue={propiedad.area_construccion_m2 ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">M² terreno</label>
            <input
              type="number"
              name="area_terreno_m2"
              defaultValue={propiedad.area_terreno_m2 ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Medidas del terreno</label>
          <input
            type="text"
            name="medidas_terreno"
            defaultValue={propiedad.medidas_terreno ?? ''}
            placeholder='Ej. 10m x 20m'
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Precio</label>
            <input
              type="number"
              name="precio"
              required
              step="0.01"
              defaultValue={propiedad.precio ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Moneda</label>
            <select
              name="moneda"
              defaultValue={propiedad.moneda ?? 'GTQ'}
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
              defaultValue={propiedad.mantenimiento ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">IUSI</label>
            <input
              type="number"
              name="iusi"
              step="0.01"
              defaultValue={propiedad.iusi ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Comisión</label>
            <input
              type="number"
              name="comision"
              step="0.01"
              defaultValue={propiedad.comision ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Hipoteca</label>
            <select
              name="hipoteca"
              defaultValue={propiedad.hipoteca ?? ''}
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
              defaultValue={propiedad.valor_hipoteca ?? ''}
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
              defaultValue={propiedad.mascota ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Acceso</label>
            <select
              name="acceso"
              defaultValue={propiedad.acceso ?? ''}
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

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Propietario</label>
          <input
            type="text"
            name="propietario_nombre"
            defaultValue={propiedad.propietario_nombre ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Nombre del propietario"
          />
        </div>

        <SelectConNuevo
          name="colega_id"
          label="Colega"
          opciones={colegas ?? []}
          placeholder="Selecciona colega (opcional)"
          defaultValue={propiedad.colega_id ?? ''}
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Captado por</label>
          <select
            name="captado_por"
            defaultValue={propiedad.captado_por ?? ''}
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
            defaultValue={propiedad.descripcion ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">No Publicar</label>
          <textarea
            name="comentarios"
            rows={3}
            defaultValue={propiedad.comentarios ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Agregar más fotos (se añaden al final)
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
          Guardar cambios
        </button>
      </form>
    </div>
  )
}
