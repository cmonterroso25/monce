// Cron del agente de seguimiento IA (corre cada 15 min vía pg_cron):
//   1. Detecta actividades (cita/reunión/video_llamada/llamada) cuya
//      programada_en pasó hace 2-48h y aún no tienen seguimiento, y les
//      envía la primera pregunta por WhatsApp al asesor (agente_id).
//   2. Reenvía la misma pregunta a quienes no respondieron en 24h
//      (máximo 3 intentos / 72h).
//   3. Marca "vencido" a quienes agotaron los 3 intentos sin responder.
//
// La ventana de 48h en el paso 1 evita una avalancha de preguntas sobre
// citas viejas si el cron estuvo caído varias horas.
//
// No clasifica respuestas ni mueve leads — eso lo hace
// seguimiento-ia-webhook al recibir la respuesta del asesor.

import { createClient } from 'npm:@supabase/supabase-js@2'

const FUNCTION_SECRET = Deno.env.get('WHATSAPP_FUNCTION_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WHATSAPP_ENVIAR_URL = `${SUPABASE_URL}/functions/v1/whatsapp-enviar`

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const TIPOS_SEGUIMIENTO = ['cita', 'reunion', 'video_llamada', 'llamada', 'firma_contrato']
const ETAPAS_TERMINALES = ['ganada', 'reservada', 'perdida']

// Cadencia de reintentos por fase: la mayoría son "no respondió, insiste
// cada 24h hasta 3 veces". confirmar_envio_propiedades es distinta: el
// primer aviso ya se programó al crear la fila (1h después de la hora en
// que el asesor dijo que enviaría las propiedades); desde ahí, el segundo
// aviso va 2h después del primero y el tercero 3h después del segundo.
const CONFIG_REINTENTO: Record<string, { maxIntentos: number; gapsHoras: number[] }> = {
  default: { maxIntentos: 3, gapsHoras: [24, 24] },
  confirmar_envio_propiedades: { maxIntentos: 3, gapsHoras: [2, 3] },
}

function configReintento(fase: string) {
  return CONFIG_REINTENTO[fase] ?? CONFIG_REINTENTO.default
}

const ETIQUETA_TIPO: Record<string, string> = {
  cita: 'cita',
  reunion: 'reunión',
  video_llamada: 'video llamada',
  llamada: 'llamada',
  firma_contrato: 'firma de contrato',
}

// 8 dígitos locales de Guatemala -> chatId individual de Green API.
// Mismo criterio que normalizarChatId en whatsapp-procesar-pendientes.
function telefonoAChatId(telefono: string): string {
  const soloDigitos = telefono.replace(/\D/g, '')
  const conCodigoPais = soloDigitos.length === 8 ? `502${soloDigitos}` : soloDigitos
  return `${conCodigoPais}@c.us`
}

function formatearFechaHoraGT(iso: string): string {
  return new Date(iso).toLocaleString('es-GT', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Guatemala',
  })
}

async function enviarWhatsapp(params: {
  chatId: string
  mensaje: string
  organizationId: string
  agenteId: string
  actividadId: string | null
  tipoNotificacion?: string
}): Promise<string | null> {
  const res = await fetch(WHATSAPP_ENVIAR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'x-notificacion-secret': FUNCTION_SECRET,
    },
    body: JSON.stringify({
      chatId: params.chatId,
      mensaje: params.mensaje,
      registrar: {
        organization_id: params.organizationId,
        tipo_notificacion: params.tipoNotificacion ?? 'seguimiento_ia_pregunta',
        agente_id: params.agenteId,
        actividad_id: params.actividadId,
      },
    }),
  })
  if (!res.ok) {
    console.error(`whatsapp-enviar respondió ${res.status}: ${await res.text()}`)
    return null
  }
  const data = await res.json()
  return data.idMessage ?? null
}

