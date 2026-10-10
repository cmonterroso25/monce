import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Lock, ExternalLink, Ban } from 'lucide-react'
import Galeria from './galeria'
import MapaUbicacion from '@/components/mapa-ubicacion'
import CompartirWhatsapp from './compartir-whatsapp'
import CompartirMarketplace from './compartir-marketplace'
import CambiarEstado from './cambiar-estado'
import DetalleRequisitosRenta from '@/components/detalle-requisitos-renta'
import SeccionAreasYAmbientes from '@/components/seccion-areas-ambientes'
import AnaliticaPropiedad from './analitica-propiedad'
import {
  obtenerAnaliticaVistas,
  obtenerCanalesActivos,
  obtenerCuentasSocialesListas,
  type CuentaSocialLista,
} from './acciones'
import PublicarCanales from './publicar-canales'
import LiberarEnvio from './liberar-envio'
import RevisionPublicacion, { type RevisionPendiente } from './revision-publicacion'
import { REQUISITOS_RENTA, type CodigoRequisitosRenta } from '../requisitos-renta'
import { formatearZona } from '@/lib/formato-zona'
import { formatearPrecioRenta } from '@/lib/formato-precio'
import { formatearFechaLargaGT } from '@/lib/fecha-gt'

const R2_PUBLIC_URL = 'https://pub-55c4b2ef6141404ea53237416303a621.r2.dev'

const coloresEstado: Record<string, string> = {
  disponible: 'bg-green-100 text-green-700',
  reservada: 'bg-yellow-100 text-yellow-700',
  vendida: 'bg-slate-200 text-slate-700',
  rentada: 'bg-blue-100 text-blue-700',
  inactiva: 'bg-red-100 text-red-700',
}

const coloresModalidad: Record<string, string> = {
  Directo: 'bg-emerald-100 text-emerald-700',
  Compartida: 'bg-blue-100 text-blue-700',
}

const ESTADOS = ['disponible', 'reservada', 'vendida', 'rentada', 'inactiva']
const ESTADOS_VISIBLES_PORTAL = ['disponible', 'reservada']

const ETIQUETAS_ENVIO: Record<string, string> = {
  QUEUED: 'En cola',
  PUBLICANDO: 'Publicando',
  WAITING_APPROVAL: 'Esperando aprobación',
  APPROVED: 'Aprobada',
  PUBLICADO: 'Publicada',
  VALIDATION_ERROR: 'Faltan datos',
  AUTH_REQUIRED: 'Cuenta requiere reautenticación',
  ADAPTER_MISMATCH: 'Formulario de Facebook cambió',
  APPROVAL_EXPIRED: 'Aprobación expirada',
  CANCELLED: 'Cancelada',
  FAILED: 'Error',
  NEEDS_REVIEW: 'Requiere revisión',
  VERIFICANDO: 'Verificando',
  RETRY_WAITING: 'Esperando reintento',
  HUMAN_INTERVENTION_REQUIRED: 'Requiere intervención humana',
}

const ETIQUETAS_PLATAFORMA: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  google: 'Google',
  website: 'Sitio web',
  portal: 'Portal',
}

function urlImagen(ruta: string) {
  if (ruta.startsWith('http')) return ruta
  return `${R2_PUBLIC_URL}/${ruta}`
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  if (valor === null || valor === undefined || valor === '') return null
  return (
    <div>
      <p className="text-xs text-slate-400">{etiqueta}</p>
      <p className="text-sm text-slate-700">{valor}</p>
    </div>
  )
}

