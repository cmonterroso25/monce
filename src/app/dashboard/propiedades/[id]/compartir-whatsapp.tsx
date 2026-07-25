'use client'

import { urlSitio } from '@/lib/url'

export default function CompartirWhatsapp({
  titulo,
  precio,
  moneda,
  zona,
  ciudad,
  dormitorios,
  banos,
  slug,
}: {
  titulo: string
  precio: number
  moneda: string
  zona: string | null
  ciudad: string | null
  dormitorios: number | null
  banos: number | null
  slug: string | null
}) {
  function generarMensaje() {
    const ubicacion = [zona, ciudad].filter(Boolean).join(', ')
    const enlace = slug ? urlSitio(`/propiedades/${slug}`) : ''

    const lineas = [
      `*${titulo}*`,
      `${moneda} ${Number(precio).toLocaleString()}`,
      ubicacion && `📍 ${ubicacion}`,
      (dormitorios || banos) &&
        `🛏️ ${dormitorios ?? '—'} hab  🛁 ${banos ?? '—'} baños`,
    ].filter(Boolean)

    let mensaje = lineas.join('\n')
    if (enlace) {
      mensaje += `\n\n${enlace}`
    }
    return mensaje
  }

  function compartir() {
    const mensaje = encodeURIComponent(generarMensaje())
    window.open(`https://wa.me/?text=${mensaje}`, '_blank')
  }

  return (
    <button
      onClick={compartir}
      className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
    >
      Compartir por WhatsApp
    </button>
  )
}
