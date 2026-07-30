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
  const colegaId = textoOpcional(formData.get('colega_id'))

  // El agente que atenderá la cita ahora se puede elegir en el formulario
  // (campo "agente_id"); si no se selecciona ninguno, se usa quien registra
  // la actividad como respaldo.
  const agenteAsignadoId = textoOpcional(formData.get('agente_id')) || user.id

  const { error } = await supabase.from('actividades').insert({
    contacto_id: contactoId,
    lead_id: leadId,
    agente_id: agenteAsignadoId,
    colega_id: colegaId,
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
      // Ya no se consulta la propiedad del lead: por decisión de negocio,
      // el mensaje de cita agendada NO debe mostrar la propiedad de interés.
      const { data: agente } = await supabase
        .from('perfiles')
        .select('nombre_completo')
        .eq('id', agenteAsignadoId)
        .maybeSingle()

      const { data: colega } = colegaId
        ? await supabase.from('colegas').select('nombre').eq('id', colegaId).maybeSingle()
        : { data: null }

      const chatIdCitas = await obtenerChatIdGrupo(supabase, perfil.organization_id, 'citas')
      if (chatIdCitas) {
        const fechaTexto = fechaVisita.toLocaleString('es-GT', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'America/Guatemala',
        })
        const notas = textoOpcional(formData.get('notas'))
        const mensaje = [
          `📅 *Nueva cita agendada*`,
          `👤 Cliente: ${contacto?.nombre_completo ?? 'Contacto sin nombre'}`,
          `🧑‍💼 Atiende: ${agente?.nombre_completo ?? 'Sin asignar'}`,
          colega?.nombre ? `🧑🏻‍💼 Colega: ${colega.nombre}` : null,
          `🕐 ${fechaTexto}`,
          notas ? `📝 ${notas}` : null,
        ].filter(Boolean).join('\n')

        await notificarWhatsapp({
          chatId: chatIdCitas,
          mensaje,
          organizationId: perfil.organization_id,
          tipoNotificacion: 'nueva_cita',
          agenteId: agenteAsignadoId,
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
    .select('tipo_actividad, programada_en, contacto_id, organization_id, agente_id, colega_id')
    .eq('id', actividadId)
    .single()

  const nuevoTipo = formData.get('tipo_actividad') as string
  const nuevaProgramadaEn = aTimestampGuatemala(formData.get('programada_en'))

  // Si el formulario de edición trae "agente_id"/"colega_id", se actualizan;
  // si no vienen (por ejemplo un formulario viejo sin esos campos), se
  // conserva lo que ya tenía la actividad.
  const nuevoAgenteId = textoOpcional(formData.get('agente_id')) ?? antes?.agente_id ?? null
  const nuevoColegaId = formData.has('colega_id')
    ? textoOpcional(formData.get('colega_id'))
    : antes?.colega_id ?? null

  const { error } = await supabase
    .from('actividades')
    .update({
      tipo_actividad: nuevoTipo,
      programada_en: nuevaProgramadaEn,
      notas: textoOpcional(formData.get('notas')),
      agente_id: nuevoAgenteId,
      colega_id: nuevoColegaId,
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

    const { data: agente } = nuevoAgenteId
      ? await supabase.from('perfiles').select('nombre_completo').eq('id', nuevoAgenteId).maybeSingle()
      : { data: null }

    const { data: colega } = nuevoColegaId
      ? await supabase.from('colegas').select('nombre').eq('id', nuevoColegaId).maybeSingle()
      : { data: null }

    const chatIdCitas = await obtenerChatIdGrupo(supabase, antes.organization_id, 'citas')
    if (chatIdCitas) {
      const fechaTexto = new Date(nuevaProgramadaEn).toLocaleString('es-GT', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Guatemala',
      })
      const notasReprogramada = textoOpcional(formData.get('notas'))
      const mensaje = [
        `🔄 *Cita reprogramada*`,
        `👤 Cliente: ${contacto?.nombre_completo ?? 'Contacto sin nombre'}`,
        `🧑‍💼 Atiende: ${agente?.nombre_completo ?? 'Sin asignar'}`,
        colega?.nombre ? `🧑🏻‍💼 Colega: ${colega.nombre}` : null,
        `🕐 Nueva fecha: ${fechaTexto}`,
        notasReprogramada ? `📝 ${notasReprogramada}` : null,
      ].filter(Boolean).join('\n')
      await notificarWhatsapp({
        chatId: chatIdCitas,
        mensaje,
        organizationId: antes.organization_id,
        tipoNotificacion: 'cambio_cita',
        agenteId: nuevoAgenteId ?? user.id,
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