export default async function DetallePropiedad({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: miPerfil } = user
    ? await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
    : { data: null }

  const { data: propiedad, error } = await supabase
    .from('propiedades')
    .select(
      `
      *,
      imagenes_propiedad (id, ruta_almacenamiento, es_portada, orden),
      propietario:contactos!contacto_propietario (nombre_completo, telefono, correo),
      capturador:perfiles!captado_por (nombre_completo, telefono),
      municipio:municipios (nombre),
      colega:colegas (nombre, telefono, inmobiliaria),
      ubicacion:ubicaciones (nombre, google_maps_url, waze_url, latitud, longitud)
    `
    )
    .eq('id', id)
    .single()

  if (error || !propiedad) {
    notFound()
  }

  const imagenes = [...(propiedad.imagenes_propiedad || [])].sort((a, b) => {
    if (a.es_portada && !b.es_portada) return -1
    if (!a.es_portada && b.es_portada) return 1
    return (a.orden ?? 0) - (b.orden ?? 0)
  })

  const requisitosRenta = propiedad.requisitos_renta
    ? REQUISITOS_RENTA[propiedad.requisitos_renta as CodigoRequisitosRenta]
    : null

  const { precioPrincipal, notaMantenimiento } = formatearPrecioRenta(
    propiedad.precio,
    propiedad.moneda,
    propiedad.mantenimiento,
    propiedad.tipo_operacion
  )

  const visibleEnPortal = propiedad.slug && ESTADOS_VISIBLES_PORTAL.includes(propiedad.estado)

  // La analítica de visitas solo se muestra a quien la RLS de
  // eventos_analitica ya permite ver (captador de la propiedad o admin).
  // Se decide aquí explícitamente en vez de confiar en el resultado de la
  // consulta, porque un agente sin permiso simplemente recibiría 0 filas
  // (no un error), lo que mostraría "0 visitas" en vez de ocultar el
  // bloque para quien no debe verlo.
  const puedeVerAnalitica =
    miPerfil?.rol === 'administrador' || (user && propiedad.captado_por === user.id)

  let analiticaInicial = null
  if (puedeVerAnalitica) {
    const hasta = new Date()
    hasta.setHours(23, 59, 59, 999)
    const desde = new Date()
    desde.setDate(desde.getDate() - 30)
    desde.setHours(0, 0, 0, 0)
    analiticaInicial = await obtenerAnaliticaVistas(propiedad.id, desde.toISOString(), hasta.toISOString())
  }

  // Motor de publicación multicanal: catálogo de canales activos y las
  // cuentas sociales READY que este usuario puede ver (la RLS de
  // cuentas_sociales ya limita a las propias o a todas si es admin).
  // No se cargan si la propiedad es no publicable: el botón no se muestra.
  const puedePublicarEnRedes = propiedad.publicable !== false
  const esAdmin = miPerfil?.rol === 'administrador'
  const canalesActivos = puedePublicarEnRedes ? await obtenerCanalesActivos() : []
  const cuentasPorPlataforma: Record<string, CuentaSocialLista[]> = {}
  if (canalesActivos.length > 0) {
    const plataformas = [
      ...new Set(canalesActivos.filter((c) => c.requiere_cuenta_social).map((c) => c.plataforma)),
    ]
    const listas = await Promise.all(
      plataformas.map((p) => obtenerCuentasSocialesListas(propiedad.organization_id, p))
    )
    plataformas.forEach((p, i) => {
      cuentasPorPlataforma[p] = listas[i]
    })
  }

  // Historial de envíos al motor de publicación (la RLS de trabajos_publicacion
  // ya limita a los del asesor, el captador de la propiedad o un admin).
  // Cada asesor ve solo sus envíos (y por tanto solo sus cuentas); el administrador ve todos.
  let consultaHistorial = supabase
    .from('trabajos_publicacion')
    .select(
      'id, estado, mensaje_error, creado_en, expira_en, cuenta_social_id, canal:canales_publicacion (nombre, plataforma), cuenta:cuentas_sociales (etiqueta)'
    )
    .eq('propiedad_id', propiedad.id)
  if (!esAdmin && user) consultaHistorial = consultaHistorial.eq('asesor_id', user.id)
  const { data: historialPublicaciones } = puedePublicarEnRedes
    ? await consultaHistorial.order('creado_en', { ascending: false }).limit(50)
    : { data: null }

  // Revisión humana: envíos que el Worker dejó llenos y esperando aprobación.
  // Si la RLS no deja leer contenido_publicacion o activos_publicacion, la
  // tarjeta lo indica en lugar de fallar.
  const revisionesPendientes: RevisionPendiente[] = []
  for (const t of (historialPublicaciones ?? []).filter((x) => x.estado === 'WAITING_APPROVAL')) {
    const { data: cont } = await supabase
      .from('contenido_publicacion')
      .select('titulo, precio, moneda, descripcion')
      .eq('trabajo_id', t.id)
      .order('version_contenido', { ascending: false })
      .limit(1)
      .maybeSingle()
    const { data: activos } = await supabase
      .from('activos_publicacion')
      .select('clave_almacenamiento, secuencia')
      .eq('trabajo_id', t.id)
      .eq('tipo_activo', 'photo')
      .order('secuencia', { ascending: true })
    const canalRev = Array.isArray(t.canal) ? t.canal[0] : t.canal
    revisionesPendientes.push({
      id: t.id,
      canalNombre: canalRev?.nombre ?? 'el canal',
      expiraEn: t.expira_en ?? null,
      titulo: cont?.titulo ?? null,
      precio: cont?.precio ?? null,
      moneda: cont?.moneda ?? null,
      descripcion: cont?.descripcion ?? null,
      fotos: (activos ?? []).map((a) => a.clave_almacenamiento as string),
    })
  }
  const hayEnviosActivos = (historialPublicaciones ?? []).some((x) =>
    ['QUEUED', 'PUBLICANDO', 'WAITING_APPROVAL', 'APPROVED'].includes(x.estado)
  )

  // El historial muestra solo lo publicado, más NEEDS_REVIEW (bloquea la propiedad y ahí vive el botón de liberar).
  // Los fallidos no se muestran; los envíos en curso se ven en el panel y en la tarjeta de aprobación.
  const historialVisible = (historialPublicaciones ?? [])
    .filter((x) => ['PUBLICADO', 'NEEDS_REVIEW'].includes(x.estado))
    .slice(0, 10)

  const hayInformacionPrivada =
    propiedad.modalidad_captacion ||
    propiedad.comision ||
    propiedad.hipoteca ||
    propiedad.valor_hipoteca ||
    propiedad.acceso ||
    propiedad.comentarios ||
    propiedad.propietario ||
    propiedad.capturador ||
    propiedad.colega ||
    propiedad.creado_en ||
    puedeVerAnalitica

  const ubicacion = propiedad.ubicacion
  const tieneCoordenadas = ubicacion?.latitud != null && ubicacion?.longitud != null

  const enlacePortal = `/propiedades/${propiedad.slug}`

  const ahora = new Date()
  const fechaIngreso = propiedad.creado_en ? new Date(propiedad.creado_en) : null
  const diasDesdeIngreso = fechaIngreso
    ? Math.floor((ahora.getTime() - fechaIngreso.getTime()) / (1000 * 60 * 60 * 24))
    : null
  const dentroDe30Dias = diasDesdeIngreso !== null && diasDesdeIngreso < 30
  const esVenta = propiedad.tipo_operacion === 'venta'
  const esDirecto = propiedad.modalidad_captacion === 'Directo'

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <Link
        href="/dashboard/propiedades"
        className="mb-4 inline-block text-sm text-slate-500 hover:text-[#38B6FF]"
      >
        ← Volver a propiedades
      </Link>

      {propiedad.publicable === false && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3">
          <Ban size={20} className="shrink-0 text-red-600" />
          <p className="text-sm font-bold text-red-700">
            No publicable — esta propiedad NO se puede compartir en redes sociales.
          </p>
        </div>
      )}

      {dentroDe30Dias && esVenta && esDirecto && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border-2 border-orange-300 bg-orange-50 px-4 py-3">
          <Ban size={20} className="shrink-0 text-orange-600" />
          <p className="text-sm font-bold text-orange-700">
            Período de exclusividad — esta propiedad no puede compartirse con otros colegas hasta {formatearFechaLargaGT(new Date(fechaIngreso!.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString())} (30 días desde su ingreso).
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <Galeria
            imagenes={imagenes.map((img) => ({
              id: img.id,
              url: urlImagen(img.ruta_almacenamiento),
            }))}
            titulo={propiedad.titulo}
          />

          {tieneCoordenadas && (
            <MapaUbicacion
              latitud={ubicacion.latitud}
              longitud={ubicacion.longitud}
              googleMapsUrl={ubicacion.google_maps_url}
              wazeUrl={ubicacion.waze_url}
            />
          )}
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                  coloresEstado[propiedad.estado] || 'bg-slate-100 text-slate-700'
                }`}
              >
                {propiedad.estado}
              </span>
              {propiedad.modalidad_captacion && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    coloresModalidad[propiedad.modalidad_captacion] || 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {propiedad.modalidad_captacion}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs uppercase text-slate-500">
              {propiedad.codigo && <span className="normal-case text-slate-400">{propiedad.codigo}</span>}
              <span>{propiedad.tipo_operacion}</span>
            </div>
          </div>

          <h1 className="text-xl font-bold text-[#2C3E50] sm:text-2xl">{propiedad.titulo}</h1>
          <p className="text-sm text-slate-500">
            {propiedad.direccion ? `${propiedad.direccion}, ` : ''}
            {propiedad.condominio ? `${propiedad.condominio}, ` : ''}
            {propiedad.sector ? `${propiedad.sector}, ` : ''}
            {propiedad.zona ? `${formatearZona(propiedad.zona)}, ` : ''}
            {propiedad.municipio?.nombre ? `${propiedad.municipio.nombre}, ` : ''}
            {propiedad.ciudad}
          </p>

          {visibleEnPortal ? (
            <Link
              href={enlacePortal}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#38B6FF] hover:underline"
            >
              <ExternalLink size={12} />
              Ver en portal público
            </Link>
          ) : null}

          <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-2xl font-bold text-[#2C3E50] sm:text-3xl">{precioPrincipal}</span>
            {notaMantenimiento && (
              <span className="text-sm font-semibold text-[#38B6FF]">{notaMantenimiento}</span>
            )}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:gap-3">
            <div className="rounded-lg border border-slate-200 py-3">
              <p className="text-lg font-semibold text-[#2C3E50]">
                {propiedad.dormitorios ?? '—'}
              </p>
              <p className="text-xs text-slate-500">Habitaciones</p>
            </div>
            <div className="rounded-lg border border-slate-200 py-3">
              <p className="text-lg font-semibold text-[#2C3E50]">
                {propiedad.banos ?? '—'}
              </p>
              <p className="text-xs text-slate-500">Baños</p>
            </div>
            <div className="rounded-lg border border-slate-200 py-3">
              <p className="text-lg font-semibold text-[#2C3E50]">
                {propiedad.area_construccion_m2 ?? '—'} m²
              </p>
              <p className="text-xs text-slate-500">Área</p>
            </div>
          </div>

          {propiedad.tipo_propiedad && (
            <p className="mt-4 text-sm text-slate-600">
              <span className="font-medium text-[#2C3E50]">Tipo: </span>
              {propiedad.tipo_propiedad}
            </p>
          )}

          {propiedad.descripcion && (
            <div className="mt-4">
              <h2 className="mb-1 font-semibold text-[#2C3E50]">Descripción</h2>
              <p className="whitespace-pre-line text-sm text-slate-600">
                {propiedad.descripcion}
              </p>
            </div>
          )}

          {/* ============================================================ */}
          {/* INFORMACION PUBLICA */}
          {/* ============================================================ */}
          <SeccionAreasYAmbientes propiedad={propiedad} className="mt-8" />

          {/* ============================================================ */}
          {/* REQUISITOS DE RENTA - antes de la información privada */}
          {/* ============================================================ */}
          {requisitosRenta && (
            <div className="mt-8">
              <DetalleRequisitosRenta paquete={requisitosRenta} />
            </div>
          )}

          {/* ============================================================ */}
          {/* INFORMACION PRIVADA - solo visible para agentes en el dashboard */}
          {/* Esta seccion NUNCA se expone en /propiedades/[slug] (portal publico) */}
          {/* ============================================================ */}
          {hayInformacionPrivada && (
            <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
                <Lock size={12} />
                Información privada — solo visible para agentes
              </h2>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Dato etiqueta="Modalidad de captación" valor={propiedad.modalidad_captacion} />
                <Dato etiqueta="Comisión" valor={propiedad.comision} />
                <Dato etiqueta="Hipoteca" valor={propiedad.hipoteca} />
                <Dato
                  etiqueta="Valor hipoteca"
                  valor={propiedad.valor_hipoteca ? Number(propiedad.valor_hipoteca).toLocaleString() : null}
                />
                <Dato etiqueta="Acceso coordinar con" valor={propiedad.acceso} />
                <Dato etiqueta="Publicada en el CRM" valor={formatearFechaLargaGT(propiedad.creado_en)} />
              </div>

              {(propiedad.propietario || propiedad.capturador || propiedad.colega) && (
                <div className="mt-3 space-y-1.5 border-t border-amber-200 pt-3">
                  {propiedad.propietario && (
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">Propietario: </span>
                      {propiedad.propietario.nombre_completo}
                      {propiedad.propietario.telefono && ` · ${propiedad.propietario.telefono}`}
                    </p>
                  )}
                  {propiedad.capturador && (
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">Captado por: </span>
                      {propiedad.capturador.nombre_completo}
                    </p>
                  )}
                  {propiedad.colega && (
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">Colega: </span>
                      {propiedad.colega.nombre}
                      {propiedad.colega.inmobiliaria && ` · ${propiedad.colega.inmobiliaria}`}
                      {propiedad.colega.telefono && ` · ${propiedad.colega.telefono}`}
                    </p>
                  )}
                </div>
              )}

              {propiedad.comentarios && (
                <div className="mt-3 border-t border-amber-200 pt-3">
                  <p className="mb-1 text-sm font-medium text-slate-700">Comentarios internos</p>
                  <p className="whitespace-pre-line text-sm text-slate-600">{propiedad.comentarios}</p>
                </div>
              )}

              {puedeVerAnalitica && analiticaInicial && (
                <AnaliticaPropiedad propiedadId={propiedad.id} datosIniciales={analiticaInicial} />
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <CompartirWhatsapp
              titulo={propiedad.titulo}
              precio={propiedad.precio}
              moneda={propiedad.moneda}
              zona={propiedad.zona}
              municipio={propiedad.municipio?.nombre ?? null}
              ciudad={propiedad.ciudad}
              dormitorios={propiedad.dormitorios}
              banos={propiedad.banos}
              slug={propiedad.slug}
              agenteId={user?.id ?? null}
            />
            <CompartirMarketplace
              titulo={propiedad.titulo}
              tipo_operacion={propiedad.tipo_operacion}
              tipo_propiedad={propiedad.tipo_propiedad}
              direccion={propiedad.direccion}
              condominio={propiedad.condominio}
              numero_casa={propiedad.numero_casa}
              sector={propiedad.sector}
              zona={propiedad.zona}
              ciudad={propiedad.ciudad}
              municipioNombre={propiedad.municipio?.nombre ?? null}
              niveles={propiedad.niveles}
              area_construccion_m2={propiedad.area_construccion_m2}
              area_terreno_m2={propiedad.area_terreno_m2}
              medidas_terreno={propiedad.medidas_terreno}
              dormitorios={propiedad.dormitorios}
              banos={propiedad.banos}
              sala={propiedad.sala}
              comedor={propiedad.comedor}
              cocina={propiedad.cocina}
              estudio={propiedad.estudio}
              sala_familiar={propiedad.sala_familiar}
              habitacion_servicio={propiedad.habitacion_servicio}
              lavanderia={propiedad.lavanderia}
              jardin={propiedad.jardin}
              bodega={propiedad.bodega}
              balcon={propiedad.balcon}
              parqueos={propiedad.parqueos}
              extras={propiedad.extras}
              precio={propiedad.precio}
              moneda={propiedad.moneda}
              iusi={propiedad.iusi}
              mantenimiento={propiedad.mantenimiento}
              mascota={propiedad.mascota}
              requisitos_renta={propiedad.requisitos_renta}
              codigo={propiedad.codigo}
              descripcion={propiedad.descripcion}
            />
            {puedePublicarEnRedes && canalesActivos.length > 0 && (
              <PublicarCanales
                propiedadId={propiedad.id}
                canalesActivos={canalesActivos}
                cuentasPorPlataforma={cuentasPorPlataforma}
              />
            )}
            <CambiarEstado
              propiedadId={propiedad.id}
              estadoActual={propiedad.estado}
              estados={ESTADOS}
            />
          </div>

          {(revisionesPendientes.length > 0 || hayEnviosActivos) && (
            <RevisionPublicacion
              propiedadId={propiedad.id}
              revisiones={revisionesPendientes}
              hayActivos={hayEnviosActivos}
            />
          )}

          {historialVisible.length > 0 && (
            <div className="mt-6 rounded-lg border border-slate-200 p-4">
              <h2 className="mb-2 text-sm font-semibold text-[#2C3E50]">Historial de publicaciones</h2>
              <ul className="space-y-2">
                {historialVisible.map((envio) => {
                  const canal = Array.isArray(envio.canal) ? envio.canal[0] : envio.canal
                  const cuenta = Array.isArray(envio.cuenta) ? envio.cuenta[0] : envio.cuenta
                  const etiqueta = ETIQUETAS_ENVIO[envio.estado] ?? envio.estado
                  return (
                    <li key={envio.id} className="border-b border-slate-100 pb-2 text-sm last:border-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-[#2C3E50]">{canal?.nombre ?? 'Canal'}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {etiqueta}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {ETIQUETAS_PLATAFORMA[canal?.plataforma ?? ''] ?? canal?.plataforma ?? ''}
                        {envio.cuenta_social_id ? ` · Cuenta: ${cuenta?.etiqueta ?? 'sin nombre'}` : ''}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(envio.creado_en).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}
                      </p>
                      {envio.mensaje_error && (
                        <p className="mt-1 text-xs text-slate-500">{envio.mensaje_error}</p>
                      )}
                      {esAdmin && ['PUBLICADO', 'NEEDS_REVIEW'].includes(envio.estado) && (
                        <LiberarEnvio trabajoId={envio.id} propiedadId={propiedad.id} estado={envio.estado} />
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
