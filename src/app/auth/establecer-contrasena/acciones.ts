'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function establecerContrasena(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?error=Tu sesión de invitación expiró, pide que te reenvíen la invitación')
  }

  const contrasena = formData.get('contrasena') as string
  const confirmarContrasena = formData.get('confirmar_contrasena') as string

  if (contrasena.length < 6) {
    redirect(
      `/auth/establecer-contrasena?error=${encodeURIComponent('La contraseña debe tener al menos 6 caracteres')}`
    )
  }

  if (contrasena !== confirmarContrasena) {
    redirect(
      `/auth/establecer-contrasena?error=${encodeURIComponent('Las contraseñas no coinciden')}`
    )
  }

  const { error } = await supabase.auth.updateUser({ password: contrasena })

  if (error) {
    console.error('--- ERROR AL ESTABLECER CONTRASEÑA ---', error)
    redirect(`/auth/establecer-contrasena?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/dashboard')
}
