'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function textoOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  return valor as string
}

function numeroOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  const n = Number(valor)
  return Number.isNaN(n) ? null : n
}

function datosDesdeFormulario(formData: FormData) {
  return {
    contacto_id: formData.get('contacto_id') as string,
    tipo_operacion: textoOpcional(formData.get('tipo_operacion')),
    tipo_propiedad: textoOpcional(formData.get('tipo_propiedad')),
    precio_min: numeroOpcional(formData.get('precio_min')),
    precio_max: numeroOpcional(formData.get('precio_max')),
    moneda: (formData.get('moneda') as string) || 'GTQ',
    zona: textoOpcional(formData.get('zona')),
    sector: textoOpcional(formData.get('sector')),
    municipio_id: textoOpcional(formData.get('municipio_id')),
    dormitorios_min: numeroOpcional(formData.get('dormitorios_min')),
    banos_min: numeroOpcional(formData.get('banos_min')),
    niveles_min: numeroOpcional(formData.get('niveles_min')),
    parqueos_min: numeroOpcional(formData.get('parqueos_min')),
    area_min: numeroOpcional(formData.get('area_min')),
    caracteristicas_deseadas: formData.getAll('caracteristicas_deseadas') as string[],
    otras_caracteristicas: textoOpcional(formData.get('otras_caracteristicas')),
    notas: textoOpcional(formData.get('notas')),
  }
}

export async function crearRequerimiento(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const datos = datosDesdeFormulario(formData)

  const { error } = await supabase.from('requerimientos').insert({
    ...datos,
    organization_id: perfil?.organization_id,
    creado_por: user.id,
  })

  if (error) {
    console.error('--- ERROR AL CREAR REQUERIMIENTO ---', error)
    redirect(`/dashboard/requerimientos/nuevo?contacto_id=${datos.contacto_id}&error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/requerimientos')
  revalidatePath(`/dashboard/contactos/${datos.contacto_id}`)
  redirect(`/dashboard/contactos/${datos.contacto_id}`)
}

export async function actualizarRequerimiento(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requerimientoId = formData.get('requerimiento_id') as string
  const datos = datosDesdeFormulario(formData)

  const { error } = await supabase
    .from('requerimientos')
    .update({ ...datos, actualizado_en: new Date().toISOString() })
    .eq('id', requerimientoId)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR REQUERIMIENTO ---', error)
    redirect(`/dashboard/requerimientos/${requerimientoId}/editar?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/requerimientos')
  revalidatePath(`/dashboard/contactos/${datos.contacto_id}`)
  redirect(`/dashboard/contactos/${datos.contacto_id}`)
}

export async function eliminarRequerimiento(requerimientoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'No autenticado' }

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle()
  const esAdmin = miPerfil?.rol === 'administrador'

  if (!esAdmin) {
    return { ok: false, mensaje: 'Solo un administrador puede eliminar requerimientos.' }
  }

  const { data: requerimiento } = await supabase
    .from('requerimientos')
    .select('contacto_id')
    .eq('id', requerimientoId)
    .maybeSingle()

  if (!requerimiento) return { ok: false, mensaje: 'Requerimiento no encontrado.' }

  const { error } = await supabase.from('requerimientos').delete().eq('id', requerimientoId)

  revalidatePath('/dashboard/requerimientos')
  revalidatePath(`/dashboard/contactos/${requerimiento.contacto_id}`)

  if (error) return { ok: false, mensaje: error.message }
  return { ok: true, mensaje: null }
}
