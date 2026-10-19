// Webhook público que Green API llama en cada mensaje de WhatsApp entrante
// (configurar webhookUrl + incomingMessageReceived en la consola de Green
// API, con el secreto de esta función en la URL vía ?secreto=).
//
// Resuelve a qué seguimiento_ia pendiente responde el asesor (por chatId,
// con preferencia por la pregunta citada si Green API la reporta), clasifica
// la respuesta con Gemini (mismo patrón de response_schema que
// generar-informe) y ejecuta la acción: mover el lead, crear la siguiente
// actividad, registrar todo en comentarios_actividad y responder al asesor.
//
// Ante cualquier ambigüedad de Gemini (no_concluyente / confianza_fecha
// baja), NUNCA se adivina: se pide una aclaración una sola vez y, si sigue
// sin ser clara, se cierra para revisión manual del admin sin tocar la
// etapa del lead.

import { createClient } from 'npm:@supabase/supabase-js@2'

const WEBHOOK_SECRET = Deno.env.get('SEGUIMIENTO_IA_WEBHOOK_SECRET')!
const GREEN_API_ID_INSTANCE = Deno.env.get('GREEN_API_ID_INSTANCE')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const WHATSAPP_FUNCTION_SECRET = Deno.env.get('WHATSAPP_FUNCTION_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const WHATSAPP_ENVIAR_URL = `${SUPABASE_URL}/functions/v1/whatsapp-enviar`

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const ETAPAS_TERMINALES = ['reservada', 'perdida']

// ---------------------------------------------------------------------
// Gemini: mismo patrón de generar-informe/index.ts (response_schema +
// reintento ante 503/429).
// ---------------------------------------------------------------------

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function llamarGemini(prompt: string, responseSchema: Record<string, unknown>) {
  const maxIntentos = 3
  let ultimoError: Error | null = null

  for (let intento = 1; intento <= maxIntentos; intento++) {
    const respuesta = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: 'application/json', response_schema: responseSchema, temperature: 0.2 },
      }),
    })

    if (respuesta.ok) return respuesta.json()

    const texto = await respuesta.text()
    ultimoError = new Error(`Gemini respondió ${respuesta.status}: ${texto}`)
    const esTransitorio = respuesta.status === 503 || respuesta.status === 429
    if (!esTransitorio || intento === maxIntentos) throw ultimoError
    await esperar(1000 * intento)
  }
  throw ultimoError ?? new Error('Gemini no respondió')
}

function parsearRespuestaGemini(data: any): Record<string, unknown> {
  const contenido = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!contenido) throw new Error('Respuesta de Gemini sin contenido: ' + JSON.stringify(data))
  try {
    return JSON.parse(contenido)
  } catch {
    const saneado = contenido.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').replace(/\r?\n/g, '\\n')
    return JSON.parse(saneado)
  }
}

// ---------------------------------------------------------------------
// Esquemas de clasificación por fase
// ---------------------------------------------------------------------

const SCHEMA_RESULTADO_VISITA = {
  type: 'OBJECT',
  properties: {
    asistio: { type: 'BOOLEAN' },
    resultado_cliente: {
      type: 'STRING',
      enum: ['reservo', 'perdido', 'indeciso_mas_opciones', 'indeciso_sin_decision', 'no_concluyente'],
    },
    resumen: { type: 'STRING' },
  },
  required: ['asistio', 'resultado_cliente', 'resumen'],
}

const SCHEMA_REPROGRAMAR = {
  type: 'OBJECT',
  properties: {
    quiere_reprogramar: { type: 'BOOLEAN' },
    fecha_hora_iso: { type: 'STRING', nullable: true },
    confianza_fecha: { type: 'STRING', enum: ['alta', 'media', 'baja', 'ninguna'] },
  },
  required: ['quiere_reprogramar', 'confianza_fecha'],
}

const SCHEMA_OFRECER_SIGUIENTE_PASO = {
  type: 'OBJECT',
  properties: {
    proximo_paso: { type: 'STRING', enum: ['llamada', 'nueva_visita', 'ninguno_por_ahora', 'perdido'] },
    fecha_hora_iso: { type: 'STRING', nullable: true },
    confianza_fecha: { type: 'STRING', enum: ['alta', 'media', 'baja', 'ninguna'] },
  },
  required: ['proximo_paso', 'confianza_fecha'],
}

const ETIQUETA_TIPO: Record<string, string> = {
  cita: 'cita', reunion: 'reunión', video_llamada: 'video llamada', llamada: 'llamada',
}

