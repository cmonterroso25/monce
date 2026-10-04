'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Unlock } from 'lucide-react'
import { liberarEnvioPublicacion } from './acciones'

type Props = { trabajoId: string; propiedadId: string; estado: string }

export default function LiberarEnvio({ trabajoId, propiedadId, estado }: Props) {
  const router = useRouter()
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const publicado = estado === 'PUBLICADO'
  const etiqueta = publicado ? 'Ya retiré el anuncio: liberar propiedad' : 'No existe anuncio: liberar propiedad'
  const confirmacion = publicado
    ? 'Confirma que ya retiraste este anuncio de Facebook (Tus publicaciones). El envío se BORRARÁ del historial y la propiedad quedará libre para volver a publicarse. ¿Continuar?'
    : 'Confirma que revisaste Tus publicaciones en Facebook y que NO existe un anuncio de esta propiedad. El envío se BORRARÁ del historial y la propiedad quedará libre para volver a publicarse. ¿Continuar?'

  async function liberar() {
    if (!window.confirm(confirmacion)) return
    setProcesando(true)
    setMensaje(null)
    const r = await liberarEnvioPublicacion(trabajoId, propiedadId)
    setProcesando(false)
    if (!r.ok) {
      setMensaje(r.mensaje)
      return
    }
    if (r.aviso) setMensaje(r.aviso)
    router.refresh()
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={liberar}
        disabled={procesando}
        className="flex items-center gap-1.5 rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {procesando ? <Loader2 size={12} className="animate-spin" /> : <Unlock size={12} />}
        {etiqueta}
      </button>
      {mensaje && <p className="mt-1 text-xs text-red-600">{mensaje}</p>}
    </div>
  )
}
