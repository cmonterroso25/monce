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

// Solo las verdaderamente finales — "reservada" ya no bloquea moverEtapa,
// porque el seguimiento continúa después de reservar hasta la firma
// (eventualmente debe poder pasar de reservada -> ganada).
const ETAPAS_TERMINALES = ['ganada', 'perdida']

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
  cita: 'cita', reunion: 'reunión', video_llamada: 'video llamada', llamada: 'llamada', firma_contrato: 'firma de contrato',
}

const ETIQUETAS_ETAPA: Record<string, string> = {
  contacto_inicial: 'Contacto inicial', visita_agendada: 'Visita agendada', visita_realizada: 'Visita realizada',
  reservada: 'Reservada', ganada: 'Ganada', perdida: 'Perdida',
}

// 8 dígitos locales de Guatemala -> chatId individual de Green API. Mismo
// criterio que telefonoAChatId en seguimiento-ia-cron.
function telefonoAChatId(telefono: string): string {
  const soloDigitos = telefono.replace(/\D/g, '')
  const conCodigoPais = soloDigitos.length === 8 ? `502${soloDigitos}` : soloDigitos
  return `${conCodigoPais}@c.us`
}

// Mensajes reutilizados en los cierres de "Perdida" y "Ganada" en varias
// fases, para que el tono sea siempre el mismo (ánimo vs. celebración).
const MENSAJE_PERDIDA = 'Entendido, no te preocupes — ¡seguro pronto llega el cliente ideal! 💪 Gracias por el seguimiento.'
const MENSAJE_GANADA = '🎉🎉 ¡FELICIDADES!! Lograste cerrar el trato, excelente trabajo 🙌🏆 Moví el lead a Ganada. ¡Gracias por todo el seguimiento que le diste!'
const MENSAJE_RESERVADA = '🎉 ¡Buenísimo! Registré la reserva — moví el lead a Reservada. ¡Excelente trabajo! Seguimos de cerca hasta la firma.'

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
        'Clasifica cuál fue el resultado: "reservo" (el cliente EXPRESÓ que quiere reservar, o ya reservó), "perdido" (no le interesó, definitivo), "indeciso_mas_opciones" (quiere ver más propiedades), "indeciso_sin_decision" (el cliente aún no ha dado una respuesta/decisión — "quedó pendiente", "lo está pensando", "no ha respondido todavía"), o "no_concluyente" si el texto sigue sin permitir determinarlo. Marca requiere_revision_documentos=true solo si menciona papelería/documentos pendientes de revisar. Si resultado_cliente es "reservo", determina además ya_reservo: true SOLO si el asesor CONFIRMA que la reserva YA SE REALIZÓ/FORMALIZÓ (ej. "ya reservó", "ya pagó el enganche", "ya firmamos la reserva"), false si todavía es solo intención de reservar ("quiere reservar", "va a reservar", "está interesado"). Para cualquier otro resultado_cliente, pon ya_reservo en false.',
        'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente estos campos: {"asistio": true, "resultado_cliente": "reservo"|"perdido"|"indeciso_mas_opciones"|"indeciso_sin_decision"|"no_concluyente", "requiere_revision_documentos": true|false, "ya_reservo": true|false, "resumen": "texto breve"}.',
      ].join('\n')
    }
    return [
      contextoFecha,
      'Un asesor inmobiliario respondió por WhatsApp a la pregunta "¿qué pasó con tu cita/llamada con el cliente?".',
      `Respuesta del asesor: "${mensajeAsesor}"`,
      'Clasifica si el cliente asistió/atendió, y si asistió, cuál fue el resultado: "reservo" (el cliente EXPRESÓ que quiere reservar, o ya reservó), "perdido" (no le interesó, definitivo), "indeciso_mas_opciones" (quiere ver más propiedades), "indeciso_sin_decision" (el cliente aún no ha dado una respuesta/decisión — "quedó pendiente", "lo está pensando", "no ha respondido todavía"), o "no_concluyente" si el texto no permite determinarlo con confianza. No asumas "reservo" ni "perdido" salvo que el texto sea claro. Además, marca requiere_revision_documentos=true solo si el asesor menciona que el cliente va a enviar papelería/documentos para que los revisen antes de confirmar la reserva; si no lo menciona, ponlo en false. Si resultado_cliente es "reservo", determina además ya_reservo: true SOLO si el asesor CONFIRMA que la reserva YA SE REALIZÓ/FORMALIZÓ (ej. "ya reservó", "ya pagó el enganche", "ya firmamos la reserva"), false si todavía es solo intención de reservar ("quiere reservar", "va a reservar", "está interesado"). Para cualquier otro resultado_cliente, pon ya_reservo en false.',
      'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente estos campos: {"asistio": true|false, "resultado_cliente": "reservo"|"perdido"|"indeciso_mas_opciones"|"indeciso_sin_decision"|"no_concluyente", "requiere_revision_documentos": true|false, "ya_reservo": true|false, "resumen": "texto breve"}.',
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
      esAclaracion
        ? 'Se le volvió a preguntar al asesor si quiere que se le consulte de nuevo en 24 horas sobre esta visita, o si prefiere marcar el lead como perdido — su respuesta anterior no dejó claro cuál de las dos opciones quería.'
        : 'Se le preguntó al asesor si quiere que se le vuelva a consultar en 24 horas sobre si pudieron reprogramar la visita, o si prefiere marcar el lead como perdido de una vez.',
      `Respuesta del asesor: "${mensajeAsesor}"`,
      'Determina resultado: "volver_a_consultar" SOLO si pide explícitamente que se le pregunte de nuevo en 24 horas; "perdida" SOLO si confirma explícitamente que el lead ya no sigue interesado o prefiere marcarlo perdido; "no_concluyente" en cualquier otro caso — por ejemplo si la respuesta no tiene relación con esta pregunta (habla de otro cliente, de otro trato, o de algo que claramente no responde ni "sí, pregúntame después" ni "no, ya no sigue"). Ante la duda usa "no_concluyente": nunca asumas "perdida" si el texto no lo confirma explícitamente.',
      'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente este campo: {"resultado": "volver_a_consultar"|"perdida"|"no_concluyente"}.',
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
  if (fase === 'seguimiento_recurrente') {
    return [
      contextoFecha,
      esAclaracion
        ? 'El asesor ya dijo que van a agendar la firma de contrato, pero su mensaje anterior no dejó clara la fecha/hora. Se le volvió a preguntar.'
        : 'Se le preguntó al asesor cómo va el trato con el cliente: si ya reservó, si ya agendaron la firma de contrato, si el trato ya se ganó, si se perdió, o si siguen esperando sin nada nuevo todavía.',
      `Respuesta del asesor: "${mensajeAsesor}"`,
      'Determina resultado: "reservo" (el cliente CONFIRMA que ya reservó/formalizó la reserva, pero aún no se ha firmado el contrato — no uses esto si solo menciona que van a agendar la firma, usa "agendar_firma" en ese caso), "agendar_firma" (van a agendar o ya agendaron la firma de contrato — conviértelo a fecha_hora_iso si dio fecha, con confianza_fecha), "ganada" (el trato ya se cerró/ganó, firma incluida), "perdida" (el cliente ya no sigue, se pierde el trato), o "seguir_esperando" (no hay nada nuevo todavía, sigue en lo mismo). No inventes una fecha si no la mencionó.',
      'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente estos campos: {"resultado": "reservo"|"agendar_firma"|"ganada"|"perdida"|"seguir_esperando", "fecha_hora_iso": "YYYY-MM-DDTHH:mm:ss-06:00"|null, "confianza_fecha": "alta"|"media"|"baja"|"ninguna"}.',
    ].join('\n')
  }
  if (fase === 'resultado_firma') {
    return [
      contextoFecha,
      'Un asesor inmobiliario respondió por WhatsApp a la pregunta "¿se realizó la firma de contrato con el cliente?".',
      `Respuesta del asesor: "${mensajeAsesor}"`,
      'Determina se_firmo: true solo si confirma que la firma ya se realizó; false en cualquier otro caso (no se hizo, se posterga, respuesta ambigua, etc.).',
      'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente estos campos: {"se_firmo": true|false, "resumen": "texto breve"}.',
    ].join('\n')
  }
  // ofrecer_siguiente_paso
  return [
    contextoFecha,
    esAclaracion
      ? 'El asesor ya dijo qué siguiente paso quiere, pero su mensaje anterior no dejó clara la fecha/hora. Se le volvió a preguntar.'
      : 'El cliente quedó indeciso tras la visita (o aún no dio una respuesta). Se le preguntó al asesor si programan una llamada (sugiriendo un plazo de 24 horas), una nueva visita, o si va a enviarle más opciones de propiedades, y para cuándo.',
    `Respuesta del asesor: "${mensajeAsesor}"`,
    'Determina proximo_paso, distinguiendo con cuidado: "llamada" SOLO si el asesor menciona explícitamente una llamada telefónica o videollamada con el cliente; "nueva_visita" si menciona una cita, visita o verse en persona de nuevo (NO es una llamada); "enviar_opciones" si lo que va a pasar es que el asesor le va a enviar/mostrar más propiedades u opciones al cliente (una tarea del asesor, no una reunión con el cliente); "ninguno_por_ahora" si no quiere agendar nada todavía; "perdido" si en realidad el cliente ya no sigue interesado. Para "llamada", "nueva_visita" o "enviar_opciones", conviértelo a fecha_hora_iso igual que arriba, con confianza_fecha. No inventes una fecha si no la mencionó — EXCEPCIÓN: si la pregunta que se le hizo al asesor ya sugería un plazo concreto (ej. "en 24 horas") y el asesor solo confirma sin dar otra fecha (ej. "sí", "dale", "está bien"), usa ese plazo sugerido desde la fecha actual de arriba, con confianza_fecha "alta".',
    'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente estos campos: {"proximo_paso": "llamada"|"nueva_visita"|"enviar_opciones"|"ninguno_por_ahora"|"perdido", "fecha_hora_iso": "YYYY-MM-DDTHH:mm:ss-06:00"|null, "confianza_fecha": "alta"|"media"|"baja"|"ninguna"}.',
  ].join('\n')
}

// ---------------------------------------------------------------------
// Acciones de negocio
// ---------------------------------------------------------------------

// Un asesor puede agendar la cita (actividades.creado_por) y otro cubrirla
// (actividades.agente_id, a quien Ben siempre le pregunta directamente). Cada
// vez que el lead efectivamente cambia de etapa, se le manda al que agendó
// un resumen cálido con el estado actual — nunca en pasos intermedios como
// "se agendó una llamada de seguimiento" (eso no mueve la etapa).
async function moverEtapa(seguimiento: SeguimientoRow, nuevaEtapa: string, resumenParaCreador: string) {
  const { data } = await supabase
    .from('leads')
    .update({ etapa: nuevaEtapa, actualizado_en: new Date().toISOString() })
    .eq('id', seguimiento.lead_id)
    .not('etapa', 'in', `(${ETAPAS_TERMINALES.join(',')})`)
    .select('id')
  if (data && data.length > 0) {
    await notificarCreadorCita(seguimiento, nuevaEtapa, resumenParaCreador)
  }
}

async function notificarCreadorCita(seguimiento: SeguimientoRow, nuevaEtapa: string, resumen: string) {
  if (!seguimiento.creado_por || seguimiento.creado_por === seguimiento.agente_id) return
  const { data: creador } = await supabase.from('perfiles').select('telefono').eq('id', seguimiento.creado_por).maybeSingle()
  if (!creador?.telefono) return

  const nombreContacto = await obtenerNombreContacto(seguimiento.contacto_id)
  const etiquetaEtapa = ETIQUETAS_ETAPA[nuevaEtapa] ?? nuevaEtapa

  let mensaje: string
  if (nuevaEtapa === 'ganada') {
    mensaje = `¡Hola! Soy Ben 😊 Excelente noticia: el lead de ${nombreContacto} que agendaste se cerró como 🎉 GANADO 🎉. ${resumen} ¡Felicidades, gran trabajo en equipo! 🙌`
  } else if (nuevaEtapa === 'perdida') {
    mensaje = `Hola, soy Ben 😊 Te cuento que el lead de ${nombreContacto} que agendaste se marcó como Perdido. ${resumen} No te preocupes, ¡seguro llegan más oportunidades pronto! 💪`
  } else {
    mensaje = `Hola, soy Ben 😊 Novedades del lead de ${nombreContacto} que agendaste: ${resumen} Estado actual: ${etiquetaEtapa}.`
  }

  const res = await fetch(WHATSAPP_ENVIAR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'x-notificacion-secret': WHATSAPP_FUNCTION_SECRET,
    },
    body: JSON.stringify({
      chatId: telefonoAChatId(creador.telefono),
      mensaje,
      registrar: {
        organization_id: seguimiento.organization_id,
        tipo_notificacion: 'seguimiento_ia_resumen_creador',
        agente_id: seguimiento.creado_por,
        actividad_id: seguimiento.actividad_id,
      },
    }),
  })
  if (!res.ok) console.error(`No se pudo notificar al asesor que agendó la cita (whatsapp-enviar respondió ${res.status}):`, await res.text())
}

