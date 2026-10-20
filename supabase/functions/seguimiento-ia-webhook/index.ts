// Webhook público que Green API llama en cada mensaje de WhatsApp entrante
// (configurar webhookUrl + incomingMessageReceived en la consola de Green
// API, con el secreto de esta función en la URL vía ?secreto=).
//
// Resuelve a qué seguimiento_ia pendiente responde el asesor (por chatId,
// con preferencia por la pregunta citada si Green API la reporta), clasifica
// la respuesta con Groq (GPT-OSS 120B) y ejecuta la acción: mover el lead,
// crear la siguiente actividad, registrar todo en comentarios_actividad y
// responder al asesor.
//
// Ante cualquier ambigüedad de la IA (no_concluyente / confianza_fecha
// baja), NUNCA se adivina: se pide una aclaración una sola vez y, si sigue
// sin ser clara, se cierra para revisión manual del admin sin tocar la
// etapa del lead.

import { createClient } from 'npm:@supabase/supabase-js@2'

const WEBHOOK_SECRET = Deno.env.get('SEGUIMIENTO_IA_WEBHOOK_SECRET')!
const GREEN_API_ID_INSTANCE = Deno.env.get('GREEN_API_ID_INSTANCE')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const WHATSAPP_FUNCTION_SECRET = Deno.env.get('WHATSAPP_FUNCTION_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const GROQ_MODEL = 'openai/gpt-oss-120b'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const WHATSAPP_ENVIAR_URL = `${SUPABASE_URL}/functions/v1/whatsapp-enviar`

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const ETAPAS_TERMINALES = ['reservada', 'perdida']

// ---------------------------------------------------------------------
// Groq (API compatible con OpenAI): se usa en vez de Gemini porque el
// nivel gratuito de Gemini (20 solicitudes/día para gemini-2.5-flash) es
// insuficiente para este agente. Groq no fuerza un JSON Schema como
// Gemini (solo garantiza JSON válido con response_format: json_object),
// así que el formato exacto esperado se describe en el propio prompt
// (ver construirPrompt).
// ---------------------------------------------------------------------

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function llamarGroq(prompt: string) {
  const maxIntentos = 3
  let ultimoError: Error | null = null

  for (let intento = 1; intento <= maxIntentos; intento++) {
    const respuesta = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    })

    if (respuesta.ok) return respuesta.json()

    const texto = await respuesta.text()
    ultimoError = new Error(`Groq respondió ${respuesta.status}: ${texto}`)
    const esTransitorio = respuesta.status === 503 || respuesta.status === 429
    if (!esTransitorio || intento === maxIntentos) throw ultimoError
    await esperar(1000 * intento)
  }
  throw ultimoError ?? new Error('Groq no respondió')
}

