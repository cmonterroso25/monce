import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CANALES_DASHBOARD, IconoCanal } from './iconos-canales'

const ESTADOS_EN_CURSO = ['QUEUED', 'PUBLICANDO', 'WAITING_APPROVAL', 'APPROVED', 'VERIFICANDO']
// Fallos terminales que se muestran solo VENTANA_ERROR_HORAS (CANCELLED y APPROVAL_EXPIRED no cuentan).
const ESTADOS_ERROR = ['FAILED', 'VALIDATION_ERROR', 'ADAPTER_MISMATCH']
const ESTADOS_PANEL = ['PUBLICADO', 'NEEDS_REVIEW', ...ESTADOS_EN_CURSO, ...ESTADOS_ERROR]
const VENTANA_ERROR_HORAS = 24
const TOPE_24H = 15
// Plataforma de cuenta social que usa cada canal (para saber si está publicado en todas las cuentas).
const PLATAFORMA_CANAL: Record<string, string> = {
  facebook_marketplace: 'facebook',
  facebook_page: 'facebook',
  instagram: 'instagram',
  whatsapp: 'whatsapp',
  tiktok: 'tiktok',
}
// Una cuenta en estos estados no cuenta como "disponible" para la estrella.
const ESTADOS_CUENTA_NO_DISPONIBLE = ['DISABLED', 'LOCKED']
const POR_PAGINA = 50
const MS_HORA = 3600000

const ESTADOS_PROPIEDAD: Record<string, string> = {
  disponible: 'Disponible',
  reservada: 'Reservada',
  vendida: 'Vendida',
  rentada: 'Rentada',
  inactiva: 'Inactiva',
}
const ESTADOS_NO_DISPONIBLE = ['vendida', 'rentada', 'inactiva']

export type FiltrosPanel = {
  q?: string
  estado?: string
  canal?: string
  cuenta?: string
  pagina?: string
  revision?: string
}

type Trabajo = {
  id: string
  estado: string
  propiedadId: string
  cuentaId: string | null
  publicadoEn: string | null
  creadoEn: string
  actualizadoEn: string
  mensajeError: string | null
  canal: string | null
}

type Nivel = 'error' | 'publicado' | 'revision' | 'curso'
const PRIORIDAD: Record<Nivel, number> = { error: 4, publicado: 3, revision: 2, curso: 1 }
const CLASE_PUNTO: Record<Nivel, string> = {
  error: 'bg-red-500',
  publicado: 'bg-green-500',
  revision: 'bg-amber-500',
  curso: 'bg-blue-500',
}

function nivelDe(estado: string): Nivel {
  if (ESTADOS_ERROR.includes(estado)) return 'error'
  if (estado === 'PUBLICADO') return 'publicado'
  if (estado === 'NEEDS_REVIEW') return 'revision'
  return 'curso'
}

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

