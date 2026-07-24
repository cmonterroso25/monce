'use server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function invitarUsuario(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol, organization_id, es_propietario_plataforma')
    .eq('id', user.id)
    .single()

  const esPropietario = miPerfil?.es_propietario_plataforma === true
  const esAdmin = miPerfil?.rol === 'administrador'

  // El bloqueo real está aquí: inviteUserByEmail corre con service role,
  // que bypasea RLS por completo. RLS no protege esta operación, así que
  // el permiso se verifica explícitamente en código antes de llamarla.
  if (!esPropietario && !esAdmin) {
    redirect(
      `/dashboard/configuracion?error=${encodeURIComponent('No tienes permiso para invitar usuarios.')}`
    )
  }

  const correo = formData.get('correo') as string
  const nombreCompleto = formData.get('nombre_completo') as string
  const organizationIdForm = formData.get('organization_id') as string | null

  let organizationId: string

  if (esPropietario) {
    if (!organizationIdForm) {
      redirect(
        `/dashboard/configuracion?error=${encodeURIComponent('Selecciona una organización.')}`
      )
    }
    organizationId = organizationIdForm as string
  } else {
    // Administrador normal: siempre su propia organización, sin importar
    // lo que venga en el formulario (evita manipular el campo vía DevTools).
    organizationId = miPerfil!.organization_id
  }

  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(correo, {
    data: {
      nombre_completo: nombreCompleto,
      organization_id: organizationId,
    },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirmar`,
  })

  if (error) {
    console.error('--- ERROR AL INVITAR USUARIO ---', error)
    redirect(`/dashboard/configuracion?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/configuracion')
  redirect('/dashboard/configuracion?exito=1')
}

export async function crearOrganizacion(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('es_propietario_plataforma')
    .eq('id', user.id)
    .single()

  if (!miPerfil?.es_propietario_plataforma) {
    redirect(
      `/dashboard/configuracion?error=${encodeURIComponent('Solo el propietario de la plataforma puede crear organizaciones.')}`
    )
  }

  const nombre = formData.get('nombre') as string

  // Usa el cliente normal (sesión del usuario), no supabaseAdmin: la
  // política RLS "Propietario crea organizaciones" ya permite este INSERT
  // exactamente para este caso, sin necesidad de bypasear RLS.
  const { error } = await supabase.from('organizaciones').insert({ nombre })

  if (error) {
    console.error('--- ERROR AL CREAR ORGANIZACION ---', error)
    redirect(`/dashboard/configuracion?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/configuracion')
  redirect('/dashboard/configuracion?exito=org')
}
