import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Lock, ExternalLink } from 'lucide-react'
import Galeria from './galeria'
import CompartirWhatsapp from './compartir-whatsapp'
import CompartirMarketplace from './compartir-marketplace'
import CambiarEstado from './cambiar-estado'
import DetalleRequisitosRenta from '@/components/detalle-requisitos-renta'
import SeccionAreasYAmbientes from '@/components/seccion-areas-ambientes'
import { REQUISITOS_RENTA, type CodigoRequisitosRenta } from '../requisitos-renta'

const R2_PUBLIC_URL = 'https://pub-55c4b2ef6141404ea53237416303a621.r2.dev'

const coloresEstado: Record<string, string> = {
  disponible: 'bg-green-100 text-green-700',
  reservada: 'bg-yellow-100 text-yellow-700',
  vendida: 'bg-slate-200 text-slate-700',
  rentada: 'bg-blue-100 text-blue-700',
  inactiva: 'bg-red-100 text-red-700',
}

const ESTADOS = ['disponible', 'reservada', 'vendida', 'rentada', 'inactiva']
const ESTADOS_VISIBLES_PORTAL = ['disponible', 'reservada']

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

  const { data: propiedad, error } = await supabase
    .from('propiedades')
    .select(
      `
      *,
      imagenes_propiedad (id, ruta_almacenamiento, es_portada, orden),
      propietario:contactos!contacto_propietario (nombre_completo, telefono, correo),
      capturador:perfiles!captado_por (nombre_completo, telefono),
      municipio:municipios (nombre),
      colega:colegas (nombre, telefono, inmobiliaria)
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

  const visibleEnPortal = propiedad.slug && ESTADOS_VISIBLES_PORTAL.includes(propiedad.estado)

  const hayInformacionPrivada =
    propiedad.modalidad_captacion ||
    propiedad.comision ||
    propiedad.hipoteca ||
    propiedad.valor_hipoteca ||
    propiedad.acceso ||
    propiedad.comentarios ||
    propiedad.propietario ||
    propiedad.capturador ||
    propiedad.colega

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <Link
        href="/dashboard/propiedades"
        className="mb-4 inline-block text-sm text-slate-500 hover:text-[#38B6FF]"
      >
        ← Volver a propiedades
      </Link>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Galeria
          imagenes={imagenes.map((img) => ({
            id: img.id,
            url: urlImagen(img.ruta_almacenamiento),
          }))}
          titulo={propiedad.titulo}
        />

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                coloresEstado[propiedad.estado] || 'bg-slate-100 text-slate-700'
              }`}
            >
              {propiedad.estado}
            </span>
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
            {propiedad.zona ? `${propiedad.zona}, ` : ''}
            {propiedad.municipio?.nombre ? `${propiedad.municipio.nombre}, ` : ''}
            {propiedad.ciudad}
          </p>

          {visibleEnPortal && (
            <a
              href={`/propiedades/${propiedad.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#38B6FF] hover:underline"
            >
              <ExternalLink size={12} />
              Ver en portal público
            </a>
          )}

          <p className="mt-3 text-2xl font-bold text-[#2C3E50] sm:text-3xl">
            {propiedad.moneda} {Number(propiedad.precio).toLocaleString()}
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
            />
            <CompartirMarketplace
              titulo={propiedad.titulo}
              tipo_operacion={propiedad.tipo_operacion}
              tipo_propiedad={propiedad.tipo_propiedad}
              condominio={propiedad.condominio}
              sector={propiedad.sector}
              zona={propiedad.zona}
              ciudad={propiedad.ciudad}
              municipioNombre={propiedad.municipio?.nombre ?? null}
              area_construccion_m2={propiedad.area_construccion_m2}
              area_terreno_m2={propiedad.area_terreno_m2}
              dormitorios={propiedad.dormitorios}
              banos={propiedad.banos}
              sala_familiar={propiedad.sala_familiar}
              habitacion_servicio={propiedad.habitacion_servicio}
              lavanderia={propiedad.lavanderia}
              jardin={propiedad.jardin}
              parqueos={propiedad.parqueos}
              extras={propiedad.extras}
              precio={propiedad.precio}
              moneda={propiedad.moneda}
              iusi={propiedad.iusi}
              mantenimiento={propiedad.mantenimiento}
              mascota={propiedad.mascota}
              requisitos_renta={propiedad.requisitos_renta}
            />
            <CambiarEstado
              propiedadId={propiedad.id}
              estadoActual={propiedad.estado}
              estados={ESTADOS}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
