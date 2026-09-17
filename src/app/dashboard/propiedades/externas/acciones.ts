'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function actualizarSeguimientoExterna(formData: FormData): Promise<{
  ok: boolean
  mensaje?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, mensaje: 'No autenticado.' }
  }

  const id = formData.get('id') as string
  const estadoSeguimiento = formData.get('estado_seguimiento') as string
  const notasAgenteRaw = formData.get('notas_agente') as string
  const notasAgente = notasAgenteRaw && notasAgenteRaw.trim() !== '' ? notasAgenteRaw : null

  let colegaId = (formData.get('colega_id') as string) || null
  if (colegaId === '') colegaId = null

  if (colegaId === '__nuevo__') {
    const nombreNuevo = formData.get('colega_nombre_nuevo') as string
    if (!nombreNuevo || nombreNuevo.trim() === '') {
      return { ok: false, mensaje: 'El nombre del nuevo colega es obligatorio.' }
    }
    const telefonoNuevo = (formData.get('colega_telefono_nuevo') as string) || null
    const inmobiliariaNuevo = (formData.get('colega_inmobiliaria_nuevo') as string) || null

    const { data: perfil } = await supabase
      .from('perfiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    const { data: nuevoColega, error: errorColega } = await supabase
      .from('colegas')
      .insert({
        nombre: nombreNuevo,
        telefono: telefonoNuevo,
        inmobiliaria: inmobiliariaNuevo,
        organization_id: perfil?.organization_id,
      })
      .select()
      .single()

    if (errorColega) {
      console.error('--- ERROR AL CREAR COLEGA DESDE PROPIEDAD EXTERNA ---', errorColega)
      return { ok: false, mensaje: errorColega.message }
    }

    colegaId = nuevoColega.id as string
  }

  // "Contactado por" no es un campo que el usuario elija: se fija
  // automáticamente al usuario logueado en cada guardado de esta
  // pantalla, independientemente del estado de seguimiento o si se
  // asignó un colega.
  const { error } = await supabase
    .from('propiedades_externas')
    .update({
      estado_seguimiento: estadoSeguimiento,
      notas_agente: notasAgente,
      colega_id: colegaId,
      agente_que_contacto: user.id,
    })
    .eq('id', id)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR SEGUIMIENTO DE PROPIEDAD EXTERNA ---', error)
    return { ok: false, mensaje: error.message }
  }

  revalidatePath('/dashboard/propiedades/externas')
  return { ok: true }
}