async function registrarComentario(actividadId: string, texto: string) {
  const { error } = await supabase.from('comentarios_actividad').insert({
    actividad_id: actividadId,
    creado_por: null,
    contenido: `🤖 Agente de seguimiento: ${texto}`,
  })
  if (error) console.error('No se pudo registrar comentario de seguimiento IA:', error)
}

async function responderAsesor(
  chatId: string,
  mensaje: string,
  organizationId: string,
  agenteId: string,
  actividadId: string | null,
  tipoNotificacion = 'seguimiento_ia_respuesta'
): Promise<string | null> {
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
      registrar: { organization_id: organizationId, tipo_notificacion: tipoNotificacion, agente_id: agenteId, actividad_id: actividadId },
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
  creado_por: string | null
}

async function obtenerNombreContacto(contactoId: string | null): Promise<string> {
  if (!contactoId) return 'el cliente'
  const { data } = await supabase.from('contactos').select('nombre_completo').eq('id', contactoId).maybeSingle()
  return data?.nombre_completo ?? 'el cliente'
}

// Hub al que llegan todos los desenlaces que dejan el lead en un estado no
// terminal sin una actividad futura con fecha ya agendada (reservo
// pendiente, documentación en revisión, "ninguno por ahora", etc.) — se
// repite cada 24h hasta que el lead llegue a Ganada o Perdida.
async function preguntaSeguimientoRecurrente(contactoId: string | null, yaReservada = false): Promise<string> {
  const nombreContacto = await obtenerNombreContacto(contactoId)
  if (yaReservada) {
    return `¿Cómo va la firma de contrato con ${nombreContacto}? ¿Ya se agendó, ya se realizó, se perdió el trato, o seguimos esperando? Si se agendó, dime para cuándo. Responde citando este mensaje.`
  }
  return `¿Cómo va todo con ${nombreContacto}? ¿Ya reservó, ya agendaron la firma de contrato, se ganó el trato, se perdió, o seguimos esperando? Si agendan la firma, dime para cuándo. Responde citando este mensaje.`
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
  // creado_por_ia marca que Ben debe recordar esta tarea por WhatsApp al
  // vencer — recordatorio_proximo_en se siembra con la misma fecha_limite
  // (el cron la recoge de ahí la primera vez, igual que seguimientos_ia).
  const { error } = await supabase.from('tareas').insert({
    asignado_a: params.agenteId,
    contacto_id: params.contactoId,
    lead_id: params.leadId,
    titulo: params.titulo,
    fecha_limite: params.fechaLimite,
    estado: 'pendiente',
    prioridad: params.prioridad,
    organization_id: params.organizationId,
    creado_por_ia: true,
    recordatorio_proximo_en: params.fechaLimite,
  })
  if (error) console.error('No se pudo crear la tarea de seguimiento IA:', error)
}

