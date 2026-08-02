'use server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
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

function normalizarTelefono(telefono: string): string {
  const soloDigitos = telefono.replace(/\D/g, '')
  if (soloDigitos.startsWith('502') && soloDigitos.length > 8) {
    return soloDigitos.slice(3)
  }
  return soloDigitos
}

async function buscarDuplicadoTelefono(
  telefono: string,
  organizationId: string,
  contactoIdExcluir?: string
): Promise<{ mensaje: string } | null> {
  const telefonoNormalizado = normalizarTelefono(telefono)
  if (!telefonoNormalizado) return null

  const { data: candidatos, error } = await supabaseAdmin
    .from('contactos')
    .select('id, nombre_completo, telefono, agente_asignado')
    .eq('organization_id', organizationId)
    .not('telefono', 'is', null)

  if (error) {
    console.error('--- ERROR AL BUSCAR DUPLICADOS DE TELEFONO (supabaseAdmin) ---', error)
    return null
  }

  const encontrado = (candidatos ?? []).find(
    (c) =>
      c.id !== contactoIdExcluir &&
      c.telefono &&
      normalizarTelefono(c.telefono) === telefonoNormalizado
  )

  if (!encontrado) return null

  let nombreAgente = 'otro agente'
  if (encontrado.agente_asignado) {
    const { data: perfilAgente, error: errorPerfil } = await supabaseAdmin
      .from('perfiles')
      .select('nombre_completo')
      .eq('id', encontrado.agente_asignado)
      .maybeSingle()

    if (errorPerfil) {
      console.error('--- ERROR AL BUSCAR NOMBRE DEL AGENTE (supabaseAdmin) ---', errorPerfil)
    } else if (perfilAgente?.nombre_completo) {
      nombreAgente = perfilAgente.nombre_completo
    }
  }

  return {
    mensaje: `Ese teléfono ya pertenece a un contacto de ${nombreAgente} (${encontrado.nombre_completo}). Verifica antes de continuar.`,
  }
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

  const duplicado = await buscarDuplicadoTelefono(telefono!, organizationId)
  if (duplicado) {
    redirect(`/dashboard/contactos/nuevo?error=${encodeURIComponent(duplicado.mensaje)}`)
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
      tipo_propiedad_interes: textoOpcional(formData.get('tipo_propiedad_interes')),
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

  const duplicado = await buscarDuplicadoTelefono(telefono!, perfil?.organization_id, contactoId)
  if (duplicado) {
    redirect(`/dashboard/contactos/${contactoId}/editar?error=${encodeURIComponent(duplicado.mensaje)}`)
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
      tipo_propiedad_interes: textoOpcional(formData.get('tipo_propiedad_interes')),
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

export async function eliminarContacto(contactoId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  const esAdmin = miPerfil?.rol === 'administrador'

  if (!esAdmin) {
    throw new Error('Solo un administrador puede eliminar contactos.')
  }

  // Lista completa de FKs hacia `contactos`, confirmada con information_schema
  // el 2026-08-01. Todas con delete_rule = NO ACTION (restrict):
  // propiedades.contacto_propietario, leads.contacto_id, actividades.contacto_id,
  // tareas.contacto_id, coincidencias_propiedad.contacto_id,
  // notificaciones_whatsapp.contacto_id, recibos.contacto_id,
  // informes_evaluacion.contacto_id, solicitudes_arrendamiento.contacto_id.

  // 1. propiedades.contacto_propietario no se borra en cascada (borraría la
  //    propiedad), solo se desvincula.
  await supabase
    .from('propiedades')
    .update({ contacto_propietario: null })
    .eq('contacto_propietario', contactoId)

  // 2. IDs de leads de este contacto, para limpiar defensivamente filas hijas
  //    de esos leads cuyo contacto_id pudiera estar en null.
  const { data: leadsDelContacto } = await supabase
    .from('leads')
    .select('id')
    .eq('contacto_id', contactoId)
  const leadIds = (leadsDelContacto ?? []).map((l) => l.id)

  await supabase.from('notificaciones_whatsapp').delete().eq('contacto_id', contactoId)
  await supabase.from('documentos').delete().eq('tipo_relacionado', 'contacto').eq('id_relacionado', contactoId)

  await supabase.from('recibos').delete().eq('contacto_id', contactoId)
  await supabase.from('informes_evaluacion').delete().eq('contacto_id', contactoId)
  await supabase.from('solicitudes_arrendamiento').delete().eq('contacto_id', contactoId)
  await supabase.from('coincidencias_propiedad').delete().eq('contacto_id', contactoId)
  await supabase.from('actividades').delete().eq('contacto_id', contactoId)
  await supabase.from('tareas').delete().eq('contacto_id', contactoId)

  if (leadIds.length > 0) {
    await supabase.from('recibos').delete().in('lead_id', leadIds)
    await supabase.from('informes_evaluacion').delete().in('lead_id', leadIds)
    await supabase.from('solicitudes_arrendamiento').delete().in('lead_id', leadIds)
    await supabase.from('actividades').delete().in('lead_id', leadIds)
    await supabase.from('tareas').delete().in('lead_id', leadIds)
  }

  await supabase.from('leads').delete().eq('contacto_id', contactoId)

  const { error } = await supabase.from('contactos').delete().eq('id', contactoId)

  if (error) {
    console.error('--- ERROR AL ELIMINAR CONTACTO ---', error)
    throw new Error(error.message)
  }

  revalidatePath('/dashboard/contactos')
}
