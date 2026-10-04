'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { listarEnviosEnCurso, type EnvioEnCurso } from './propiedades/envios-en-curso'

const ETIQUETAS: Record<string, string> = {
  QUEUED: 'En cola',
  PUBLICANDO: 'Publicando…',
  WAITING_APPROVAL: 'Esperando tu aprobación',
  APPROVED: 'Aprobada, publicando…',
}

// Consulta los envíos en curso cada 8 s (solo con la pestaña visible), al volver a la pestaña
// y al cambiar de pantalla.
export function useEnviosEnCurso(): EnvioEnCurso[] {
  const pathname = usePathname()
  const [envios, setEnvios] = useState<EnvioEnCurso[]>([])

  useEffect(() => {
    let activo = true
    async function cargar() {
      if (document.visibilityState === 'hidden') return
      try {
        const r = await listarEnviosEnCurso()
        if (activo) setEnvios(r)
      } catch {
        // Un fallo de red momentáneo no debe romper el sidebar.
      }
    }
    void cargar()
    const t = setInterval(() => void cargar(), 8000)
    const alVolver = () => {
      if (document.visibilityState === 'visible') void cargar()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      activo = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [pathname])

  return envios
}

export function PanelEnviosEnCurso({
  envios,
  onNavegar,
}: {
  envios: EnvioEnCurso[]
  onNavegar: () => void
}) {
  if (envios.length === 0) return null
  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/50">
        Publicaciones en curso
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {envios.map((e) => {
          const espera = e.estado === 'WAITING_APPROVAL'
          return (
            <li key={e.id}>
              <Link
                href={`/dashboard/propiedades/${e.propiedadId}`}
                onClick={onNavegar}
                className={`block rounded-md px-2 py-1.5 text-xs ${
                  espera ? 'bg-amber-400 text-[#2C3E50]' : 'bg-white/10 text-white/85 hover:bg-white/20'
                }`}
              >
                <span className="block truncate font-semibold">
                  {e.codigo ?? 'Propiedad'}
                  {e.titulo ? ` · ${e.titulo}` : ''}
                </span>
                <span className="block truncate opacity-80">
                  {e.canal ?? 'Canal'}
                  {e.cuenta ? ` · ${e.cuenta}` : ''}
                </span>
                <span className="block font-medium">{ETIQUETAS[e.estado] ?? e.estado}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
