'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function numeroOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  const n = Number(valor)
  return Number.isNaN(n) ? null : n
}

function textoOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  return valor as string
}

export async function crearContacto(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const organizationId = perfil?.organization_id

  const telefono = textoOpcional(formData.get('telefono'))
  if (!telefono) {
    redirect(`/dashboard/contactos/nuevo?error=${encodeURIComponent('El teléfono es obligatorio.')}`)
  }

  const { data: existente } = await supabase
    .from('contactos')
    .select('id, nombre_completo')
    .eq('telefono', telefono)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (existente) {
    redirect(
      `/dashboard/contactos/nuevo?error=${encodeURIComponent(
        `Ese contacto ya está agregado: ${existente.nombre_completo}. Verifica antes de continuar.`
      )}`
    )
  }

  const zonasTexto = textoOpcional(formData.get('zonas_interes'))
  const zonasInteres = zonasTexto
    ? zonasTexto.split(',').map((z) => z.trim()).filter(Boolean)
    : null

  const { data: contacto, error } = await supabase
    .from('contactos')
    .insert({
      nombre_completo: formData.get('nombre_completo') as string,
      correo: textoOpcional(formData.get('correo')),
      telefono,
      tipo_contacto: textoOpcional(formData.get('tipo_contacto')),
      origen: textoOpcional(formData.get('origen')),
      estado: (formData.get('estado') as string) || 'nuevo',
      presupuesto_min: numeroOpcional(formData.get('presupuesto_min')),
      presupuesto_max: numeroOpcional(formData.get('presupuesto_max')),
      zonas_interes: zonasInteres,
      agente_asignado: textoOpcional(formData.get('agente_asignado')) || user.id,
      organization_id: organizationId,
    })
    .select()
    .single()

  if (error) {
    console.error('--- ERROR AL CREAR CONTACTO ---', error)
    redirect(`/dashboard/contactos/nuevo?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/contactos')
  redirect(`/dashboard/contactos/${contacto.id}`)
}

export async function actualizarContacto(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const contactoId = formData.get('contacto_id') as string

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const telefono = textoOpcional(formData.get('telefono'))
  if (!telefono) {
    redirect(`/dashboard/contactos/${contactoId}/editar?error=${encodeURIComponent('El teléfono es obligatorio.')}`)
  }

  const { data: existente } = await supabase
    .from('contactos')
    .select('id, nombre_completo')
    .eq('telefono', telefono)
    .eq('organization_id', perfil?.organization_id)
    .neq('id', contactoId)
    .maybeSingle()

  if (existente) {
    redirect(
      `/dashboard/contactos/${contactoId}/editar?error=${encodeURIComponent(
        `Ese teléfono ya pertenece a otro contacto: ${existente.nombre_completo}. Verifica antes de continuar.`
      )}`
    )
  }

  const zonasTexto = textoOpcional(formData.get('zonas_interes'))
  const zonasInteres = zonasTexto
    ? zonasTexto.split(',').map((z) => z.trim()).filter(Boolean)
    : null

  const { error } = await supabase
    .from('contactos')
    .update({
      nombre_completo: formData.get('nombre_completo') as string,
      correo: textoOpcional(formData.get('correo')),
      telefono,
      tipo_contacto: textoOpcional(formData.get('tipo_contacto')),
      origen: textoOpcional(formData.get('origen')),
      estado: (formData.get('estado') as string) || 'nuevo',
      presupuesto_min: numeroOpcional(formData.get('presupuesto_min')),
      presupuesto_max: numeroOpcional(formData.get('presupuesto_max')),
      zonas_interes: zonasInteres,
      agente_asignado: textoOpcional(formData.get('agente_asignado')),
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', contactoId)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR CONTACTO ---', error)
    redirect(`/dashboard/contactos/${contactoId}/editar?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/contactos')
  revalidatePath(`/dashboard/contactos/${contactoId}`)
  redirect(`/dashboard/contactos/${contactoId}`)
}

export async function actualizarEstadoContacto(contactoId: string, nuevoEstado: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('contactos')
    .update({ estado: nuevoEstado, actualizado_en: new Date().toISOString() })
    .eq('id', contactoId)

  revalidatePath('/dashboard/contactos')
  revalidatePath(`/dashboard/contactos/${contactoId}`)

  if (error) return { ok: false, mensaje: error.message }
  return { ok: true, mensaje: null }
}