function fechaHoraGuatemalaTexto(): string {
  const ahora = new Date()
  const fecha = ahora.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Guatemala' })
  const hora = ahora.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guatemala' })
  return `${fecha}, ${hora}`
}

function construirPrompt(fase: string, mensajeAsesor: string, esAclaracion: boolean): string {
  const contextoFecha = `Fecha y hora actuales en Guatemala: ${fechaHoraGuatemalaTexto()}.`
  if (fase === 'resultado_visita') {
    return [
      contextoFecha,
      'Un asesor inmobiliario respondió por WhatsApp a la pregunta "¿qué pasó con tu cita/llamada con el cliente?".',
      `Respuesta del asesor: "${mensajeAsesor}"`,
      'Clasifica si el cliente asistió/atendió, y si asistió, cuál fue el resultado: "reservo" (quiere reservar la propiedad), "perdido" (no le interesó, definitivo), "indeciso_mas_opciones" (quiere ver más propiedades), "indeciso_sin_decision" (no se decide, sin pedir más opciones), o "no_concluyente" si el texto no permite determinarlo con confianza. No asumas "reservo" ni "perdido" salvo que el texto sea claro.',
    ].join('\n')
  }
  if (fase === 'reprogramar') {
    return [
      contextoFecha,
      esAclaracion
        ? 'El asesor ya dijo que quieren reprogramar la cita, pero su mensaje anterior no dejó clara la fecha/hora. Se le volvió a preguntar.'
        : 'El cliente no asistió/atendió. Se le preguntó al asesor por WhatsApp si el cliente quiere reprogramar y para cuándo.',
      `Respuesta del asesor: "${mensajeAsesor}"`,
      'Determina si quiere reprogramar (quiere_reprogramar) y, si dio una fecha/hora, conviértela a fecha_hora_iso (formato ISO 8601 con zona -06:00, usando la fecha actual de arriba como referencia para expresiones relativas como "el jueves" o "mañana"). confianza_fecha debe ser "alta" solo si la fecha y hora son inequívocas, "media" si falta precisión (ej. solo el día, sin hora), "baja" si es muy vaga, o "ninguna" si no mencionó fecha. No inventes una fecha si no la mencionó.',
    ].join('\n')
  }
  // ofrecer_siguiente_paso
  return [
    contextoFecha,
    esAclaracion
      ? 'El asesor ya dijo qué siguiente paso quiere, pero su mensaje anterior no dejó clara la fecha/hora. Se le volvió a preguntar.'
      : 'El cliente quedó indeciso tras la visita. Se le preguntó al asesor si programan una llamada o una nueva visita de seguimiento, y para cuándo.',
    `Respuesta del asesor: "${mensajeAsesor}"`,
    'Determina proximo_paso: "llamada" (llamada de seguimiento), "nueva_visita" (otra cita presencial), "ninguno_por_ahora" (no quiere agendar nada todavía), o "perdido" (en realidad ya no sigue interesado). Si es llamada o nueva_visita, conviértela a fecha_hora_iso igual que arriba, con confianza_fecha. No inventes una fecha si no la mencionó.',
  ].join('\n')
}

// ---------------------------------------------------------------------
// Acciones de negocio
// ---------------------------------------------------------------------

async function moverEtapa(leadId: string, nuevaEtapa: string) {
  await supabase
    .from('leads')
    .update({ etapa: nuevaEtapa, actualizado_en: new Date().toISOString() })
    .eq('id', leadId)
    .not('etapa', 'in', `(${ETAPAS_TERMINALES.join(',')})`)
}

async function registrarComentario(actividadId: string, texto: string) {
  const { error } = await supabase.from('comentarios_actividad').insert({
    actividad_id: actividadId,
    creado_por: null,
    contenido: `🤖 Agente de seguimiento: ${texto}`,
  })
  if (error) console.error('No se pudo registrar comentario de seguimiento IA:', error)
}

async function responderAsesor(chatId: string, mensaje: string, organizationId: string, agenteId: string, actividadId: string): Promise<string | null> {
  const res = await fetch(WHATSAPP_ENVIAR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'x-notificacion-secret': WHATSAPP_FUNCTION_SECRET,
    },
    body: JSON.stringify({
      chatId,
      mensaje,
      registrar: { organization_id: organizationId, tipo_notificacion: 'seguimiento_ia_respuesta', agente_id: agenteId, actividad_id: actividadId },
    }),
  })
  if (!res.ok) {
    console.error(`whatsapp-enviar respondió ${res.status}: ${await res.text()}`)
    return null
  }
  return (await res.json()).idMessage ?? null
}

