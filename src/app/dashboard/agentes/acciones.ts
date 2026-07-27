'use server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function textoOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  return valor as string
}

export async function actualizarAgente(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const agenteId = formData.get('agente_id') as string

  // Verificación explícita de rol: no depender solo de RLS, ya que el
  // cambio de correo más abajo usa supabaseAdmin (service_role), que
  // bypasea RLS por completo.
  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (miPerfil?.rol !== 'administrador') {
    redirect(`/dashboard/agentes/${agenteId}/editar?error=${encodeURIComponent('Solo un administrador puede editar agentes.')}`)
  }

  const nuevoCorreo = textoOpcional(formData.get('correo'))

  if (nuevoCorreo) {
    const { data: usuarioActual } = await supabaseAdmin.auth.admin.getUserById(agenteId)
    if (usuarioActual?.user?.email !== nuevoCorreo) {
      const { error: errorCorreo } = await supabaseAdmin.auth.admin.updateUserById(agenteId, {
        email: nuevoCorreo,
      })
      if (errorCorreo) {
        console.error('--- ERROR AL ACTUALIZAR CORREO ---', errorCorreo)
        redirect(`/dashboard/agentes/${agenteId}/editar?error=${encodeURIComponent(errorCorreo.message)}`)
      }
    }
  }

  const { error } = await supabase
    .from('perfiles')
    .update({
      nombre_completo: formData.get('nombre_completo') as string,
      telefono: textoOpcional(formData.get('telefono')),
      rol: formData.get('rol') as string,
      activo: formData.get('activo') === 'true',
    })
    .eq('id', agenteId)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR AGENTE ---', error)
    redirect(`/dashboard/agentes/${agenteId}/editar?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/agentes')
  revalidatePath(`/dashboard/agentes/${agenteId}`)
  redirect(`/dashboard/agentes/${agenteId}`)
}
