'use server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { notificarWhatsapp, obtenerChatIdGrupo } from '@/lib/whatsapp/notificar'
import {
  validarColegas,
  guardarColegasActividad,
  idsColegasDeActividad,
  nombresDeColegas,
} from '@/lib/colegas-actividad'
import {
  guardarPropiedadesVisita,
  filtrarPropiedadesPermitidas,
  reemplazarPropiedadesLead,
} from '@/lib/propiedades-enviadas'

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

  // Solo se aceptan propiedades que ya se enviaron a este contacto.
  const propiedadesValidas = await filtrarPropiedadesPermitidas(
    supabase,
    contactoId,
    formData.getAll('propiedades_ids') as string[],
    [],
    true
  )

  // Código escrito a mano (propiedad enviada fuera del CRM): se asocia al contacto
  // como envío 'manual' y se vincula al lead. "PROP-0" / "PROP-" solos se ignoran.
  const codigoManual = (textoOpcional(formData.get('propiedad_codigo')) ?? '').trim().toUpperCase()
  if (codigoManual && codigoManual !== 'PROP-0' && codigoManual !== 'PROP-') {
    const urlError = (mensaje: string) =>
      `/dashboard/leads/nuevo?contacto_id=${contactoId}&error=${encodeURIComponent(mensaje)}`

    const { id: propiedadManualId, error: errorCodigo } = await resolverPropiedadPorCodigo(
      supabase,
      codigoManual,
      perfil?.organization_id
    )
    if (errorCodigo || !propiedadManualId) {
      redirect(urlError(errorCodigo ?? 'No se encontró la propiedad.'))
    }

    // Solo propiedades disponibles (mismo criterio que "Buscar coincidencias").
    const { data: propiedadManual } = await supabase
      .from('propiedades')
      .select('estado')
      .eq('id', propiedadManualId)
      .single()
    if (propiedadManual?.estado !== 'disponible') {
      const motivo =
        propiedadManual?.estado === 'reservada'
          ? 'se encuentra reservada'
          : `su estado es "${propiedadManual?.estado ?? 'desconocido'}", no disponible`
      redirect(urlError(`No se puede asociar la propiedad ${codigoManual} a este lead porque ${motivo}.`))
    }

    if (!propiedadesValidas.includes(propiedadManualId)) {
      const { data: previo } = await supabase
        .from('envios_propiedad_contacto')
        .select('id')
        .eq('contacto_id', contactoId)
        .eq('propiedad_id', propiedadManualId)
        .limit(1)

      if (!previo || previo.length === 0) {
        const { error: errorEnvio } = await supabase.from('envios_propiedad_contacto').insert({
          contacto_id: contactoId,
          propiedad_id: propiedadManualId,
          canal: 'manual',
          enviado_por: user.id,
          organization_id: perfil?.organization_id,
        })
        if (errorEnvio) {
          console.error('--- ERROR AL ASOCIAR PROPIEDAD POR CÓDIGO ---', errorEnvio)
          redirect(urlError('No se pudo asociar la propiedad al contacto: ' + errorEnvio.message))
        }
      }
      propiedadesValidas.push(propiedadManualId)
    }
  }

  const propiedadId = propiedadesValidas[0] ?? null

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

  if (propiedadesValidas.length > 0) {
    const guardado = await reemplazarPropiedadesLead(supabase, {
      leadId: lead.id,
      organizationId: perfil?.organization_id,
      propiedadesIds: propiedadesValidas,
      reemplazar: false,
    })
    if (!guardado.ok) {
      console.error('--- ERROR AL GUARDAR PROPIEDADES DEL LEAD ---', guardado.mensaje)
      revalidatePath('/dashboard/leads')
      redirect(
        `/dashboard/leads/${lead.id}?error=${encodeURIComponent('El lead se creó, pero no se pudieron guardar las propiedades: ' + guardado.mensaje)}`
      )
    }
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

  const hayCaja = formData.has('selector_propiedades')

  // Se aceptan las enviadas al contacto y las que el lead ya tenía vinculadas.
  const { data: leadActual } = await supabase
    .from('leads')
    .select('contacto_id, propiedad_id')
    .eq('id', leadId)
    .single()
  const { data: vinculadasActuales } = await supabase
    .from('lead_propiedades')
    .select('propiedad_id')
    .eq('lead_id', leadId)
  const yaVinculadas = [
    leadActual?.propiedad_id,
    ...(vinculadasActuales ?? []).map((v) => v.propiedad_id),
  ].filter(Boolean) as string[]

  const propiedadesValidas = await filtrarPropiedadesPermitidas(
    supabase,
    leadActual?.contacto_id ?? null,
    formData.getAll('propiedades_ids') as string[],
    yaVinculadas
  )
  // La propiedad principal se conserva si sigue elegida; si no, la primera.
  const propiedadId =
    leadActual?.propiedad_id && propiedadesValidas.includes(leadActual.propiedad_id)
      ? leadActual.propiedad_id
      : propiedadesValidas[0] ?? null

  const { error } = await supabase
    .from('leads')
    .update({
      ...(hayCaja ? { propiedad_id: propiedadId } : {}),
      agente_id: textoOpcional(formData.get('agente_id')),
      motivo_perdida: textoOpcional(formData.get('motivo_perdida')),
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR LEAD ---', error)
    redirect(`/dashboard/leads/${leadId}/editar?error=${encodeURIComponent(error.message)}`)
  }

  if (hayCaja) {
    const guardado = await reemplazarPropiedadesLead(supabase, {
      leadId,
      organizationId: perfil?.organization_id,
      propiedadesIds: propiedadesValidas,
      reemplazar: true,
    })
    if (!guardado.ok) {
      console.error('--- ERROR AL GUARDAR PROPIEDADES DEL LEAD ---', guardado.mensaje)
      redirect(
        `/dashboard/leads/${leadId}/editar?error=${encodeURIComponent('No se pudieron guardar las propiedades: ' + guardado.mensaje)}`
      )
    }
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

  const { data: perfil, error: errorPerfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const leadId = formData.get('lead_id') as string
  const contactoId = formData.get('contacto_id') as string

  const tipoActividad = formData.get('tipo_actividad') as string
  const programadaEn = aTimestampGuatemala(formData.get('programada_en'))
  const colegasIds = await validarColegas(
    supabase,
    formData.getAll('colegas_ids') as string[],
    perfil?.organization_id
  )
  const colegaId = colegasIds[0] ?? null

  // El agente que atenderá la cita ahora se puede elegir en el formulario
  // (campo "agente_id"); si no se selecciona ninguno, se usa quien registra
  // la actividad como respaldo.
  const agenteAsignadoId = textoOpcional(formData.get('agente_id')) || user.id

  const payloadActividad = {
    contacto_id: contactoId,
    lead_id: leadId,
    agente_id: agenteAsignadoId,
    creado_por: user.id,
    colega_id: colegaId,
    tipo_actividad: tipoActividad,
    notas: textoOpcional(formData.get('notas')),
    programada_en: programadaEn,
    organization_id: perfil?.organization_id,
  }

  const { data: actividadCreada, error } = await supabase
    .from('actividades')
    .insert(payloadActividad)
    .select('id')
    .single()

  if (error) {
    // Diagnóstico ampliado: se registra el payload exacto que se intentó
    // insertar, el usuario que hizo la petición, y si hubo error al leer
    // su perfil (lo cual dejaría organization_id en null/undefined).
    // Se usa supabaseAdmin para releer el perfil real sin RLS y comparar
    // contra lo que se usó en el insert, para detectar desalineaciones.
    const { data: perfilReal } = await supabaseAdmin
      .from('perfiles')
      .select('id, organization_id, activo, rol')
      .eq('id', user.id)
      .maybeSingle()

    console.error('--- ERROR AL CREAR ACTIVIDAD ---', {
      error,
      errorPerfil,
      auth_uid: user.id,
      payload_intentado: payloadActividad,
      perfil_real_sin_rls: perfilReal,
    })
    redirect(`/dashboard/leads/${leadId}?error=${encodeURIComponent(error.message)}`)
  }

  if (actividadCreada?.id && colegasIds.length > 0) {
    const guardadoColegas = await guardarColegasActividad(supabase, {
      actividadId: actividadCreada.id,
      organizationId: perfil?.organization_id,
      colegasIds,
      reemplazar: false,
    })
    if (!guardadoColegas.ok) {
      console.error('--- ERROR AL GUARDAR COLEGAS DE LA ACTIVIDAD ---', guardadoColegas.mensaje)
      revalidatePath('/dashboard/actividades')
      redirect(
        `/dashboard/leads/${leadId}?error=${encodeURIComponent('La actividad se creó, pero no se pudieron guardar los colegas: ' + guardadoColegas.mensaje)}`
      )
    }
  }

  if ((tipoActividad === 'cita' || tipoActividad === 'reunion') && programadaEn) {
    // Se usa supabaseAdmin (service role) para esta lectura: quien registra
    // la actividad puede no ser el agente_asignado del contacto (por
    // ejemplo, otro agente que solo quedó asignado a la cita), y la RLS de
    // "contactos" restringe SELECT al agente_asignado o admin. Esta lectura
    // es solo para armar el texto de la notificación interna de WhatsApp,
    // no expone datos al usuario en la UI, así que bypasear RLS aquí es
    // seguro y necesario.
    const { data: contacto } = await supabaseAdmin
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

      const nombresColegas = await nombresDeColegas(supabase, colegasIds)
      const colega = nombresColegas.length > 0 ? { nombre: nombresColegas.join(', ') } : null

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
  if (actividadCreada?.id) {
    const guardado = await guardarPropiedadesVisita(supabase, {
      actividadId: actividadCreada.id,
      contactoId,
      organizationId: perfil?.organization_id,
      propiedadesIds: formData.getAll('propiedades_ids') as string[],
      reemplazar: false,
      soloDisponibles: true,
    })
    if (!guardado.ok) {
      console.error('--- ERROR AL GUARDAR PROPIEDADES DE LA ACTIVIDAD ---', guardado.mensaje)
      revalidatePath('/dashboard/actividades')
      redirect(
        `/dashboard/leads/${leadId}?error=${encodeURIComponent('La actividad se creó, pero no se pudieron guardar las propiedades: ' + guardado.mensaje)}`
      )
    }
  }

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
  const hayCajaColegas = formData.has('selector_colegas')
  const colegasIdsNuevos = hayCajaColegas
    ? await validarColegas(supabase, formData.getAll('colegas_ids') as string[], antes?.organization_id)
    : []
  const nuevoColegaId = hayCajaColegas ? colegasIdsNuevos[0] ?? null : antes?.colega_id ?? null

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

  if (antes && hayCajaColegas) {
    const guardadoColegas = await guardarColegasActividad(supabase, {
      actividadId,
      organizationId: antes.organization_id,
      colegasIds: colegasIdsNuevos,
      reemplazar: true,
    })
    if (!guardadoColegas.ok) {
      console.error('--- ERROR AL GUARDAR COLEGAS DE LA ACTIVIDAD ---', guardadoColegas.mensaje)
      redirect(
        `/dashboard/actividades/${actividadId}/editar?error=${encodeURIComponent('No se pudieron guardar los colegas: ' + guardadoColegas.mensaje)}`
      )
    }
  }

  if (
    antes &&
    (nuevoTipo === 'cita' || nuevoTipo === 'reunion') &&
    nuevaProgramadaEn &&
    antes.programada_en !== nuevaProgramadaEn
  ) {
    const { data: contacto } = await supabaseAdmin
      .from('contactos')
      .select('nombre_completo')
      .eq('id', antes.contacto_id)
      .single()

    const { data: agente } = nuevoAgenteId
      ? await supabase.from('perfiles').select('nombre_completo').eq('id', nuevoAgenteId).maybeSingle()
      : { data: null }

    const idsColegasMensaje = await idsColegasDeActividad(supabase, actividadId, nuevoColegaId)
    const nombresColegas = await nombresDeColegas(supabase, idsColegasMensaje)
    const colega = nombresColegas.length > 0 ? { nombre: nombresColegas.join(', ') } : null

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
  if (antes && formData.has('selector_propiedades')) {
    const guardado = await guardarPropiedadesVisita(supabase, {
      actividadId,
      contactoId: antes.contacto_id,
      organizationId: antes.organization_id,
      propiedadesIds: formData.getAll('propiedades_ids') as string[],
      reemplazar: true,
    })
    if (!guardado.ok) {
      console.error('--- ERROR AL GUARDAR PROPIEDADES DE LA ACTIVIDAD ---', guardado.mensaje)
      redirect(
        `/dashboard/actividades/${actividadId}/editar?error=${encodeURIComponent('No se pudieron guardar las propiedades: ' + guardado.mensaje)}`
      )
    }
  }

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
