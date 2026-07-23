import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { BedDouble, Bath, Ruler, MapPin, MessageCircle } from 'lucide-react'
import DetalleRequisitosRenta from '@/components/detalle-requisitos-renta'
import SeccionAreasYAmbientes from '@/components/seccion-areas-ambientes'
import Galeria from '@/app/dashboard/propiedades/[id]/galeria'
import { REQUISITOS_RENTA, type CodigoRequisitosRenta } from '@/app/dashboard/propiedades/requisitos-renta'

const R2_PUBLIC_URL = 'https://pub-55c4b2ef6141404ea53237416303a621.r2.dev'

function urlImagen(ruta: string) {
  if (ruta.startsWith('http')) return ruta
  return `${R2_PUBLIC_URL}/${ruta}`
}

function numeroWhatsapp(telefono: string | null | undefined) {
  if (!telefono) return null
  const soloDigitos = telefono.replace(/\D/g, '')
  if (soloDigitos.length === 8) return `502${soloDigitos}`
  return soloDigitos
}

async function obtenerPropiedad(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('propiedades')
    .select(
      `
      id, titulo, descripcion, tipo_operacion, tipo_propiedad, precio, moneda,
      zona, ciudad, dormitorios, banos, area_construccion_m2, area_terreno_m2, parqueos, slug, estado,
      requisitos_renta,
      niveles, numero_casa, medidas_terreno, extras, mantenimiento, iusi, mascota,
      sala, comedor, cocina, estudio, sala_familiar, habitacion_servicio, lavanderia, jardin,
      imagenes_propiedad (id, ruta_almacenamiento, es_portada, orden),
      municipio:municipios (nombre),
      capturador:perfiles!captado_por (nombre_completo, telefono)
    `
    )
    .eq('slug', slug)
    .in('estado', ['disponible', 'reservada'])
    .maybeSingle()
  return data as any
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const propiedad = await obtenerPropiedad(slug)
  if (!propiedad) return { title: 'Propiedad no encontrada — Monce Inmobiliaria' }

  const portada =
    propiedad.imagenes_propiedad?.find((img: any) => img.es_portada) ??
    propiedad.imagenes_propiedad?.[0]
  const imagenUrl = portada ? urlImagen(portada.ruta_almacenamiento) : undefined
  const descripcionCorta = `${propiedad.moneda} ${Number(propiedad.precio).toLocaleString()} · ${[
    propiedad.zona,
    propiedad.ciudad,
  ]
    .filter(Boolean)
    .join(', ')}`

  return {
    title: `${propiedad.titulo} — Monce Inmobiliaria`,
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
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const propiedad = await obtenerPropiedad(slug)
  if (!propiedad) notFound()

  const imagenes = [...(propiedad.imagenes_propiedad ?? [])].sort((a: any, b: any) => {
    if (a.es_portada && !b.es_portada) return -1
    if (!a.es_portada && b.es_portada) return 1
    return (a.orden ?? 0) - (b.orden ?? 0)
  })

  const requisitosRenta = propiedad.requisitos_renta
    ? REQUISITOS_RENTA[propiedad.requisitos_renta as CodigoRequisitosRenta]
    : null

  const numero = numeroWhatsapp(propiedad.capturador?.telefono)
  const enlacePropiedad = `${process.env.NEXT_PUBLIC_SITE_URL || ''}/propiedades/${propiedad.slug}`
  const mensajeWhatsapp = encodeURIComponent(
    `Hola, me interesa la propiedad "${propiedad.titulo}" (${enlacePropiedad})`
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <a href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-monce.png" alt="Monce Inmobiliaria" className="h-8 w-8 rounded" />
          <span className="text-sm font-semibold text-[#2C3E50]">Monce Inmobiliaria</span>
        </a>
      </header>

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
            {[propiedad.zona, propiedad.municipio?.nombre, propiedad.ciudad].filter(Boolean).join(', ')}
          </p>

          <p className="mt-3 text-3xl font-bold text-[#2C3E50]">
            {propiedad.moneda} {Number(propiedad.precio).toLocaleString()}
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

          {requisitosRenta && (
            <div className="mt-6">
              <DetalleRequisitosRenta paquete={requisitosRenta} />
            </div>
          )}

          {numero && (
            <a
              href={`https://wa.me/${numero}?text=${mensajeWhatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded bg-green-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <MessageCircle size={16} />
              Preguntar por esta propiedad
            </a>
          )}
        </div>
      </main>
    </div>
  )
}
