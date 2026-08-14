import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { actualizarPropiedadDatos } from '../../acciones'
import SelectConNuevo from '@/components/select-con-nuevo'
import SelectorUbicacion from '@/components/selector-ubicacion'
import GestorFotos from './gestor-fotos'
import { TIPOS_PROPIEDAD } from '@/lib/tipos-propiedad'
import SelectorRequisitosRenta from '../../selector-requisitos-renta'
import SelectorPublicable from '../../selector-publicable'
import SelectorFotos from '@/components/selector-fotos'
import BotonGuardarPropiedad from '@/components/boton-guardar-propiedad'
import FormularioSinEnvioNativo from '@/components/formulario-sin-envio-nativo'

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
    { data: ubicaciones },
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
    supabase.from('ubicaciones').select('id, nombre, google_maps_url, waze_url').order('nombre'),
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
      <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <h1 className="mb-2 text-lg font-semibold text-amber-800">
            No tienes permiso para editar esta propiedad
          </h1>
          <p className="text-sm text-amber-700">
            {nombreCaptador
              ? `Esta propiedad fue capturada por ${nombreCaptador}. Solo esa persona o un administrador puede editarla.`
              : 'Solo quien capturo esta propiedad o un administrador puede editarla.'}
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
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <h1 className="mb-6 text-xl font-bold sm:text-2xl">
        Editar propiedad {propiedad.codigo ? `- ${propiedad.codigo}` : ''}
      </h1>

      {sp.error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{sp.error}</p>
      )}

      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-700">Fotos actuales</label>
        <GestorFotos propiedadId={propiedad.id} imagenesIniciales={imagenes ?? []} />
      </div>

      <FormularioSinEnvioNativo className="space-y-4">
        <input type="hidden" name="propiedad_id" value={propiedad.id} />

        <div className="mb-2 border-b border-gray-200 pb-2">
          <h2 className="text-base font-semibold text-[#2C3E50]">Informacion publica</h2>
          <p className="text-xs text-gray-500">Estos datos se muestran en el portal publico de la propiedad.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Titulo</label>
          <input
            type="text"
            name="titulo"
            required
            defaultValue={propiedad.titulo ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <SelectorUbicacion
          opciones={ubicaciones ?? []}
          defaultValue={propiedad.ubicacion_id ?? ''}
          puedeEditar={esAdmin}
        />

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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Inmueble</label>
            <select
              name="tipo_propiedad"
              required
              defaultValue={propiedad.tipo_propiedad ?? 'casa'}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {TIPOS_PROPIEDAD.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
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

        <SelectorRequisitosRenta defaultValue={propiedad.requisitos_renta ?? ''} />
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Niveles</label>
            <input
              type="text"
              name="niveles"
              defaultValue={propiedad.niveles ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Habitaciones</label>
            <input
              type="text"
              name="dormitorios"
              defaultValue={propiedad.dormitorios ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Banos</label>
            <input
              type="text"
              name="banos"
              defaultValue={propiedad.banos ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>


        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            ['sala', 'Sala'],
            ['comedor', 'Comedor'],
            ['cocina', 'Cocina'],
            ['estudio', 'Estudio'],
            ['sala_familiar', 'Sala Familiar'],
            ['habitacion_servicio', 'Habitacion de servicio'],
            ['lavanderia', 'Lavanderia'],
            ['jardin', 'Jardin'],
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">M2 construccion</label>
            <input
              type="number"
              name="area_construccion_m2"
              defaultValue={propiedad.area_construccion_m2 ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">M2 terreno</label>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </div>

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
          <label className="mb-1 block text-sm font-medium text-gray-700">Descripción</label>
          <textarea
            name="descripcion"
            rows={5}
            defaultValue={propiedad.descripcion ?? ''}
            placeholder="Descripción de la propiedad, visible en el portal público"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="mb-2 mt-8 border-b border-gray-200 pb-2">
          <h2 className="text-base font-semibold text-[#2C3E50]">Informacion interna (No publicar)</h2>
          <p className="text-xs text-gray-500">Solo visible dentro del CRM, nunca en el portal publico.</p>
        </div>

        <SelectorPublicable defaultValue={propiedad.publicable ?? true} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Modalidad de captacion</label>
          <select
            name="modalidad_captacion"
            defaultValue={propiedad.modalidad_captacion ?? 'Directo'}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="Directo">Directo</option>
            <option value="Compartida">Compartida</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Comisión</label>
          <select
            name="comision"
            defaultValue={propiedad.comision ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Selecciona</option>
            <option value="Primera renta">Primera renta</option>
            <option value="1/2 renta">1/2 renta</option>
            <option value="5%">5%</option>
            <option value="4%">4%</option>
            <option value="3%">3%</option>
            <option value="2.5">2.5</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Hipoteca</label>
            <select
              name="hipoteca"
              defaultValue={propiedad.hipoteca ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Selecciona</option>
              <option value="Si">Si</option>
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

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Acceso coordinar con:</label>
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
          <label className="mb-1 block text-sm font-medium text-gray-700">Otra información</label>
          <textarea
            name="comentarios"
            rows={4}
            defaultValue={propiedad.comentarios ?? ''}
            placeholder="Notas internas adicionales sobre la propiedad"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-8">
          <SelectorFotos label="Agregar mas fotos (se anaden al final)" />
        </div>

        <BotonGuardarPropiedad
          accion={actualizarPropiedadDatos}
          conteoFotosExistentes={(imagenes ?? []).length}
          redirectTo={`/dashboard/propiedades/${propiedad.id}`}
          className="w-full rounded bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Guardar cambios
        </BotonGuardarPropiedad>
      </FormularioSinEnvioNativo>
    </div>
  )
}