async function procesarCandidatasNuevas() {
  const ahora = Date.now()
  const hace2h = new Date(ahora - 2 * 3600_000).toISOString()
  const hace48h = new Date(ahora - 48 * 3600_000).toISOString()

  const { data: actividades, error } = await supabase
    .from('actividades')
    .select(
      'id, lead_id, agente_id, contacto_id, tipo_actividad, organization_id, creado_por, ' +
        'contacto:contactos(nombre_completo), agente:perfiles!actividades_agente_id_fkey(nombre_completo, telefono), lead:leads(etapa)'
    )
    .not('lead_id', 'is', null)
    .in('tipo_actividad', TIPOS_SEGUIMIENTO)
    .gte('programada_en', hace48h)
    .lte('programada_en', hace2h)

  if (error) {
    console.error('Error consultando actividades candidatas:', error)
    return { enviadas: 0 }
  }
  if (!actividades || actividades.length === 0) return { enviadas: 0 }

  const { data: yaConSeguimiento } = await supabase
    .from('seguimientos_ia')
    .select('actividad_id')
    .in('actividad_id', actividades.map((a) => a.id))
  const idsConSeguimiento = new Set((yaConSeguimiento ?? []).map((s) => s.actividad_id))

  let enviadas = 0
  for (const a of actividades) {
    if (idsConSeguimiento.has(a.id)) continue
    const lead = Array.isArray(a.lead) ? a.lead[0] : a.lead
    if (!lead || ETAPAS_TERMINALES.includes(lead.etapa)) continue
    const agente = Array.isArray(a.agente) ? a.agente[0] : a.agente
    const contacto = Array.isArray(a.contacto) ? a.contacto[0] : a.contacto
    if (!agente?.telefono) {
      console.error(`Actividad ${a.id}: el asesor ${a.agente_id} no tiene teléfono registrado, se omite.`)
      continue
    }

    const chatId = telefonoAChatId(agente.telefono)
    const esFirma = a.tipo_actividad === 'firma_contrato'
    const mensaje = esFirma
      ? [
          `Hola ${agente.nombre_completo ?? ''}, soy Ben, tu asistente inmobiliario 😊 ¿Cómo te fue con la firma de contrato de ${contacto?.nombre_completo ?? 'el cliente'}? ¿Ya se realizó?`,
          'Cuéntame cómo te fue. Responde citando este mensaje 🙂',
        ].join('\n')
      : [
          `Hola ${agente.nombre_completo ?? ''}, soy Ben, tu asistente inmobiliario 😊 ¿Cómo te fue con tu ${ETIQUETA_TIPO[a.tipo_actividad] ?? a.tipo_actividad} con ${contacto?.nombre_completo ?? 'el cliente'}?`,
          'Cuéntame si se realizó y cómo te fue. Responde citando este mensaje 🙂',
        ].join('\n')

    const idMessage = await enviarWhatsapp({
      chatId,
      mensaje,
      organizationId: a.organization_id,
      agenteId: a.agente_id,
      actividadId: a.id,
    })

    const { error: errorInsert } = await supabase.from('seguimientos_ia').insert({
      actividad_id: a.id,
      lead_id: a.lead_id,
      agente_id: a.agente_id,
      contacto_id: a.contacto_id,
      organization_id: a.organization_id,
      creado_por: a.creado_por ?? null,
      fase: esFirma ? 'resultado_firma' : 'resultado_visita',
      estado: 'pendiente',
      pregunta_texto: mensaje,
      chat_id_asesor: chatId,
      green_api_message_id: idMessage,
      intento: 1,
      proximo_reintento_en: new Date(Date.now() + 24 * 3600_000).toISOString(),
    })
    if (errorInsert) console.error(`No se pudo registrar seguimiento_ia para actividad ${a.id}:`, errorInsert)
    else enviadas++
  }
  return { enviadas }
}

