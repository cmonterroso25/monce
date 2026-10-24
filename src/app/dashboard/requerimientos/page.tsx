import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { TIPOS_PROPIEDAD } from '@/lib/tipos-propiedad'
import { ETIQUETAS_TIPO_OPERACION, ETIQUETAS_CARACTERISTICA } from './constantes'
import BotonEliminarRequerimiento from './boton-eliminar-requerimiento'
import CambiarEstadoRequerimiento from './[id]/cambiar-estado'

const ETIQUETA_TIPO_PROPIEDAD: Record<string, string> = Object.fromEntries(
  TIPOS_PROPIEDAD.map((t) => [t.value, t.label])
)

type Requerimiento = {
  id: string
  estado: string
  tipo_operacion: string | null
  tipo_propiedad: string | null
  precio_min: number | null
  precio_max: number | null
  moneda: string | null
  zona: string | null
  sector: string | null
  dormitorios_min: number | null
  banos_min: number | null
  caracteristicas_deseadas: string[] | null
  creado_en: string
  contacto: { id: string; nombre_completo: string } | null
  municipio: { nombre: string } | null
}

const GRID_COLS = 'grid-cols-[1.3fr_1fr_1.1fr_1fr_1.2fr_100px_90px_40px]'

export default async function ListadoRequerimientos() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle()
  const esAdmin = miPerfil?.rol === 'administrador'

  const { data } = await supabase
    .from('requerimientos')
    .select(
      'id, estado, tipo_operacion, tipo_propiedad, precio_min, precio_max, moneda, zona, sector, dormitorios_min, banos_min, caracteristicas_deseadas, creado_en, contacto:contactos(id, nombre_completo), municipio:municipios(nombre)'
    )
    .order('creado_en', { ascending: false })

  const requerimientos = ((data ?? []) as unknown as Requerimiento[]).map((r) => ({
    ...r,
    contacto: Array.isArray(r.contacto) ? r.contacto[0] : r.contacto,
    municipio: Array.isArray(r.municipio) ? r.municipio[0] : r.municipio,
  }))

  function textoUbicacion(r: Requerimiento) {
    const partes = [r.zona ? `Zona ${r.zona}` : null, r.sector, r.municipio?.nombre].filter(Boolean)
    return partes.length > 0 ? partes.join(' · ') : '—'
  }

  function textoPresupuesto(r: Requerimiento) {
    if (!r.precio_min && !r.precio_max) return '—'
    const moneda = r.moneda ?? 'GTQ'
    const min = r.precio_min ? Number(r.precio_min).toLocaleString() : '0'
    const max = r.precio_max ? Number(r.precio_max).toLocaleString() : null
    return max ? `${moneda} ${min} - ${max}` : `${moneda} ${min}+`
  }

  function textoDistribucion(r: Requerimiento) {
    const partes = [r.dormitorios_min ? `${r.dormitorios_min}+ hab` : null, r.banos_min ? `${r.banos_min}+ baños` : null].filter(Boolean)
    const caracteristicas = (r.caracteristicas_deseadas ?? []).map((c) => ETIQUETAS_CARACTERISTICA[c] ?? c)
    return [...partes, ...caracteristicas].join(' · ') || '—'
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#2C3E50] sm:text-2xl">Requerimientos</h1>
          <p className="text-sm text-slate-500">Qué está buscando cada cliente, para cruzarlo con el inventario.</p>
        </div>
        <Link
          href="/dashboard/requerimientos/nuevo"
          className="rounded bg-[#2C3E50] px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-[#38B6FF]"
        >
          + Nuevo requerimiento
        </Link>
      </div>

      {requerimientos.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">Aún no hay requerimientos registrados.</p>
      )}

      {requerimientos.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[1180px]">
            <div
              className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500`}
            >
              <div>Contacto</div>
              <div>Negocio / tipo</div>
              <div>Ubicación</div>
              <div>Presupuesto</div>
              <div>Distribución / características</div>
              <div></div>
              <div>Estado</div>
              <div />
            </div>

            {requerimientos.map((r) => (
              <div
                key={r.id}
                className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-100 px-3 py-2 transition hover:bg-slate-50 last:border-b-0`}
              >
                <div className="min-w-0">
                  <Link href={`/dashboard/requerimientos/${r.id}/editar`} className="truncate text-sm font-semibold text-[#2C3E50] hover:text-[#38B6FF]">
                    {r.contacto?.nombre_completo ?? 'Contacto eliminado'}
                  </Link>
                </div>
                <div className="truncate text-sm text-slate-600">
                  {[r.tipo_operacion ? ETIQUETAS_TIPO_OPERACION[r.tipo_operacion] : null, r.tipo_propiedad ? ETIQUETA_TIPO_PROPIEDAD[r.tipo_propiedad] : null]
                    .filter(Boolean)
                    .join(' · ') || 'Cualquiera'}
                </div>
                <div className="truncate text-sm text-slate-600">{textoUbicacion(r)}</div>
                <div className="truncate text-sm text-slate-600">{textoPresupuesto(r)}</div>
                <div className="truncate text-sm text-slate-600" title={textoDistribucion(r)}>
                  {textoDistribucion(r)}
                </div>
                <div className="text-xs text-slate-400">
                  {new Date(r.creado_en).toLocaleDateString('es-GT', { dateStyle: 'medium' })}
                </div>
                <div className="flex justify-end">
                  <CambiarEstadoRequerimiento requerimientoId={r.id} estadoActual={r.estado} />
                </div>
                <div className="flex justify-center">
                  {esAdmin && <BotonEliminarRequerimiento requerimientoId={r.id} etiqueta={r.contacto?.nombre_completo ?? 'requerimiento'} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