function fechaGT(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-GT', {
    timeZone: 'America/Guatemala',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function fechaHoraGT(iso: string) {
  return new Date(iso).toLocaleString('es-GT', {
    timeZone: 'America/Guatemala',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function lineaTrabajo(t: Trabajo, cuentas: Map<string, string>): string {
  const cuenta = t.cuentaId ? cuentas.get(t.cuentaId) ?? 'cuenta' : 'sin cuenta'
  switch (nivelDe(t.estado)) {
    case 'publicado':
      return `• ${cuenta}: publicado el ${fechaGT(t.publicadoEn)}`
    case 'revision':
      return `• ${cuenta}: requiere revisión`
    case 'error': {
      const m = (t.mensajeError ?? 'sin detalle').replace(/\s+/g, ' ').trim()
      return `• ${cuenta}: falló el ${fechaHoraGT(t.actualizadoEn)} — ${m.length > 140 ? m.slice(0, 140) + '…' : m}`
    }
    default:
      return `• ${cuenta}: en curso`
  }
}

function interseccion(a: Set<string> | null, b: Iterable<string>): Set<string> {
  const sb = new Set(b)
  return a ? new Set([...a].filter((x) => sb.has(x))) : sb
}

export default async function PanelPublicaciones({
  userId,
  filtros,
}: {
  userId: string
  filtros: FiltrosPanel
}) {
  const supabase = await createClient()

  const [{ data: cuentasData }, { data: trabajosData, error: errorTrabajos }] = await Promise.all([
    supabase.from('cuentas_sociales').select('id, etiqueta, plataforma, estado').eq('asesor_id', userId).order('creado_en'),
    supabase
      .from('trabajos_publicacion')
      .select(
        'id, estado, expira_en, propiedad_id, cuenta_social_id, publicado_en, creado_en, actualizado_en, mensaje_error, canal:canales_publicacion (codigo)'
      )
      .eq('asesor_id', userId)
      .in('estado', ESTADOS_PANEL)
      .order('creado_en', { ascending: false })
      .limit(1000),
  ])

  const cuentas = (cuentasData ?? []) as { id: string; etiqueta: string | null; plataforma: string; estado: string }[]
  const etiquetaCuenta = new Map(cuentas.map((c) => [c.id, c.etiqueta ?? c.plataforma]))
  const cuentasDisponiblesPorPlataforma = new Map<string, string[]>()
  for (const c of cuentas) {
    if (ESTADOS_CUENTA_NO_DISPONIBLE.includes(c.estado)) continue
    const lista = cuentasDisponiblesPorPlataforma.get(c.plataforma) ?? []
    lista.push(c.id)
    cuentasDisponiblesPorPlataforma.set(c.plataforma, lista)
  }

  const ahora = Date.now()
  const todos: Trabajo[] = (trabajosData ?? [])
    .filter((t: any) => !(t.estado === 'WAITING_APPROVAL' && t.expira_en && new Date(t.expira_en).getTime() < ahora))
    .map((t: any) => ({
      id: t.id as string,
      estado: t.estado as string,
      propiedadId: t.propiedad_id as string,
      cuentaId: (t.cuenta_social_id as string | null) ?? null,
      publicadoEn: (t.publicado_en as string | null) ?? null,
      creadoEn: t.creado_en as string,
      actualizadoEn: t.actualizado_en as string,
      mensajeError: (t.mensaje_error as string | null) ?? null,
      canal: uno<any>(t.canal)?.codigo ?? null,
    }))

  // Envíos que cuentan para el resumen, el tope y los canales en color (sin errores).
  const trabajos = todos.filter((t) => !ESTADOS_ERROR.includes(t.estado))

  // Errores visibles: solo las últimas 24 h y sin un reintento posterior de la misma propiedad/canal/cuenta.
  const limiteError = ahora - VENTANA_ERROR_HORAS * MS_HORA
  const errores = todos
    .filter((t) => ESTADOS_ERROR.includes(t.estado) && new Date(t.actualizadoEn).getTime() >= limiteError)
    .filter(
      (e) =>
        !trabajos.some(
          (t) =>
            t.propiedadId === e.propiedadId &&
            t.canal === e.canal &&
            t.cuentaId === e.cuentaId &&
            new Date(t.creadoEn).getTime() > new Date(e.creadoEn).getTime()
        )
    )

  const idsRevision = new Set<string>([
    ...trabajos.filter((t) => t.estado === 'NEEDS_REVIEW').map((t) => t.propiedadId),
    ...errores.map((e) => e.propiedadId),
  ])

  // Propiedades con anuncio vigente (PUBLICADO o NEEDS_REVIEW) que ya no están disponibles.
  const idsConAnuncioVigente = [
    ...new Set(
      trabajos.filter((t) => t.estado === 'PUBLICADO' || t.estado === 'NEEDS_REVIEW').map((t) => t.propiedadId)
    ),
  ]
  let porRetirar: { id: string; codigo: string | null }[] = []
  if (idsConAnuncioVigente.length > 0) {
    const { data: noDisponibles } = await supabase
      .from('propiedades')
      .select('id, codigo')
      .in('id', idsConAnuncioVigente)
      .in('estado', ESTADOS_NO_DISPONIBLE)
    porRetirar = (noDisponibles ?? []) as typeof porRetirar
  }

  // Resumen
  const vigentes = trabajos.filter((t) => t.estado === 'PUBLICADO').length
  const enCurso = trabajos.filter((t) => ESTADOS_EN_CURSO.includes(t.estado)).length
  const porRevisar = idsRevision.size
  const ultimos7 = trabajos.filter(
    (t) => t.estado === 'PUBLICADO' && t.publicadoEn && new Date(t.publicadoEn).getTime() >= ahora - 168 * MS_HORA
  ).length

  // Filtros
  const q = (filtros.q ?? '').trim().slice(0, 30).replace(/[%_,()]/g, '')
  const estado = filtros.estado && ESTADOS_PROPIEDAD[filtros.estado] ? filtros.estado : ''
  const canal = CANALES_DASHBOARD.some((c) => c.codigo === filtros.canal) ? (filtros.canal as string) : ''
  const cuentaFiltro = cuentas.some((c) => c.id === filtros.cuenta) ? (filtros.cuenta as string) : ''
  const soloRevision = filtros.revision === '1'
  const pagina = Math.max(1, parseInt(filtros.pagina ?? '1', 10) || 1)

  let idsRestringidos: Set<string> | null = null
  if (canal || cuentaFiltro) {
    idsRestringidos = interseccion(
      idsRestringidos,
      trabajos
        .filter((t) => (!canal || t.canal === canal) && (!cuentaFiltro || t.cuentaId === cuentaFiltro))
        .map((t) => t.propiedadId)
    )
  }
  if (soloRevision) {
    idsRestringidos = interseccion(idsRestringidos, idsRevision)
  }

  let propiedades: { id: string; codigo: string | null; titulo: string | null; tipo_operacion: string | null; estado: string | null }[] = []
  let total = 0
  let errorPropiedades: string | null = null

  if (!(idsRestringidos && idsRestringidos.size === 0)) {
    const desde = (pagina - 1) * POR_PAGINA
    let consulta = supabase
      .from('propiedades')
      .select('id, codigo, titulo, tipo_operacion, estado', { count: 'exact' })
    if (q) consulta = consulta.ilike('codigo', `%${q}%`)
    if (estado) consulta = consulta.eq('estado', estado)
    if (idsRestringidos) consulta = consulta.in('id', [...idsRestringidos])
    const { data, count, error } = await consulta
      .order('creado_en', { ascending: false })
      .range(desde, desde + POR_PAGINA - 1)
    if (error) errorPropiedades = error.message
    propiedades = (data ?? []) as typeof propiedades
    total = count ?? 0
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  const trabajosPorPropiedad = new Map<string, Trabajo[]>()
  for (const t of [...trabajos, ...errores]) {
    const lista = trabajosPorPropiedad.get(t.propiedadId) ?? []
    lista.push(t)
    trabajosPorPropiedad.set(t.propiedadId, lista)
  }

  function href(p: number) {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (estado) sp.set('estado', estado)
    if (canal) sp.set('canal', canal)
    if (cuentaFiltro) sp.set('cuenta', cuentaFiltro)
    if (soloRevision) sp.set('revision', '1')
    if (p > 1) sp.set('pagina', String(p))
    const s = sp.toString()
    return `/dashboard/cuentas${s ? `?${s}` : ''}`
  }

  const hayFiltros = Boolean(q || estado || canal || cuentaFiltro || soloRevision)

  const tarjetas: { texto: string; valor: number; clase: string; href?: string }[] = [
    { texto: 'Anuncios vigentes', valor: vigentes, clase: 'text-green-700' },
    { texto: 'En curso', valor: enCurso, clase: 'text-blue-700' },
    { texto: 'Requieren revisión', valor: porRevisar, clase: 'text-amber-700', href: '/dashboard/cuentas?revision=1' },
    { texto: 'Publicados en 7 días', valor: ultimos7, clase: 'text-[#2C3E50]' },
  ]
  const CAJA = 'block rounded-lg border border-slate-200 bg-white p-4 shadow-sm'

  return (
    <section className="mt-10">
      <h2 className="mb-1 text-xl font-bold text-[#2C3E50]">Mis publicaciones</h2>
      <p className="mb-4 text-sm text-slate-500">
        Los canales en color son los que <strong>tú</strong> publicaste. En gris están los que tú no has publicado,
        aunque otro asesor sí lo haya hecho. Hoy solo Facebook Marketplace está habilitado para publicar.
      </p>

      {errorTrabajos && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          No se pudieron leer tus publicaciones: {errorTrabajos.message}
        </div>
      )}

      {porRetirar.length > 0 && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold">
            {porRetirar.length === 1
              ? '1 propiedad ya no está disponible pero su anuncio sigue publicado'
              : `${porRetirar.length} propiedades ya no están disponibles pero sus anuncios siguen publicados`}
          </div>
          <p className="mt-1 text-xs">
            Retira el anuncio de Facebook. Después, un administrador debe liberar el envío desde la ficha de la propiedad.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {porRetirar.slice(0, 15).map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/propiedades/${p.id}`}
                className="rounded bg-white px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-100"
              >
                {p.codigo ?? 'Sin código'}
              </Link>
            ))}
            {porRetirar.length > 15 && <span className="text-xs">y {porRetirar.length - 15} más</span>}
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tarjetas.map((k) => {
          const interior = (
            <>
              <div className={`text-2xl font-bold ${k.clase}`}>{k.valor}</div>
              <div className="text-xs text-slate-500">{k.texto}</div>
              {k.href && <div className="mt-1 text-xs text-amber-700 underline">Ver propiedades</div>}
            </>
          )
          return k.href ? (
            <Link key={k.texto} href={k.href} className={`${CAJA} hover:border-amber-300`}>
              {interior}
            </Link>
          ) : (
            <div key={k.texto} className={CAJA}>
              {interior}
            </div>
          )
        })}
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-[#2C3E50]">Uso por cuenta (últimas 24 h)</h3>
        {cuentas.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no tienes cuentas registradas.</p>
        ) : (
          <ul className="space-y-3">
            {cuentas.map((c) => {
              const mios = trabajos.filter((t) => t.cuentaId === c.id)
              const vig = mios.filter((t) => t.estado === 'PUBLICADO')
              const en24 = mios.filter((t) => new Date(t.creadoEn).getTime() >= ahora - 24 * MS_HORA).length
              const ultima =
                vig
                  .map((t) => t.publicadoEn)
                  .filter((f): f is string => Boolean(f))
                  .sort()
                  .pop() ?? null
              const pct = Math.min(100, Math.round((en24 / TOPE_24H) * 100))
              return (
                <li key={c.id} className="text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-[#2C3E50]">{c.etiqueta ?? c.plataforma}</span>
                    <span className="text-xs text-slate-500">
                      {vig.length} vigentes · {en24} / {TOPE_24H} en 24 h · última: {fechaGT(ultima)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                    <div
                      className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
          {CANALES_DASHBOARD.map((c) => (
            <span key={c.codigo} className="inline-flex items-center gap-1.5">
              <span style={{ color: c.color }}>
                <IconoCanal codigo={c.codigo} className="h-4 w-4" />
              </span>
              {c.nombre}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" /> publicado
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> por revisar
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-500" /> en curso
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" /> error
          </span>
        </div>

        {soloRevision && (
          <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Mostrando solo las propiedades que requieren revisión: envíos por revisar o con error en las últimas 24 h.
          </div>
        )}

        <form method="get" action="/dashboard/cuentas" className="mb-4 flex flex-wrap items-end gap-3">
          {soloRevision && <input type="hidden" name="revision" value="1" />}
          <div>
            <label className="mb-1 block text-xs text-slate-500">Código</label>
            <input
              name="q"
              defaultValue={q}
              maxLength={30}
              placeholder="PROP-0600"
              className="w-32 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Estado de la propiedad</label>
            <select name="estado" defaultValue={estado} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              {Object.entries(ESTADOS_PROPIEDAD).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Canal (publicadas por mí)</label>
            <select name="canal" defaultValue={canal} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              {CANALES_DASHBOARD.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Cuenta</label>
            <select name="cuenta" defaultValue={cuentaFiltro} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">Todas</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.etiqueta ?? c.plataforma}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded bg-[#2C3E50] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#38B6FF]">
            Filtrar
          </button>
          {hayFiltros && (
            <Link href="/dashboard/cuentas" className="text-sm text-slate-600 hover:underline">
              Limpiar
            </Link>
          )}
        </form>

        {errorPropiedades && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            No se pudieron leer las propiedades: {errorPropiedades}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 pr-3 font-medium">Propiedad</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 font-medium">Canales</th>
              </tr>
            </thead>
            <tbody>
              {propiedades.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-500">
                    No hay propiedades con esos filtros.
                  </td>
                </tr>
              )}
              {propiedades.map((p) => {
                const ts = trabajosPorPropiedad.get(p.id) ?? []
                const anuncioVigente = ts.some((t) => t.estado === 'PUBLICADO' || t.estado === 'NEEDS_REVIEW')
                const retirar = anuncioVigente && ESTADOS_NO_DISPONIBLE.includes(p.estado ?? '')
                return (
                  <tr key={p.id} className={`border-b border-slate-100 ${retirar ? 'bg-red-50' : ''}`}>
                    <td className="py-2 pr-3">
                      <Link href={`/dashboard/propiedades/${p.id}`} className="font-medium text-[#2C3E50] hover:text-[#38B6FF]">
                        {p.codigo ?? 'Sin código'}
                      </Link>
                      <div className="max-w-xs truncate text-xs text-slate-500">
                        {p.titulo ?? ''}
                        {p.tipo_operacion ? ` · ${p.tipo_operacion}` : ''}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-xs text-slate-600">{ESTADOS_PROPIEDAD[p.estado ?? ''] ?? p.estado ?? '—'}</span>
                      {retirar && (
                        <div className="text-xs font-medium text-red-700">Anuncio vigente: retíralo de Facebook</div>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        {CANALES_DASHBOARD.map((c) => {
                          const delCanal = ts
                            .filter((t) => t.canal === c.codigo)
                            .sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime())
                          const nivel = delCanal.reduce<Nivel | null>((acc, t) => {
                            const n = nivelDe(t.estado)
                            return !acc || PRIORIDAD[n] > PRIORIDAD[acc] ? n : acc
                          }, null)
                          const publicadoPorMi = delCanal.some((t) => nivelDe(t.estado) !== 'error')
                          const disponibles = cuentasDisponiblesPorPlataforma.get(PLATAFORMA_CANAL[c.codigo] ?? '') ?? []
                          const publicadasIds = new Set(
                            delCanal.filter((t) => t.estado === 'PUBLICADO' && t.cuentaId).map((t) => t.cuentaId as string)
                          )
                          const enTodasLasCuentas = disponibles.length > 0 && disponibles.every((id) => publicadasIds.has(id))
                          const titulo =
                            delCanal.length > 0
                              ? [c.nombre, ...delCanal.map((t) => lineaTrabajo(t, etiquetaCuenta))].join('\n')
                              : `${c.nombre} · no publicado por ti`
                          return (
                            <span
                              key={c.codigo}
                              title={titulo}
                              className="relative inline-flex h-8 w-8 items-center justify-center"
                              style={{ color: publicadoPorMi ? c.color : '#CBD5E1' }}
                            >
                              <IconoCanal codigo={c.codigo} className="h-5 w-5" />
                              {enTodasLasCuentas ? (
                                <svg viewBox="0 0 24 24" className="absolute -right-0.5 -top-1 h-4 w-4" aria-hidden="true">
                                  <path
                                    d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9L12 2.5z"
                                    fill="#FACC15"
                                    stroke="#ffffff"
                                    strokeWidth="1.5"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              ) : (
                                nivel && (
                                  <span
                                    className={`absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white ${CLASE_PUNTO[nivel]}`}
                                  />
                                )
                              )}
                            </span>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>
            {total} propiedades · página {Math.min(pagina, paginas)} de {paginas}
          </span>
          <span className="flex gap-3">
            {pagina > 1 && (
              <Link href={href(pagina - 1)} className="hover:underline">
                ← Anterior
              </Link>
            )}
            {pagina < paginas && (
              <Link href={href(pagina + 1)} className="hover:underline">
                Siguiente →
              </Link>
            )}
          </span>
        </div>
      </div>
    </section>
  )
}
