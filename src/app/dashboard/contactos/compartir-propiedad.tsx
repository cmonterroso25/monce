'use client'
import { useState } from 'react'
import { MessageCircle, Send, AtSign, Music2 } from 'lucide-react'
import { urlSitio } from '@/lib/url'
type Plataforma = 'messenger' | 'instagram' | 'tiktok'
const ETIQUETAS_PLATAFORMA: Record<Plataforma, string> = {
  messenger: 'Messenger',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}
function numeroWhatsapp(telefono: string | null | undefined) {
  if (!telefono) return null
  const digitos = telefono.replace(/\D/g, '')
  if (digitos.length === 8) return `502${digitos}`
  return digitos
}
export function CompartirPropiedad({
  slug,
  titulo,
  precio,
  moneda,
  zona,
  municipio,
  ciudad,
  dormitorios,
  banos,
  telefonoContacto,
}: {
  slug: string
  titulo: string
  precio?: number | null
  moneda?: string | null
  zona?: string | null
  municipio?: string | null
  ciudad?: string | null
  dormitorios?: number | null
  banos?: number | null
  telefonoContacto?: string | null
}) {
  const [copiado, setCopiado] = useState<Plataforma | 'error' | null>(null)
  const enlace = urlSitio(`/propiedades/${slug}`)
  const numero = numeroWhatsapp(telefonoContacto)

  function generarMensaje() {
    const ubicacion = [zona, municipio, ciudad].filter(Boolean).join(', ')
    const bloques = [
      `🏠 *${titulo}*`,
      precio ? `${moneda} ${Number(precio).toLocaleString()}` : null,
      ubicacion && `📍 ${ubicacion}`,
      (dormitorios || banos) &&
        `🛏️ ${dormitorios ?? '—'} hab  🛁 ${banos ?? '—'} baños`,
    ].filter(Boolean)

    let mensaje = bloques.join('\n\n')
    mensaje += `\n\n${enlace}`
    return mensaje
  }

  function compartirWhatsapp() {
    const mensaje = encodeURIComponent(generarMensaje())
    const url = numero ? `https://wa.me/${numero}?text=${mensaje}` : `https://wa.me/?text=${mensaje}`
    window.open(url, '_blank')
  }
  async function copiarLink(app: Plataforma) {
    try {
      await navigator.clipboard.writeText(enlace)
      setCopiado(app)
      setTimeout(() => setCopiado(null), 3500)
    } catch {
      setCopiado('error')
      setTimeout(() => setCopiado(null), 3500)
    }
  }
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={compartirWhatsapp}
        title={numero ? `Enviar por WhatsApp a ${telefonoContacto}` : 'Compartir por WhatsApp'}
        className="rounded p-1.5 text-green-600 transition-colors hover:bg-green-50"
      >
        <MessageCircle size={15} />
      </button>
      <button
        type="button"
        onClick={() => copiarLink('messenger')}
        title="Messenger no permite prellenar mensajes desde computadora: esto copia el link para pegarlo manualmente"
        className="rounded p-1.5 text-blue-600 transition-colors hover:bg-blue-50"
      >
        <Send size={15} />
      </button>
      <button
        type="button"
        onClick={() => copiarLink('instagram')}
        title="Instagram no permite prellenar mensajes: esto copia el link para pegarlo manualmente"
        className="rounded p-1.5 text-pink-600 transition-colors hover:bg-pink-50"
      >
        <AtSign size={15} />
      </button>
      <button
        type="button"
        onClick={() => copiarLink('tiktok')}
        title="TikTok no permite prellenar mensajes: esto copia el link para pegarlo manualmente"
        className="rounded p-1.5 text-slate-800 transition-colors hover:bg-slate-100"
      >
        <Music2 size={15} />
      </button>
      {copiado && copiado !== 'error' && (
        <span className="text-[10px] text-slate-400">
          Enlace copiado — pégalo en {ETIQUETAS_PLATAFORMA[copiado]} manualmente
        </span>
      )}
      {copiado === 'error' && (
        <span className="text-[10px] text-red-500">No se pudo copiar el enlace</span>
      )}
    </div>
  )
}
