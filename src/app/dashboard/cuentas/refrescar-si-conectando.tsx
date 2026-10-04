'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Refresca la pantalla cada 4 s mientras alguna cuenta se está conectando.
export default function RefrescarSiConectando({ activo }: { activo: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!activo) return
    const t = setInterval(() => router.refresh(), 4000)
    return () => clearInterval(t)
  }, [activo, router])
  return null
}
