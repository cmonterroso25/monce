'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { aprobarPublicacion, rechazarPublicacion } from './acciones'

export type RevisionPendiente = {
  id: string
  canalNombre: string
  expiraEn: string | null
  titulo: string | null
  precio: number | null
  moneda: string | null
  descripcion: string | null
  fotos: string[]
}

type Props = {
  propiedadId: string
  revisiones: RevisionPendiente[]
  hayActivos: boolean
}

function tiempoRestante(expiraEn: string | null, ahora: number): string {
  if (!expiraEn) return ''
  const seg = Math.max(0, Math.floor((new Date(expiraEn).getTime() - ahora) / 1000))
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`
}

export default function RevisionPublicacion({ propiedadId, revisiones, hayActivos }: Props) {
  const router = useRouter()
  const [procesando, setProcesando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    if (!hayActivos) return
    let n = 0
    const t = setInterval(() => {
      n += 1
      setAhora(Date.now())
      if (n % 8 === 0) router.refresh()
    }, 1000)
    return () => clearInterval(t)
  }, [hayActivos, router])

  async function decidir(id: string, accion: 'aprobar' | 'rechazar') {
    if (
      accion === 'aprobar' &&
      !window.confirm('Se publicará en Facebook Marketplace de inmediato, con la cuenta seleccionada. ¿Confirmas?')
    ) {
      return
    }
    setProcesando(id)
    setError(null)
    const r = accion === 'aprobar' ? await aprobarPublicacion(id, propiedadId) : await rechazarPublicacion(id, propiedadId)
    setProcesando(null)
    if (!r.ok) setError(r.mensaje)
    else router.refresh()
  }

  return (
    <div className="mt-6 space-y-4">
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {revisiones.length === 0 && (
        <p className="rounded border border-slate-200 p-3 text-xs text-slate-500">
          Hay envíos en curso. Esta sección se actualiza sola.
        </p>
      )}

      {revisiones.map((r) => (
        <div key={r.id} className="rounded-lg border-2 border-amber-300 bg-amber-50/60 p-4">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <ShieldCheck size={16} />
            Revisa antes de publicar en {r.canalNombre}
          </h2>
          <p className="mb-3 text-xs text-amber-700">
            El formulario ya está lleno y esperando. Al aprobar se publicará de inmediato.
            {r.expiraEn ? ` Tiempo para decidir: ${tiempoRestante(r.expiraEn, ahora)}` : ''}
          </p>

          {r.titulo === null ? (
            <p className="text-sm text-slate-600">No se pudo leer el contenido de este envío desde el CRM.</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-[#2C3E50]">{r.titulo}</p>
              {r.precio !== null && (
                <p className="text-sm text-slate-700">
                  {r.moneda ?? ''} {Number(r.precio).toLocaleString('es-GT')}
                </p>
              )}
              <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line rounded bg-white p-2 text-xs text-slate-600">
                {r.descripcion}
              </p>
              {r.fotos.length > 0 && (
                <div className="mt-2 flex gap-1 overflow-x-auto">
                  {r.fotos.map((url) => (
                    <img key={url} src={url} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
                  ))}
                </div>
              )}
            </>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={procesando !== null}
              onClick={() => decidir(r.id, 'aprobar')}
              className="flex flex-1 items-center justify-center gap-2 rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {procesando === r.id && <Loader2 size={14} className="animate-spin" />}
              Aprobar y publicar
            </button>
            <button
              type="button"
              disabled={procesando !== null}
              onClick={() => decidir(r.id, 'rechazar')}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Rechazar
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
