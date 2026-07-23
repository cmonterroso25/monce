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

// Los inputs datetime-local no incluyen zona horaria (ej. "2025-01-15T14:00").
// Guatemala es siempre UTC-6 (sin horario de verano), así que fijamos ese
// offset explícitamente para que Postgres no lo interprete como UTC.
function aTimestampGuatemala(valor: FormDataEntryValue | null): string | null {
  if (!valor || valor === '') return null
  const texto = valor as string
  if (/[+-]\d{2}:\d{2}$/.test(texto) || texto.endsWith('Z')) return texto
  return `${texto}:00-06:00`
}

export async function crearLead(formData: FormData) {
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

  const contactoId = formData.get('contacto_id') as string
  if (!contactoId) {
    redirect(`/dashboard/leads/nuevo?error=${encodeURIComponent('Debes seleccionar un contacto.')}`)
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      contacto_id: contactoId,
      propiedad_id: textoOpcional(formData.get('propiedad_id')),
      agente_id: textoOpcional(formData.get('agente_id')) || user.id,
      etapa: (formData.get('etapa') as string) || 'contacto_inicial',
      valor_negocio: numeroOpcional(formData.get('valor_negocio')),
      probabilidad: numeroOpcional(formData.get('probabilidad')),
      fecha_cierre_esperada: textoOpcional(formData.get('fecha_cierre_esperada')),
      organization_id: perfil?.organization_id,
    })
    .select()
    .single()

  if (error) {
    console.error('--- ERROR AL CREAR LEAD ---', error)
    redirect(`/dashboard/leads/nuevo?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/leads')
  redirect(`/dashboard/leads/${lead.id}`)
}

export async function actualizarLead(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const leadId = formData.get('lead_id') as string

  const { error } = await supabase
    .from('leads')
    .update({
      propiedad_id: textoOpcional(formData.get('propiedad_id')),
      agente_id: textoOpcional(formData.get('agente_id')),
      valor_negocio: numeroOpcional(formData.get('valor_negocio')),
      probabilidad: numeroOpcional(formData.get('probabilidad')),
      fecha_cierre_esperada: textoOpcional(formData.get('fecha_cierre_esperada')),
      motivo_perdida: textoOpcional(formData.get('motivo_perdida')),
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR LEAD ---', error)
    redirect(`/dashboard/leads/${leadId}/editar?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/leads')
  revalidatePath(`/dashboard/leads/${leadId}`)
  redirect(`/dashboard/leads/${leadId}`)
}

export async function cambiarEtapaLead(leadId: string, nuevaEtapa: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('leads')
    .update({ etapa: nuevaEtapa, actualizado_en: new Date().toISOString() })
    .eq('id', leadId)

  revalidatePath('/dashboard/leads')
  revalidatePath(`/dashboard/leads/${leadId}`)

  if (error) return { ok: false, mensaje: error.message }
  return { ok: true, mensaje: null }
}

export async function crearActividad(formData: FormData) {
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

  const leadId = formData.get('lead_id') as string
  const contactoId = formData.get('contacto_id') as string

  const tipoActividad = formData.get('tipo_actividad') as string
  const programadaEn = aTimestampGuatemala(formData.get('programada_en'))

  const { error } = await supabase.from('actividades').insert({
    contacto_id: contactoId,
    lead_id: leadId,
    agente_id: user.id,
    tipo_actividad: tipoActividad,
    notas: textoOpcional(formData.get('notas')),
    programada_en: programadaEn,
    organization_id: perfil?.organization_id,
  })

  if (error) {
    console.error('--- ERROR AL CREAR ACTIVIDAD ---', error)
    redirect(`/dashboard/leads/${leadId}?error=${encodeURIComponent(error.message)}`)
  }

  if ((tipoActividad === 'cita' || tipoActividad === 'reunion') && programadaEn) {
    const { data: contacto } = await supabase
      .from('contactos')
      .select('nombre_completo, telefono')
      .eq('id', contactoId)
      .single()

    const fechaVisita = new Date(programadaEn)
    const recordatorio = new Date(fechaVisita.getTime() - 60 * 60 * 1000)

    if (contacto?.telefono) {
      await supabase.from('notificaciones_whatsapp').insert({
        contacto_id: contactoId,
        telefono: contacto.telefono,
        mensaje: `Hola ${contacto.nombre_completo}, te recordamos tu cita hoy a las ${fechaVisita.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guatemala' })}.`,
        programado_para: recordatorio.toISOString(),
        organization_id: perfil?.organization_id,
      })
    }
  }

  revalidatePath(`/dashboard/leads/${leadId}`)
  revalidatePath('/dashboard/actividades')
  redirect(`/dashboard/leads/${leadId}`)
}

export async function actualizarActividad(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const actividadId = formData.get('actividad_id') as string
  const leadId = textoOpcional(formData.get('lead_id'))

  const { error } = await supabase
    .from('actividades')
    .update({
      tipo_actividad: formData.get('tipo_actividad') as string,
      programada_en: aTimestampGuatemala(formData.get('programada_en')),
      notas: textoOpcional(formData.get('notas')),
    })
    .eq('id', actividadId)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR ACTIVIDAD ---', error)
    redirect(`/dashboard/actividades/${actividadId}/editar?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/actividades')
  revalidatePath('/dashboard/calendario')
  if (leadId) revalidatePath(`/dashboard/leads/${leadId}`)
  redirect('/dashboard/actividades')
}

export async function marcarActividadCompletada(actividadId: string, leadId?: string | null) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('actividades')
    .update({ completada_en: new Date().toISOString() })
    .eq('id', actividadId)

  if (leadId) revalidatePath(`/dashboard/leads/${leadId}`)
  revalidatePath('/dashboard/actividades')

  if (error) return { ok: false, mensaje: error.message }
  return { ok: true, mensaje: null }
}
