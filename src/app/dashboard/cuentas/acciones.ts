'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function conError(mensaje: string): never {
  return redirect(`/dashboard/cuentas?error=${encodeURIComponent(mensaje)}`)
}

export async function crearMiCuentaSocial(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const etiqueta = ((formData.get('etiqueta') as string) ?? '').trim()
  if (!etiqueta) conError('Escribe un nombre para la cuenta, por ejemplo "Facebook de Ana".')
  if (etiqueta.length > 60) conError('El nombre de la cuenta no puede pasar de 60 caracteres.')

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  if (!miPerfil) conError('No se encontró tu perfil.')

  const { data: repetida } = await supabase
    .from('cuentas_sociales')
    .select('id')
    .eq('asesor_id', user.id)
    .eq('plataforma', 'facebook')
    .eq('etiqueta', etiqueta)
    .maybeSingle()
  if (repetida) conError('Ya tienes una cuenta con ese nombre. Usa otro para distinguirlas.')

  const { error } = await supabase.from('cuentas_sociales').insert({
    organization_id: miPerfil!.organization_id,
    asesor_id: user.id,
    plataforma: 'facebook',
    etiqueta,
    estado: 'PENDING_SETUP',
  })

  if (error) {
    console.error('--- ERROR AL CREAR MI CUENTA SOCIAL ---', error)
    conError(error.message)
  }

  revalidatePath('/dashboard/cuentas')
  redirect('/dashboard/cuentas?exito=creada')
}

export async function eliminarMiCuentaSocial(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cuentaId = formData.get('cuenta_id') as string

  const { data: cuenta } = await supabase
    .from('cuentas_sociales')
    .select('id, estado')
    .eq('id', cuentaId)
    .eq('asesor_id', user.id)
    .maybeSingle()
  if (!cuenta) conError('No se encontró esa cuenta entre las tuyas.')
  if (cuenta!.estado === 'BUSY') conError('La cuenta está publicando ahora mismo. Espera a que termine.')

  const { data: borradas, error } = await supabase
    .from('cuentas_sociales')
    .delete()
    .eq('id', cuentaId)
    .eq('asesor_id', user.id)
    .select('id')

  if (error) {
    console.error('--- ERROR AL ELIMINAR MI CUENTA SOCIAL ---', error)
    conError(
      error.code === '23503'
        ? 'Esta cuenta ya tiene publicaciones en el historial y no se puede eliminar.'
        : error.message
    )
  }
  if (!borradas || borradas.length === 0) conError('No se pudo eliminar la cuenta.')

  revalidatePath('/dashboard/cuentas')
  redirect('/dashboard/cuentas?exito=eliminada')
}
