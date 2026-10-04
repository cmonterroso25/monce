'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Refresca el listado cada 8 s (solo con la pestaña visible) mientras haya publicaciones en curso.
export default function RefrescarSiEnCurso({ activo }: { activo: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!activo) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 8000)
    return () => clearInterval(t)
  }, [activo, router])
  return null
}
