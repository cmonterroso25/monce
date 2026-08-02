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
  // bypasea RLS por completo. Incluye es_propietario_plataforma porque
  // el propietario debe poder editar agentes de cualquier organización
  // aunque su propio rol de perfil no sea 'administrador'.
  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol, es_propietario_plataforma')
    .eq('id', user.id)
    .single()

  const puedeEditar = miPerfil?.rol === 'administrador' || miPerfil?.es_propietario_plataforma === true
  if (!puedeEditar) {
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

// Reasignar la organización de un agente. Solo el propietario de
// plataforma puede hacerlo (cruza organizaciones); un administrador
// normal no, porque solo ve/administra su propia organización.
// RLS ya lo permite vía es_propietario_plataforma() en las políticas
// de perfiles, sin necesidad de supabaseAdmin.
export async function reasignarOrganizacionAgente(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const agenteId = formData.get('agente_id') as string
  const nuevaOrganizacionId = formData.get('organization_id') as string

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('es_propietario_plataforma')
    .eq('id', user.id)
    .single()

  if (!miPerfil?.es_propietario_plataforma) {
    redirect(`/dashboard/agentes/${agenteId}/editar?error=${encodeURIComponent('Solo el propietario de la plataforma puede reasignar la organización de un agente.')}`)
  }

  const { error } = await supabase
    .from('perfiles')
    .update({ organization_id: nuevaOrganizacionId })
    .eq('id', agenteId)

  if (error) {
    console.error('--- ERROR AL REASIGNAR ORGANIZACION DE AGENTE ---', error)
    redirect(`/dashboard/agentes/${agenteId}/editar?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/agentes')
  revalidatePath(`/dashboard/agentes/${agenteId}`)
  redirect(`/dashboard/agentes/${agenteId}`)
}