function parsearRespuestaGroq(data: any): Record<string, unknown> {
  const contenido = data?.choices?.[0]?.message?.content
  if (!contenido) throw new Error('Respuesta de Groq sin contenido: ' + JSON.stringify(data))
  try {
    return JSON.parse(contenido)
  } catch {
    const saneado = contenido.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').replace(/\r?\n/g, '\\n')
    return JSON.parse(saneado)
  }
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
    if (esAclaracion) {
      // Ya se confirmó asistio=true en el turno anterior (si no hubiera
      // asistido, el flujo habría pasado a la fase "reprogramar", no a
      // una aclaración aquí). No se le vuelve a preguntar eso — solo el
      // resultado — para que no lo reclasifique mal con el texto nuevo.
      return [
        contextoFecha,
        'Ya se confirmó que el cliente SÍ asistió/atendió la cita o llamada. Un asesor inmobiliario respondió algo ambiguo sobre el RESULTADO de esa visita, y se le pidió que aclarara.',
        `Respuesta del asesor: "${mensajeAsesor}"`,
        'Clasifica cuál fue el resultado: "reservo" (el cliente EXPRESÓ que quiere reservar), "perdido" (no le interesó, definitivo), "indeciso_mas_opciones" (quiere ver más propiedades), "indeciso_sin_decision" (el cliente aún no ha dado una respuesta/decisión — "quedó pendiente", "lo está pensando", "no ha respondido todavía"), o "no_concluyente" si el texto sigue sin permitir determinarlo. Marca requiere_revision_documentos=true solo si menciona papelería/documentos pendientes de revisar.',
        'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente estos campos: {"asistio": true, "resultado_cliente": "reservo"|"perdido"|"indeciso_mas_opciones"|"indeciso_sin_decision"|"no_concluyente", "requiere_revision_documentos": true|false, "resumen": "texto breve"}.',
      ].join('\n')
    }
    return [
      contextoFecha,
      'Un asesor inmobiliario respondió por WhatsApp a la pregunta "¿qué pasó con tu cita/llamada con el cliente?".',
      `Respuesta del asesor: "${mensajeAsesor}"`,
      'Clasifica si el cliente asistió/atendió, y si asistió, cuál fue el resultado: "reservo" (el cliente EXPRESÓ que quiere reservar — no que ya reservó formalmente, solo que esa es su intención), "perdido" (no le interesó, definitivo), "indeciso_mas_opciones" (quiere ver más propiedades), "indeciso_sin_decision" (el cliente aún no ha dado una respuesta/decisión — "quedó pendiente", "lo está pensando", "no ha respondido todavía"), o "no_concluyente" si el texto no permite determinarlo con confianza. No asumas "reservo" ni "perdido" salvo que el texto sea claro. Además, marca requiere_revision_documentos=true solo si el asesor menciona que el cliente va a enviar papelería/documentos para que los revisen antes de confirmar la reserva; si no lo menciona, ponlo en false.',
      'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente estos campos: {"asistio": true|false, "resultado_cliente": "reservo"|"perdido"|"indeciso_mas_opciones"|"indeciso_sin_decision"|"no_concluyente", "requiere_revision_documentos": true|false, "resumen": "texto breve"}.',
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
      'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente estos campos: {"quiere_reprogramar": true|false, "fecha_hora_iso": "YYYY-MM-DDTHH:mm:ss-06:00"|null, "confianza_fecha": "alta"|"media"|"baja"|"ninguna"}.',
    ].join('\n')
  }
  if (fase === 'confirmar_reintento_24h') {
    return [
      contextoFecha,
      'Se le preguntó al asesor si quiere que se le vuelva a consultar en 24 horas sobre si pudieron reprogramar la visita, o si prefiere marcar el lead como perdido de una vez.',
      `Respuesta del asesor: "${mensajeAsesor}"`,
      'Determina volver_a_consultar: true si quiere que se le pregunte de nuevo en 24 horas, false si prefiere marcarlo como perdido ahora.',
      'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente este campo: {"volver_a_consultar": true|false}.',
    ].join('\n')
  }
  if (fase === 'confirmar_envio_propiedades') {
    return [
      contextoFecha,
      'Se le preguntó al asesor si ya le envió al cliente más opciones/propiedades que había quedado pendiente de enviar.',
      `Respuesta del asesor: "${mensajeAsesor}"`,
      'Determina enviadas: true solo si confirma que ya las envió; false en cualquier otro caso (todavía no, está por hacerlo, respuesta ambigua, etc.) — ante la duda, false.',
      'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente este campo: {"enviadas": true|false}.',
    ].join('\n')
  }
  // ofrecer_siguiente_paso
  return [
    contextoFecha,
    esAclaracion
      ? 'El asesor ya dijo qué siguiente paso quiere, pero su mensaje anterior no dejó clara la fecha/hora. Se le volvió a preguntar.'
      : 'El cliente quedó indeciso tras la visita. Se le preguntó al asesor si programan una llamada, una nueva visita, o si va a enviarle más opciones de propiedades, y para cuándo.',
    `Respuesta del asesor: "${mensajeAsesor}"`,
    'Determina proximo_paso, distinguiendo con cuidado: "llamada" SOLO si el asesor menciona explícitamente una llamada telefónica o videollamada con el cliente; "nueva_visita" si menciona una cita, visita o verse en persona de nuevo (NO es una llamada); "enviar_opciones" si lo que va a pasar es que el asesor le va a enviar/mostrar más propiedades u opciones al cliente (una tarea del asesor, no una reunión con el cliente); "ninguno_por_ahora" si no quiere agendar nada todavía; "perdido" si en realidad el cliente ya no sigue interesado. Para "llamada", "nueva_visita" o "enviar_opciones", conviértelo a fecha_hora_iso igual que arriba, con confianza_fecha. No inventes una fecha si no la mencionó.',
    'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente estos campos: {"proximo_paso": "llamada"|"nueva_visita"|"enviar_opciones"|"ninguno_por_ahora"|"perdido", "fecha_hora_iso": "YYYY-MM-DDTHH:mm:ss-06:00"|null, "confianza_fecha": "alta"|"media"|"baja"|"ninguna"}.',
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
  contacto_id: string | null
  organization_id: string
  fase: string
  chat_id_asesor: string
  es_reintento_aclaracion: boolean
}

