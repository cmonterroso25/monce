import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Galeria from './galeria'
import CompartirWhatsapp from './compartir-whatsapp'
import CambiarEstado from './cambiar-estado'

const R2_PUBLIC_URL = 'https://pub-55c4b2ef6141404ea53237416303a621.r2.dev'

const coloresEstado: Record<string, string> = {
  disponible: 'bg-green-100 text-green-700',
  reservada: 'bg-yellow-100 text-yellow-700',
  vendida: 'bg-slate-200 text-slate-700',
  rentada: 'bg-blue-100 text-blue-700',
  inactiva: 'bg-red-100 text-red-700',
}

const ESTADOS = ['disponible', 'reservada', 'vendida', 'rentada', 'inactiva']

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

  const amenidades = [
    ['Sala', propiedad.sala],
    ['Comedor', propiedad.comedor],
    ['Cocina', propiedad.cocina],
    ['Estudio', propiedad.estudio],
    ['Sala familiar', propiedad.sala_familiar],
    ['Habitación de servicio', propiedad.habitacion_servicio],
    ['Lavandería', propiedad.lavanderia],
    ['Jardín', propiedad.jardin],
  ].filter(([, valor]) => valor)

  return (
    <div className="mx-auto max-w-5xl p-8">
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
          <div className="mb-2 flex items-center justify-between">
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

          <h1 className="text-2xl font-bold text-[#2C3E50]">{propiedad.titulo}</h1>
          <p className="text-sm text-slate-500">
            {propiedad.direccion ? `${propiedad.direccion}, ` : ''}
            {propiedad.condominio ? `${propiedad.condominio}, ` : ''}
            {propiedad.sector ? `${propiedad.sector}, ` : ''}
            {propiedad.zona ? `${propiedad.zona}, ` : ''}
            {propiedad.municipio?.nombre ? `${propiedad.municipio.nombre}, ` : ''}
            {propiedad.ciudad}
          </p>

          <p className="mt-3 text-3xl font-bold text-[#2C3E50]">
            {propiedad.moneda} {Number(propiedad.precio).toLocaleString()}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
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
                {propiedad.area_m2 ?? '—'} m²
              </p>
              <p className="text-xs text-slate-500">Área</p>
            </div>
          </div>

          {propiedad.tipo_propiedad && (
            <p className="mt-4 text-sm text-slate-600">
              <span className="font-medium text-[#2C3E50]">Tipo: </span>
              {propiedad.tipo_propiedad}
              {propiedad.modalidad_captacion && ` · ${propiedad.modalidad_captacion}`}
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

          {/* Areas */}
          <div className="mt-6">
            <h2 className="mb-2 font-semibold text-[#2C3E50]">Areas</h2>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-3">
              <Dato etiqueta="Niveles" valor={propiedad.niveles} />
              <Dato etiqueta="Parqueos" valor={propiedad.parqueos} />
              <Dato etiqueta="Número de casa" valor={propiedad.numero_casa} />
              <Dato etiqueta="M² construcción" valor={propiedad.area_construccion_m2} />
              <Dato etiqueta="M² terreno" valor={propiedad.area_terreno_m2} />
              <Dato etiqueta="Medidas del terreno" valor={propiedad.medidas_terreno} />
              <Dato etiqueta="Extras" valor={propiedad.extras} />
            </div>
          </div>

          {amenidades.length > 0 && (
            <div className="mt-4">
              <h2 className="mb-2 font-semibold text-[#2C3E50]">Ambientes</h2>
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-3">
                {amenidades.map(([etiqueta, valor]) => (
                  <Dato key={etiqueta as string} etiqueta={etiqueta as string} valor={valor as string} />
                ))}
              </div>
            </div>
          )}

          {/* Datos financieros */}
          <div className="mt-4">
            <h2 className="mb-2 font-semibold text-[#2C3E50]">Datos financieros</h2>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-3">
              <Dato
                etiqueta="Mantenimiento"
                valor={propiedad.mantenimiento ? Number(propiedad.mantenimiento).toLocaleString() : null}
              />
              <Dato etiqueta="IUSI" valor={propiedad.iusi ? Number(propiedad.iusi).toLocaleString() : null} />
              <Dato etiqueta="Comisión" valor={propiedad.comision ? Number(propiedad.comision).toLocaleString() : null} />
              <Dato etiqueta="Hipoteca" valor={propiedad.hipoteca} />
              <Dato etiqueta="Mascota" valor={propiedad.mascota} />
              <Dato etiqueta="Acceso" valor={propiedad.acceso} />
            </div>
          </div>

          {propiedad.comentarios && (
            <div className="mt-4">
              <h2 className="mb-1 font-semibold text-[#2C3E50]">Comentarios internos</h2>
              <p className="whitespace-pre-line text-sm text-slate-600">
                {propiedad.comentarios}
              </p>
            </div>
          )}

          {/* Personas involucradas */}
          {(propiedad.propietario || propiedad.capturador || propiedad.colega) && (
            <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-4">
              {propiedad.propietario && (
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-[#2C3E50]">Propietario: </span>
                  {propiedad.propietario.nombre_completo}
                  {propiedad.propietario.telefono && ` · ${propiedad.propietario.telefono}`}
                </p>
              )}
              {propiedad.capturador && (
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-[#2C3E50]">Captado por: </span>
                  {propiedad.capturador.nombre_completo}
                </p>
              )}
              {propiedad.colega && (
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-[#2C3E50]">Colega: </span>
                  {propiedad.colega.nombre}
                  {propiedad.colega.inmobiliaria && ` · ${propiedad.colega.inmobiliaria}`}
                  {propiedad.colega.telefono && ` · ${propiedad.colega.telefono}`}
                </p>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <CompartirWhatsapp
              titulo={propiedad.titulo}
              precio={propiedad.precio}
              moneda={propiedad.moneda}
              zona={propiedad.zona}
              ciudad={propiedad.ciudad}
              dormitorios={propiedad.dormitorios}
              banos={propiedad.banos}
              slug={propiedad.slug}
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
