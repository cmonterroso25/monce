'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function registrarUsuario(formData: FormData) {
  const supabase = await createClient()

  const correo = formData.get('correo') as string
  const contrasena = formData.get('contrasena') as string
  const nombreCompleto = formData.get('nombre_completo') as string

  const { error } = await supabase.auth.signUp({
    email: correo,
    password: contrasena,
    options: {
      data: {
        nombre_completo: nombreCompleto,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirmar`,
    },
  })

  if (error) {
    console.error('--- ERROR DE REGISTRO ---')
    console.error('Mensaje:', error.message)
    console.error('Codigo:', error.status)
    console.error('Objeto completo:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
    redirect(`/registro?error=${encodeURIComponent(error.message || 'Error desconocido')}`)
  }

  redirect('/registro/revisa-tu-correo')
}