async function crearSiguienteActividad(params: {
  leadId: string
  organizationId: string
  agenteId: string
  // Quien agendó la cita ORIGINAL — se propaga tal cual a cada actividad
  // nueva que Ben agenda, para que ese asesor siga recibiendo el resumen
  // de novedades durante todo el ciclo de seguimiento (no solo de la
  // primera cita). Si no hay dato (actividades antiguas sin creado_por),
  // se usa el asesor que cubre como respaldo.
  creadoPor: string | null
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
    creado_por: params.creadoPor ?? params.agenteId,
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
  ) as { asistio: boolean; resultado_cliente: string; requiere_revision_documentos: boolean; ya_reservo: boolean; resumen: string }

  // En una aclaración de esta misma fase, "asistio" ya es un hecho
  // confirmado del turno anterior (si no hubiera asistido, ya estaríamos
  // en la fase "reprogramar") — se fuerza para no dejar que el modelo lo
  // reclasifique mal con un texto que ya no habla de eso.
  if (seguimiento.es_reintento_aclaracion) clasificacion.asistio = true

  if (!clasificacion.asistio) {
    // Se incluye el nombre del contacto (a diferencia de antes, que decía
    // "el cliente" genérico): si al asesor le llega esta pregunta mientras
    // también tiene otra conversación activa sobre un lead distinto, el
    // nombre le permite notar que está respondiendo a la pregunta
    // equivocada, en vez de que su respuesta se aplique al lead que no es.
    const nombreContacto = await obtenerNombreContacto(seguimiento.contacto_id)
    const pregunta = `¿Quieren reprogramar la visita con ${nombreContacto}? Si es así, dime para cuándo. Responde citando este mensaje.`
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
    // El asesor confirmó que la reserva YA SE REALIZÓ (no solo intención)
    // — recién aquí se mueve directo a "Reservada". El ciclo NO se cierra:
    // continúa cada 24h enfocado en la firma de contrato, hasta Ganada.
    if (clasificacion.ya_reservo) {
      await registrarComentario(seguimiento.actividad_id, `Cliente reservó. ${clasificacion.resumen}`)
      await moverEtapa(seguimiento, 'reservada', clasificacion.resumen)
      await responderAsesor(seguimiento.chat_id_asesor, MENSAJE_RESERVADA, seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
      const preguntaFirma = await preguntaSeguimientoRecurrente(seguimiento.contacto_id, true)
      await programarPreguntaFutura(seguimiento, 'seguimiento_recurrente', preguntaFirma, new Date(Date.now() + 24 * 3600_000))
      return
    }
    // Todavía es solo intención verbal, no una reserva formalizada — el
    // lead se queda en "visita_realizada" y se gestiona con una acción de
    // seguimiento; el ciclo de 24h (seguimiento_recurrente) sigue y ahí
    // se puede confirmar la reserva más adelante.
    await moverEtapa(seguimiento, 'visita_realizada', clasificacion.resumen)
    let mensajeRespuesta: string
    if (clasificacion.requiere_revision_documentos) {
      await registrarComentario(seguimiento.actividad_id, 'Documentación en revisión.')
      mensajeRespuesta = '¡Qué bien que le haya gustado! 😊 Quedo pendiente de la documentación — te escribo en 24 horas para ver cómo va. ¡Gracias por el seguimiento!'
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
      mensajeRespuesta = '¡Excelente noticia! 🙌 Ya programé un recordatorio para llamarlo en 24 horas y cerrar la reserva. Te escribo para ver cómo va. ¡Gracias por el seguimiento!'
    }
    await responderAsesor(seguimiento.chat_id_asesor, mensajeRespuesta, seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    const preguntaRecurrente = await preguntaSeguimientoRecurrente(seguimiento.contacto_id)
    await programarPreguntaFutura(seguimiento, 'seguimiento_recurrente', preguntaRecurrente, new Date(Date.now() + 24 * 3600_000))
    return
  }
  if (clasificacion.resultado_cliente === 'perdido') {
    await registrarComentario(seguimiento.actividad_id, clasificacion.resumen)
    await moverEtapa(seguimiento, 'perdida', clasificacion.resumen)
    await responderAsesor(seguimiento.chat_id_asesor, MENSAJE_PERDIDA, seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }
  await registrarComentario(seguimiento.actividad_id, clasificacion.resumen)
  await moverEtapa(seguimiento, 'visita_realizada', clasificacion.resumen)

  if (clasificacion.resultado_cliente === 'indeciso_sin_decision') {
    // El cliente aún no da una respuesta (lo está pensando, quedó
    // pendiente) — se sugiere una llamada en 24h pero se pregunta antes
    // de crear nada, por si el asesor prefiere otra cosa.
    const pregunta = '¿Programamos una llamada de seguimiento en 24 horas, o prefieres hacer algo diferente? Si es algo distinto, dime qué y para cuándo. Responde citando este mensaje.'
    await reabrirConNuevaFase(seguimiento, 'ofrecer_siguiente_paso', pregunta, false)
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
      const nombreContacto = await obtenerNombreContacto(seguimiento.contacto_id)
      const pregunta = `¿Quieres que te vuelva a preguntar en 24 horas sobre la visita con ${nombreContacto}, o prefieres que marque ese lead como perdido ahora? Responde citando este mensaje.`
      await reabrirConNuevaFase(seguimiento, 'confirmar_reintento_24h', pregunta, false)
      return
    }
    await crearSiguienteActividad({ leadId: seguimiento.lead_id, organizationId: seguimiento.organization_id, agenteId: seguimiento.agente_id, creadoPor: seguimiento.creado_por, tipoActividad: 'cita', programadaEn: fechaIso! })
    await moverEtapa(seguimiento, 'visita_agendada', `Se reprogramó la visita para ${fechaIso}.`)
    await registrarComentario(seguimiento.actividad_id, `Se reprogramó la visita para ${fechaIso}.`)
    await responderAsesor(seguimiento.chat_id_asesor, '¡Perfecto! 📅 Ya agendé la nueva visita. Te escribo un par de horas después para ver cómo te fue. ¡Gracias por el seguimiento!', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }

  // ofrecer_siguiente_paso
  if (decision === 'ninguno_por_ahora') {
    await registrarComentario(seguimiento.actividad_id, 'El asesor prefiere no agendar nada por ahora.')
    await responderAsesor(seguimiento.chat_id_asesor, 'Entendido, sin problema 😊 Te escribo en 24 horas para ver si hay novedades. ¡Gracias por mantenerme al tanto!', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    const preguntaRecurrente = await preguntaSeguimientoRecurrente(seguimiento.contacto_id)
    await programarPreguntaFutura(seguimiento, 'seguimiento_recurrente', preguntaRecurrente, new Date(Date.now() + 24 * 3600_000))
    return
  }
  if (decision === 'perdido') {
    await moverEtapa(seguimiento, 'perdida', 'El cliente ya no está interesado.')
    await registrarComentario(seguimiento.actividad_id, 'El cliente ya no está interesado.')
    await responderAsesor(seguimiento.chat_id_asesor, MENSAJE_PERDIDA, seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
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
    await responderAsesor(seguimiento.chat_id_asesor, '¡Genial! 👍 Te pregunto en 1 hora después de esa hora para ver si ya se las enviaste. ¡Gracias por el seguimiento!', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
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
  await crearSiguienteActividad({ leadId: seguimiento.lead_id, organizationId: seguimiento.organization_id, agenteId: seguimiento.agente_id, creadoPor: seguimiento.creado_por, tipoActividad: tipo, programadaEn: fechaIso! })
  await registrarComentario(seguimiento.actividad_id, `Se agendó ${ETIQUETA_TIPO[tipo]} de seguimiento para ${fechaIso}.`)
  await responderAsesor(seguimiento.chat_id_asesor, `¡Perfecto! 📅 Ya agendé la ${ETIQUETA_TIPO[tipo]}. Te escribo un par de horas después para ver cómo te fue. ¡Gracias por el seguimiento!`, seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
  await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
}

async function procesarConfirmarReintento24h(seguimiento: SeguimientoRow, mensajeAsesor: string) {
  const clasificacion = parsearRespuestaGroq(
    await llamarGroq(construirPrompt('confirmar_reintento_24h', mensajeAsesor, seguimiento.es_reintento_aclaracion))
  ) as { resultado: 'volver_a_consultar' | 'perdida' | 'no_concluyente' }

  // Antes esto era un booleano forzado a true/false, así que una respuesta
  // que no encajaba con ninguna de las dos opciones (ej. el asesor hablando
  // en realidad de OTRO lead, caso real que motivó este cambio) terminaba
  // cerrando como "perdida" por descarte. Ahora, si no es explícito, se
  // repregunta en vez de asumir — nunca se mueve la etapa sin confirmación clara.
  if (clasificacion.resultado === 'no_concluyente') {
    if (seguimiento.es_reintento_aclaracion) {
      await cerrarParaRevisionManual(seguimiento, `No quedó claro si reintentar en 24h o marcar perdido. Respuesta del asesor: "${mensajeAsesor}".`)
      return
    }
    const nombreContacto = await obtenerNombreContacto(seguimiento.contacto_id)
    const pregunta = `No me quedó claro — hablo del seguimiento de ${nombreContacto}: ¿quieres que te pregunte de nuevo en 24 horas, o prefieres que lo marque como perdido? Responde citando este mensaje.`
    await reabrirConNuevaFase(seguimiento, 'confirmar_reintento_24h', pregunta, true)
    return
  }

  if (clasificacion.resultado === 'volver_a_consultar') {
    await responderAsesor(seguimiento.chat_id_asesor, '¡Va! 😊 Te pregunto de nuevo en 24 horas. Gracias por el seguimiento.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    const nombreContacto = await obtenerNombreContacto(seguimiento.contacto_id)
    await programarPreguntaFutura(
      seguimiento,
      'reprogramar',
      `¿Qué me cuentas, pudieron reprogramar la visita con ${nombreContacto}? Responde citando este mensaje.`,
      new Date(Date.now() + 24 * 3600_000)
    )
    return
  }
  await registrarComentario(seguimiento.actividad_id, 'El cliente no quiere reprogramar.')
  await moverEtapa(seguimiento, 'perdida', 'El cliente no quiere reprogramar.')
  await responderAsesor(seguimiento.chat_id_asesor, MENSAJE_PERDIDA, seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
  await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
}

async function procesarConfirmarEnvioPropiedades(seguimiento: SeguimientoRow, mensajeAsesor: string) {
  const clasificacion = parsearRespuestaGroq(
    await llamarGroq(construirPrompt('confirmar_envio_propiedades', mensajeAsesor, false))
  ) as { enviadas: boolean }

  if (clasificacion.enviadas) {
    await registrarComentario(seguimiento.actividad_id, 'El asesor confirmó que ya envió las propiedades.')
    await responderAsesor(seguimiento.chat_id_asesor, '¡Genial! 🙌 Te escribo en 24 horas para ver cómo va. ¡Gracias por el seguimiento!', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    const preguntaRecurrente = await preguntaSeguimientoRecurrente(seguimiento.contacto_id)
    await programarPreguntaFutura(seguimiento, 'seguimiento_recurrente', preguntaRecurrente, new Date(Date.now() + 24 * 3600_000))
    return
  }
  // Aún no las envía: se reabre a "pendiente" SIN tocar intento ni
  // proximo_reintento_en — esos ya quedaron bien calculados por el cron al
  // enviar este aviso (1h / +2h / +3h), así que el próximo aviso programado
  // sigue su curso tal cual.
  await responderAsesor(seguimiento.chat_id_asesor, 'Entendido, sin prisa 😊 Te pregunto de nuevo más tarde.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
  await supabase.from('seguimientos_ia').update({ estado: 'pendiente', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
}

// Hub recurrente: a este punto llega cualquier desenlace que deja el lead
// en un estado no terminal sin una actividad futura ya agendada. Se repite
// cada 24h (sin límite de rondas, solo protegido por el "vencido" normal
// si el asesor deja de responder) hasta que el lead llegue a Ganada o
// Perdida, o se agende la firma de contrato.
async function procesarSeguimientoRecurrente(seguimiento: SeguimientoRow, mensajeAsesor: string) {
  const clasificacion = parsearRespuestaGroq(
    await llamarGroq(construirPrompt('seguimiento_recurrente', mensajeAsesor, seguimiento.es_reintento_aclaracion))
  ) as { resultado: string; fecha_hora_iso: string | null; confianza_fecha: string }

  if (clasificacion.resultado === 'reservo') {
    // Si ya estaba en "reservada" (ej. el asesor vuelve a confirmar algo
    // que ya se sabía), no se repite el comentario ni el mensaje de
    // felicitación — solo se sigue preguntando por la firma.
    const { data: leadActual } = await supabase.from('leads').select('etapa').eq('id', seguimiento.lead_id).maybeSingle()
    if (leadActual?.etapa !== 'reservada') {
      await moverEtapa(seguimiento, 'reservada', 'El cliente confirmó la reserva.')
      await registrarComentario(seguimiento.actividad_id, 'El cliente confirmó la reserva.')
      await responderAsesor(seguimiento.chat_id_asesor, MENSAJE_RESERVADA, seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    }
    // No se cierra: el ciclo de 24h sigue, ahora enfocado en la firma.
    const preguntaFirma = await preguntaSeguimientoRecurrente(seguimiento.contacto_id, true)
    await programarPreguntaFutura(seguimiento, 'seguimiento_recurrente', preguntaFirma, new Date(Date.now() + 24 * 3600_000))
    return
  }
  if (clasificacion.resultado === 'agendar_firma') {
    if (clasificacion.confianza_fecha === 'baja' || clasificacion.confianza_fecha === 'ninguna' || !clasificacion.fecha_hora_iso) {
      if (seguimiento.es_reintento_aclaracion) {
        await cerrarParaRevisionManual(seguimiento, `No quedó clara la fecha de la firma de contrato. Respuesta del asesor: "${mensajeAsesor}".`)
        return
      }
      const pregunta = '¿Para qué fecha y hora exactas quedó la firma de contrato? Responde citando este mensaje.'
      await reabrirConNuevaFase(seguimiento, 'seguimiento_recurrente', pregunta, true)
      return
    }
    await crearSiguienteActividad({ leadId: seguimiento.lead_id, organizationId: seguimiento.organization_id, agenteId: seguimiento.agente_id, creadoPor: seguimiento.creado_por, tipoActividad: 'firma_contrato', programadaEn: clasificacion.fecha_hora_iso })
    await registrarComentario(seguimiento.actividad_id, `Se agendó la firma de contrato para ${clasificacion.fecha_hora_iso}.`)
    await responderAsesor(seguimiento.chat_id_asesor, '¡Qué buena noticia! 🎉 Ya agendé la firma de contrato — ¡felicidades por este avance! Te escribo después para confirmar que todo salió bien.', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }
  if (clasificacion.resultado === 'ganada') {
    await moverEtapa(seguimiento, 'ganada', 'El trato se cerró como Ganado 🎉.')
    await registrarComentario(seguimiento.actividad_id, 'El trato se cerró como Ganado 🎉.')
    await responderAsesor(seguimiento.chat_id_asesor, MENSAJE_GANADA, seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }
  if (clasificacion.resultado === 'perdida') {
    await moverEtapa(seguimiento, 'perdida', 'El trato se marcó como Perdido.')
    await registrarComentario(seguimiento.actividad_id, 'El trato se marcó como Perdido.')
    await responderAsesor(seguimiento.chat_id_asesor, MENSAJE_PERDIDA, seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }
  // seguir_esperando: se responde ahora y se reprograma la MISMA pregunta
  // para dentro de 24h (intento se reinicia, así que un asesor que sigue
  // respondiendo nunca llega a "vencido" por esta vía). Si el lead ya
  // está reservado, la pregunta se mantiene enfocada en la firma en vez
  // de volver a preguntar "¿ya reservó?".
  await responderAsesor(seguimiento.chat_id_asesor, 'Entendido, sin problema 😊 Te pregunto de nuevo en 24 horas. ¡Gracias por mantenerme al tanto!', seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
  const { data: leadParaPregunta } = await supabase.from('leads').select('etapa').eq('id', seguimiento.lead_id).maybeSingle()
  const pregunta = await preguntaSeguimientoRecurrente(seguimiento.contacto_id, leadParaPregunta?.etapa === 'reservada')
  await programarPreguntaFutura(seguimiento, 'seguimiento_recurrente', pregunta, new Date(Date.now() + 24 * 3600_000))
}

async function procesarResultadoFirma(seguimiento: SeguimientoRow, mensajeAsesor: string) {
  const clasificacion = parsearRespuestaGroq(
    await llamarGroq(construirPrompt('resultado_firma', mensajeAsesor, false))
  ) as { se_firmo: boolean; resumen: string }

  if (clasificacion.se_firmo) {
    await moverEtapa(seguimiento, 'ganada', `Firma de contrato realizada. ${clasificacion.resumen}`)
    await registrarComentario(seguimiento.actividad_id, `Firma de contrato realizada. ${clasificacion.resumen}`)
    await responderAsesor(seguimiento.chat_id_asesor, MENSAJE_GANADA, seguimiento.organization_id, seguimiento.agente_id, seguimiento.actividad_id)
    await supabase.from('seguimientos_ia').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', seguimiento.id)
    return
  }
  await registrarComentario(seguimiento.actividad_id, `La firma de contrato no se realizó. ${clasificacion.resumen}`)
  const pregunta = '¿Reagendamos la firma de contrato, se ganó de otra forma, se perdió, o seguimos esperando? Si reagendan, dime para cuándo. Responde citando este mensaje.'
  await reabrirConNuevaFase(seguimiento, 'seguimiento_recurrente', pregunta, false)
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
  } else if (seguimiento.fase === 'confirmar_envio_propiedades') {
    await procesarConfirmarEnvioPropiedades(seguimiento, mensajeAsesor)
  } else if (seguimiento.fase === 'seguimiento_recurrente') {
    await procesarSeguimientoRecurrente(seguimiento, mensajeAsesor)
  } else {
    await procesarResultadoFirma(seguimiento, mensajeAsesor)
  }
}

// ---------------------------------------------------------------------
// Resolución de a qué seguimiento pendiente responde el mensaje entrante
// ---------------------------------------------------------------------

async function resolverSeguimientoPendiente(chatId: string, stanzaIdCitado: string | null): Promise<SeguimientoRow | null> {
  const { data: pendientes } = await supabase
    .from('seguimientos_ia')
    .select('id, actividad_id, lead_id, agente_id, contacto_id, organization_id, fase, chat_id_asesor, es_reintento_aclaracion, green_api_message_id, creado_por')
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
// Recordatorio de tareas creadas por Ben (ej. "Llamar a X para gestionar
// la reserva"). Flujo independiente del árbol de fases de seguimientos_ia:
// el cron ya siembra/reprograma tareas.recordatorio_proximo_en (ver
// seguimiento-ia-cron), aquí solo se procesa la respuesta del asesor.
// ---------------------------------------------------------------------

type TareaRow = {
  id: string
  titulo: string
  asignado_a: string
  organization_id: string
  recordatorio_chat_id: string
  recordatorio_green_api_message_id: string | null
  recordatorio_enviado_en: string | null
}

function construirPromptConfirmarTarea(titulo: string, mensajeAsesor: string): string {
  return [
    `Se le preguntó al asesor si ya completó esta tarea: "${titulo}".`,
    `Respuesta del asesor: "${mensajeAsesor}"`,
    'Determina completada: true solo si confirma que ya la hizo; false en cualquier otro caso (todavía no, está por hacerlo, respuesta ambigua, etc.) — ante la duda, false.',
    'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente este campo: {"completada": true|false}.',
  ].join('\n')
}

async function resolverTareaPendiente(chatId: string, stanzaIdCitado: string | null): Promise<TareaRow | null> {
  const { data: pendientes } = await supabase
    .from('tareas')
    .select('id, titulo, asignado_a, organization_id, recordatorio_chat_id, recordatorio_green_api_message_id, recordatorio_enviado_en')
    .eq('estado', 'pendiente')
    .eq('recordatorio_chat_id', chatId)
    .not('recordatorio_enviado_en', 'is', null)
    .order('recordatorio_enviado_en', { ascending: false })

  if (!pendientes || pendientes.length === 0) return null
  if (pendientes.length === 1) return pendientes[0] as TareaRow

  if (stanzaIdCitado) {
    const porCita = pendientes.find((p) => p.recordatorio_green_api_message_id === stanzaIdCitado)
    if (porCita) return porCita as TareaRow
  }
  return pendientes[0] as TareaRow
}

// Claim atómico: recordatorio_proximo_en no nulo = disponible para
// reclamar (equivalente al "pendiente" de seguimientos_ia). Se pone en
// null mientras se procesa, para que una reentrega de Green API no
// reprocese la misma respuesta dos veces.
async function reclamarRecordatorioTarea(tareaId: string): Promise<boolean> {
  const { data } = await supabase
    .from('tareas')
    .update({ recordatorio_proximo_en: null })
    .eq('id', tareaId)
    .not('recordatorio_proximo_en', 'is', null)
    .select('id')
  return !!data && data.length > 0
}

async function procesarRespuestaTarea(tarea: TareaRow, mensajeAsesor: string) {
  const clasificacion = parsearRespuestaGroq(
    await llamarGroq(construirPromptConfirmarTarea(tarea.titulo, mensajeAsesor))
  ) as { completada: boolean }

  if (clasificacion.completada) {
    await supabase.from('tareas').update({ estado: 'completada' }).eq('id', tarea.id)
    await responderAsesor(
      tarea.recordatorio_chat_id,
      '¡Genial, gracias por confirmarlo! ✅ Ya marqué la tarea como completada.',
      tarea.organization_id,
      tarea.asignado_a,
      null,
      'tareas_recordatorio_ia_respuesta'
    )
    return
  }
  // Sigue pendiente: se reprograma el recordatorio para dentro de 4h, sin
  // límite de reintentos — nunca se cierra sola sin confirmación.
  await supabase
    .from('tareas')
    .update({ recordatorio_proximo_en: new Date(Date.now() + 4 * 3600_000).toISOString() })
    .eq('id', tarea.id)
  await responderAsesor(
    tarea.recordatorio_chat_id,
    'Entendido, sin problema 😊 Te recuerdo de nuevo en unas horas.',
    tarea.organization_id,
    tarea.asignado_a,
    null,
    'tareas_recordatorio_ia_respuesta'
  )
}

// ---------------------------------------------------------------------
// Asistente inmobiliario interno: consultas libres de leads/citas,
// búsqueda de propiedades y creación de tareas por WhatsApp. Solo para
// asesores/administradores ya existentes en "perfiles" (nunca clientes) —
// es la defensa anti-abuso del webhook público. Se evalúa SOLO cuando el
// mensaje entrante no corresponde a ningún seguimiento de cita ni
// recordatorio de tarea pendiente.
// ---------------------------------------------------------------------

type PerfilAsistente = {
  id: string
  nombre_completo: string
  rol: 'agente' | 'administrador'
  telefono: string
  organization_id: string
}

function telefonoLocal8(valor: string): string {
  const digitos = valor.replace(/\D/g, '')
  return digitos.length >= 8 ? digitos.slice(-8) : digitos
}

async function resolverPerfilPorChatId(chatId: string): Promise<PerfilAsistente | null> {
  const local8 = telefonoLocal8(chatId)
  if (local8.length !== 8) return null
  const { data: perfiles } = await supabase
    .from('perfiles')
    .select('id, nombre_completo, rol, telefono, organization_id')
    .eq('activo', true)
    .not('telefono', 'is', null)
  const candidatos = (perfiles ?? []).filter((p) => telefonoLocal8(p.telefono!) === local8)
  if (candidatos.length === 0) return null
  if (candidatos.length === 1) return candidatos[0] as PerfilAsistente
  // Desempate documentado ante un teléfono duplicado entre dos perfiles
  // reales: preferir administrador. No se puede saber desde código cuál
  // de los dos es el correcto — requiere corregir el dato en Perfiles.
  return (candidatos.find((p) => p.rol === 'administrador') ?? candidatos[0]) as PerfilAsistente
}

// Helpers de fecha en zona Guatemala (-06:00 fijo, sin DST) — Deno no
// puede importar src/lib/fecha-gt.ts, se replica lo mínimo necesario.
function componentesGT(fecha: Date): { anio: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(fecha)
  const obtener = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value)
  return { anio: obtener('year'), mes: obtener('month'), dia: obtener('day') }
}

function inicioDeDiaGT(anio: number, mes: number, dia: number): Date {
  return new Date(`${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T00:00:00-06:00`)
}

function formatearHoraGT(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guatemala' })
}

function formatearFechaHoraGT(iso: string): string {
  const fecha = new Date(iso).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', timeZone: 'America/Guatemala' })
  return `${fecha} a las ${formatearHoraGT(iso)}`
}

// Mismo criterio que src/lib/formato-zona.ts: si solo guardaron el
// número ("15"), antepone "Zona"; si ya dice "zona", se respeta tal cual.
function formatearZonaDup(zona: string | null | undefined): string | null {
  if (!zona) return null
  const valor = zona.trim()
  if (valor === '') return null
  if (/zona/i.test(valor)) return valor
  return `Zona ${valor}`
}

function urlPropiedadWhatsapp(propiedadId: string): string {
  const base = Deno.env.get('SITE_URL') ?? ''
  return `${base}/dashboard/propiedades/${propiedadId}`
}

const TIPOS_ACTIVIDAD_CONSULTA = ['cita', 'reunion', 'video_llamada', 'llamada', 'firma_contrato']
const TIPOS_PROPIEDAD_VALIDOS = ['casa', 'apartamento', 'terreno', 'bodega', 'oficina', 'ofibodega', 'finca', 'granja', 'local', 'edificio']
const ETAPAS_FINALIZADAS_PARA_CONTEO = ['ganada', 'perdida']

function construirPromptConsultaGeneral(mensaje: string): string {
  const contextoFecha = `Fecha y hora actuales en Guatemala: ${fechaHoraGuatemalaTexto()}.`
  return [
    contextoFecha,
    'Eres el asistente interno por WhatsApp de un CRM inmobiliario en Guatemala. Te escribe un asesor o administrador del equipo (nunca un cliente externo) con una consulta o instrucción sobre el CRM.',
    `Mensaje: "${mensaje}"`,
    'Clasifica la intención en exactamente una de estas 10 categorías: "consultar_leads" (cuántos leads tiene o en qué etapa están, o resumen de ganados/perdidos), "consultar_citas" (qué citas/visitas/llamadas tiene agendadas), "buscar_propiedades" (buscar propiedades del inventario por criterios), "crear_tarea" (crear una tarea o recordatorio para sí mismo), "agendar_cita" (agendar una cita o visita con un cliente/lead existente), "cambiar_etapa_lead" (instrucción directa de mover un lead a una etapa específica, ej. "marca a Juan como ganado", "mueve el lead de María a perdida" — NO uses esto para preguntas, solo para órdenes explícitas), "consultar_requerimientos" (qué está buscando un cliente / qué requerimientos tiene abiertos, ej. "¿qué requerimientos tengo?", "¿hay algún requerimiento en zona 10?"), "cerrar_requerimiento" (instrucción explícita de cerrar/dar por resuelto un requerimiento, ej. "cierra el requerimiento de Juan", "ya no busca nada Juan" — NO uses esto para preguntas), "reporte_desempeno" (pedir un reporte de desempeño del equipo: conversión por asesor, motivos de pérdida más comunes, tiempo promedio de cierre — solo tiene sentido para un administrador), "conversacion_general" (cualquier otra cosa, saludos incluidos).',
    'Llena solo los campos que correspondan a la intención detectada; deja los demás en null:',
    '- etapa_lead: "contacto_inicial"|"visita_agendada"|"visita_realizada"|"reservada"|"ganada"|"perdida"|"activos"|"todos" (usa "activos" si no mencionó etapa; "todos" solo si pidió el total incluyendo ganados y perdidos).',
    '- rango_fecha_leads: "hoy"|"esta_semana"|"este_mes"|"todo" (para "consultar_leads" solo si etapa_lead es "ganada" o "perdida"; para "reporte_desempeno" siempre aplica como el periodo del reporte; si no especificó, usa "este_mes").',
    '- rango_fecha_citas: "hoy"|"mañana"|"esta_semana"|"vencidas" (si no especificó, usa "hoy").',
    '- tipo_operacion: "venta"|"renta"|null.',
    '- tipo_propiedad: "casa"|"apartamento"|"terreno"|"bodega"|"oficina"|"ofibodega"|"finca"|"granja"|"local"|"edificio"|null.',
    '- ubicacion: para "buscar_propiedades" o "consultar_requerimientos", CUALQUIER zona, sector, condominio, colonia o municipio mencionado, como un solo texto (no sabes en qué columna vive en la base de datos, así que no intentes clasificarlo — solo transcribe la ubicación tal como la dijo). Si mencionó un número de zona, incluye SOLO el número (ej. "10", no "zona 10"). Si mencionó varias ubicaciones, usa solo la más específica. Null si no mencionó ubicación.',
    '- amenidades: para "buscar_propiedades", arreglo de palabras clave de amenidades o características mencionadas (ej. ["piscina","gimnasio"]), o null si no mencionó ninguna.',
    '- precio_min, precio_max, dormitorios_min, banos_min, niveles_min: número o null.',
    '- area_exacta, area_min, area_max: metros cuadrados mencionados (construcción o terreno), número o null. Si da un metraje SIN calificarlo (ej. "de 100m2", "casa de 100 metros") usa area_exacta — debe coincidir EXACTO, ni más ni menos. Usa area_min SOLO si dijo explícitamente "más de", "mayor a", "mínimo", "arriba de" o similar. Usa area_max SOLO si dijo explícitamente "menos de", "menor a", "máximo", "hasta" o similar. Si mencionó un rango explícito (ej. "entre 100 y 150 m2") usa area_min Y area_max juntos. Nunca combines area_exacta con area_min/area_max.',
    '- titulo_tarea: para crear_tarea, un título breve (ej. "Llamar a Juan Pérez"), o null.',
    '- nombre_contacto: para crear_tarea, agendar_cita, cambiar_etapa_lead o cerrar_requerimiento, el nombre completo del cliente/contacto mencionado, o null.',
    '- etapa_nueva: SOLO para cambiar_etapa_lead, la etapa de destino: "contacto_inicial"|"visita_agendada"|"visita_realizada"|"reservada"|"ganada"|"perdida" (interpreta "ganado"→"ganada", "perdido"→"perdida", "reservó"→"reservada", etc.), o null si no quedó claro a cuál etapa.',
    '- fecha_hora_iso: para crear_tarea o agendar_cita, la fecha/hora convertida a ISO 8601 con zona -06:00 (usa la fecha actual de arriba para expresiones relativas como "mañana"), o null si no la mencionó.',
    '- confianza_fecha: "alta"|"media"|"baja"|"ninguna" (alta solo si es inequívoca — no inventes fecha).',
    '- prioridad_tarea: "baja"|"media"|"alta" (infiere la urgencia; si no es claro, usa "media").',
    'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente estos campos: {"intencion": "...", "etapa_lead": string|null, "rango_fecha_leads": string|null, "rango_fecha_citas": string|null, "tipo_operacion": string|null, "tipo_propiedad": string|null, "ubicacion": string|null, "amenidades": string[]|null, "precio_min": number|null, "precio_max": number|null, "dormitorios_min": number|null, "banos_min": number|null, "niveles_min": number|null, "area_exacta": number|null, "area_min": number|null, "area_max": number|null, "titulo_tarea": string|null, "nombre_contacto": string|null, "etapa_nueva": string|null, "fecha_hora_iso": string|null, "confianza_fecha": string|null, "prioridad_tarea": string|null}.',
  ].join('\n')
}

function construirPromptAclaracionFecha(mensaje: string): string {
  const contextoFecha = `Fecha y hora actuales en Guatemala: ${fechaHoraGuatemalaTexto()}.`
  return [
    contextoFecha,
    'El asesor ya pidió crear una tarea/recordatorio, pero no dejó clara la fecha/hora. Se le volvió a preguntar para cuándo.',
    `Respuesta: "${mensaje}"`,
    'Convierte la fecha/hora a fecha_hora_iso (ISO 8601, zona -06:00, usando la fecha actual de arriba como referencia). confianza_fecha: "alta" solo si es inequívoca, "media" si falta precisión, "baja" si es muy vaga, "ninguna" si sigue sin mencionar fecha.',
    'Responde ÚNICAMENTE con un objeto JSON válido: {"fecha_hora_iso": "YYYY-MM-DDTHH:mm:ss-06:00"|null, "confianza_fecha": "alta"|"media"|"baja"|"ninguna"}.',
  ].join('\n')
}

const ETAPAS_VALIDAS_LEAD = ['contacto_inicial', 'visita_agendada', 'visita_realizada', 'reservada', 'ganada', 'perdida']

function construirPromptAclaracionEtapa(mensaje: string): string {
  return [
    'El asesor ya pidió cambiar la etapa de un lead, pero no dejó clara a cuál etapa. Se le volvió a preguntar.',
    `Respuesta: "${mensaje}"`,
    'Determina etapa_nueva: "contacto_inicial"|"visita_agendada"|"visita_realizada"|"reservada"|"ganada"|"perdida" (interpreta "ganado"→"ganada", "perdido"→"perdida", "reservó"→"reservada", etc.), o null si sigue sin quedar claro.',
    'Responde ÚNICAMENTE con un objeto JSON válido: {"etapa_nueva": string|null}.',
  ].join('\n')
}

async function yaFueProcesadoMensajeEntrante(idMessageEntrante: string | null): Promise<boolean> {
  if (!idMessageEntrante) return false
  const { error } = await supabase.from('asistente_ia_mensajes_procesados').insert({ green_api_message_id: idMessageEntrante })
  return !!error // violación de unique = ya se procesó este mensaje antes
}

function mensajeConversacionGeneral(nombreCompleto: string): string {
  const nombre = nombreCompleto.split(' ')[0]
  return [
    `¡Hola ${nombre}! 😊 Soy Ben, tu asistente del CRM, puedo ayudarte con cosas como:`,
    '• "¿Cuántos leads tengo en visita agendada?"',
    '• "¿Qué citas tengo hoy?"',
    '• "Busca casas en zona 10 hasta Q1.8M"',
    '• "Créame una tarea para llamar a Juan mañana a las 10am"',
    '• "Agéndame una cita con Juan Pérez el jueves a las 3pm"',
    '¿En qué te ayudo? 🙂',
  ].join('\n')
}

function inicioRangoLeadsGT(rango: string): Date | null {
  const ahora = new Date()
  const { anio, mes, dia } = componentesGT(ahora)
  if (rango === 'hoy') return inicioDeDiaGT(anio, mes, dia)
  if (rango === 'esta_semana') return new Date(ahora.getTime() - 7 * 24 * 3600_000)
  if (rango === 'este_mes') return inicioDeDiaGT(anio, mes, 1)
  return null
}

async function responderConsultaLeads(perfil: PerfilAsistente, chatId: string, c: Record<string, any>) {
  const etapaLead = ['contacto_inicial', 'visita_agendada', 'visita_realizada', 'reservada', 'ganada', 'perdida', 'activos', 'todos'].includes(c.etapa_lead)
    ? c.etapa_lead
    : 'activos'

  let query = supabase.from('leads').select('etapa').eq('organization_id', perfil.organization_id)
  if (perfil.rol === 'agente') query = query.eq('agente_id', perfil.id)
  if (etapaLead === 'activos') query = query.not('etapa', 'in', `(${ETAPAS_FINALIZADAS_PARA_CONTEO.join(',')})`)
  else if (etapaLead !== 'todos') query = query.eq('etapa', etapaLead)

  if (etapaLead === 'ganada' || etapaLead === 'perdida') {
    const rango = ['hoy', 'esta_semana', 'este_mes', 'todo'].includes(c.rango_fecha_leads) ? c.rango_fecha_leads : 'este_mes'
    const desde = inicioRangoLeadsGT(rango)
    if (desde) query = query.gte('actualizado_en', desde.toISOString())
  }

  const { data, error } = await query
  if (error) {
    console.error('Error consultando leads para asistente IA:', error)
    await responderAsesor(chatId, 'Uy, no pude consultar tus leads en este momento 😓 Intenta de nuevo en un rato.', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }

  const total = data?.length ?? 0
  const sujeto = perfil.rol === 'agente' ? 'Tienes' : 'Hay'
  let mensaje: string
  if (etapaLead === 'activos' || etapaLead === 'todos') {
    const conteo = (data ?? []).reduce<Record<string, number>>((acc, l) => { acc[l.etapa] = (acc[l.etapa] ?? 0) + 1; return acc }, {})
    const etapasAMostrar = Object.keys(ETIQUETAS_ETAPA).filter((e) => (etapaLead === 'activos' ? !ETAPAS_FINALIZADAS_PARA_CONTEO.includes(e) : true))
    mensaje = [
      `📊 ${sujeto} ${total} lead${total === 1 ? '' : 's'} ${etapaLead === 'activos' ? 'activos' : 'en total'}:`,
      ...etapasAMostrar.map((e) => `• ${ETIQUETAS_ETAPA[e]}: ${conteo[e] ?? 0}`),
    ].join('\n')
  } else {
    const etiquetaRango: Record<string, string> = { hoy: 'hoy', esta_semana: 'esta semana', este_mes: 'este mes', todo: 'en total' }
    const rangoTxt = etiquetaRango[c.rango_fecha_leads ?? 'este_mes'] ?? 'este mes'
    mensaje =
      etapaLead === 'ganada'
        ? `🎉 ${perfil.rol === 'agente' ? 'Llevas' : 'El equipo lleva'} ${total} lead${total === 1 ? '' : 's'} ganado${total === 1 ? '' : 's'} ${rangoTxt}. ¡Sigue así!`
        : `${total} lead${total === 1 ? '' : 's'} se ${total === 1 ? 'marcó' : 'marcaron'} como perdido${total === 1 ? '' : 's'} ${rangoTxt} 💪. Vamos por los próximos.`
  }
  await responderAsesor(chatId, mensaje, perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
}

// Solo administradores — no tiene sentido un reporte "de equipo" acotado a
// un solo agente. Tiempo de cierre es una aproximación (actualizado_en -
// creado_en del lead): el esquema no guarda un historial de cuándo pasó
// por cada etapa, así que no se puede desglosar tiempo POR etapa, solo el
// total desde que se creó el lead hasta que se cerró.
async function responderReporteDesempeno(perfil: PerfilAsistente, chatId: string, c: Record<string, any>) {
  if (perfil.rol !== 'administrador') {
    await responderAsesor(chatId, 'Este reporte está disponible solo para administradores 😊', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }
  const rango = ['hoy', 'esta_semana', 'este_mes', 'todo'].includes(c.rango_fecha_leads) ? c.rango_fecha_leads : 'este_mes'
  const desde = inicioRangoLeadsGT(rango)

  let query = supabase
    .from('leads')
    .select('etapa, agente_id, motivo_perdida, creado_en, actualizado_en, agente:perfiles!leads_agente_id_fkey(nombre_completo)')
    .eq('organization_id', perfil.organization_id)
    .in('etapa', ['ganada', 'perdida'])
  if (desde) query = query.gte('actualizado_en', desde.toISOString())

  const { data, error } = await query
  if (error) {
    console.error('Error consultando reporte de desempeño:', error)
    await responderAsesor(chatId, 'Uy, no pude armar el reporte en este momento 😓', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }

  const etiquetaRango: Record<string, string> = { hoy: 'hoy', esta_semana: 'esta semana', este_mes: 'este mes', todo: 'en total' }
  const rangoTxt = etiquetaRango[rango] ?? 'este mes'
  if (!data || data.length === 0) {
    await responderAsesor(chatId, `No hay leads ganados ni perdidos ${rangoTxt} todavía 🙂`, perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }

  const porAsesor: Record<string, { nombre: string; ganadas: number; perdidas: number }> = {}
  const motivos: Record<string, number> = {}
  let sumaDias = 0
  for (const l of data as any[]) {
    const agente = Array.isArray(l.agente) ? l.agente[0] : l.agente
    const key = l.agente_id ?? 'sin_asesor'
    if (!porAsesor[key]) porAsesor[key] = { nombre: agente?.nombre_completo ?? 'Sin asesor', ganadas: 0, perdidas: 0 }
    if (l.etapa === 'ganada') porAsesor[key].ganadas++
    else {
      porAsesor[key].perdidas++
      if (l.motivo_perdida) motivos[l.motivo_perdida] = (motivos[l.motivo_perdida] ?? 0) + 1
    }
    sumaDias += (new Date(l.actualizado_en).getTime() - new Date(l.creado_en).getTime()) / 86_400_000
  }

  const lineasAsesores = Object.values(porAsesor)
    .sort((a, b) => b.ganadas + b.perdidas - (a.ganadas + a.perdidas))
    .map((a) => {
      const total = a.ganadas + a.perdidas
      const pct = total > 0 ? Math.round((a.ganadas / total) * 100) : 0
      return `• ${a.nombre}: ${a.ganadas} ganada${a.ganadas === 1 ? '' : 's'} / ${a.perdidas} perdida${a.perdidas === 1 ? '' : 's'} (${pct}%)`
    })
  const lineasMotivos = Object.entries(motivos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([motivo, n]) => `• ${motivo}: ${n}`)
  const promedioDias = Math.round(sumaDias / data.length)

  const bloques = [
    `📊 Reporte del equipo (${rangoTxt}):`,
    ['Conversión por asesor:', ...lineasAsesores].join('\n'),
    lineasMotivos.length > 0 ? ['Motivos de pérdida más comunes:', ...lineasMotivos].join('\n') : null,
    `Tiempo promedio de cierre: ${promedioDias} día${promedioDias === 1 ? '' : 's'} (desde que se creó el lead hasta Ganada/Perdida).`,
  ].filter(Boolean) as string[]
  await responderAsesor(chatId, bloques.join('\n\n'), perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
}

function rangoCitasGT(rango: string): { desde: Date | null; hasta: Date | null; vencidas: boolean } {
  const ahora = new Date()
  const { anio, mes, dia } = componentesGT(ahora)
  const inicioHoy = inicioDeDiaGT(anio, mes, dia)
  if (rango === 'hoy') return { desde: inicioHoy, hasta: new Date(inicioHoy.getTime() + 24 * 3600_000), vencidas: false }
  if (rango === 'mañana') {
    const d = new Date(inicioHoy.getTime() + 24 * 3600_000)
    return { desde: d, hasta: new Date(d.getTime() + 24 * 3600_000), vencidas: false }
  }
  if (rango === 'esta_semana') return { desde: inicioHoy, hasta: new Date(inicioHoy.getTime() + 7 * 24 * 3600_000), vencidas: false }
  return { desde: null, hasta: null, vencidas: true }
}

async function responderConsultaCitas(perfil: PerfilAsistente, chatId: string, c: Record<string, any>) {
  const rango = ['hoy', 'mañana', 'esta_semana', 'vencidas'].includes(c.rango_fecha_citas) ? c.rango_fecha_citas : 'hoy'
  const { desde, hasta, vencidas } = rangoCitasGT(rango)

  let query = supabase
    .from('actividades')
    .select('id, tipo_actividad, programada_en, contacto:contactos(nombre_completo)')
    .eq('organization_id', perfil.organization_id)
    .in('tipo_actividad', TIPOS_ACTIVIDAD_CONSULTA)
    .is('completada_en', null)
    .order('programada_en', { ascending: true })
    .limit(20)
  if (perfil.rol === 'agente') query = query.eq('agente_id', perfil.id)
  if (vencidas) query = query.lt('programada_en', new Date().toISOString())
  else query = query.gte('programada_en', desde!.toISOString()).lt('programada_en', hasta!.toISOString())

  const { data, error } = await query
  if (error) {
    console.error('Error consultando citas para asistente IA:', error)
    await responderAsesor(chatId, 'Uy, no pude consultar tus citas en este momento 😓', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }

  const etiquetaRango: Record<string, string> = { hoy: 'para hoy', mañana: 'para mañana', esta_semana: 'esta semana', vencidas: 'vencidas' }
  if (!data || data.length === 0) {
    await responderAsesor(chatId, `No tienes citas ${etiquetaRango[rango]} 🙂`, perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }
  const lineas = data.map((a: any) => {
    const contacto = Array.isArray(a.contacto) ? a.contacto[0] : a.contacto
    return `• ${formatearHoraGT(a.programada_en)} — ${ETIQUETA_TIPO[a.tipo_actividad] ?? a.tipo_actividad} con ${contacto?.nombre_completo ?? 'el cliente'}`
  })
  await responderAsesor(
    chatId,
    [`📅 Tienes ${data.length} cita${data.length === 1 ? '' : 's'} ${etiquetaRango[rango]}:`, ...lineas].join('\n'),
    perfil.organization_id,
    perfil.id,
    null,
    'asistente_ia_respuesta'
  )
}

// dormitorios/banos/niveles son columnas de TEXTO en la BD (aceptan input
// libre del formulario, ej. "2.5" o "N/A"), así que un mínimo nunca se
// compara con gte en la consulta (compararía como texto: "10" < "9"). Se
// filtran en código con Number(...) después de traer un lote más amplio.
function numeroONull(valor: unknown): number | null {
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

// La IA no sabe (ni debe adivinar) en qué columna vive una ubicación libre
// ("Vista Verde" puede ser el condominio de una propiedad y el sector o
// zona de otra) — forzarla a elegir una sola columna llevaba a búsquedas
// que no encontraban nada aunque la propiedad existiera. Por eso un solo
// término de ubicación se compara contra zona, sector, condominio Y
// municipio a la vez (OR), en vez de atar cada campo a una columna fija.
function escaparValorFiltro(valor: string): string {
  return valor.replace(/[(),]/g, ' ').trim()
}

// Un metraje mencionado sin calificar ("casa de 100m2") es una búsqueda
// EXACTA, no un mínimo — a diferencia de dormitorios/baños, donde "3
// habitaciones" sí se trata como mínimo. Solo se vuelve mínimo/máximo/rango
// si el asesor lo dice explícitamente ("mayor a", "hasta", "entre X y Y").
function construirCondicionArea(c: Record<string, any>): string | null {
  const exacta = typeof c.area_exacta === 'number' ? c.area_exacta : null
  const min = typeof c.area_min === 'number' ? c.area_min : null
  const max = typeof c.area_max === 'number' ? c.area_max : null

  if (exacta !== null) return `area_construccion_m2.eq.${exacta},area_terreno_m2.eq.${exacta}`
  if (min !== null && max !== null) {
    return `and(area_construccion_m2.gte.${min},area_construccion_m2.lte.${max}),and(area_terreno_m2.gte.${min},area_terreno_m2.lte.${max})`
  }
  if (min !== null) return `area_construccion_m2.gte.${min},area_terreno_m2.gte.${min}`
  if (max !== null) return `area_construccion_m2.lte.${max},area_terreno_m2.lte.${max}`
  return null
}

async function responderBusquedaPropiedades(perfil: PerfilAsistente, chatId: string, c: Record<string, any>) {
  let query = supabase
    .from('propiedades')
    .select('id, titulo, tipo_operacion, zona, ciudad, sector, condominio, niveles, precio, moneda, dormitorios, banos, area_construccion_m2, area_terreno_m2, amenidades, municipio:municipios(nombre)')
    .eq('organization_id', perfil.organization_id)
    .eq('estado', 'disponible')
    .order('creado_en', { ascending: false })
    .limit(80)

  if (c.tipo_operacion === 'venta' || c.tipo_operacion === 'renta') query = query.eq('tipo_operacion', c.tipo_operacion)
  if (TIPOS_PROPIEDAD_VALIDOS.includes(c.tipo_propiedad)) query = query.eq('tipo_propiedad', c.tipo_propiedad)
  if (typeof c.precio_min === 'number') query = query.gte('precio', c.precio_min)
  if (typeof c.precio_max === 'number') query = query.lte('precio', c.precio_max)
  const condicionArea = construirCondicionArea(c)
  if (condicionArea) query = query.or(condicionArea)
  if (Array.isArray(c.amenidades)) {
    for (const termino of c.amenidades) {
      if (typeof termino === 'string' && termino.trim()) query = query.ilike('amenidades', `%${termino.trim()}%`)
    }
  }

  const ubicacion = c.ubicacion ? escaparValorFiltro(String(c.ubicacion)) : null
  if (ubicacion) {
    const { data: municipiosCoincidentes } = await supabase.from('municipios').select('id').ilike('nombre', `%${ubicacion}%`)
    const condiciones = [`zona.ilike.%${ubicacion}%`, `sector.ilike.%${ubicacion}%`, `condominio.ilike.%${ubicacion}%`]
    if (municipiosCoincidentes && municipiosCoincidentes.length > 0) {
      condiciones.push(`municipio_id.in.(${municipiosCoincidentes.map((m) => m.id).join(',')})`)
    }
    query = query.or(condiciones.join(','))
  }

  const { data, error } = await query
  if (error) {
    console.error('Error buscando propiedades para asistente IA:', error)
    await responderAsesor(chatId, 'Uy, no pude buscar en el inventario en este momento 😓', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }

  let resultados = (data ?? []) as any[]
  if (typeof c.dormitorios_min === 'number') {
    resultados = resultados.filter((p) => { const n = numeroONull(p.dormitorios); return n !== null && n >= c.dormitorios_min })
  }
  if (typeof c.banos_min === 'number') {
    resultados = resultados.filter((p) => { const n = numeroONull(p.banos); return n !== null && n >= c.banos_min })
  }
  if (typeof c.niveles_min === 'number') {
    resultados = resultados.filter((p) => { const n = numeroONull(p.niveles); return n !== null && n >= c.niveles_min })
  }
  const total = resultados.length
  resultados = resultados.slice(0, 5)

  if (resultados.length === 0) {
    await responderAsesor(chatId, 'No encontré propiedades disponibles con esos criterios 😕 ¿Quieres que busque con otros filtros?', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }
  const lineas = resultados.map((p: any) => {
    const municipioNombre = Array.isArray(p.municipio) ? p.municipio[0]?.nombre : p.municipio?.nombre
    const zonaTxt = formatearZonaDup(p.zona) ?? municipioNombre ?? p.ciudad ?? ''
    const ubicacionExtra = [p.condominio, municipioNombre && municipioNombre !== zonaTxt ? municipioNombre : null]
      .filter(Boolean)
      .join(' · ')
    const precioTxt = `${p.moneda ?? 'GTQ'} ${Number(p.precio ?? 0).toLocaleString('es-GT')}`
    const area = p.area_construccion_m2 ?? p.area_terreno_m2
    const detalles = [
      p.dormitorios ? `${p.dormitorios} hab` : null,
      p.banos ? `${p.banos} baños` : null,
      p.niveles ? `${p.niveles} niveles` : null,
      area ? `${area} m²` : null,
    ].filter(Boolean).join(' · ')
    return `• ${p.titulo} — ${zonaTxt}${ubicacionExtra ? ' · ' + ubicacionExtra : ''} — ${precioTxt}${detalles ? ` (${detalles})` : ''}\n  ${urlPropiedadWhatsapp(p.id)}`
  })
  await responderAsesor(
    chatId,
    [`🏠 Encontré ${total} propiedad${total === 1 ? '' : 'es'}${total > resultados.length ? ` (muestro ${resultados.length})` : ''}:`, '', ...lineas].join('\n'),
    perfil.organization_id,
    perfil.id,
    null,
    'asistente_ia_respuesta'
  )
}

const ETIQUETAS_TIPO_OPERACION_REQ: Record<string, string> = { venta: 'Venta', renta: 'Renta' }

async function responderConsultarRequerimientos(perfil: PerfilAsistente, chatId: string, c: Record<string, any>) {
  let query = supabase
    .from('requerimientos')
    .select('id, tipo_operacion, tipo_propiedad, precio_min, precio_max, moneda, zona, sector, contacto:contactos(nombre_completo), municipio:municipios(nombre)')
    .eq('organization_id', perfil.organization_id)
    .eq('estado', 'abierto')
    .order('creado_en', { ascending: false })
    .limit(10)
  if (perfil.rol === 'agente') query = query.eq('creado_por', perfil.id)

  const ubicacion = c.ubicacion ? escaparValorFiltro(String(c.ubicacion)) : null
  if (ubicacion) {
    const { data: municipiosCoincidentes } = await supabase
      .from('municipios')
      .select('id')
      .ilike('nombre', `%${ubicacion}%`)
    const condiciones = [`zona.ilike.%${ubicacion}%`, `sector.ilike.%${ubicacion}%`]
    if (municipiosCoincidentes && municipiosCoincidentes.length > 0) {
      condiciones.push(`municipio_id.in.(${municipiosCoincidentes.map((m) => m.id).join(',')})`)
    }
    query = query.or(condiciones.join(','))
  }

  const { data, error } = await query
  if (error) {
    console.error('Error consultando requerimientos para asistente IA:', error)
    await responderAsesor(chatId, 'Uy, no pude consultar los requerimientos en este momento 😓', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }

  if (!data || data.length === 0) {
    await responderAsesor(chatId, 'No hay requerimientos abiertos que coincidan 🙂', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }

  const lineas = (data as any[]).map((r) => {
    const contacto = Array.isArray(r.contacto) ? r.contacto[0] : r.contacto
    const municipio = Array.isArray(r.municipio) ? r.municipio[0] : r.municipio
    const tipo = [r.tipo_operacion ? ETIQUETAS_TIPO_OPERACION_REQ[r.tipo_operacion] : null, r.tipo_propiedad].filter(Boolean).join(' · ') || 'Cualquier tipo'
    const ubicacionTxt = [r.zona ? `Zona ${r.zona}` : null, r.sector, municipio?.nombre].filter(Boolean).join(' · ')
    const presupuesto = r.precio_min || r.precio_max
      ? `${r.moneda ?? 'GTQ'} ${r.precio_min ? Number(r.precio_min).toLocaleString() : '0'}${r.precio_max ? ` - ${Number(r.precio_max).toLocaleString()}` : '+'}`
      : null
    return `• ${contacto?.nombre_completo ?? 'Cliente'} — ${tipo}${ubicacionTxt ? ' · ' + ubicacionTxt : ''}${presupuesto ? ' · ' + presupuesto : ''}`
  })

  await responderAsesor(
    chatId,
    [`📋 ${data.length} requerimiento${data.length === 1 ? '' : 's'} abierto${data.length === 1 ? '' : 's'}:`, ...lineas].join('\n'),
    perfil.organization_id,
    perfil.id,
    null,
    'asistente_ia_respuesta'
  )
}

// Igual que resolverLeadPorNombreContacto: solo vincula si hay EXACTAMENTE
// un contacto coincidente, y además solo si ese contacto tiene EXACTAMENTE
// un requerimiento abierto — si tiene varios, no se puede adivinar cuál
// cerrar, así que se pide hacerlo manualmente en vez de asumir.
async function resolverRequerimientoAbiertoPorNombreContacto(nombreContacto: string | null, perfil: PerfilAsistente): Promise<{ requerimientoId: string; contactoId: string } | null> {
  if (!nombreContacto || !nombreContacto.trim()) return null
  const { data: contactosCoincidentes } = await supabase.from('contactos').select('id').ilike('nombre_completo', `%${nombreContacto.trim()}%`)
  const contactoIds = (contactosCoincidentes ?? []).map((c) => c.id)
  if (contactoIds.length === 0) return null

  let query = supabase
    .from('requerimientos')
    .select('id, contacto_id')
    .eq('organization_id', perfil.organization_id)
    .eq('estado', 'abierto')
    .in('contacto_id', contactoIds)
    .order('creado_en', { ascending: false })
  if (perfil.rol === 'agente') query = query.eq('creado_por', perfil.id)
  const { data: requerimientosCoincidentes } = await query
  if (!requerimientosCoincidentes || requerimientosCoincidentes.length === 0) return null

  const contactosDistintos = new Set(requerimientosCoincidentes.map((r) => r.contacto_id))
  if (contactosDistintos.size !== 1 || requerimientosCoincidentes.length !== 1) return null
  const unico = requerimientosCoincidentes[0]
  return { requerimientoId: unico.id, contactoId: unico.contacto_id }
}

async function cerrarRequerimientoDesdeAsistente(perfil: PerfilAsistente, chatId: string, nombreContacto: string) {
  const vinculo = await resolverRequerimientoAbiertoPorNombreContacto(nombreContacto, perfil)
  if (!vinculo) {
    await responderAsesor(
      chatId,
      `No encontré (o hay varios) un requerimiento abierto de "${nombreContacto}" entre los que puedes ver 😕 Ciérralo manualmente desde el CRM.`,
      perfil.organization_id,
      perfil.id,
      null,
      'asistente_ia_respuesta'
    )
    return
  }

  const { error } = await supabase.from('requerimientos').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', vinculo.requerimientoId)
  if (error) {
    console.error('No se pudo cerrar el requerimiento desde el asistente IA:', error)
    await responderAsesor(chatId, 'Uy, no pude cerrarlo 😓 Intenta de nuevo o hazlo manualmente desde el CRM.', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }

  await responderAsesor(chatId, `✅ Listo, cerré el requerimiento de ${nombreContacto}.`, perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
}

async function responderCerrarRequerimiento(perfil: PerfilAsistente, chatId: string, c: Record<string, any>) {
  const nombreContacto = c.nombre_contacto ? String(c.nombre_contacto).trim() : null

  if (!nombreContacto) {
    const pregunta = '¿El requerimiento de qué cliente quieres cerrar? Responde citando este mensaje 🙂'
    const idMessage = await responderAsesor(chatId, pregunta, perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    await supabase.from('asistente_ia_pendientes').insert({
      chat_id_asesor: chatId,
      perfil_id: perfil.id,
      organization_id: perfil.organization_id,
      intencion: 'cerrar_requerimiento',
      contexto: {},
      pregunta_texto: pregunta,
      green_api_message_id: idMessage,
    })
    return
  }

  await cerrarRequerimientoDesdeAsistente(perfil, chatId, nombreContacto)
}

function fechaEsConfiable(fechaIso: unknown, confianza: unknown): fechaIso is string {
  return typeof fechaIso === 'string' && (confianza === 'alta' || confianza === 'media')
}

// Búsqueda en dos pasos (contactos -> leads) en vez de un ilike sobre una
// tabla embebida vía PostgREST, patrón que no se usa hoy en ningún otro
// lugar del proyecto. Solo vincula si hay EXACTAMENTE un contacto
// coincidente entre los leads visibles para este perfil.
async function resolverLeadPorNombreContacto(nombreContacto: string | null, perfil: PerfilAsistente): Promise<{ leadId: string; contactoId: string } | null> {
  if (!nombreContacto || !nombreContacto.trim()) return null
  const { data: contactosCoincidentes } = await supabase.from('contactos').select('id').ilike('nombre_completo', `%${nombreContacto.trim()}%`)
  const contactoIds = (contactosCoincidentes ?? []).map((c) => c.id)
  if (contactoIds.length === 0) return null

  let query = supabase.from('leads').select('id, contacto_id').eq('organization_id', perfil.organization_id).in('contacto_id', contactoIds).order('actualizado_en', { ascending: false })
  if (perfil.rol === 'agente') query = query.eq('agente_id', perfil.id)
  const { data: leadsCoincidentes } = await query
  if (!leadsCoincidentes || leadsCoincidentes.length === 0) return null

  const contactosDistintos = new Set(leadsCoincidentes.map((l) => l.contacto_id))
  if (contactosDistintos.size !== 1) return null // 0 ya cubierto arriba; >1 = ambiguo, nunca vincular
  const masReciente = leadsCoincidentes[0]
  return { leadId: masReciente.id, contactoId: masReciente.contacto_id }
}

async function crearTareaDesdeAsistente(perfil: PerfilAsistente, chatId: string, titulo: string, nombreContacto: string | null, fechaHoraIso: string, prioridad: string) {
  const vinculo = await resolverLeadPorNombreContacto(nombreContacto, perfil)
  // creado_por_ia + recordatorio_proximo_en reusan el mismo mecanismo de
  // recordatorio automático que ya existe para las tareas que Ben crea
  // durante el seguimiento de citas (ver crearTarea más arriba).
  const { error } = await supabase.from('tareas').insert({
    asignado_a: perfil.id,
    contacto_id: vinculo?.contactoId ?? null,
    lead_id: vinculo?.leadId ?? null,
    titulo,
    fecha_limite: fechaHoraIso,
    estado: 'pendiente',
    prioridad,
    organization_id: perfil.organization_id,
    creado_por_ia: true,
    recordatorio_proximo_en: fechaHoraIso,
  })
  if (error) {
    console.error('No se pudo crear tarea desde el asistente IA:', error)
    await responderAsesor(chatId, 'Uy, no pude crear la tarea 😓 Intenta de nuevo o créala manualmente desde el CRM.', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }

  const avisoVinculo = nombreContacto && !vinculo ? ` No encontré (o hay varios) "${nombreContacto}" entre tus leads — vincúlala manualmente desde el CRM si quieres.` : ''
  await responderAsesor(
    chatId,
    `✅ Listo, creé la tarea "${titulo}" para el ${formatearFechaHoraGT(fechaHoraIso)}. Te recordaré por aquí si se acerca la fecha y no la has marcado como hecha.${avisoVinculo}`,
    perfil.organization_id,
    perfil.id,
    null,
    'asistente_ia_respuesta'
  )
}

async function responderCrearTarea(perfil: PerfilAsistente, chatId: string, c: Record<string, any>) {
  const titulo = (c.titulo_tarea && String(c.titulo_tarea).trim()) || 'Tarea de seguimiento'
  const prioridad = ['baja', 'media', 'alta'].includes(c.prioridad_tarea) ? c.prioridad_tarea : 'media'

  if (!fechaEsConfiable(c.fecha_hora_iso, c.confianza_fecha)) {
    const pregunta = '¿Para qué fecha y hora exactas quieres la tarea? Responde citando este mensaje 🙂'
    const idMessage = await responderAsesor(chatId, pregunta, perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    await supabase.from('asistente_ia_pendientes').insert({
      chat_id_asesor: chatId,
      perfil_id: perfil.id,
      organization_id: perfil.organization_id,
      intencion: 'crear_tarea',
      contexto: { titulo_tarea: titulo, nombre_contacto: c.nombre_contacto ?? null, prioridad_tarea: prioridad },
      pregunta_texto: pregunta,
      green_api_message_id: idMessage,
    })
    return
  }
  await crearTareaDesdeAsistente(perfil, chatId, titulo, c.nombre_contacto ?? null, c.fecha_hora_iso, prioridad)
}

// La cita creada por Ben no dispara el aviso al grupo de WhatsApp "citas"
// ni el recordatorio automático al cliente que sí dispara crearActividad
// en la web — decisión explícita: Ben solo confirma al asesor, igual que
// el resto de sus respuestas.
async function crearCitaDesdeAsistente(perfil: PerfilAsistente, chatId: string, nombreContacto: string, fechaHoraIso: string) {
  const vinculo = await resolverLeadPorNombreContacto(nombreContacto, perfil)
  if (!vinculo) {
    await responderAsesor(
      chatId,
      `No encontré (o hay varios) un lead de "${nombreContacto}" entre los que puedes ver 😕 Agenda la cita manualmente desde el CRM, o intenta con el nombre completo tal como aparece ahí.`,
      perfil.organization_id,
      perfil.id,
      null,
      'asistente_ia_respuesta'
    )
    return
  }

  const { data: lead } = await supabase.from('leads').select('etapa, agente_id').eq('id', vinculo.leadId).single()

  const { error } = await supabase.from('actividades').insert({
    contacto_id: vinculo.contactoId,
    lead_id: vinculo.leadId,
    agente_id: lead?.agente_id ?? perfil.id,
    creado_por: perfil.id,
    tipo_actividad: 'cita',
    programada_en: fechaHoraIso,
    organization_id: perfil.organization_id,
  })
  if (error) {
    console.error('No se pudo crear la cita desde el asistente IA:', error)
    await responderAsesor(chatId, 'Uy, no pude crear la cita 😓 Intenta de nuevo o créala manualmente desde el CRM.', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }

  // Solo se avanza la etapa desde "contacto_inicial": si el lead ya iba más
  // adelante (visita_realizada, reservada, etc.) agendar una cita nueva
  // (ej. la firma) no debe retroceder ni alterar su etapa actual.
  let avisoEtapa = ''
  if (lead?.etapa === 'contacto_inicial') {
    await supabase.from('leads').update({ etapa: 'visita_agendada', actualizado_en: new Date().toISOString() }).eq('id', vinculo.leadId).eq('etapa', 'contacto_inicial')
    avisoEtapa = ' Moví el lead a *Visita agendada*.'
  }

  await responderAsesor(
    chatId,
    `✅ Listo, agendé la cita con ${nombreContacto} para el ${formatearFechaHoraGT(fechaHoraIso)}.${avisoEtapa}`,
    perfil.organization_id,
    perfil.id,
    null,
    'asistente_ia_respuesta'
  )
}

async function responderAgendarCita(perfil: PerfilAsistente, chatId: string, c: Record<string, any>) {
  const nombreContacto = c.nombre_contacto ? String(c.nombre_contacto).trim() : null
  const fechaConfiable = fechaEsConfiable(c.fecha_hora_iso, c.confianza_fecha)

  if (!nombreContacto) {
    const pregunta = '¿Cuál es el nombre completo del cliente para la cita? Responde citando este mensaje 🙂'
    const idMessage = await responderAsesor(chatId, pregunta, perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    await supabase.from('asistente_ia_pendientes').insert({
      chat_id_asesor: chatId,
      perfil_id: perfil.id,
      organization_id: perfil.organization_id,
      intencion: 'agendar_cita',
      contexto: { esperando: 'nombre_contacto', fecha_hora_iso: fechaConfiable ? c.fecha_hora_iso : null },
      pregunta_texto: pregunta,
      green_api_message_id: idMessage,
    })
    return
  }

  if (!fechaConfiable) {
    const pregunta = `¿Para qué fecha y hora quieres agendar la cita con ${nombreContacto}? Responde citando este mensaje 🙂`
    const idMessage = await responderAsesor(chatId, pregunta, perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    await supabase.from('asistente_ia_pendientes').insert({
      chat_id_asesor: chatId,
      perfil_id: perfil.id,
      organization_id: perfil.organization_id,
      intencion: 'agendar_cita',
      contexto: { esperando: 'fecha_hora_iso', nombre_contacto: nombreContacto },
      pregunta_texto: pregunta,
      green_api_message_id: idMessage,
    })
    return
  }

  await crearCitaDesdeAsistente(perfil, chatId, nombreContacto, c.fecha_hora_iso)
}

// Igual que con agendar_cita, se usa resolverLeadPorNombreContacto (ya
// acotado por rol) y no hay ninguna restricción de etapas terminal→no
// terminal: es la misma acción sin guardas que ya existe en el Kanban del
// CRM (cambiarEtapaLead), solo con otra puerta de entrada por WhatsApp.
async function cambiarEtapaDesdeAsistente(perfil: PerfilAsistente, chatId: string, nombreContacto: string, etapaNueva: string) {
  const vinculo = await resolverLeadPorNombreContacto(nombreContacto, perfil)
  if (!vinculo) {
    await responderAsesor(
      chatId,
      `No encontré (o hay varios) un lead de "${nombreContacto}" entre los que puedes ver 😕 Cámbialo manualmente desde el CRM, o intenta con el nombre completo tal como aparece ahí.`,
      perfil.organization_id,
      perfil.id,
      null,
      'asistente_ia_respuesta'
    )
    return
  }

  const { error } = await supabase.from('leads').update({ etapa: etapaNueva, actualizado_en: new Date().toISOString() }).eq('id', vinculo.leadId)
  if (error) {
    console.error('No se pudo cambiar la etapa del lead desde el asistente IA:', error)
    await responderAsesor(chatId, 'Uy, no pude cambiar la etapa 😓 Intenta de nuevo o hazlo manualmente desde el CRM.', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }

  await responderAsesor(
    chatId,
    `✅ Listo, moví el lead de ${nombreContacto} a *${ETIQUETAS_ETAPA[etapaNueva] ?? etapaNueva}*.`,
    perfil.organization_id,
    perfil.id,
    null,
    'asistente_ia_respuesta'
  )
}

async function responderCambiarEtapaLead(perfil: PerfilAsistente, chatId: string, c: Record<string, any>) {
  const nombreContacto = c.nombre_contacto ? String(c.nombre_contacto).trim() : null
  const etapaNueva = ETAPAS_VALIDAS_LEAD.includes(c.etapa_nueva) ? (c.etapa_nueva as string) : null

  if (!nombreContacto) {
    const pregunta = '¿El lead de qué cliente quieres cambiar de etapa? Responde citando este mensaje 🙂'
    const idMessage = await responderAsesor(chatId, pregunta, perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    await supabase.from('asistente_ia_pendientes').insert({
      chat_id_asesor: chatId,
      perfil_id: perfil.id,
      organization_id: perfil.organization_id,
      intencion: 'cambiar_etapa_lead',
      contexto: { esperando: 'nombre_contacto', etapa_nueva: etapaNueva },
      pregunta_texto: pregunta,
      green_api_message_id: idMessage,
    })
    return
  }

  if (!etapaNueva) {
    const pregunta = `¿A qué etapa muevo el lead de ${nombreContacto}? (contacto inicial, visita agendada, visita realizada, reservada, ganada o perdida). Responde citando este mensaje 🙂`
    const idMessage = await responderAsesor(chatId, pregunta, perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    await supabase.from('asistente_ia_pendientes').insert({
      chat_id_asesor: chatId,
      perfil_id: perfil.id,
      organization_id: perfil.organization_id,
      intencion: 'cambiar_etapa_lead',
      contexto: { esperando: 'etapa_nueva', nombre_contacto: nombreContacto },
      pregunta_texto: pregunta,
      green_api_message_id: idMessage,
    })
    return
  }

  await cambiarEtapaDesdeAsistente(perfil, chatId, nombreContacto, etapaNueva)
}

async function manejarConsultaGeneral(perfil: PerfilAsistente, chatId: string, mensaje: string, idMessageEntrante: string | null) {
  if (await yaFueProcesadoMensajeEntrante(idMessageEntrante)) return

  let c: Record<string, any>
  try {
    c = parsearRespuestaGroq(await llamarGroq(construirPromptConsultaGeneral(mensaje)))
  } catch (err) {
    console.error('Error clasificando consulta general:', err)
    await responderAsesor(chatId, 'Uy, tuve un problema para entender tu mensaje 😅 ¿Puedes intentarlo de nuevo?', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }

  if (c.intencion === 'consultar_leads') await responderConsultaLeads(perfil, chatId, c)
  else if (c.intencion === 'consultar_citas') await responderConsultaCitas(perfil, chatId, c)
  else if (c.intencion === 'buscar_propiedades') await responderBusquedaPropiedades(perfil, chatId, c)
  else if (c.intencion === 'crear_tarea') await responderCrearTarea(perfil, chatId, c)
  else if (c.intencion === 'agendar_cita') await responderAgendarCita(perfil, chatId, c)
  else if (c.intencion === 'cambiar_etapa_lead') await responderCambiarEtapaLead(perfil, chatId, c)
  else if (c.intencion === 'consultar_requerimientos') await responderConsultarRequerimientos(perfil, chatId, c)
  else if (c.intencion === 'cerrar_requerimiento') await responderCerrarRequerimiento(perfil, chatId, c)
  else if (c.intencion === 'reporte_desempeno') await responderReporteDesempeno(perfil, chatId, c)
  else await responderAsesor(chatId, mensajeConversacionGeneral(perfil.nombre_completo), perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
}

type PendienteAsistenteRow = { id: string; chat_id_asesor: string; perfil_id: string; organization_id: string; intencion: string; contexto: Record<string, any>; creado_en: string }

async function resolverAclaracionPendienteAsistente(chatId: string): Promise<PendienteAsistenteRow | null> {
  const { data } = await supabase
    .from('asistente_ia_pendientes')
    .select('id, chat_id_asesor, perfil_id, organization_id, intencion, contexto, creado_en')
    .eq('chat_id_asesor', chatId)
    .eq('estado', 'pendiente')
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  // Si quedó abierta más de 2h sin respuesta, se cierra silenciosamente y
  // el mensaje nuevo se trata como una consulta fresca (evita que un
  // mensaje no relacionado, días después, se interprete como "la fecha").
  if (new Date(data.creado_en).getTime() < Date.now() - 2 * 3600_000) {
    await supabase.from('asistente_ia_pendientes').update({ estado: 'cerrado', actualizado_en: new Date().toISOString() }).eq('id', data.id).eq('estado', 'pendiente')
    return null
  }
  return data as PendienteAsistenteRow
}

async function reclamarAclaracionPendiente(id: string): Promise<boolean> {
  const { data } = await supabase
    .from('asistente_ia_pendientes')
    .update({ estado: 'respondido', actualizado_en: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'pendiente')
    .select('id')
  return !!data && data.length > 0
}

async function procesarAclaracionAgendarCita(pendiente: PendienteAsistenteRow, mensaje: string, perfil: PerfilAsistente, chatId: string) {
  const ctx = pendiente.contexto as { esperando: 'nombre_contacto' | 'fecha_hora_iso'; nombre_contacto?: string; fecha_hora_iso?: string | null }

  if (ctx.esperando === 'nombre_contacto') {
    const nombreContacto = mensaje.trim()
    if (ctx.fecha_hora_iso) {
      await crearCitaDesdeAsistente(perfil, chatId, nombreContacto, ctx.fecha_hora_iso)
      return
    }
    const pregunta = `¿Para qué fecha y hora quieres agendar la cita con ${nombreContacto}? Responde citando este mensaje 🙂`
    const idMessage = await responderAsesor(chatId, pregunta, perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    await supabase.from('asistente_ia_pendientes').insert({
      chat_id_asesor: chatId,
      perfil_id: perfil.id,
      organization_id: perfil.organization_id,
      intencion: 'agendar_cita',
      contexto: { esperando: 'fecha_hora_iso', nombre_contacto: nombreContacto },
      pregunta_texto: pregunta,
      green_api_message_id: idMessage,
    })
    return
  }

  // ctx.esperando === 'fecha_hora_iso'
  const clasificacion = parsearRespuestaGroq(await llamarGroq(construirPromptAclaracionFecha(mensaje))) as { fecha_hora_iso: string | null; confianza_fecha: string }
  if (!fechaEsConfiable(clasificacion.fecha_hora_iso, clasificacion.confianza_fecha)) {
    await responderAsesor(chatId, 'Sigue sin quedarme clara la fecha 😅 Mejor agenda la cita manualmente desde el CRM con la fecha exacta.', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }
  await crearCitaDesdeAsistente(perfil, chatId, ctx.nombre_contacto!, clasificacion.fecha_hora_iso)
}

async function procesarAclaracionCambiarEtapaLead(pendiente: PendienteAsistenteRow, mensaje: string, perfil: PerfilAsistente, chatId: string) {
  const ctx = pendiente.contexto as { esperando: 'nombre_contacto' | 'etapa_nueva'; nombre_contacto?: string; etapa_nueva?: string | null }

  if (ctx.esperando === 'nombre_contacto') {
    const nombreContacto = mensaje.trim()
    if (ctx.etapa_nueva) {
      await cambiarEtapaDesdeAsistente(perfil, chatId, nombreContacto, ctx.etapa_nueva)
      return
    }
    const pregunta = `¿A qué etapa muevo el lead de ${nombreContacto}? (contacto inicial, visita agendada, visita realizada, reservada, ganada o perdida). Responde citando este mensaje 🙂`
    const idMessage = await responderAsesor(chatId, pregunta, perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    await supabase.from('asistente_ia_pendientes').insert({
      chat_id_asesor: chatId,
      perfil_id: perfil.id,
      organization_id: perfil.organization_id,
      intencion: 'cambiar_etapa_lead',
      contexto: { esperando: 'etapa_nueva', nombre_contacto: nombreContacto },
      pregunta_texto: pregunta,
      green_api_message_id: idMessage,
    })
    return
  }

  // ctx.esperando === 'etapa_nueva'
  const clasificacion = parsearRespuestaGroq(await llamarGroq(construirPromptAclaracionEtapa(mensaje))) as { etapa_nueva: string | null }
  const etapaNueva = ETAPAS_VALIDAS_LEAD.includes(clasificacion.etapa_nueva as string) ? clasificacion.etapa_nueva! : null
  if (!etapaNueva) {
    await responderAsesor(chatId, 'Sigue sin quedarme clara la etapa 😅 Mejor hazlo manualmente desde el CRM.', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }
  await cambiarEtapaDesdeAsistente(perfil, chatId, ctx.nombre_contacto!, etapaNueva)
}

async function procesarAclaracionPendiente(pendiente: PendienteAsistenteRow, mensaje: string, perfil: PerfilAsistente, chatId: string) {
  if (pendiente.intencion === 'agendar_cita') {
    await procesarAclaracionAgendarCita(pendiente, mensaje, perfil, chatId)
    return
  }
  if (pendiente.intencion === 'cambiar_etapa_lead') {
    await procesarAclaracionCambiarEtapaLead(pendiente, mensaje, perfil, chatId)
    return
  }
  if (pendiente.intencion === 'cerrar_requerimiento') {
    await cerrarRequerimientoDesdeAsistente(perfil, chatId, mensaje.trim())
    return
  }
  const clasificacion = parsearRespuestaGroq(await llamarGroq(construirPromptAclaracionFecha(mensaje))) as { fecha_hora_iso: string | null; confianza_fecha: string }
  if (!fechaEsConfiable(clasificacion.fecha_hora_iso, clasificacion.confianza_fecha)) {
    await responderAsesor(chatId, 'Sigue sin quedarme clara la fecha 😅 Mejor créala manualmente desde el CRM con la fecha exacta que necesitas.', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    return
  }
  const ctx = pendiente.contexto as { titulo_tarea: string; nombre_contacto: string | null; prioridad_tarea: string }
  await crearTareaDesdeAsistente(perfil, chatId, ctx.titulo_tarea, ctx.nombre_contacto, clasificacion.fecha_hora_iso, ctx.prioridad_tarea)
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
  // Igual que stanzaIdCitado: se asume que el body de Green API trae
  // "idMessage" en la raíz para mensajes entrantes (campo estándar
  // documentado), a confirmar contra tráfico real. Si el nombre real
  // difiere, el dedup de reentregas simplemente no deduplica — no rompe
  // nada, solo deja de proteger ese caso puntual.
  const idMessageEntrante = (body.idMessage as string | undefined) ?? null

  if (!chatId || !textoMensaje) {
    return new Response(JSON.stringify({ ok: true, ignorado: 'sin chatId o texto' }), { status: 200 })
  }

  const seguimiento = await resolverSeguimientoPendiente(chatId, stanzaIdCitado)
  if (seguimiento) {
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
  }

  // Sin seguimiento de cita pendiente: puede ser la respuesta a un
  // recordatorio de tarea ("¿ya llamaste a X?").
  const tarea = await resolverTareaPendiente(chatId, stanzaIdCitado)
  if (tarea) {
    const reclamada = await reclamarRecordatorioTarea(tarea.id)
    if (!reclamada) {
      return new Response(JSON.stringify({ ok: true, duplicado: true }), { status: 200 })
    }
    try {
      await procesarRespuestaTarea(tarea, textoMensaje)
    } catch (err) {
      console.error(`Error procesando recordatorio de tarea ${tarea.id}:`, err)
      // Ante un error, se reprograma el recordatorio en vez de dejarlo
      // "trabado" sin recordatorio_proximo_en (que lo sacaría del cron).
      await supabase.from('tareas').update({ recordatorio_proximo_en: new Date(Date.now() + 4 * 3600_000).toISOString() }).eq('id', tarea.id)
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  // Sin seguimiento de cita ni recordatorio de tarea pendiente: puede ser
  // una consulta al asistente general (solo para perfiles conocidos — si
  // el número no está en "perfiles", se ignora igual que siempre).
  const perfil = await resolverPerfilPorChatId(chatId)
  if (!perfil) {
    return new Response(JSON.stringify({ ok: true, ignorado: 'sin seguimiento, recordatorio ni perfil reconocido' }), { status: 200 })
  }

  const pendienteAsistente = await resolverAclaracionPendienteAsistente(chatId)
  if (pendienteAsistente) {
    const reclamadaAsistente = await reclamarAclaracionPendiente(pendienteAsistente.id)
    if (!reclamadaAsistente) {
      return new Response(JSON.stringify({ ok: true, duplicado: true }), { status: 200 })
    }
    try {
      await procesarAclaracionPendiente(pendienteAsistente, textoMensaje, perfil, chatId)
    } catch (err) {
      console.error('Error procesando aclaración del asistente IA:', err)
      await responderAsesor(chatId, 'Tuve un problema procesando tu respuesta 😅 intenta de nuevo o créala manualmente desde el CRM.', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    await manejarConsultaGeneral(perfil, chatId, textoMensaje, idMessageEntrante)
  } catch (err) {
    console.error('Error en el asistente general:', err)
    await responderAsesor(chatId, 'Tuve un problema procesando tu mensaje 😅 intenta de nuevo.', perfil.organization_id, perfil.id, null, 'asistente_ia_respuesta')
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
