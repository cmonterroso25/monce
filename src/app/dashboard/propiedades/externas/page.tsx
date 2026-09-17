import { createClient } from '@/lib/supabase/server'
import { BedDouble, Bath, Ruler, MapPin, ExternalLink } from 'lucide-react'
import TabsPropiedades from '../tabs-propiedades'
import FiltrosExternas from './filtros-externas'
import FilaSeguimiento from './fila-seguimiento'

const TIPOS_OPERACION = ['venta', 'renta']
const TIPOS_PROPIEDAD = [
  'casa', 'apartamento', 'terreno', 'bodega', 'ofibodega',
  'oficina', 'finca', 'granja', 'local',
]
const ESTADOS_PUBLICACION = ['activo', 'posible_baja', 'eliminado']
const ESTADOS_SEGUIMIENTO = ['sin_contactar', 'descartado', 'nuevo_colega']

const coloresPublicacion: Record<string, string> = {
  activo: 'bg-green-100 text-green-700',
  posible_baja: 'bg-yellow-100 text-yellow-700',
  eliminado: 'bg-red-100 text-red-700',
}

const coloresSeguimiento: Record<string, string> = {
  sin_contactar: 'bg-slate-100 text-slate-700',
  descartado: 'bg-red-100 text-red-700',
  nuevo_colega: 'bg-blue-100 text-blue-700',
}

const GRID_COLS = 'grid-cols-[2fr_1fr_1.1fr_100px_110px_120px_130px_120px_90px]'

