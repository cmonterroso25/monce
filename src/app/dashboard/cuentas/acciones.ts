'use server'

import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

const ESTADOS_CONECTABLES = ['PENDING_SETUP', 'AUTH_REQUIRED', 'ERROR']

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
  if (['BUSY', 'CONNECT_REQUESTED', 'CONNECTING'].includes(cuenta!.estado)) {
    conError('La cuenta está en uso (publicando o conectándose). Espera a que termine o cancela la conexión.')
  }

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

// Pide al Worker (en la Mac) que abra la ventana de inicio de sesión de Facebook.
// La RLS de cuentas_sociales solo deja editar a admin; por eso se valida aquí que la
// cuenta sea del usuario y se escribe con service role, solo hacia CONNECT_REQUESTED.
export async function solicitarConexionCuenta(formData: FormData) {
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
  if (!ESTADOS_CONECTABLES.includes(cuenta!.estado)) {
    conError(`La cuenta está en estado ${cuenta!.estado} y no se puede conectar ahora.`)
  }

  const { data, error } = await supabaseAdmin
    .from('cuentas_sociales')
    .update({ estado: 'CONNECT_REQUESTED' })
    .eq('id', cuentaId)
    .eq('asesor_id', user.id)
    .in('estado', ESTADOS_CONECTABLES)
    .select('id')

  if (error) {
    console.error('--- ERROR AL SOLICITAR CONEXION DE CUENTA ---', error)
    conError(error.message)
  }
  if (!data || data.length === 0) conError('La cuenta cambió de estado mientras tanto. Recarga la página.')

  revalidatePath('/dashboard/cuentas')
  redirect('/dashboard/cuentas?exito=conexion_solicitada')
}

// Cancela una solicitud que el Worker todavía no tomó.
export async function cancelarConexionCuenta(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cuentaId = formData.get('cuenta_id') as string

  const { data: cuenta } = await supabase
    .from('cuentas_sociales')
    .select('id, estado, autenticada_en')
    .eq('id', cuentaId)
    .eq('asesor_id', user.id)
    .maybeSingle()
  if (!cuenta) conError('No se encontró esa cuenta entre las tuyas.')
  if (cuenta!.estado !== 'CONNECT_REQUESTED') {
    conError('Solo se puede cancelar mientras el Worker no haya abierto la ventana.')
  }

  const { data, error } = await supabaseAdmin
    .from('cuentas_sociales')
    .update({ estado: cuenta!.autenticada_en ? 'AUTH_REQUIRED' : 'PENDING_SETUP' })
    .eq('id', cuentaId)
    .eq('asesor_id', user.id)
    .eq('estado', 'CONNECT_REQUESTED')
    .select('id')

  if (error) {
    console.error('--- ERROR AL CANCELAR CONEXION DE CUENTA ---', error)
    conError(error.message)
  }
  if (!data || data.length === 0) conError('El Worker ya tomó la solicitud; cierra la ventana de Chromium si no quieres continuar.')

  revalidatePath('/dashboard/cuentas')
  redirect('/dashboard/cuentas?exito=conexion_cancelada')
}