type SeguimientoRow = {
  id: string
  actividad_id: string
  lead_id: string
  agente_id: string
  organization_id: string
  fase: string
  chat_id_asesor: string
  es_reintento_aclaracion: boolean
}

async function crearSiguienteActividad(params: {
  leadId: string
  organizationId: string
  agenteId: string
  tipoActividad: string
  programadaEn: string
}) {
  // El contacto se toma de la actividad original del mismo lead (más reciente),
  // que es la fuente de verdad de a quién se le está dando seguimiento.
  const { data: actividadPrevia } = await supabase
    .from('actividades')
    .select('contacto_id, colega_id')
    .eq('lead_id', params.leadId)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('actividades').insert({
    contacto_id: actividadPrevia?.contacto_id ?? null,
    lead_id: params.leadId,
    agente_id: params.agenteId,
    creado_por: params.agenteId,
    colega_id: actividadPrevia?.colega_id ?? null,
    tipo_actividad: params.tipoActividad,
    programada_en: params.programadaEn,
    organization_id: params.organizationId,
  })
  if (error) console.error('No se pudo crear la siguiente actividad de seguimiento:', error)
  return !error
}

// Marca la fila como "respondido" de forma atómica (solo si seguía
// "pendiente") para no reprocesar la misma respuesta dos veces si Green
// API reentrega el webhook.
async function reclamarSeguimiento(seguimientoId: string, respuestaTexto: string): Promise<boolean> {
  const { data } = await supabase
    .from('seguimientos_ia')
    .update({ estado: 'respondido', respuesta_texto: respuestaTexto, respondido_en: new Date().toISOString() })
    .eq('id', seguimientoId)
    .eq('estado', 'pendiente')
    .select('id')
  return !!data && data.length > 0
}