export default async function ListadoPropiedadesExternas({
  searchParams,
}: {
  searchParams: Promise<{
    fuente_portal?: string
    tipo_operacion?: string
    tipo_propiedad?: string
    estado_publicacion?: string
    estado_seguimiento?: string
    zona?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const [{ data: fuentesData }, { data: colegas }] = await Promise.all([
    supabase.from('propiedades_externas').select('fuente_portal'),
    supabase.from('colegas').select('id, nombre').order('nombre'),
  ])

  const fuentes = Array.from(
    new Set(fuentesData?.map((f) => f.fuente_portal).filter(Boolean))
  ) as string[]

  // Nombre del usuario logueado, para mostrarlo en el panel de Acciones
  // como quién quedará registrado en "Contactado por" al guardar.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let agenteActualNombre: string | null = null
  if (user) {
    const { data: miPerfil } = await supabase
      .from('perfiles')
      .select('nombre_completo')
      .eq('id', user.id)
      .single()
    agenteActualNombre = miPerfil?.nombre_completo ?? null
  }

  let query = supabase
    .from('propiedades_externas')
    .select('*, colega:colegas(nombre)')
    .order('primera_deteccion', { ascending: false })

  if (params.fuente_portal) query = query.eq('fuente_portal', params.fuente_portal)
  if (params.tipo_operacion) query = query.eq('tipo_operacion', params.tipo_operacion)
  if (params.tipo_propiedad) query = query.eq('tipo_propiedad', params.tipo_propiedad)
  if (params.estado_publicacion) query = query.eq('estado_publicacion', params.estado_publicacion)
  if (params.estado_seguimiento) query = query.eq('estado_seguimiento', params.estado_seguimiento)
  if (params.zona) query = query.ilike('zona_municipio', `%${params.zona}%`)

  const { data: propiedadesExternas } = await query
  const total = propiedadesExternas?.length ?? 0

  // Se resuelve "Contactado por" con una consulta aparte a perfiles (no
  // se usa el embed de Supabase perfiles!agente_que_contacto porque no
  // está confirmado que exista esa FK en el esquema; así se evita un
  // fallo de query por una relación no verificada).
  const idsAgentes = Array.from(
    new Set(
      (propiedadesExternas ?? [])
        .map((p) => p.agente_que_contacto)
        .filter((id): id is string => Boolean(id))
    )
  )

  let mapaAgentes = new Map<string, string>()
  if (idsAgentes.length > 0) {
    const { data: perfilesAgentes } = await supabase
      .from('perfiles')
      .select('id, nombre_completo')
      .in('id', idsAgentes)
    mapaAgentes = new Map(
      (perfilesAgentes ?? []).map((p) => [p.id as string, p.nombre_completo as string])
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-baseline gap-2">
        <h1 className="text-xl font-bold text-[#2C3E50] sm:text-2xl">Propiedades externas</h1>
        <span className="text-sm font-medium text-slate-400">({total})</span>
      </div>

      <TabsPropiedades />

      <FiltrosExternas
        fuentes={fuentes}
        tiposOperacion={TIPOS_OPERACION}
        tiposPropiedad={TIPOS_PROPIEDAD}
        estadosPublicacion={ESTADOS_PUBLICACION}
        estadosSeguimiento={ESTADOS_SEGUIMIENTO}
      />

      {(!propiedadesExternas || propiedadesExternas.length === 0) && (
        <p className="mt-6 text-sm text-slate-500">
          No se encontraron propiedades externas con esos filtros.
        </p>
      )}

      {propiedadesExternas && propiedadesExternas.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[1250px]">
            <div
              className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500`}
            >
              <div>Propiedad</div>
              <div>Ubicación</div>
              <div>Hab / Baños / m²</div>
              <div className="text-right">Precio</div>
              <div>Publicación</div>
              <div>Seguimiento</div>
              <div>Contactado por</div>
              <div>Colega</div>
              <div className="text-center">Acciones</div>
            </div>

            {propiedadesExternas.map((p) => (
              <div
                key={p.id}
                className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-100 px-3 py-2 transition hover:bg-slate-50 last:border-b-0`}
              >
                <div className="min-w-0">
                  <a
                    href={p.fuente_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 truncate text-sm font-semibold text-[#2C3E50] hover:text-[#38B6FF]"
                  >
                    <span className="truncate">{p.titulo}</span>
                    <ExternalLink size={12} className="flex-shrink-0 text-slate-400" />
                  </a>
                  <p className="truncate text-xs uppercase text-slate-400">
                    {p.tipo_operacion} · {p.tipo_propiedad} · {p.fuente_portal}
                  </p>
                </div>

                <div className="flex min-w-0 items-center gap-1 text-sm text-slate-600">
                  <MapPin size={14} className="flex-shrink-0 text-slate-400" />
                  <span className="truncate">
                    {p.condominio_sector ? `${p.condominio_sector}, ` : ''}
                    {p.zona_municipio}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span className="flex items-center gap-1">
                    <BedDouble size={15} className="text-slate-400" />
                    {p.dormitorios ?? '—'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Bath size={15} className="text-slate-400" />
                    {p.banos ?? '—'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Ruler size={15} className="text-slate-400" />
                    {p.area_construccion_m2 ?? '—'} m²
                  </span>
                </div>

                <div className="text-right">
                  <p className="text-sm font-bold text-[#2C3E50]">
                    {p.precio ? `${p.moneda ?? ''} ${Number(p.precio).toLocaleString()}` : '—'}
                  </p>
                  {p.precio_anterior && Number(p.precio_anterior) !== Number(p.precio) && (
                    <p className="text-xs text-slate-400 line-through">
                      {p.moneda} {Number(p.precio_anterior).toLocaleString()}
                    </p>
                  )}
                </div>

                <div>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                      coloresPublicacion[p.estado_publicacion] || 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {p.estado_publicacion.replace('_', ' ')}
                  </span>
                </div>

                <div>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                      coloresSeguimiento[p.estado_seguimiento] || 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {p.estado_seguimiento.replace('_', ' ')}
                  </span>
                </div>

                <div className="min-w-0 truncate text-sm text-slate-600">
                  {p.agente_que_contacto ? mapaAgentes.get(p.agente_que_contacto) ?? '—' : '—'}
                </div>

                <div className="min-w-0 truncate text-sm text-slate-600">
                  {p.colega?.nombre ?? '—'}
                </div>

                <div className="flex justify-center">
                  <FilaSeguimiento
                    propiedadExternaId={p.id}
                    estadoSeguimientoActual={p.estado_seguimiento}
                    notasActuales={p.notas_agente}
                    colegaIdActual={p.colega_id}
                    colegas={colegas ?? []}
                    estadosSeguimiento={ESTADOS_SEGUIMIENTO}
                    agenteActualNombre={agenteActualNombre}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
