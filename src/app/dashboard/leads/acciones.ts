'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { notificarWhatsapp, obtenerChatIdGrupo } from '@/lib/whatsapp/notificar'

function numeroOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  const n = Number(valor)
  return Number.isNaN(n) ? null : n
}

function textoOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  return valor as string
}

function aTimestampGuatemala(valor: FormDataEntryValue | null): string | null {
  if (!valor || valor === '') return null
  const texto = valor as string
  if (/[+-]\d{2}:\d{2}$/.test(texto) || texto.endsWith('Z')) return texto
  return `${texto}:00-06:00`
}

async function resolverPropiedadPorCodigo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  codigo: string | null,
  organizationId: string | undefined
) {
  if (!codigo) return { id: null, error: null as string | null }

  const { data: propiedad } = await supabase
    .from('propiedades')
    .select('id')
    .eq('codigo', codigo)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!propiedad) {
    return { id: null, error: `No se encontró ninguna propiedad con el código "${codigo}".` }
  }
  return { id: propiedad.id, error: null }
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

  const propiedadCodigo = textoOpcional(formData.get('propiedad_codigo'))
  const { id: propiedadId, error: errorPropiedad } = await resolverPropiedadPorCodigo(
    supabase,
    propiedadCodigo,
    perfil?.organization_id
  )
  if (errorPropiedad) {
    redirect(`/dashboard/leads/nuevo?error=${encodeURIComponent(errorPropiedad)}`)
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      contacto_id: contactoId,
      propiedad_id: propiedadId,
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

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const propiedadCodigo = textoOpcional(formData.get('propiedad_codigo'))
  const { id: propiedadId, error: errorPropiedad } = await resolverPropiedadPorCodigo(
    supabase,
    propiedadCodigo,
    perfil?.organization_id
  )
  if (errorPropiedad) {
    redirect(`/dashboard/leads/${leadId}/editar?error=${encodeURIComponent(errorPropiedad)}`)
  }

  const { error } = await supabase
    .from('leads')
    .update({
      propiedad_id: propiedadId,
      agente_id: textoOpcional(formData.get('agente_id')),
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
      // Nota: esta fila queda en cola pero el cron de envío NO está
      // activado todavía (ver explicación de cuota de Green API). No se
      // pierde, simplemente no se envía hasta que subas de plan.
    }

    if (perfil?.organization_id) {
      const { data: leadConPropiedad } = await supabase
        .from('leads')
        .select('propiedades(titulo, codigo)')
        .eq('id', leadId)
        .maybeSingle()

      const chatIdCitas = await obtenerChatIdGrupo(supabase, perfil.organization_id, 'citas')
      if (chatIdCitas) {
        const fechaTexto = fechaVisita.toLocaleString('es-GT', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'America/Guatemala',
        })
        const propiedadRel = (leadConPropiedad as { propiedades: { titulo: string; codigo: string | null } | null } | null)?.propiedades
        const propiedadInfo = propiedadRel ? `\n🏠 ${propiedadRel.titulo} (${propiedadRel.codigo ?? ''})` : ''
        const notas = textoOpcional(formData.get('notas'))
        const mensaje = [
          `📅 *Nueva cita agendada*`,
          `👤 ${contacto?.nombre_completo ?? 'Contacto sin nombre'}${propiedadInfo}`,
          `🕐 ${fechaTexto}`,
          notas ? `📝 ${notas}` : null,
        ].filter(Boolean).join('\n')

        await notificarWhatsapp({
          chatId: chatIdCitas,
          mensaje,
          organizationId: perfil.organization_id,
          tipoNotificacion: 'nueva_cita',
          agenteId: user.id,
          contactoId,
        })
      }
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

  const { data: antes } = await supabase
    .from('actividades')
    .select('tipo_actividad, programada_en, contacto_id, organization_id')
    .eq('id', actividadId)
    .single()

  const nuevoTipo = formData.get('tipo_actividad') as string
  const nuevaProgramadaEn = aTimestampGuatemala(formData.get('programada_en'))

  const { error } = await supabase
    .from('actividades')
    .update({
      tipo_actividad: nuevoTipo,
      programada_en: nuevaProgramadaEn,
      notas: textoOpcional(formData.get('notas')),
    })
    .eq('id', actividadId)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR ACTIVIDAD ---', error)
    redirect(`/dashboard/actividades/${actividadId}/editar?error=${encodeURIComponent(error.message)}`)
  }

  if (
    antes &&
    (nuevoTipo === 'cita' || nuevoTipo === 'reunion') &&
    nuevaProgramadaEn &&
    antes.programada_en !== nuevaProgramadaEn
  ) {
    const { data: contacto } = await supabase
      .from('contactos')
      .select('nombre_completo')
      .eq('id', antes.contacto_id)
      .single()

    const chatIdCitas = await obtenerChatIdGrupo(supabase, antes.organization_id, 'citas')
    if (chatIdCitas) {
      const fechaTexto = new Date(nuevaProgramadaEn).toLocaleString('es-GT', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Guatemala',
      })
      const mensaje = [
        `🔄 *Cita reprogramada*`,
        `👤 ${contacto?.nombre_completo ?? 'Contacto sin nombre'}`,
        `🕐 Nueva fecha: ${fechaTexto}`,
      ].join('\n')
      await notificarWhatsapp({
        chatId: chatIdCitas,
        mensaje,
        organizationId: antes.organization_id,
        tipoNotificacion: 'cambio_cita',
        agenteId: user.id,
        contactoId: antes.contacto_id,
      })
    }
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

export async function eliminarLead(leadId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('agente_id')
    .eq('id', leadId)
    .single()

  if (!lead) {
    throw new Error('Lead no encontrado.')
  }

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  const esAdmin = miPerfil?.rol === 'administrador'
  const puedeEliminar = esAdmin || lead.agente_id === user.id

  if (!puedeEliminar) {
    throw new Error('Solo el agente asignado o un administrador pueden eliminar este lead.')
  }

  await supabase.from('documentos').delete().eq('tipo_relacionado', 'lead').eq('id_relacionado', leadId)
  await supabase.from('actividades').delete().eq('lead_id', leadId)
  await supabase.from('tareas').delete().eq('lead_id', leadId)
  await supabase.from('recibos').delete().eq('lead_id', leadId)
  await supabase.from('informes_evaluacion').delete().eq('lead_id', leadId)

  const { error } = await supabase.from('leads').delete().eq('id', leadId)

  if (error) {
    console.error('--- ERROR AL ELIMINAR LEAD ---', error)
    throw new Error(error.message)
  }

  revalidatePath('/dashboard/leads')
}
