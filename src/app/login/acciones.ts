'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function iniciarSesion(formData: FormData) {
  const supabase = await createClient()

  const correo = formData.get('correo') as string
  const contrasena = formData.get('contrasena') as string

  const { error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: contrasena,
  })

  if (error) {
    redirect(`/login?error=${encodeURIComponent('Correo o contraseña incorrectos')}`)
  }

  redirect('/dashboard')
}