async function procesarReintentosYVencidos() {
  const { data: pendientes, error } = await supabase
    .from('seguimientos_ia')
    .select('id, fase, pregunta_texto, chat_id_asesor, organization_id, agente_id, actividad_id, intento')
    .eq('estado', 'pendiente')
    .lte('proximo_reintento_en', new Date().toISOString())

  if (error) {
    console.error('Error consultando reintentos:', error)
    return { reenviadas: 0, vencidas: 0 }
  }

  let reenviadas = 0
  let vencidas = 0
  for (const s of pendientes ?? []) {
    const { maxIntentos, gapsHoras } = configReintento(s.fase)
    if (s.intento >= maxIntentos) {
      await supabase.from('seguimientos_ia').update({ estado: 'vencido', actualizado_en: new Date().toISOString() }).eq('id', s.id)
      vencidas++
      continue
    }
    await enviarWhatsapp({
      chatId: s.chat_id_asesor,
      mensaje: s.pregunta_texto,
      organizationId: s.organization_id,
      agenteId: s.agente_id,
      actividadId: s.actividad_id,
    })
    // gapsHoras[0] es el intervalo a usar después del PRIMER envío de este
    // ciclo de reintentos (cuando s.intento, antes de incrementar, vale 0
    // para confirmar_envio_propiedades o 1 para el resto, que ya envió el
    // primer mensaje al crear la fila); así sucesivamente.
    const gapHoras = gapsHoras[s.intento] ?? gapsHoras[gapsHoras.length - 1] ?? 24
    await supabase
      .from('seguimientos_ia')
      .update({
        intento: s.intento + 1,
        proximo_reintento_en: new Date(Date.now() + gapHoras * 3600_000).toISOString(),
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', s.id)
    reenviadas++
  }
  return { reenviadas, vencidas }
}

// Recordatorios de tareas creadas por Ben (ej. "Llamar a X para gestionar
// la reserva"): recordatorio_proximo_en se siembra con la fecha_limite al
// crear la tarea (seguimiento-ia-webhook) y se recorre +4h en cada envío —
// sin límite de reintentos, hasta que el asesor confirme por WhatsApp que
// ya la hizo (seguimiento-ia-webhook marca estado='completada').
async function procesarRecordatoriosDeTareas() {
  const { data: tareas, error } = await supabase
    .from('tareas')
    .select(
      'id, titulo, asignado_a, organization_id, ' +
        'asesor:perfiles!tareas_asignado_a_fkey(nombre_completo, telefono)'
    )
    .eq('creado_por_ia', true)
    .eq('estado', 'pendiente')
    .not('recordatorio_proximo_en', 'is', null)
    .lte('recordatorio_proximo_en', new Date().toISOString())

  if (error) {
    console.error('Error consultando recordatorios de tareas:', error)
    return { recordatoriosTareas: 0 }
  }
  if (!tareas || tareas.length === 0) return { recordatoriosTareas: 0 }

  let enviados = 0
  for (const t of tareas) {
    const asesor = Array.isArray(t.asesor) ? t.asesor[0] : t.asesor
    if (!asesor?.telefono) {
      console.error(`Tarea ${t.id}: el asesor ${t.asignado_a} no tiene teléfono registrado, se omite.`)
      continue
    }
    const chatId = telefonoAChatId(asesor.telefono)
    const mensaje = `Hola ${asesor.nombre_completo ?? ''}, soy Ben 😊 ¿Ya pudiste completar esto: "${t.titulo}"? Responde citando este mensaje 🙂`

    const idMessage = await enviarWhatsapp({
      chatId,
      mensaje,
      organizationId: t.organization_id,
      agenteId: t.asignado_a,
      actividadId: null,
      tipoNotificacion: 'tareas_recordatorio_ia',
    })

    await supabase
      .from('tareas')
      .update({
        recordatorio_chat_id: chatId,
        recordatorio_green_api_message_id: idMessage,
        recordatorio_enviado_en: new Date().toISOString(),
        recordatorio_proximo_en: new Date(Date.now() + 4 * 3600_000).toISOString(),
      })
      .eq('id', t.id)
    enviados++
  }
  return { recordatoriosTareas: enviados }
}

// Recordatorio al asesor que CUBRE la cita (agente_id) 24h y 2h antes de
// que ocurra — no al cliente (fuera de alcance por ahora). Cada tramo se
// marca con su propio *_enviado_en para no reenviar en cada corrida del
// cron (cada 15 min); el 24h se omite si ya estamos a menos de 2h (para
// no duplicar con el aviso de 2h en citas de último momento). Si la cita
// se reprograma, actualizarActividad (src/app/dashboard/leads/acciones.ts)
// resetea ambos campos a null para recalcular sobre la nueva fecha.
async function procesarRecordatoriosCitaAsesor() {
  const ahora = Date.now()
  const ahoraIso = new Date(ahora).toISOString()
  const en2h = new Date(ahora + 2 * 3600_000).toISOString()
  const en24h = new Date(ahora + 24 * 3600_000).toISOString()

  const SELECT_BASE =
    'id, lead_id, agente_id, contacto_id, tipo_actividad, programada_en, organization_id, ' +
    'contacto:contactos(nombre_completo), agente:perfiles!actividades_agente_id_fkey(nombre_completo, telefono)'

  async function enviarTramo(columna: string, desde: string, hasta: string, etiquetaTiempo: string) {
    const { data: actividades, error } = await supabase
      .from('actividades')
      .select(SELECT_BASE)
      .in('tipo_actividad', TIPOS_SEGUIMIENTO)
      .is('completada_en', null)
      .is(columna, null)
      .gt('programada_en', desde)
      .lte('programada_en', hasta)

    if (error) {
      console.error(`Error consultando recordatorios de cita (${columna}):`, error)
      return 0
    }
    let enviados = 0
    for (const a of actividades ?? []) {
      const contacto = Array.isArray(a.contacto) ? a.contacto[0] : a.contacto
      const agente = Array.isArray(a.agente) ? a.agente[0] : a.agente
      if (!agente?.telefono) {
        console.error(`Actividad ${a.id}: el asesor ${a.agente_id} no tiene teléfono registrado, se omite recordatorio.`)
        continue
      }
      const mensaje = `¡Hola ${agente.nombre_completo ?? ''}! 😊 Soy Ben, recordatorio${etiquetaTiempo}: tienes ${ETIQUETA_TIPO[a.tipo_actividad] ?? a.tipo_actividad} con ${contacto?.nombre_completo ?? 'el cliente'} el ${formatearFechaHoraGT(a.programada_en)}.`
      await enviarWhatsapp({
        chatId: telefonoAChatId(agente.telefono),
        mensaje,
        organizationId: a.organization_id,
        agenteId: a.agente_id,
        actividadId: a.id,
        tipoNotificacion: columna === 'recordatorio_agente_24h_enviado_en' ? 'recordatorio_agente_24h' : 'recordatorio_agente_2h',
      })
      await supabase.from('actividades').update({ [columna]: new Date().toISOString() }).eq('id', a.id)
      enviados++
    }
    return enviados
  }

  const recordatorios2h = await enviarTramo('recordatorio_agente_2h_enviado_en', ahoraIso, en2h, ' (en 2 horas)')
  // El de 24h solo mira citas que todavía están a MÁS de 2h (evita
  // duplicar con el de 2h en citas de último momento, programadas con
  // menos de 24h de anticipación).
  const recordatorios24h = await enviarTramo('recordatorio_agente_24h_enviado_en', en2h, en24h, '')

  return { recordatorios24h, recordatorios2h }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-notificacion-secret') !== FUNCTION_SECRET) {
    return new Response('No autorizado', { status: 401 })
  }

  const nuevas = await procesarCandidatasNuevas()
  const reintentos = await procesarReintentosYVencidos()
  const tareas = await procesarRecordatoriosDeTareas()
  const recordatoriosCita = await procesarRecordatoriosCitaAsesor()

  return new Response(
    JSON.stringify({ ok: true, ...nuevas, ...reintentos, ...tareas, ...recordatoriosCita }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
