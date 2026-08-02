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
    organizationId = miPerfil!.organization_id
  }

  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(correo, {
    data: {
      nombre_completo: nombreCompleto,
      organization_id: organizationId,
    },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/invitacion`,
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
  const { error } = await supabase.from('organizaciones').insert({ nombre })

  if (error) {
    console.error('--- ERROR AL CREAR ORGANIZACION ---', error)
    redirect(`/dashboard/configuracion?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/configuracion')
  redirect('/dashboard/configuracion?exito=org')
}

// Borrado suave: marca eliminada_en y desactiva a todos los agentes de
// esa organización (activo=false), sin borrar sus cuentas de Auth ni
// tocar ninguna fila de las 17 tablas que dependen de organization_id.
// RLS ya permite ambas operaciones al propietario de plataforma vía
// es_propietario_plataforma() en las políticas de organizaciones/perfiles,
// así que no hace falta supabaseAdmin aquí.
export async function eliminarOrganizacion(formData: FormData) {
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
      `/dashboard/configuracion?error=${encodeURIComponent('Solo el propietario de la plataforma puede eliminar organizaciones.')}`
    )
  }

  const organizationId = formData.get('organization_id') as string

  const { error: errorOrg } = await supabase
    .from('organizaciones')
    .update({ eliminada_en: new Date().toISOString() })
    .eq('id', organizationId)

  if (errorOrg) {
    console.error('--- ERROR AL ELIMINAR ORGANIZACION ---', errorOrg)
    redirect(`/dashboard/configuracion?error=${encodeURIComponent(errorOrg.message)}`)
  }

  const { error: errorPerfiles } = await supabase
    .from('perfiles')
    .update({ activo: false })
    .eq('organization_id', organizationId)

  if (errorPerfiles) {
    console.error('--- ERROR AL DESACTIVAR AGENTES DE LA ORGANIZACION ---', errorPerfiles)
    redirect(`/dashboard/configuracion?error=${encodeURIComponent(errorPerfiles.message)}`)
  }

  revalidatePath('/dashboard/configuracion')
  redirect('/dashboard/configuracion?exito=org_eliminada')
}
