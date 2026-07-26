import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { BedDouble, Bath, Ruler, MapPin, Pencil } from 'lucide-react'
import FiltrosPropiedades from './filtros-propiedades'
import BotonEliminarPropiedad from './boton-eliminar'

const R2_PUBLIC_URL = 'https://pub-55c4b2ef6141404ea53237416303a621.r2.dev'

const coloresEstado: Record<string, string> = {
  disponible: 'bg-green-100 text-green-700',
  reservada: 'bg-yellow-100 text-yellow-700',
  vendida: 'bg-slate-200 text-slate-700',
  rentada: 'bg-blue-100 text-blue-700',
  inactiva: 'bg-red-100 text-red-700',
}

const ESTADOS = ['disponible', 'reservada', 'vendida', 'rentada', 'inactiva']
const MODALIDADES = ['Directo', 'Compartida']

function urlImagen(ruta: string) {
  if (ruta.startsWith('http')) return ruta
  return `${R2_PUBLIC_URL}/${ruta}`
}

// Columnas de la "tabla": ancho de imagen, código+estado, propiedad, ubicación, hab/baños/m2, precio, acción
const GRID_COLS = 'grid-cols-[64px_90px_2.6fr_0.9fr_1.1fr_130px_72px]'

export default async function ListadoPropiedades({
  searchParams,
}: {
  searchParams: Promise<{
    estado?: string
    tipo?: string
    zona?: string
    municipio_id?: string
    colega_id?: string
    captado_por?: string
    modalidad_captacion?: string
    precio_min?: string
    precio_max?: string
    m2_min?: string
    m2_max?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [
    { data: tiposData },
    { data: municipios },
    { data: colegas },
    { data: perfiles },
    { data: miPerfil },
  ] = await Promise.all([
    supabase.from('propiedades').select('tipo_propiedad').not('tipo_propiedad', 'is', null),
    supabase.from('municipios').select('id, nombre').order('nombre'),
    supabase.from('colegas').select('id, nombre').order('nombre'),
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
    user
      ? supabase.from('perfiles').select('rol').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
  ])

  const esAdmin = miPerfil?.rol === 'administrador'

  const tipos = Array.from(
    new Set(tiposData?.map((t) => t.tipo_propiedad).filter(Boolean))
  ) as string[]

  const agentes = (perfiles ?? []).map((p) => ({ id: p.id, nombre: p.nombre_completo }))

  let query = supabase
    .from('propiedades')
    .select('*, imagenes_propiedad(ruta_almacenamiento, es_portada), municipio:municipios(nombre)')
    .order('creado_en', { ascending: false })

  if (params.estado) query = query.eq('estado', params.estado)
  if (params.tipo) query = query.eq('tipo_propiedad', params.tipo)
  if (params.zona) query = query.ilike('zona', `%${params.zona}%`)
  if (params.municipio_id) query = query.eq('municipio_id', params.municipio_id)
  if (params.colega_id) query = query.eq('colega_id', params.colega_id)
  if (params.captado_por) query = query.eq('captado_por', params.captado_por)
  if (params.modalidad_captacion) query = query.eq('modalidad_captacion', params.modalidad_captacion)
  if (params.precio_min) query = query.gte('precio', Number(params.precio_min))
  if (params.precio_max) query = query.lte('precio', Number(params.precio_max))
  if (params.m2_min) query = query.gte('area_construccion_m2', Number(params.m2_min))
  if (params.m2_max) query = query.lte('area_construccion_m2', Number(params.m2_max))

  const { data: propiedades } = await query

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-[#2C3E50] sm:text-2xl">Propiedades</h1>
        <Link
          href="/dashboard/propiedades/nueva"
          className="rounded bg-[#2C3E50] px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-[#38B6FF] sm:w-auto"
        >
          + Nueva propiedad
        </Link>
      </div>

      <FiltrosPropiedades
        estados={ESTADOS}
        tipos={tipos}
        municipios={municipios ?? []}
        colegas={colegas ?? []}
        agentes={agentes}
        modalidades={MODALIDADES}
      />

      {(!propiedades || propiedades.length === 0) && (
        <p className="mt-6 text-sm text-slate-500">
          No se encontraron propiedades con esos filtros.
        </p>
      )}

      {propiedades && propiedades.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[900px]">
            {/* Encabezado de columnas */}
            <div
              className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500`}
            >
              <div />
              <div>Código</div>
              <div>Propiedad</div>
              <div>Ubicación</div>
              <div>Hab / Baños / m²</div>
              <div className="text-right">Precio</div>
              <div />
            </div>

            {/* Filas */}
            {propiedades.map((propiedad) => {
              const portada = propiedad.imagenes_propiedad?.find(
                (img: { es_portada: boolean }) => img.es_portada
              )
              const puedeEditar = esAdmin || propiedad.captado_por === user?.id

              return (
                <div
                  key={propiedad.id}
                  className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-100 px-3 py-2 transition hover:bg-slate-50 last:border-b-0`}
                >
                  <Link href={`/dashboard/propiedades/${propiedad.id}`} className="contents">
                    {/* Thumbnail */}
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-slate-100">
                      {portada ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={urlImagen(portada.ruta_almacenamiento)}
                          alt={propiedad.titulo}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[9px] text-slate-400">
                          Sin foto
                        </div>
                      )}
                    </div>

                    {/* Código + estado */}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-500">
                        {propiedad.codigo ?? '—'}
                      </p>
                      <span
                        className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          coloresEstado[propiedad.estado] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {propiedad.estado}
                      </span>
                    </div>

                    {/* Propiedad */}
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-[#2C3E50]">
                        {propiedad.titulo}
                      </h2>
                      <p className="truncate text-xs uppercase text-slate-400">
                        {propiedad.tipo_operacion}
                        {propiedad.tipo_propiedad ? ` · ${propiedad.tipo_propiedad}` : ''}
                      </p>
                    </div>

                    {/* Ubicación */}
                    <div className="flex min-w-0 items-center gap-1 text-sm text-slate-600">
                      <MapPin size={14} className="flex-shrink-0 text-slate-400" />
                      <span className="truncate">
                        {propiedad.zona ? `${propiedad.zona}, ` : ''}
                        {propiedad.municipio?.nombre ?? propiedad.ciudad}
                      </span>
                    </div>

                    {/* Hab / Baños / m2 */}
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <span className="flex items-center gap-1">
                        <BedDouble size={15} className="text-slate-400" />
                        {propiedad.dormitorios ?? '—'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Bath size={15} className="text-slate-400" />
                        {propiedad.banos ?? '—'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Ruler size={15} className="text-slate-400" />
                        {propiedad.area_construccion_m2 ?? '—'} m²
                      </span>
                    </div>

                    {/* Precio */}
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#2C3E50]">
                        {propiedad.moneda} {Number(propiedad.precio).toLocaleString()}
                      </p>
                    </div>
                  </Link>

                  {/* Editar: quien capturo la propiedad o un admin. Eliminar: solo admin. */}
                  <div className="flex items-center justify-center gap-1">
                    {puedeEditar && (
                      <Link
                        href={`/dashboard/propiedades/${propiedad.id}/editar`}
                        className="flex items-center justify-center rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#38B6FF]"
                        title="Editar propiedad"
                      >
                        <Pencil size={16} />
                      </Link>
                    )}
                    {esAdmin && (
                      <BotonEliminarPropiedad propiedadId={propiedad.id} titulo={propiedad.titulo} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
