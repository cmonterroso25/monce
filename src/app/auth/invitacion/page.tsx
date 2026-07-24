'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ProcesarInvitacion() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function procesar() {
      const hash = window.location.hash.substring(1) // quita el '#'
      const params = new URLSearchParams(hash)

      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (!accessToken || !refreshToken) {
        setError('No se pudo procesar la invitación')
        return
      }

      const supabase = createClient()
      const { error: errorSesion } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (errorSesion) {
        console.error('--- ERROR AL ESTABLECER SESION DE INVITACION ---', errorSesion)
        setError('No se pudo procesar la invitación')
        return
      }

      router.replace('/auth/establecer-contrasena')
    }

    procesar()
  }, [router])

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-8 text-center">
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-8 text-center">
      <p className="text-sm text-slate-500">Procesando tu invitación...</p>
    </div>
  )
}