async function obtenerNombreContacto(contactoId: string | null): Promise<string> {
  if (!contactoId) return 'el cliente'
  const { data } = await supabase.from('contactos').select('nombre_completo').eq('id', contactoId).maybeSingle()
  return data?.nombre_completo ?? 'el cliente'
}

async function crearTarea(params: {
  leadId: string
  contactoId: string | null
  agenteId: string
  organizationId: string
  titulo: string
  fechaLimite: string
  prioridad: 'baja' | 'media' | 'alta'
}) {
  const { error } = await supabase.from('tareas').insert({
    asignado_a: params.agenteId,
    contacto_id: params.contactoId,
    lead_id: params.leadId,
    titulo: params.titulo,
    fecha_limite: params.fechaLimite,
    estado: 'pendiente',
    prioridad: params.prioridad,
    organization_id: params.organizationId,
  })
  if (error) console.error('No se pudo crear la tarea de seguimiento IA:', error)
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

// Para seguimientos que no se preguntan de inmediato, sino en un momento
// futuro programado (ej. "pregúntale en 1 hora si ya envió las propiedades").
// A diferencia de reabrirConNuevaFase, NO envía nada por WhatsApp ahora —
// solo deja la fila lista para que el cron la dispare cuando corresponda.
async function programarPreguntaFutura(seguimiento: SeguimientoRow, fase: string, preguntaTexto: string, enviarEn: Date) {
  await supabase
    .from('seguimientos_ia')
    .update({
      fase,
      estado: 'pendiente',
      pregunta_texto: preguntaTexto,
      green_api_message_id: null,
      es_reintento_aclaracion: false,
      intento: 0,
      proximo_reintento_en: enviarEn.toISOString(),
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
  const clasificacion = parsearRespuestaGroq(
    await llamarGroq(construirPrompt('resultado_visita', mensajeAsesor, seguimiento.es_reintento_aclaracion))
  ) as { asistio: boolean; resultado_cliente: string; requiere_revision_documentos: boolean; resumen: string }

  // En una aclaración de esta misma fase, "asistio" ya es un hecho
  // confirmado del turno anterior (si no hubiera asistido, ya estaríamos
  // en la fase "reprogramar") — se fuerza para no dejar que el modelo lo
  // reclasifique mal con un texto que ya no habla de eso.
  if (seguimiento.es_reintento_aclaracion) clasificacion.asistio = true

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
    const pregunta = 'Cuéntame más detalles: ¿el cliente quiere reservar, no le interesó, o se quedó indeciso? Responde citando este mensaje.'
    await reabrirConNuevaFase(seguimiento, 'resultado_visita', pregunta, true)
    return
  }

  if (clasificacion.resultado_cliente === 'reservo') {
    // "Reservo" es la intención verbal del cliente, no una reserva ya
    // formalizada — el lead se queda en "visita_realizada" y se gestiona
    // con una acción de seguimiento, nunca se salta directo a "reservada".
    await moverEtapa(seguimiento.lead_id, 'visita_realizada')
    if (clasificacion.requiere_revision_documentos) {
      await registrarComentario(seguimiento.actividad_id, 'Documentación en revisión.')
      await responderAsesor(seguimiento.chat_id_asesor, 'Entendido, quedo pendiente de la documentación.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    } else {
      await registrarComentario(seguimiento.actividad_id, `Cliente interesado en reservar. ${clasificacion.resumen}`)
      const nombreContacto = await obtenerNombreContacto(seguimiento.contacto_id)
      await crearTarea({
        leadId: seguimiento.lead_id,
        contactoId: seguimiento.contacto_id,
        agenteId: seguimiento.agente_id,
        organizationId: seguimiento.organization_id,
        titulo: `Llamar a ${nombreContacto} para gestionar la reserva`,
        fechaLimite: new Date(Date.now() + 24 * 3600_000).toISOString(),
        prioridad: 'alta',
      })
      await responderAsesor(seguimiento.chat_id_asesor, 'Perfecto, programé un recordatorio para llamarlo en 24 horas y gestionar la reserva.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    }
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }
  if (clasificacion.resultado_cliente === 'perdido') {
    await registrarComentario(seguimiento.actividad_id, clasificacion.resumen)
    await moverEtapa(seguimiento.lead_id, 'perdida')
    await responderAsesor(seguimiento.chat_id_asesor, 'Entendido, marqué el lead como Perdido.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }
  await registrarComentario(seguimiento.actividad_id, clasificacion.resumen)
  await moverEtapa(seguimiento.lead_id, 'visita_realizada')

  if (clasificacion.resultado_cliente === 'indeciso_sin_decision') {
    // El cliente aún no da una respuesta (lo está pensando, quedó
    // pendiente) — se sugiere y programa directamente una llamada de
    // seguimiento en 24h, en vez de preguntar qué hacer.
    const nombreContacto = await obtenerNombreContacto(seguimiento.contacto_id)
    await crearTarea({
      leadId: seguimiento.lead_id,
      contactoId: seguimiento.contacto_id,
      agenteId: seguimiento.agente_id,
      organizationId: seguimiento.organization_id,
      titulo: `Llamar a ${nombreContacto} para seguimiento (aún sin respuesta)`,
      fechaLimite: new Date(Date.now() + 24 * 3600_000).toISOString(),
      prioridad: 'media',
    })
    await responderAsesor(seguimiento.chat_id_asesor, 'Entendido, te programé una llamada de seguimiento en 24 horas para ver qué decidió.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }

  // indeciso_mas_opciones
  const pregunta = '¿Programamos una llamada o una nueva visita de seguimiento? Si es así, dime para cuándo. Responde citando este mensaje.'
  await reabrirConNuevaFase(seguimiento, 'ofrecer_siguiente_paso', pregunta, false)
}

async function procesarConFecha(
  seguimiento: SeguimientoRow,
  mensajeAsesor: string,
  campoDecision: string
) {
  const clasificacion = parsearRespuestaGroq(
    await llamarGroq(construirPrompt(seguimiento.fase, mensajeAsesor, seguimiento.es_reintento_aclaracion))
  ) as Record<string, any>

  const decision = clasificacion[campoDecision] as string | boolean
  const fechaIso = clasificacion.fecha_hora_iso as string | null
  const confianza = clasificacion.confianza_fecha as string

  const necesitaFecha =
    (seguimiento.fase === 'reprogramar' && decision === true) ||
    (seguimiento.fase === 'ofrecer_siguiente_paso' && typeof decision === 'string' && ['llamada', 'nueva_visita', 'enviar_opciones'].includes(decision))

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
      // No confirma reprogramar ahora: antes de marcar perdida, se le da la
      // opción de que se le consulte de nuevo en 24h (puede estar esperando
      // que el cliente le responda, por ejemplo).
      const pregunta = '¿Quieres que te vuelva a preguntar en 24 horas sobre esto, o prefieres que marque el lead como perdido ahora? Responde citando este mensaje.'
      await reabrirConNuevaFase(seguimiento, 'confirmar_reintento_24h', pregunta, false)
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
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }
  if (decision === 'perdido') {
    await moverEtapa(seguimiento.lead_id, 'perdida')
    await registrarComentario(seguimiento.actividad_id, 'El cliente ya no está interesado.')
    await responderAsesor(seguimiento.chat_id_asesor, 'Entendido, marqué el lead como Perdido.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }
  if (decision === 'enviar_opciones') {
    const nombreContacto = await obtenerNombreContacto(seguimiento.contacto_id)
    await crearTarea({
      leadId: seguimiento.lead_id,
      contactoId: seguimiento.contacto_id,
      agenteId: seguimiento.agente_id,
      organizationId: seguimiento.organization_id,
      titulo: `Enviarle más opciones de propiedades a ${nombreContacto}`,
      fechaLimite: fechaIso!,
      prioridad: 'media',
    })
    await registrarComentario(seguimiento.actividad_id, `Se programó enviar más opciones el ${fechaIso}; se dará seguimiento del envío.`)
    await responderAsesor(seguimiento.chat_id_asesor, 'Listo, te pregunto en 1 hora después de esa hora si ya se las enviaste.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    const horaEnvio = new Date(fechaIso!)
    await programarPreguntaFutura(
      seguimiento,
      'confirmar_envio_propiedades',
      `¿Ya le enviaste las propiedades a ${nombreContacto}? Responde citando este mensaje.`,
      new Date(horaEnvio.getTime() + 3600_000)
    )
    return
  }
  // llamada / nueva_visita
  const tipo = decision === 'llamada' ? 'llamada' : 'cita'
  await crearSiguienteActividad({ leadId: seguimiento.lead_id, organizationId: seguimiento.organization_id, agenteId: seguimiento.agente_id, tipoActividad: tipo, programadaEn: fechaIso! })
  await registrarComentario(seguimiento.actividad_id, `Se agendó ${ETIQUETA_TIPO[tipo]} de seguimiento para ${fechaIso}.`)
  await responderAsesor(seguimiento.chat_id_asesor, `Listo, agendé la ${ETIQUETA_TIPO[tipo]}. Te escribiré de nuevo un par de horas después para dar seguimiento.`, seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
  await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
}

async function procesarConfirmarReintento24h(seguimiento: SeguimientoRow, mensajeAsesor: string) {
  const clasificacion = parsearRespuestaGroq(
    await llamarGroq(construirPrompt('confirmar_reintento_24h', mensajeAsesor, false))
  ) as { volver_a_consultar: boolean }

  if (clasificacion.volver_a_consultar) {
    await responderAsesor(seguimiento.chat_id_asesor, 'Listo, te preguntaré de nuevo en 24 horas.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    await programarPreguntaFutura(
      seguimiento,
      'reprogramar',
      '¿Qué me cuentas, pudieron reprogramar la visita con el cliente? Responde citando este mensaje.',
      new Date(Date.now() + 24 * 3600_000)
    )
    return
  }
  await registrarComentario(seguimiento.actividad_id, 'El cliente no quiere reprogramar.')
  await moverEtapa(seguimiento.lead_id, 'perdida')
  await responderAsesor(seguimiento.chat_id_asesor, 'Entendido, marqué el lead como Perdido.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
  await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
}

async function procesarConfirmarEnvioPropiedades(seguimiento: SeguimientoRow, mensajeAsesor: string) {
  const clasificacion = parsearRespuestaGroq(
    await llamarGroq(construirPrompt('confirmar_envio_propiedades', mensajeAsesor, false))
  ) as { enviadas: boolean }

  if (clasificacion.enviadas) {
    await registrarComentario(seguimiento.actividad_id, 'El asesor confirmó que ya envió las propiedades.')
    await responderAsesor(seguimiento.chat_id_asesor, '¡Perfecto, gracias!', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }
  // Aún no las envía: se reabre a "pendiente" SIN tocar intento ni
  // proximo_reintento_en — esos ya quedaron bien calculados por el cron al
  // enviar este aviso (1h / +2h / +3h), así que el próximo aviso programado
  // sigue su curso tal cual.
  await responderAsesor(seguimiento.chat_id_asesor, 'Entendido, te preguntaré de nuevo más tarde.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
  await supabase.from('seguimientos_ia').update({ estado: 'pendiente', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
}

async function procesarRespuesta(seguimiento: SeguimientoRow, mensajeAsesor: string) {
  if (seguimiento.fase === 'resultado_visita') {
    await procesarResultadoVisita(seguimiento, mensajeAsesor)
  } else if (seguimiento.fase === 'reprogramar') {
    await procesarConFecha(seguimiento, mensajeAsesor, 'quiere_reprogramar')
  } else if (seguimiento.fase === 'ofrecer_siguiente_paso') {
    await procesarConFecha(seguimiento, mensajeAsesor, 'proximo_paso')
  } else if (seguimiento.fase === 'confirmar_reintento_24h') {
    await procesarConfirmarReintento24h(seguimiento, mensajeAsesor)
  } else {
    await procesarConfirmarEnvioPropiedades(seguimiento, mensajeAsesor)
  }
}

// ---------------------------------------------------------------------
// Resolución de a qué seguimiento pendiente responde el mensaje entrante
// ---------------------------------------------------------------------

async function resolverSeguimientoPendiente(chatId: string, stanzaIdCitado: string | null): Promise<SeguimientoRow | null> {
  const { data: pendientes } = await supabase
    .from('seguimientos_ia')
    .select('id, actividad_id, lead_id, agente_id, contacto_id, organization_id, fase, chat_id_asesor, es_reintento_aclaracion, green_api_message_id')
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
