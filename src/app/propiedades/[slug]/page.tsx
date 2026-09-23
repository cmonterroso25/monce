import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { BedDouble, Bath, Ruler, MapPin } from 'lucide-react'
import DetalleRequisitosRenta from '@/components/detalle-requisitos-renta'
import SeccionAreasYAmbientes from '@/components/seccion-areas-ambientes'
import Galeria from '@/app/dashboard/propiedades/[id]/galeria'
import MapaUbicacion from '@/components/mapa-ubicacion'
import { REQUISITOS_RENTA, type CodigoRequisitosRenta } from '@/app/dashboard/propiedades/requisitos-renta'
import { formatearZona } from '@/lib/formato-zona'
import { formatearPrecioRenta } from '@/lib/formato-precio'
import { registrarVistaPublica } from '@/lib/analitica/registrar-vista'

const R2_PUBLIC_URL = 'https://pub-55c4b2ef6141404ea53237416303a621.r2.dev'

function urlImagen(ruta: string) {
  if (ruta.startsWith('http')) return ruta
  return `${R2_PUBLIC_URL}/${ruta}`
}

// Ficha pública sin marca ni contacto directo: se removió el logo/nombre
// de la inmobiliaria y el botón de WhatsApp hacia el agente/organización
// a propósito, para que agentes de OTRAS inmobiliarias puedan compartir
// este enlace (modalidad "Compartida") sin que el cliente termine
// contactando directamente a esta organización en vez de a ellos.
async function obtenerPropiedad(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('propiedades')
    .select(
      `
      id, titulo, descripcion, tipo_operacion, tipo_propiedad, precio, moneda,
      zona, ciudad, dormitorios, banos, area_construccion_m2, area_terreno_m2, parqueos, slug, estado,
      requisitos_renta, organization_id,
      niveles, numero_casa, medidas_terreno, extras, mantenimiento, iusi, mascota,
      sala, comedor, cocina, estudio, sala_familiar, habitacion_servicio, lavanderia, jardin,
      bodega, balcon, amenidades,
      imagenes_propiedad (id, ruta_almacenamiento, es_portada, orden),
      municipio:municipios (nombre),
      ubicacion:ubicaciones (nombre, google_maps_url, waze_url, latitud, longitud)
    `
    )
    .eq('slug', slug)
    .in('estado', ['disponible', 'reservada'])
    .maybeSingle()

  if (!data) return null

  return data as any
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const propiedad = await obtenerPropiedad(slug)
  if (!propiedad) return { title: 'Propiedad no encontrada' }

  const portada =
    propiedad.imagenes_propiedad?.find((img: any) => img.es_portada) ??
    propiedad.imagenes_propiedad?.[0]
  const imagenUrl = portada ? urlImagen(portada.ruta_almacenamiento) : undefined
  const descripcionCorta = `${propiedad.moneda} ${Number(propiedad.precio).toLocaleString()} · ${[
    formatearZona(propiedad.zona),
    propiedad.ciudad,
  ]
    .filter(Boolean)
    .join(', ')}`

  return {
    title: propiedad.titulo,
    description: descripcionCorta,
    openGraph: {
      title: propiedad.titulo,
      description: descripcionCorta,
      images: imagenUrl ? [{ url: imagenUrl }] : [],
      type: 'website',
    },
  }
}

export default async function PropiedadPublica({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ agente?: string }>
}) {
  const { slug } = await params
  const { agente } = await searchParams
  const propiedad = await obtenerPropiedad(slug)
  if (!propiedad) notFound()

  // Registro de analítica de tráfico (no bloqueante): se dispara en cada
  // carga de la ficha pública, con el agente atribuido si vino de un
  // enlace compartido (?agente=<id>). Ver registrarVistaPublica: nunca
  // lanza, así que un fallo aquí no puede romper el render de la página.
  await registrarVistaPublica(propiedad.id, propiedad.organization_id, agente ?? null)

  const imagenes = [...(propiedad.imagenes_propiedad ?? [])].sort((a: any, b: any) => {
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

  const ubicacion = propiedad.ubicacion
  const tieneCoordenadas = ubicacion?.latitud != null && ubicacion?.longitud != null

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl p-6">
        <div className="mb-6">
          <Galeria
            imagenes={imagenes.map((img: any) => ({
              id: img.id,
              url: urlImagen(img.ruta_almacenamiento),
            }))}
            titulo={propiedad.titulo}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <span className="mb-2 inline-block rounded-full bg-[#38B6FF]/10 px-3 py-1 text-xs font-medium uppercase text-[#38B6FF]">
            {propiedad.tipo_operacion}
          </span>
          <h1 className="text-2xl font-bold text-[#2C3E50]">{propiedad.titulo}</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
            <MapPin size={14} />
            {[formatearZona(propiedad.zona), propiedad.municipio?.nombre, propiedad.ciudad].filter(Boolean).join(', ')}
          </p>

          <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-3xl font-bold text-[#2C3E50]">{precioPrincipal}</span>
            {notaMantenimiento && (
              <span className="text-sm font-semibold text-[#38B6FF]">{notaMantenimiento}</span>
            )}
          </p>

          <div className="mt-4 flex gap-6 text-sm text-slate-600">
            <span className="flex items-center gap-1">
              <BedDouble size={16} className="text-slate-400" /> {propiedad.dormitorios ?? '—'} hab
            </span>
            <span className="flex items-center gap-1">
              <Bath size={16} className="text-slate-400" /> {propiedad.banos ?? '—'} baños
            </span>
            <span className="flex items-center gap-1">
              <Ruler size={16} className="text-slate-400" /> {propiedad.area_construccion_m2 ?? '—'} m² construcción
            </span>
            {propiedad.area_terreno_m2 && (
              <span className="flex items-center gap-1">
                <Ruler size={16} className="text-slate-400" /> {propiedad.area_terreno_m2} m² terreno
              </span>
            )}
          </div>

          {propiedad.descripcion && (
            <p className="mt-5 whitespace-pre-line text-sm text-slate-600">{propiedad.descripcion}</p>
          )}

          <SeccionAreasYAmbientes propiedad={propiedad} titulo="Detalles de propiedad" className="mt-6" />

          {tieneCoordenadas && (
            <div className="mt-6">
              <MapaUbicacion
                latitud={ubicacion.latitud}
                longitud={ubicacion.longitud}
                googleMapsUrl={ubicacion.google_maps_url}
                wazeUrl={ubicacion.waze_url}
              />
            </div>
          )}

          {requisitosRenta && (
            <div className="mt-6">
              <DetalleRequisitosRenta paquete={requisitosRenta} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