async function reabrirConNuevaFase(seguimiento: SeguimientoRow, fase: string, preguntaTexto: string, esAclaracion: boolean) {
  const idMessage = await responderAsesor(seguimiento.chat_id_asesor, preguntaTexto, seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
  await supabase
    .from('seguimientos_ia')
    .update({
      fase,
      estado: 'pendiente',
      pregunta_texto: preguntaTexto,
      green_api_message_id: idMessage,
      es_reintento_aclaracion: esAclaracion,
      intento: 1,
      proximo_reintento_en: new Date(Date.now() + 24 * 3600_000).toISOString(),
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', seguimiento.id)
}

async function cerrarParaRevisionManual(seguimiento: SeguimientoRow, motivo: string) {
  await registrarComentario(seguimiento.actividad_id, `${motivo} Requiere revisión manual — no se movió el lead.`)
  await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
}

// ---------------------------------------------------------------------
// Árbol de decisión por fase
// ---------------------------------------------------------------------

async function procesarResultadoVisita(seguimiento: SeguimientoRow, mensajeAsesor: string) {
  const clasificacion = parsearRespuestaGemini(
    await llamarGemini(construirPrompt('resultado_visita', mensajeAsesor, false), SCHEMA_RESULTADO_VISITA)
  ) as { asistio: boolean; resultado_cliente: string; resumen: string }

  if (!clasificacion.asistio) {
    const pregunta = '¿Quieren reprogramar la visita? Si es así, dime para cuándo. Responde citando este mensaje.'
    await registrarComentario(seguimiento.actividad_id, `El cliente no asistió/atendió. ${clasificacion.resumen}`)
    await reabrirConNuevaFase(seguimiento, 'reprogramar', pregunta, false)
    return
  }

  if (clasificacion.resultado_cliente === 'no_concluyente') {
    if (seguimiento.es_reintento_aclaracion) {
      await cerrarParaRevisionManual(seguimiento, `No quedó claro el resultado de la visita. Respuesta del asesor: "${mensajeAsesor}".`)
      return
    }
    const pregunta = 'No me quedó claro: ¿el cliente quiere reservar, no le interesó, o se quedó indeciso? Responde citando este mensaje.'
    await reabrirConNuevaFase(seguimiento, 'resultado_visita', pregunta, true)
    return
  }

  await registrarComentario(seguimiento.actividad_id, clasificacion.resumen)

  if (clasificacion.resultado_cliente === 'reservo') {
    await moverEtapa(seguimiento.lead_id, 'reservada')
    await responderAsesor(seguimiento.chat_id_asesor, '¡Excelente! Moví el lead a Reservada 🎉', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }
  if (clasificacion.resultado_cliente === 'perdido') {
    await moverEtapa(seguimiento.lead_id, 'perdida')
    await responderAsesor(seguimiento.chat_id_asesor, 'Entendido, marqué el lead como Perdido.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }
  // indeciso_mas_opciones / indeciso_sin_decision
  await moverEtapa(seguimiento.lead_id, 'visita_realizada')
  const pregunta = '¿Programamos una llamada o una nueva visita de seguimiento? Si es así, dime para cuándo. Responde citando este mensaje.'
  await reabrirConNuevaFase(seguimiento, 'ofrecer_siguiente_paso', pregunta, false)
}

async function procesarConFecha(
  seguimiento: SeguimientoRow,
  mensajeAsesor: string,
  schema: Record<string, unknown>,
  campoDecision: string
) {
  const clasificacion = parsearRespuestaGemini(
    await llamarGemini(construirPrompt(seguimiento.fase, mensajeAsesor, seguimiento.es_reintento_aclaracion), schema)
  ) as Record<string, any>

  const decision = clasificacion[campoDecision] as string | boolean
  const fechaIso = clasificacion.fecha_hora_iso as string | null
  const confianza = clasificacion.confianza_fecha as string

  const necesitaFecha =
    (seguimiento.fase === 'reprogramar' && decision === true) ||
    (seguimiento.fase === 'ofrecer_siguiente_paso' && typeof decision === 'string' && ['llamada', 'nueva_visita'].includes(decision))

  if (necesitaFecha && (confianza === 'baja' || confianza === 'ninguna' || !fechaIso)) {
    if (seguimiento.es_reintento_aclaracion) {
      await cerrarParaRevisionManual(seguimiento, `No quedó clara la fecha propuesta. Respuesta del asesor: "${mensajeAsesor}".`)
      return
    }
    const pregunta = '¿Para qué fecha y hora exactas? Responde citando este mensaje.'
    await reabrirConNuevaFase(seguimiento, seguimiento.fase, pregunta, true)
    return
  }

  if (seguimiento.fase === 'reprogramar') {
    if (decision === false) {
      await registrarComentario(seguimiento.actividad_id, 'El cliente no quiere reprogramar.')
      await moverEtapa(seguimiento.lead_id, 'perdida')
      await responderAsesor(seguimiento.chat_id_asesor, 'Entendido, marqué el lead como Perdido.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
      await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
      return
    }
    await crearSiguienteActividad({ leadId: seguimiento.lead_id, organizationId: seguimiento.organization_id, agenteId: seguimiento.agente_id, tipoActividad: 'cita', programadaEn: fechaIso! })
    await moverEtapa(seguimiento.lead_id, 'visita_agendada')
    await registrarComentario(seguimiento.actividad_id, `Se reprogramó la visita para ${fechaIso}.`)
    await responderAsesor(seguimiento.chat_id_asesor, `Listo, agendé la nueva visita. Te escribiré de nuevo un par de horas después para dar seguimiento.`, seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }

  // ofrecer_siguiente_paso
  if (decision === 'ninguno_por_ahora') {
    await registrarComentario(seguimiento.actividad_id, 'El asesor prefiere no agendar nada por ahora.')
    await responderAsesor(seguimiento.chat_id_asesor, 'Entendido, el lead queda tal como está.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
  } else if (decision === 'perdido') {
    await moverEtapa(seguimiento.lead_id, 'perdida')
    await registrarComentario(seguimiento.actividad_id, 'El cliente ya no está interesado.')
    await responderAsesor(seguimiento.chat_id_asesor, 'Entendido, marqué el lead como Perdido.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
  } else {
    const tipo = decision === 'llamada' ? 'llamada' : 'cita'
    await crearSiguienteActividad({ leadId: seguimiento.lead_id, organizationId: seguimiento.organization_id, agenteId: seguimiento.agente_id, tipoActividad: tipo, programadaEn: fechaIso! })
    await registrarComentario(seguimiento.actividad_id, `Se agendó ${ETIQUETA_TIPO[tipo]} de seguimiento para ${fechaIso}.`)
    await responderAsesor(seguimiento.chat_id_asesor, `Listo, agendé la ${ETIQUETA_TIPO[tipo]}. Te escribiré de nuevo un par de horas después para dar seguimiento.`, seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
  }
  await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
}

async function procesarRespuesta(seguimiento: SeguimientoRow, mensajeAsesor: string) {
  if (seguimiento.fase === 'resultado_visita') {
    await procesarResultadoVisita(seguimiento, mensajeAsesor)
  } else if (seguimiento.fase === 'reprogramar') {
    await procesarConFecha(seguimiento, mensajeAsesor, SCHEMA_REPROGRAMAR, 'quiere_reprogramar')
  } else {
    await procesarConFecha(seguimiento, mensajeAsesor, SCHEMA_OFRECER_SIGUIENTE_PASO, 'proximo_paso')
  }
}

// ---------------------------------------------------------------------
// Resolución de a qué seguimiento pendiente responde el mensaje entrante
// ---------------------------------------------------------------------

async function resolverSeguimientoPendiente(chatId: string, stanzaIdCitado: string | null): Promise<SeguimientoRow | null> {
  const { data: pendientes } = await supabase
    .from('seguimientos_ia')
    .select('id, actividad_id, lead_id, agente_id, organization_id, fase, chat_id_asesor, es_reintento_aclaracion, green_api_message_id')
    .eq('chat_id_asesor', chatId)
    .eq('estado', 'pendiente')
    .order('creado_en', { ascending: false })

  if (!pendientes || pendientes.length === 0) return null
  if (pendientes.length === 1) return pendientes[0] as SeguimientoRow

  if (stanzaIdCitado) {
    const porCita = pendientes.find((p) => p.green_api_message_id === stanzaIdCitado)
    if (porCita) return porCita as SeguimientoRow
  }

  // Varias conversaciones abiertas sin cita clara: se asume la más reciente
  // y se deja advertencia para que el admin confirme que fue la correcta.
  const masReciente = pendientes[0] as SeguimientoRow
  await registrarComentario(
    masReciente.actividad_id,
    `Respuesta ambigua: el asesor tiene ${pendientes.length} seguimientos abiertos y no citó ninguna pregunta. Se asumió que esta respuesta era para esta cita.`
  )
  return masReciente
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------

Deno.serve(async (req) => {
  const url = new URL(req.url)
  if (url.searchParams.get('secreto') !== WEBHOOK_SECRET) {
    return new Response('No autorizado', { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response('JSON inválido', { status: 400 })
  }

  // Green API envía varios tipos de webhook (estado de entrega, etc.);
  // solo nos interesan los mensajes entrantes de texto.
  if (body.typeWebhook !== 'incomingMessageReceived') {
    return new Response(JSON.stringify({ ok: true, ignorado: body.typeWebhook }), { status: 200 })
  }
  if (String(body.instanceData?.idInstance ?? '') !== GREEN_API_ID_INSTANCE) {
    return new Response('No autorizado', { status: 401 })
  }

  const chatId = body.senderData?.chatId as string | undefined
  const textoMensaje =
    body.messageData?.textMessageData?.textMessage ??
    body.messageData?.extendedTextMessageData?.text ??
    null
  // Nombre de campo a confirmar contra la documentación real de Green API
  // al activar esto; si no existe, el fallback de "más reciente" sigue
  // funcionando igual.
  const stanzaIdCitado = body.messageData?.extendedTextMessageData?.stanzaId ?? null

  if (!chatId || !textoMensaje) {
    return new Response(JSON.stringify({ ok: true, ignorado: 'sin chatId o texto' }), { status: 200 })
  }

  const seguimiento = await resolverSeguimientoPendiente(chatId, stanzaIdCitado)
  if (!seguimiento) {
    // Mensaje de alguien sin seguimiento pendiente: no es asunto de este agente.
    return new Response(JSON.stringify({ ok: true, ignorado: 'sin seguimiento pendiente' }), { status: 200 })
  }

  const reclamado = await reclamarSeguimiento(seguimiento.id, textoMensaje)
  if (!reclamado) {
    // Ya fue procesado por una entrega anterior del mismo webhook (Green
    // API puede reentregar); no se reprocesa.
    return new Response(JSON.stringify({ ok: true, duplicado: true }), { status: 200 })
  }

  try {
    await procesarRespuesta(seguimiento, textoMensaje)
  } catch (err) {
    console.error(`Error procesando seguimiento ${seguimiento.id}:`, err)
    await cerrarParaRevisionManual(seguimiento, `Error al procesar la respuesta con IA: ${err instanceof Error ? err.message : String(err)}.`)
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
