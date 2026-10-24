// Simulador de solo lectura del agente de seguimiento IA: deja probar las
// preguntas y la clasificación de la IA sin tocar leads/actividades reales
// ni enviar WhatsApp. Reutiliza exactamente los mismos prompts, esquemas y
// árbol de decisión que seguimiento-ia-webhook/index.ts — si ese archivo
// cambia la lógica, hay que replicar el cambio aquí también (no hay
// carpeta _shared en este proyecto; mismo criterio que el resto de las
// Edge Functions, que duplican su propio código de llamadas a IA).

import { createClient } from 'npm:@supabase/supabase-js@2'

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const PRUEBA_SECRET = Deno.env.get('WHATSAPP_FUNCTION_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GROQ_MODEL = 'openai/gpt-oss-120b'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const ETIQUETA_TIPO: Record<string, string> = {
  cita: 'cita', reunion: 'reunión', video_llamada: 'video llamada', llamada: 'llamada', firma_contrato: 'firma de contrato',
}

const MENSAJE_PERDIDA = 'Entendido, no te preocupes — ¡seguro pronto llega el cliente ideal! 💪 Gracias por el seguimiento.'
const MENSAJE_GANADA = '🎉🎉 ¡FELICIDADES!! Lograste cerrar el trato, excelente trabajo 🙌🏆 Moví el lead a Ganada. ¡Gracias por todo el seguimiento que le diste!'
const MENSAJE_RESERVADA = '🎉 ¡Buenísimo! Registré la reserva — moví el lead a Reservada. ¡Excelente trabajo! Seguimos de cerca hasta la firma.'

export const PREGUNTA_INICIAL = (agenteNombre: string, tipoActividad: string, contactoNombre: string) =>
  [
    `Hola ${agenteNombre}, soy Ben, tu asistente inmobiliario 😊 ¿Cómo te fue con tu ${ETIQUETA_TIPO[tipoActividad] ?? tipoActividad} con ${contactoNombre}?`,
    'Cuéntame si se realizó y cómo te fue. Responde citando este mensaje 🙂',
  ].join('\n')

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

type Resultado = {
  clasificacion: Record<string, unknown>
  accion_descrita: string
  siguiente_fase: string | null
  siguiente_pregunta: string | null
  es_reintento_aclaracion_siguiente: boolean
  terminal: boolean
}

function evaluarResultadoVisita(clasificacion: any, esAclaracion: boolean, nombreContacto: string): Resultado {
  // En una aclaración de esta fase, "asistio" ya es un hecho confirmado
  // del turno anterior — se fuerza para no dejar que el modelo lo
  // reclasifique mal con un texto que ya no habla de eso.
  if (esAclaracion) clasificacion.asistio = true
  if (!clasificacion.asistio) {
    return {
      clasificacion,
      accion_descrita: `Se registra en Seguimientos: "El cliente no asistió/atendió. ${clasificacion.resumen}". No se mueve el lead todavía.`,
      siguiente_fase: 'reprogramar',
      siguiente_pregunta: `¿Quieren reprogramar la visita con ${nombreContacto}? Si es así, dime para cuándo. Responde citando este mensaje.`,
      es_reintento_aclaracion_siguiente: false,
      terminal: false,
    }
  }
  if (clasificacion.resultado_cliente === 'no_concluyente') {
    if (esAclaracion) {
      return {
        clasificacion,
        accion_descrita: 'Sigue sin ser claro tras una aclaración: se CIERRA para revisión manual del admin. No se mueve el lead.',
        siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true,
      }
    }
    return {
      clasificacion,
      accion_descrita: 'No quedó claro el resultado: se pide una aclaración (una sola vez).',
      siguiente_fase: 'resultado_visita',
      siguiente_pregunta: 'Cuéntame más detalles: ¿el cliente quiere reservar, no le interesó, o se quedó indeciso? Responde citando este mensaje.',
      es_reintento_aclaracion_siguiente: true,
      terminal: false,
    }
  }
  if (clasificacion.resultado_cliente === 'reservo') {
    if (clasificacion.ya_reservo) {
      return {
        clasificacion,
        accion_descrita: `Se mueve el lead a "Reservada". NO se cierra: sigue cada 24h enfocado en la firma. Mensaje al asesor: "${MENSAJE_RESERVADA}"`,
        siguiente_fase: 'seguimiento_recurrente',
        siguiente_pregunta: '¿Cómo va la firma de contrato? ¿Ya se agendó, ya se realizó, se perdió el trato, o seguimos esperando? Si se agendó, dime para cuándo. Responde citando este mensaje.',
        es_reintento_aclaracion_siguiente: false, terminal: false,
      }
    }
    if (clasificacion.requiere_revision_documentos) {
      return {
        clasificacion,
        accion_descrita: `El lead se queda en "Visita realizada" (NO se mueve a Reservada). Mensaje al asesor: "¡Qué bien que le haya gustado! 😊 Quedo pendiente de la documentación — te escribo en 24 horas para ver cómo va. ¡Gracias por el seguimiento!" Entra al ciclo recurrente hasta Ganada/Perdida.`,
        siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false,
        terminal: true, // en la simulación se trata como fin de turno; el próximo aviso real llega en 24h, fuera de este chat de prueba
      }
    }
    return {
      clasificacion,
      accion_descrita: `El lead se queda en "Visita realizada" (NO se mueve a Reservada). Se crea una TAREA "Llamar para gestionar la reserva" en 24h. Mensaje al asesor: "¡Excelente noticia! 🙌 Ya programé un recordatorio para llamarlo en 24 horas y cerrar la reserva. Te escribo para ver cómo va. ¡Gracias por el seguimiento!" Entra al ciclo recurrente hasta Ganada/Perdida.`,
      siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false,
      terminal: true,
    }
  }
  if (clasificacion.resultado_cliente === 'perdido') {
    return { clasificacion, accion_descrita: `Se mueve el lead a "Perdida". Mensaje al asesor: "${MENSAJE_PERDIDA}"`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  if (clasificacion.resultado_cliente === 'indeciso_sin_decision') {
    return {
      clasificacion,
      accion_descrita: `Se mueve el lead a "Visita realizada". Se sugiere una llamada en 24h pero se PREGUNTA antes de crear nada.`,
      siguiente_fase: 'ofrecer_siguiente_paso',
      siguiente_pregunta: '¿Programamos una llamada de seguimiento en 24 horas, o prefieres hacer algo diferente? Si es algo distinto, dime qué y para cuándo. Responde citando este mensaje.',
      es_reintento_aclaracion_siguiente: false,
      terminal: false,
    }
  }
  // indeciso_mas_opciones
  return {
    clasificacion,
    accion_descrita: `Se mueve el lead a "Visita realizada". Resumen registrado: "${clasificacion.resumen}".`,
    siguiente_fase: 'ofrecer_siguiente_paso',
    siguiente_pregunta: '¿Programamos una llamada o una nueva visita de seguimiento? Si es así, dime para cuándo. Responde citando este mensaje.',
    es_reintento_aclaracion_siguiente: false,
    terminal: false,
  }
}

function evaluarConFecha(fase: string, clasificacion: any, esAclaracion: boolean, nombreContacto: string): Resultado {
  const campoDecision = fase === 'reprogramar' ? 'quiere_reprogramar' : 'proximo_paso'
  const decision = clasificacion[campoDecision]
  const fechaIso = clasificacion.fecha_hora_iso as string | null
  const confianza = clasificacion.confianza_fecha as string

  const necesitaFecha =
    (fase === 'reprogramar' && decision === true) ||
    (fase === 'ofrecer_siguiente_paso' && typeof decision === 'string' && ['llamada', 'nueva_visita', 'enviar_opciones'].includes(decision))

  if (necesitaFecha && (confianza === 'baja' || confianza === 'ninguna' || !fechaIso)) {
    if (esAclaracion) {
      return { clasificacion, accion_descrita: 'La fecha sigue sin ser clara tras una aclaración: se CIERRA para revisión manual del admin. No se agenda nada.', siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
    }
    return {
      clasificacion,
      accion_descrita: 'No quedó clara la fecha/hora: se pide una aclaración (una sola vez).',
      siguiente_fase: fase,
      siguiente_pregunta: '¿Para qué fecha y hora exactas? Responde citando este mensaje.',
      es_reintento_aclaracion_siguiente: true,
      terminal: false,
    }
  }

  if (fase === 'reprogramar') {
    if (decision === false) {
      return {
        clasificacion,
        accion_descrita: 'El asesor no confirma reprogramar ahora: se le pregunta si quiere que se le consulte de nuevo en 24h o prefiere marcar perdida.',
        siguiente_fase: 'confirmar_reintento_24h',
        siguiente_pregunta: `¿Quieres que te vuelva a preguntar en 24 horas sobre la visita con ${nombreContacto}, o prefieres que marque ese lead como perdido ahora? Responde citando este mensaje.`,
        es_reintento_aclaracion_siguiente: false,
        terminal: false,
      }
    }
    return { clasificacion, accion_descrita: `Se crea una nueva CITA para ${fechaIso}, el lead vuelve a "Visita agendada". Mensaje al asesor: "¡Perfecto! 📅 Ya agendé la nueva visita. Te escribo un par de horas después para ver cómo te fue. ¡Gracias por el seguimiento!"`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }

  if (decision === 'ninguno_por_ahora') {
    return { clasificacion, accion_descrita: 'El asesor prefiere no agendar nada por ahora: no se mueve el lead. Mensaje al asesor: "Entendido, sin problema 😊 Te escribo en 24 horas para ver si hay novedades. ¡Gracias por mantenerme al tanto!" Entra al ciclo recurrente.', siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  if (decision === 'perdido') {
    return { clasificacion, accion_descrita: `El cliente ya no está interesado: se mueve el lead a "Perdida". Mensaje al asesor: "${MENSAJE_PERDIDA}"`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  if (decision === 'enviar_opciones') {
    return {
      clasificacion,
      accion_descrita: `Se crea una TAREA "Enviarle más opciones" con vencimiento ${fechaIso}. Mensaje al asesor: "¡Genial! 👍 Te pregunto en 1 hora después de esa hora para ver si ya se las enviaste. ¡Gracias por el seguimiento!" (y de nuevo 2h y 3h después si sigue sin confirmar).`,
      siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true,
    }
  }
  const tipo = decision === 'llamada' ? 'llamada' : 'cita'
  return { clasificacion, accion_descrita: `Se crea una nueva ${ETIQUETA_TIPO[tipo]} de seguimiento para ${fechaIso}. Mensaje al asesor: "¡Perfecto! 📅 Ya agendé la ${ETIQUETA_TIPO[tipo]}. Te escribo un par de horas después para ver cómo te fue. ¡Gracias por el seguimiento!"`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
}

function evaluarConfirmarReintento24h(clasificacion: any, esAclaracion: boolean, nombreContacto: string): Resultado {
  // Antes era un booleano forzado a true/false, así que una respuesta que
  // no encajaba con ninguna de las dos opciones (ej. el asesor hablando en
  // realidad de OTRO lead) terminaba cerrando como "perdida" por descarte.
  // Ahora, si no es explícito, se repregunta en vez de asumir.
  if (clasificacion.resultado === 'no_concluyente') {
    if (esAclaracion) {
      return {
        clasificacion,
        accion_descrita: 'Sigue sin ser claro tras una aclaración: se CIERRA para revisión manual del admin. No se mueve el lead.',
        siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true,
      }
    }
    return {
      clasificacion,
      accion_descrita: 'No quedó claro si reintentar en 24h o marcar perdido: se pide una aclaración (una sola vez), mencionando el nombre del cliente para evitar confundirlo con otro lead.',
      siguiente_fase: 'confirmar_reintento_24h',
      siguiente_pregunta: `No me quedó claro — hablo del seguimiento de ${nombreContacto}: ¿quieres que te pregunte de nuevo en 24 horas, o prefieres que lo marque como perdido? Responde citando este mensaje.`,
      es_reintento_aclaracion_siguiente: true,
      terminal: false,
    }
  }
  if (clasificacion.resultado === 'volver_a_consultar') {
    return {
      clasificacion,
      accion_descrita: 'Mensaje al asesor: "¡Va! 😊 Te pregunto de nuevo en 24 horas. Gracias por el seguimiento." (no se envía la siguiente pregunta ahora; se programa para dentro de 24h).',
      siguiente_fase: 'reprogramar',
      siguiente_pregunta: `¿Qué me cuentas, pudieron reprogramar la visita con ${nombreContacto}? Responde citando este mensaje.`,
      es_reintento_aclaracion_siguiente: false,
      terminal: true, // en la simulación se trata como fin de turno; el aviso real llega 24h después, fuera de este chat de prueba
    }
  }
  return { clasificacion, accion_descrita: `El cliente no quiere reprogramar: se mueve el lead a "Perdida". Mensaje al asesor: "${MENSAJE_PERDIDA}"`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
}

function evaluarConfirmarEnvioPropiedades(clasificacion: any): Resultado {
  if (clasificacion.enviadas) {
    return { clasificacion, accion_descrita: 'El asesor confirmó que ya envió las propiedades: no se mueve el lead. Mensaje al asesor: "¡Genial! 🙌 Te escribo en 24 horas para ver cómo va. ¡Gracias por el seguimiento!" Entra al ciclo recurrente.', siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  return {
    clasificacion,
    accion_descrita: 'El asesor dice que aún no las envía. Mensaje al asesor: "Entendido, sin prisa 😊 Te pregunto de nuevo más tarde." Se reabre la espera para el siguiente aviso programado (2h o 3h después, según cuál aviso sea).',
    siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false,
    terminal: true, // en la simulación se trata como fin de turno; el siguiente aviso real llega más tarde, fuera de este chat de prueba
  }
}

function evaluarSeguimientoRecurrente(clasificacion: any, esAclaracion: boolean): Resultado {
  if (clasificacion.resultado === 'reservo') {
    return {
      clasificacion,
      accion_descrita: `Se mueve el lead a "Reservada" (si no lo estaba ya). NO se cierra: sigue cada 24h enfocado en la firma. Mensaje al asesor: "${MENSAJE_RESERVADA}"`,
      siguiente_fase: 'seguimiento_recurrente',
      siguiente_pregunta: '¿Cómo va la firma de contrato? ¿Ya se agendó, ya se realizó, se perdió el trato, o seguimos esperando? Si se agendó, dime para cuándo. Responde citando este mensaje.',
      es_reintento_aclaracion_siguiente: false, terminal: false,
    }
  }
  if (clasificacion.resultado === 'agendar_firma') {
    const confianza = clasificacion.confianza_fecha as string
    const fechaIso = clasificacion.fecha_hora_iso as string | null
    if (confianza === 'baja' || confianza === 'ninguna' || !fechaIso) {
      if (esAclaracion) {
        return { clasificacion, accion_descrita: 'La fecha de la firma sigue sin ser clara tras una aclaración: se CIERRA para revisión manual del admin.', siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
      }
      return {
        clasificacion,
        accion_descrita: 'No quedó clara la fecha de la firma: se pide una aclaración (una sola vez).',
        siguiente_fase: 'seguimiento_recurrente',
        siguiente_pregunta: '¿Para qué fecha y hora exactas quedó la firma de contrato? Responde citando este mensaje.',
        es_reintento_aclaracion_siguiente: true,
        terminal: false,
      }
    }
    return { clasificacion, accion_descrita: `Se crea una nueva actividad "firma de contrato" para ${fechaIso}. Mensaje al asesor: "¡Qué buena noticia! 🎉 Ya agendé la firma de contrato — ¡felicidades por este avance! Te escribo después para confirmar que todo salió bien." El ciclo se repetirá 2h después preguntando si se realizó.`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  if (clasificacion.resultado === 'ganada') {
    return { clasificacion, accion_descrita: `Se mueve el lead a "Ganada" 🎉. Fin del ciclo. Mensaje al asesor: "${MENSAJE_GANADA}"`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  if (clasificacion.resultado === 'perdida') {
    return { clasificacion, accion_descrita: `Se mueve el lead a "Perdida". Fin del ciclo. Mensaje al asesor: "${MENSAJE_PERDIDA}"`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  // seguir_esperando
  return {
    clasificacion,
    accion_descrita: 'No hay nada nuevo. Mensaje al asesor: "Entendido, sin problema 😊 Te pregunto de nuevo en 24 horas. ¡Gracias por mantenerme al tanto!" Se reprograma la MISMA pregunta para dentro de 24h (sin límite de rondas mientras el asesor siga respondiendo).',
    siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false,
    terminal: true, // en la simulación se trata como fin de turno; el próximo aviso real llega en 24h
  }
}

function evaluarResultadoFirma(clasificacion: any): Resultado {
  if (clasificacion.se_firmo) {
    return { clasificacion, accion_descrita: `¡Se mueve el lead a "Ganada"! 🎉 Fin del ciclo. Mensaje al asesor: "${MENSAJE_GANADA}"`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  return {
    clasificacion,
    accion_descrita: 'La firma no se realizó: se pasa al ciclo recurrente preguntando si reagendan, se ganó de otra forma, se perdió, o siguen esperando.',
    siguiente_fase: 'seguimiento_recurrente',
    siguiente_pregunta: '¿Reagendamos la firma de contrato, se ganó de otra forma, se perdió, o seguimos esperando? Si reagendan, dime para cuándo. Responde citando este mensaje.',
    es_reintento_aclaracion_siguiente: false,
    terminal: false,
  }
}

// ---------------------------------------------------------------------
// Modo "asistente general": mismos prompts/lógica que
// seguimiento-ia-webhook/index.ts (manejarConsultaGeneral y vecinos) — si
// ese archivo cambia esta parte, replicar aquí también. A diferencia del
// webhook real, las consultas de lectura SÍ ejecutan contra la base real
// (sin riesgo), y "crear_tarea" nunca inserta — solo describe qué se
// crearía (dry-run), igual criterio que ya usa el resto de este simulador.
// ---------------------------------------------------------------------

type PerfilAsistente = { id: string; nombre_completo: string; rol: 'agente' | 'administrador'; organization_id: string }

const ETIQUETAS_ETAPA: Record<string, string> = {
  contacto_inicial: 'Contacto inicial', visita_agendada: 'Visita agendada', visita_realizada: 'Visita realizada',
  reservada: 'Reservada', ganada: 'Ganada', perdida: 'Perdida',
}
const TIPOS_ACTIVIDAD_CONSULTA = ['cita', 'reunion', 'video_llamada', 'llamada', 'firma_contrato']
const TIPOS_PROPIEDAD_VALIDOS = ['casa', 'apartamento', 'terreno', 'bodega', 'oficina', 'ofibodega', 'finca', 'granja', 'local', 'edificio']
const ETAPAS_FINALIZADAS_PARA_CONTEO = ['ganada', 'perdida']

function componentesGT(fecha: Date): { anio: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(fecha)
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
function formatearZonaDup(zona: string | null | undefined): string | null {
  if (!zona) return null
  const valor = zona.trim()
  if (valor === '') return null
  if (/zona/i.test(valor)) return valor
  return `Zona ${valor}`
}

function construirPromptConsultaGeneral(mensaje: string): string {
  const contextoFecha = `Fecha y hora actuales en Guatemala: ${fechaHoraGuatemalaTexto()}.`
  return [
    contextoFecha,
    'Eres el asistente interno por WhatsApp de un CRM inmobiliario en Guatemala. Te escribe un asesor o administrador del equipo (nunca un cliente externo) con una consulta o instrucción sobre el CRM.',
    `Mensaje: "${mensaje}"`,
    'Clasifica la intención en exactamente una de estas 11 categorías: "consultar_leads" (cuántos leads tiene o en qué etapa están, o resumen de ganados/perdidos), "consultar_citas" (qué citas/visitas/llamadas tiene agendadas), "buscar_propiedades" (buscar propiedades del inventario por criterios), "crear_tarea" (crear una tarea o recordatorio para sí mismo), "agendar_cita" (agendar una cita o visita con un cliente/lead existente), "cambiar_etapa_lead" (instrucción directa de mover un lead a una etapa específica, ej. "marca a Juan como ganado", "mueve el lead de María a perdida" — NO uses esto para preguntas, solo para órdenes explícitas), "consultar_requerimientos" (qué está buscando un cliente / qué requerimientos tiene abiertos, ej. "¿qué requerimientos tengo?", "¿hay algún requerimiento en zona 10?"), "cerrar_requerimiento" (instrucción explícita de cerrar/dar por resuelto un requerimiento, ej. "cierra el requerimiento de Juan", "ya no busca nada Juan" — NO uses esto para preguntas), "crear_lead" (registrar un contacto y lead NUEVO que el asesor consiguió fuera del sistema, ej. "registra un lead nuevo: Juan Pérez, 5555-1234, busca casa en zona 15" — usa esto solo cuando quede claro que el cliente AÚN NO existe en el CRM, no para buscar o actualizar uno existente), "reporte_desempeno" (pedir un reporte de desempeño del equipo: conversión por asesor, motivos de pérdida más comunes, tiempo promedio de cierre — solo tiene sentido para un administrador), "conversacion_general" (cualquier otra cosa, saludos incluidos).',
    'Llena solo los campos que correspondan a la intención detectada; deja los demás en null:',
    '- etapa_lead: "contacto_inicial"|"visita_agendada"|"visita_realizada"|"reservada"|"ganada"|"perdida"|"activos"|"todos" (usa "activos" si no mencionó etapa; "todos" solo si pidió el total incluyendo ganados y perdidos).',
    '- rango_fecha_leads: "hoy"|"esta_semana"|"este_mes"|"todo" (para "consultar_leads" solo si etapa_lead es "ganada" o "perdida"; para "reporte_desempeno" siempre aplica como el periodo del reporte; si no especificó, usa "este_mes").',
    '- rango_fecha_citas: "hoy"|"mañana"|"esta_semana"|"vencidas" (si no especificó, usa "hoy").',
    '- tipo_operacion: "venta"|"renta"|null.',
    '- tipo_propiedad: "casa"|"apartamento"|"terreno"|"bodega"|"oficina"|"ofibodega"|"finca"|"granja"|"local"|"edificio"|null (para "buscar_propiedades" el tipo que busca en inventario; para "crear_lead" el tipo que le interesa al cliente nuevo).',
    '- ubicacion: para "buscar_propiedades", "consultar_requerimientos" o "crear_lead", CUALQUIER zona, sector, condominio, colonia o municipio mencionado, como un solo texto (no sabes en qué columna vive en la base de datos, así que no intentes clasificarlo — solo transcribe la ubicación tal como la dijo). Si mencionó un número de zona, incluye SOLO el número (ej. "10", no "zona 10"). Si mencionó varias ubicaciones, usa solo la más específica. Null si no mencionó ubicación.',
    '- amenidades: para "buscar_propiedades", arreglo de palabras clave de amenidades o características mencionadas (ej. ["piscina","gimnasio"]), o null si no mencionó ninguna.',
    '- precio_min, precio_max, dormitorios_min, banos_min, niveles_min: número o null (para "crear_lead", precio_min/precio_max son el presupuesto del cliente nuevo, si lo mencionó).',
    '- area_exacta, area_min, area_max: metros cuadrados mencionados (construcción o terreno), número o null. Si da un metraje SIN calificarlo (ej. "de 100m2", "casa de 100 metros") usa area_exacta — debe coincidir EXACTO, ni más ni menos. Usa area_min SOLO si dijo explícitamente "más de", "mayor a", "mínimo", "arriba de" o similar. Usa area_max SOLO si dijo explícitamente "menos de", "menor a", "máximo", "hasta" o similar. Si mencionó un rango explícito (ej. "entre 100 y 150 m2") usa area_min Y area_max juntos. Nunca combines area_exacta con area_min/area_max.',
    '- titulo_tarea: para crear_tarea, un título breve (ej. "Llamar a Juan Pérez"), o null.',
    '- nombre_contacto: para crear_tarea, agendar_cita, cambiar_etapa_lead, cerrar_requerimiento o crear_lead, el nombre completo del cliente/contacto mencionado, o null.',
    '- telefono_contacto: SOLO para crear_lead, el teléfono del cliente nuevo tal como lo escribió (ej. "5555-1234"), o null si no lo mencionó.',
    '- etapa_nueva: SOLO para cambiar_etapa_lead, la etapa de destino: "contacto_inicial"|"visita_agendada"|"visita_realizada"|"reservada"|"ganada"|"perdida" (interpreta "ganado"→"ganada", "perdido"→"perdida", "reservó"→"reservada", etc.), o null si no quedó claro a cuál etapa.',
    '- fecha_hora_iso: para crear_tarea o agendar_cita, la fecha/hora convertida a ISO 8601 con zona -06:00 (usa la fecha actual de arriba para expresiones relativas como "mañana"), o null si no la mencionó.',
    '- confianza_fecha: "alta"|"media"|"baja"|"ninguna" (alta solo si es inequívoca — no inventes fecha).',
    '- prioridad_tarea: "baja"|"media"|"alta" (infiere la urgencia; si no es claro, usa "media").',
    'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente estos campos: {"intencion": "...", "etapa_lead": string|null, "rango_fecha_leads": string|null, "rango_fecha_citas": string|null, "tipo_operacion": string|null, "tipo_propiedad": string|null, "ubicacion": string|null, "amenidades": string[]|null, "precio_min": number|null, "precio_max": number|null, "dormitorios_min": number|null, "banos_min": number|null, "niveles_min": number|null, "area_exacta": number|null, "area_min": number|null, "area_max": number|null, "titulo_tarea": string|null, "nombre_contacto": string|null, "telefono_contacto": string|null, "etapa_nueva": string|null, "fecha_hora_iso": string|null, "confianza_fecha": string|null, "prioridad_tarea": string|null}.',
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

function fechaEsConfiable(fechaIso: unknown, confianza: unknown): fechaIso is string {
  return typeof fechaIso === 'string' && (confianza === 'alta' || confianza === 'media')
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

function inicioRangoLeadsGT(rango: string): Date | null {
  const ahora = new Date()
  const { anio, mes, dia } = componentesGT(ahora)
  if (rango === 'hoy') return inicioDeDiaGT(anio, mes, dia)
  if (rango === 'esta_semana') return new Date(ahora.getTime() - 7 * 24 * 3600_000)
  if (rango === 'este_mes') return inicioDeDiaGT(anio, mes, 1)
  return null
}

async function calcularRespuestaConsultaLeads(perfil: PerfilAsistente, c: Record<string, any>): Promise<string> {
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
  if (error) return 'Uy, no pude consultar tus leads en este momento 😓 Intenta de nuevo en un rato.'

  const total = data?.length ?? 0
  const sujeto = perfil.rol === 'agente' ? 'Tienes' : 'Hay'
  if (etapaLead === 'activos' || etapaLead === 'todos') {
    const conteo = (data ?? []).reduce<Record<string, number>>((acc, l) => { acc[l.etapa] = (acc[l.etapa] ?? 0) + 1; return acc }, {})
    const etapasAMostrar = Object.keys(ETIQUETAS_ETAPA).filter((e) => (etapaLead === 'activos' ? !ETAPAS_FINALIZADAS_PARA_CONTEO.includes(e) : true))
    return [`📊 ${sujeto} ${total} lead${total === 1 ? '' : 's'} ${etapaLead === 'activos' ? 'activos' : 'en total'}:`, ...etapasAMostrar.map((e) => `• ${ETIQUETAS_ETAPA[e]}: ${conteo[e] ?? 0}`)].join('\n')
  }
  const etiquetaRango: Record<string, string> = { hoy: 'hoy', esta_semana: 'esta semana', este_mes: 'este mes', todo: 'en total' }
  const rangoTxt = etiquetaRango[c.rango_fecha_leads ?? 'este_mes'] ?? 'este mes'
  return etapaLead === 'ganada'
    ? `🎉 ${perfil.rol === 'agente' ? 'Llevas' : 'El equipo lleva'} ${total} lead${total === 1 ? '' : 's'} ganado${total === 1 ? '' : 's'} ${rangoTxt}. ¡Sigue así!`
    : `${total} lead${total === 1 ? '' : 's'} se ${total === 1 ? 'marcó' : 'marcaron'} como perdido${total === 1 ? '' : 's'} ${rangoTxt} 💪. Vamos por los próximos.`
}

async function calcularReporteDesempeno(perfil: PerfilAsistente, c: Record<string, any>): Promise<string> {
  if (perfil.rol !== 'administrador') return 'Este reporte está disponible solo para administradores 😊'

  const rango = ['hoy', 'esta_semana', 'este_mes', 'todo'].includes(c.rango_fecha_leads) ? c.rango_fecha_leads : 'este_mes'
  const desde = inicioRangoLeadsGT(rango)

  let query = supabase
    .from('leads')
    .select('etapa, agente_id, motivo_perdida, creado_en, actualizado_en, agente:perfiles!leads_agente_id_fkey(nombre_completo)')
    .eq('organization_id', perfil.organization_id)
    .in('etapa', ['ganada', 'perdida'])
  if (desde) query = query.gte('actualizado_en', desde.toISOString())

  const { data, error } = await query
  if (error) return 'Uy, no pude armar el reporte en este momento 😓'

  const etiquetaRango: Record<string, string> = { hoy: 'hoy', esta_semana: 'esta semana', este_mes: 'este mes', todo: 'en total' }
  const rangoTxt = etiquetaRango[rango] ?? 'este mes'
  if (!data || data.length === 0) return `No hay leads ganados ni perdidos ${rangoTxt} todavía 🙂`

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
  const lineasMotivos = Object.entries(motivos).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([motivo, n]) => `• ${motivo}: ${n}`)
  const promedioDias = Math.round(sumaDias / data.length)

  const bloques = [
    `📊 Reporte del equipo (${rangoTxt}):`,
    ['Conversión por asesor:', ...lineasAsesores].join('\n'),
    lineasMotivos.length > 0 ? ['Motivos de pérdida más comunes:', ...lineasMotivos].join('\n') : null,
    `Tiempo promedio de cierre: ${promedioDias} día${promedioDias === 1 ? '' : 's'} (desde que se creó el lead hasta Ganada/Perdida).`,
  ].filter(Boolean) as string[]
  return bloques.join('\n\n')
}

function rangoCitasGT(rango: string): { desde: Date | null; hasta: Date | null; vencidas: boolean } {
  const ahora = new Date()
  const { anio, mes, dia } = componentesGT(ahora)
  const inicioHoy = inicioDeDiaGT(anio, mes, dia)
  if (rango === 'hoy') return { desde: inicioHoy, hasta: new Date(inicioHoy.getTime() + 24 * 3600_000), vencidas: false }
  if (rango === 'mañana') { const d = new Date(inicioHoy.getTime() + 24 * 3600_000); return { desde: d, hasta: new Date(d.getTime() + 24 * 3600_000), vencidas: false } }
  if (rango === 'esta_semana') return { desde: inicioHoy, hasta: new Date(inicioHoy.getTime() + 7 * 24 * 3600_000), vencidas: false }
  return { desde: null, hasta: null, vencidas: true }
}

async function calcularRespuestaConsultaCitas(perfil: PerfilAsistente, c: Record<string, any>): Promise<string> {
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
  if (error) return 'Uy, no pude consultar tus citas en este momento 😓'

  const etiquetaRango: Record<string, string> = { hoy: 'para hoy', mañana: 'para mañana', esta_semana: 'esta semana', vencidas: 'vencidas' }
  if (!data || data.length === 0) return `No tienes citas ${etiquetaRango[rango]} 🙂`
  const lineas = data.map((a: any) => {
    const contacto = Array.isArray(a.contacto) ? a.contacto[0] : a.contacto
    return `• ${formatearHoraGT(a.programada_en)} — ${ETIQUETA_TIPO[a.tipo_actividad] ?? a.tipo_actividad} con ${contacto?.nombre_completo ?? 'el cliente'}`
  })
  return [`📅 Tienes ${data.length} cita${data.length === 1 ? '' : 's'} ${etiquetaRango[rango]}:`, ...lineas].join('\n')
}

// dormitorios/banos/niveles son columnas de TEXTO en la BD (aceptan input
// libre del formulario), así que un mínimo nunca se compara con gte en la
// consulta (compararía como texto). Se filtran en código con Number(...)
// después de traer un lote más amplio — igual que en el webhook real.
function numeroONull(valor: unknown): number | null {
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

// La IA no sabe (ni debe adivinar) en qué columna vive una ubicación libre
// ("Vista Verde" puede ser el condominio de una propiedad y el sector o
// zona de otra) — forzarla a elegir una sola columna llevaba a búsquedas
// que no encontraban nada aunque la propiedad existiera. Por eso un solo
// término de ubicación se compara contra zona, sector, condominio Y
// municipio a la vez (OR), igual que en el webhook real.
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

async function calcularRespuestaBusquedaPropiedades(perfil: PerfilAsistente, c: Record<string, any>): Promise<string> {
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
  if (error) return 'Uy, no pude buscar en el inventario en este momento 😓'

  let resultados = (data ?? []) as any[]
  if (typeof c.dormitorios_min === 'number') resultados = resultados.filter((p) => { const n = numeroONull(p.dormitorios); return n !== null && n >= c.dormitorios_min })
  if (typeof c.banos_min === 'number') resultados = resultados.filter((p) => { const n = numeroONull(p.banos); return n !== null && n >= c.banos_min })
  if (typeof c.niveles_min === 'number') resultados = resultados.filter((p) => { const n = numeroONull(p.niveles); return n !== null && n >= c.niveles_min })
  const total = resultados.length
  resultados = resultados.slice(0, 5)

  if (resultados.length === 0) return 'No encontré propiedades disponibles con esos criterios 😕 ¿Quieres que busque con otros filtros?'
  const lineas = resultados.map((p: any) => {
    const municipioNombre = Array.isArray(p.municipio) ? p.municipio[0]?.nombre : p.municipio?.nombre
    const zonaTxt = formatearZonaDup(p.zona) ?? municipioNombre ?? p.ciudad ?? ''
    const ubicacionExtra = [p.condominio, municipioNombre && municipioNombre !== zonaTxt ? municipioNombre : null].filter(Boolean).join(' · ')
    const precioTxt = `${p.moneda ?? 'GTQ'} ${Number(p.precio ?? 0).toLocaleString('es-GT')}`
    const area = p.area_construccion_m2 ?? p.area_terreno_m2
    const detalles = [
      p.dormitorios ? `${p.dormitorios} hab` : null,
      p.banos ? `${p.banos} baños` : null,
      p.niveles ? `${p.niveles} niveles` : null,
      area ? `${area} m²` : null,
    ].filter(Boolean).join(' · ')
    return `• ${p.titulo} — ${zonaTxt}${ubicacionExtra ? ' · ' + ubicacionExtra : ''} — ${precioTxt}${detalles ? ` (${detalles})` : ''} [propiedad ${p.id}]`
  })
  return [`🏠 Encontré ${total} propiedad${total === 1 ? '' : 'es'}${total > resultados.length ? ` (muestro ${resultados.length})` : ''}:`, '', ...lineas].join('\n')
}

const ETIQUETAS_TIPO_OPERACION_REQ: Record<string, string> = { venta: 'Venta', renta: 'Renta' }

async function calcularRespuestaConsultarRequerimientos(perfil: PerfilAsistente, c: Record<string, any>): Promise<string> {
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
    const { data: municipiosCoincidentes } = await supabase.from('municipios').select('id').ilike('nombre', `%${ubicacion}%`)
    const condiciones = [`zona.ilike.%${ubicacion}%`, `sector.ilike.%${ubicacion}%`]
    if (municipiosCoincidentes && municipiosCoincidentes.length > 0) {
      condiciones.push(`municipio_id.in.(${municipiosCoincidentes.map((m) => m.id).join(',')})`)
    }
    query = query.or(condiciones.join(','))
  }

  const { data, error } = await query
  if (error) return 'Uy, no pude consultar los requerimientos en este momento 😓'
  if (!data || data.length === 0) return 'No hay requerimientos abiertos que coincidan 🙂'

  const lineas = (data as any[]).map((r) => {
    const contacto = Array.isArray(r.contacto) ? r.contacto[0] : r.contacto
    const municipio = Array.isArray(r.municipio) ? r.municipio[0] : r.municipio
    const tipo = [r.tipo_operacion ? ETIQUETAS_TIPO_OPERACION_REQ[r.tipo_operacion] : null, r.tipo_propiedad].filter(Boolean).join(' · ') || 'Cualquier tipo'
    const ubicacionTxt = [r.zona ? `Zona ${r.zona}` : null, r.sector, municipio?.nombre].filter(Boolean).join(' · ')
    const presupuesto = r.precio_min || r.precio_max
      ? `${r.moneda ?? 'GTQ'} ${r.precio_min ? Number(r.precio_min).toLocaleString() : '0'}${r.precio_max ? ` - ${Number(r.precio_max).toLocaleString()}` : '+'}`
      : null
    return `• ${contacto?.nombre_completo ?? 'Cliente'} — ${tipo}${ubicacionTxt ? ' · ' + ubicacionTxt : ''}${presupuesto ? ' · ' + presupuesto : ''} [requerimiento ${r.id}]`
  })
  return [`📋 ${data.length} requerimiento${data.length === 1 ? '' : 's'} abierto${data.length === 1 ? '' : 's'}:`, ...lineas].join('\n')
}

async function resolverLeadPorNombreContacto(nombreContacto: string | null, perfil: PerfilAsistente): Promise<{ leadId: string; contactoId: string; nombre: string } | null> {
  if (!nombreContacto || !nombreContacto.trim()) return null
  const { data: contactosCoincidentes } = await supabase.from('contactos').select('id, nombre_completo').ilike('nombre_completo', `%${nombreContacto.trim()}%`)
  const contactoIds = (contactosCoincidentes ?? []).map((c) => c.id)
  if (contactoIds.length === 0) return null

  let query = supabase.from('leads').select('id, contacto_id').eq('organization_id', perfil.organization_id).in('contacto_id', contactoIds).order('actualizado_en', { ascending: false })
  if (perfil.rol === 'agente') query = query.eq('agente_id', perfil.id)
  const { data: leadsCoincidentes } = await query
  if (!leadsCoincidentes || leadsCoincidentes.length === 0) return null

  const contactosDistintos = new Set(leadsCoincidentes.map((l) => l.contacto_id))
  if (contactosDistintos.size !== 1) return null
  const masReciente = leadsCoincidentes[0]
  const nombre = contactosCoincidentes?.find((c) => c.id === masReciente.contacto_id)?.nombre_completo ?? nombreContacto
  return { leadId: masReciente.id, contactoId: masReciente.contacto_id, nombre }
}

async function calcularAccionCrearTarea(perfil: PerfilAsistente, titulo: string, nombreContacto: string | null, fechaHoraIso: string, prioridad: string): Promise<string> {
  const vinculo = await resolverLeadPorNombreContacto(nombreContacto, perfil)
  const vinculoTxt = nombreContacto ? (vinculo ? ` Vinculada al lead de "${vinculo.nombre}".` : ` No encontré (o hay varios) "${nombreContacto}" entre los leads visibles — quedaría sin vincular.`) : ''
  return `Se crearía la tarea "${titulo}" (prioridad ${prioridad}) para ${formatearFechaHoraGT(fechaHoraIso)}, asignada a ${perfil.nombre_completo}.${vinculoTxt} Ben la recordaría por WhatsApp automáticamente si no se marca como hecha.`
}

async function calcularAccionAgendarCita(perfil: PerfilAsistente, nombreContacto: string, fechaHoraIso: string): Promise<string> {
  const vinculo = await resolverLeadPorNombreContacto(nombreContacto, perfil)
  if (!vinculo) {
    return `No encontré (o hay varios) un lead de "${nombreContacto}" entre los que puedes ver — no se podría agendar así, habría que crearla manualmente desde el CRM.`
  }
  const { data: lead } = await supabase.from('leads').select('etapa').eq('id', vinculo.leadId).maybeSingle()
  const avisoEtapa = lead?.etapa === 'contacto_inicial' ? ' Movería el lead a *Visita agendada*.' : ''
  return `Se crearía la cita con ${vinculo.nombre} para ${formatearFechaHoraGT(fechaHoraIso)}, vinculada a su lead (${ETIQUETAS_ETAPA[lead?.etapa ?? ''] ?? 'etapa actual'}).${avisoEtapa}`
}

async function calcularAccionCambiarEtapaLead(perfil: PerfilAsistente, nombreContacto: string, etapaNueva: string): Promise<string> {
  const vinculo = await resolverLeadPorNombreContacto(nombreContacto, perfil)
  if (!vinculo) {
    return `No encontré (o hay varios) un lead de "${nombreContacto}" entre los que puedes ver — no se podría cambiar así, habría que hacerlo manualmente desde el CRM.`
  }
  return `Se movería el lead de ${vinculo.nombre} a *${ETIQUETAS_ETAPA[etapaNueva] ?? etapaNueva}*.`
}

// Igual que resolverLeadPorNombreContacto: solo vincula si hay EXACTAMENTE
// un contacto coincidente, y además solo si ese contacto tiene EXACTAMENTE
// un requerimiento abierto — con varios, no se adivina cuál cerrar.
async function resolverRequerimientoAbiertoPorNombreContacto(nombreContacto: string | null, perfil: PerfilAsistente): Promise<{ requerimientoId: string; nombre: string } | null> {
  if (!nombreContacto || !nombreContacto.trim()) return null
  const { data: contactosCoincidentes } = await supabase.from('contactos').select('id, nombre_completo').ilike('nombre_completo', `%${nombreContacto.trim()}%`)
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
  const nombre = contactosCoincidentes?.find((c) => c.id === unico.contacto_id)?.nombre_completo ?? nombreContacto
  return { requerimientoId: unico.id, nombre }
}

async function calcularAccionCerrarRequerimiento(perfil: PerfilAsistente, nombreContacto: string): Promise<string> {
  const vinculo = await resolverRequerimientoAbiertoPorNombreContacto(nombreContacto, perfil)
  if (!vinculo) {
    return `No encontré (o hay varios) un requerimiento abierto de "${nombreContacto}" entre los que puedes ver — habría que cerrarlo manualmente desde el CRM.`
  }
  return `Se cerraría el requerimiento de ${vinculo.nombre}.`
}

type DatosLeadNuevo = { tipo_propiedad: string | null; ubicacion: string | null; precio_min: number | null; precio_max: number | null }

// Mismo criterio que buscarDuplicadoTelefono en src/app/dashboard/contactos/acciones.ts
function normalizarTelefonoContacto(telefono: string): string {
  const soloDigitos = telefono.replace(/\D/g, '')
  if (soloDigitos.startsWith('502') && soloDigitos.length > 8) return soloDigitos.slice(3)
  return soloDigitos
}

async function buscarContactoDuplicadoPorTelefono(telefono: string, organizationId: string): Promise<{ nombre_completo: string } | null> {
  const telefonoNormalizado = normalizarTelefonoContacto(telefono)
  if (!telefonoNormalizado) return null
  const { data: candidatos } = await supabase
    .from('contactos')
    .select('nombre_completo, telefono')
    .eq('organization_id', organizationId)
    .not('telefono', 'is', null)
  const encontrado = (candidatos ?? []).find((c) => c.telefono && normalizarTelefonoContacto(c.telefono) === telefonoNormalizado)
  return encontrado ? { nombre_completo: encontrado.nombre_completo } : null
}

async function calcularAccionCrearLead(perfil: PerfilAsistente, nombreContacto: string, telefonoContacto: string, datos: DatosLeadNuevo): Promise<string> {
  const duplicado = await buscarContactoDuplicadoPorTelefono(telefonoContacto, perfil.organization_id)
  if (duplicado) {
    return `⚠️ Ya existe un contacto con ese teléfono: ${duplicado.nombre_completo}. No se crearía uno nuevo para evitar duplicarlo — se debería revisar manualmente desde el CRM.`
  }
  const detalles: string[] = []
  if (datos.tipo_propiedad) detalles.push(`busca ${datos.tipo_propiedad}`)
  if (datos.ubicacion) detalles.push(`en ${datos.ubicacion}`)
  if (datos.precio_min || datos.precio_max) {
    const rango = datos.precio_min && datos.precio_max ? `${datos.precio_min}-${datos.precio_max}` : datos.precio_min ? `desde ${datos.precio_min}` : `hasta ${datos.precio_max}`
    detalles.push(`presupuesto ${rango}`)
  }
  const detalleTxt = detalles.length > 0 ? ` (${detalles.join(', ')})` : ''
  return `Se registraría a ${nombreContacto} (${telefonoContacto}) como contacto nuevo${detalleTxt}, asignado a ${perfil.nombre_completo}, y se le crearía su lead en "Contacto inicial".`
}

type ResultadoAsistenteGeneral = {
  ok: boolean
  error?: string
  prompt_enviado_a_ia?: string
  clasificacion?: Record<string, unknown>
  mensaje_respuesta?: string
  accion_descrita?: string
  requiere_aclaracion?: boolean
  siguiente_pregunta?: string | null
  contexto_para_siguiente_turno?: Record<string, unknown> | null
}

async function manejarAsistenteGeneral(perfil: PerfilAsistente, mensaje: string): Promise<ResultadoAsistenteGeneral> {
  const prompt = construirPromptConsultaGeneral(mensaje)
  const c = parsearRespuestaGroq(await llamarGroq(prompt)) as Record<string, any>

  if (c.intencion === 'consultar_leads') {
    return { ok: true, prompt_enviado_a_ia: prompt, clasificacion: c, mensaje_respuesta: await calcularRespuestaConsultaLeads(perfil, c) }
  }
  if (c.intencion === 'reporte_desempeno') {
    return { ok: true, prompt_enviado_a_ia: prompt, clasificacion: c, mensaje_respuesta: await calcularReporteDesempeno(perfil, c) }
  }
  if (c.intencion === 'consultar_citas') {
    return { ok: true, prompt_enviado_a_ia: prompt, clasificacion: c, mensaje_respuesta: await calcularRespuestaConsultaCitas(perfil, c) }
  }
  if (c.intencion === 'buscar_propiedades') {
    return { ok: true, prompt_enviado_a_ia: prompt, clasificacion: c, mensaje_respuesta: await calcularRespuestaBusquedaPropiedades(perfil, c) }
  }
  if (c.intencion === 'crear_tarea') {
    const titulo = (c.titulo_tarea && String(c.titulo_tarea).trim()) || 'Tarea de seguimiento'
    const prioridad = ['baja', 'media', 'alta'].includes(c.prioridad_tarea) ? c.prioridad_tarea : 'media'
    if (!fechaEsConfiable(c.fecha_hora_iso, c.confianza_fecha)) {
      return {
        ok: true, prompt_enviado_a_ia: prompt, clasificacion: c,
        requiere_aclaracion: true,
        siguiente_pregunta: '¿Para qué fecha y hora exactas quieres la tarea? Responde citando este mensaje 🙂',
        contexto_para_siguiente_turno: { intencion: 'crear_tarea', titulo_tarea: titulo, nombre_contacto: c.nombre_contacto ?? null, prioridad_tarea: prioridad },
      }
    }
    return { ok: true, prompt_enviado_a_ia: prompt, clasificacion: c, accion_descrita: await calcularAccionCrearTarea(perfil, titulo, c.nombre_contacto ?? null, c.fecha_hora_iso, prioridad) }
  }
  if (c.intencion === 'agendar_cita') {
    const nombreContacto = c.nombre_contacto ? String(c.nombre_contacto).trim() : null
    const fechaConfiable = fechaEsConfiable(c.fecha_hora_iso, c.confianza_fecha)
    if (!nombreContacto) {
      return {
        ok: true, prompt_enviado_a_ia: prompt, clasificacion: c,
        requiere_aclaracion: true,
        siguiente_pregunta: '¿Cuál es el nombre completo del cliente para la cita? Responde citando este mensaje 🙂',
        contexto_para_siguiente_turno: { intencion: 'agendar_cita', esperando: 'nombre_contacto', fecha_hora_iso: fechaConfiable ? c.fecha_hora_iso : null },
      }
    }
    if (!fechaConfiable) {
      return {
        ok: true, prompt_enviado_a_ia: prompt, clasificacion: c,
        requiere_aclaracion: true,
        siguiente_pregunta: `¿Para qué fecha y hora quieres agendar la cita con ${nombreContacto}? Responde citando este mensaje 🙂`,
        contexto_para_siguiente_turno: { intencion: 'agendar_cita', esperando: 'fecha_hora_iso', nombre_contacto: nombreContacto },
      }
    }
    return { ok: true, prompt_enviado_a_ia: prompt, clasificacion: c, accion_descrita: await calcularAccionAgendarCita(perfil, nombreContacto, c.fecha_hora_iso) }
  }
  if (c.intencion === 'cambiar_etapa_lead') {
    const nombreContacto = c.nombre_contacto ? String(c.nombre_contacto).trim() : null
    const etapaNueva = ETAPAS_VALIDAS_LEAD.includes(c.etapa_nueva) ? (c.etapa_nueva as string) : null
    if (!nombreContacto) {
      return {
        ok: true, prompt_enviado_a_ia: prompt, clasificacion: c,
        requiere_aclaracion: true,
        siguiente_pregunta: '¿El lead de qué cliente quieres cambiar de etapa? Responde citando este mensaje 🙂',
        contexto_para_siguiente_turno: { intencion: 'cambiar_etapa_lead', esperando: 'nombre_contacto', etapa_nueva: etapaNueva },
      }
    }
    if (!etapaNueva) {
      return {
        ok: true, prompt_enviado_a_ia: prompt, clasificacion: c,
        requiere_aclaracion: true,
        siguiente_pregunta: `¿A qué etapa muevo el lead de ${nombreContacto}? (contacto inicial, visita agendada, visita realizada, reservada, ganada o perdida). Responde citando este mensaje 🙂`,
        contexto_para_siguiente_turno: { intencion: 'cambiar_etapa_lead', esperando: 'etapa_nueva', nombre_contacto: nombreContacto },
      }
    }
    return { ok: true, prompt_enviado_a_ia: prompt, clasificacion: c, accion_descrita: await calcularAccionCambiarEtapaLead(perfil, nombreContacto, etapaNueva) }
  }
  if (c.intencion === 'consultar_requerimientos') {
    return { ok: true, prompt_enviado_a_ia: prompt, clasificacion: c, mensaje_respuesta: await calcularRespuestaConsultarRequerimientos(perfil, c) }
  }
  if (c.intencion === 'cerrar_requerimiento') {
    const nombreContacto = c.nombre_contacto ? String(c.nombre_contacto).trim() : null
    if (!nombreContacto) {
      return {
        ok: true, prompt_enviado_a_ia: prompt, clasificacion: c,
        requiere_aclaracion: true,
        siguiente_pregunta: '¿El requerimiento de qué cliente quieres cerrar? Responde citando este mensaje 🙂',
        contexto_para_siguiente_turno: { intencion: 'cerrar_requerimiento' },
      }
    }
    return { ok: true, prompt_enviado_a_ia: prompt, clasificacion: c, accion_descrita: await calcularAccionCerrarRequerimiento(perfil, nombreContacto) }
  }
  if (c.intencion === 'crear_lead') {
    const nombreContacto = c.nombre_contacto ? String(c.nombre_contacto).trim() : null
    const telefonoContacto = c.telefono_contacto ? String(c.telefono_contacto).trim() : null
    const datos: DatosLeadNuevo = { tipo_propiedad: c.tipo_propiedad ?? null, ubicacion: c.ubicacion ?? null, precio_min: c.precio_min ?? null, precio_max: c.precio_max ?? null }
    if (!nombreContacto) {
      return {
        ok: true, prompt_enviado_a_ia: prompt, clasificacion: c,
        requiere_aclaracion: true,
        siguiente_pregunta: '¿Cuál es el nombre completo del cliente nuevo? Responde citando este mensaje 🙂',
        contexto_para_siguiente_turno: { intencion: 'crear_lead', esperando: 'nombre_contacto', telefono_contacto: telefonoContacto, ...datos },
      }
    }
    if (!telefonoContacto) {
      return {
        ok: true, prompt_enviado_a_ia: prompt, clasificacion: c,
        requiere_aclaracion: true,
        siguiente_pregunta: `¿Cuál es el teléfono de ${nombreContacto}? Responde citando este mensaje 🙂`,
        contexto_para_siguiente_turno: { intencion: 'crear_lead', esperando: 'telefono_contacto', nombre_contacto: nombreContacto, ...datos },
      }
    }
    return { ok: true, prompt_enviado_a_ia: prompt, clasificacion: c, accion_descrita: await calcularAccionCrearLead(perfil, nombreContacto, telefonoContacto, datos) }
  }
  const nombre = perfil.nombre_completo.split(' ')[0]
  return {
    ok: true,
    prompt_enviado_a_ia: prompt,
    clasificacion: c,
    mensaje_respuesta: [
      `¡Hola ${nombre}! 😊 Soy Ben, tu asistente del CRM, puedo ayudarte con cosas como:`,
      '• "¿Cuántos leads tengo en visita agendada?"',
      '• "¿Qué citas tengo hoy?"',
      '• "Busca casas en zona 10 hasta Q1.8M"',
      '• "Créame una tarea para llamar a Juan mañana a las 10am"',
      '• "Agéndame una cita con Juan Pérez el jueves a las 3pm"',
      '• "Registra un lead nuevo: Juan Pérez, 5555-1234, busca casa en zona 15"',
      '¿En qué te ayudo? 🙂',
    ].join('\n'),
  }
}

type ContextoPrevioAsistente =
  | { intencion: 'crear_tarea'; titulo_tarea: string; nombre_contacto: string | null; prioridad_tarea: string }
  | { intencion: 'agendar_cita'; esperando: 'nombre_contacto' | 'fecha_hora_iso'; nombre_contacto?: string; fecha_hora_iso?: string | null }
  | { intencion: 'cambiar_etapa_lead'; esperando: 'nombre_contacto' | 'etapa_nueva'; nombre_contacto?: string; etapa_nueva?: string | null }
  | { intencion: 'cerrar_requerimiento' }
  | { intencion: 'crear_lead'; esperando: 'nombre_contacto' | 'telefono_contacto'; nombre_contacto?: string; telefono_contacto?: string | null; tipo_propiedad: string | null; ubicacion: string | null; precio_min: number | null; precio_max: number | null }

async function manejarAsistenteGeneralAclaracion(perfil: PerfilAsistente, mensaje: string, contextoPrevio: ContextoPrevioAsistente): Promise<ResultadoAsistenteGeneral> {
  if (contextoPrevio.intencion === 'cerrar_requerimiento') {
    const nombreContacto = mensaje.trim()
    return { ok: true, clasificacion: { nombre_contacto: nombreContacto }, accion_descrita: await calcularAccionCerrarRequerimiento(perfil, nombreContacto) }
  }
  if (contextoPrevio.intencion === 'agendar_cita') {
    if (contextoPrevio.esperando === 'nombre_contacto') {
      const nombreContacto = mensaje.trim()
      if (contextoPrevio.fecha_hora_iso) {
        return { ok: true, clasificacion: { nombre_contacto: nombreContacto }, accion_descrita: await calcularAccionAgendarCita(perfil, nombreContacto, contextoPrevio.fecha_hora_iso) }
      }
      return {
        ok: true, clasificacion: { nombre_contacto: nombreContacto },
        requiere_aclaracion: true,
        siguiente_pregunta: `¿Para qué fecha y hora quieres agendar la cita con ${nombreContacto}? Responde citando este mensaje 🙂`,
        contexto_para_siguiente_turno: { intencion: 'agendar_cita', esperando: 'fecha_hora_iso', nombre_contacto: nombreContacto },
      }
    }
    const prompt = construirPromptAclaracionFecha(mensaje)
    const clasificacion = parsearRespuestaGroq(await llamarGroq(prompt)) as { fecha_hora_iso: string | null; confianza_fecha: string }
    if (!fechaEsConfiable(clasificacion.fecha_hora_iso, clasificacion.confianza_fecha)) {
      return { ok: true, prompt_enviado_a_ia: prompt, clasificacion, mensaje_respuesta: 'Sigue sin quedarme clara la fecha 😅 Mejor agenda la cita manualmente desde el CRM con la fecha exacta.' }
    }
    return {
      ok: true, prompt_enviado_a_ia: prompt, clasificacion,
      accion_descrita: await calcularAccionAgendarCita(perfil, contextoPrevio.nombre_contacto!, clasificacion.fecha_hora_iso),
    }
  }

  if (contextoPrevio.intencion === 'crear_lead') {
    const datos: DatosLeadNuevo = { tipo_propiedad: contextoPrevio.tipo_propiedad, ubicacion: contextoPrevio.ubicacion, precio_min: contextoPrevio.precio_min, precio_max: contextoPrevio.precio_max }
    if (contextoPrevio.esperando === 'nombre_contacto') {
      const nombreContacto = mensaje.trim()
      if (contextoPrevio.telefono_contacto) {
        return { ok: true, clasificacion: { nombre_contacto: nombreContacto }, accion_descrita: await calcularAccionCrearLead(perfil, nombreContacto, contextoPrevio.telefono_contacto, datos) }
      }
      return {
        ok: true, clasificacion: { nombre_contacto: nombreContacto },
        requiere_aclaracion: true,
        siguiente_pregunta: `¿Cuál es el teléfono de ${nombreContacto}? Responde citando este mensaje 🙂`,
        contexto_para_siguiente_turno: { intencion: 'crear_lead', esperando: 'telefono_contacto', nombre_contacto: nombreContacto, ...datos },
      }
    }
    // esperando === 'telefono_contacto'
    const telefonoContacto = mensaje.trim()
    return { ok: true, clasificacion: { telefono_contacto: telefonoContacto }, accion_descrita: await calcularAccionCrearLead(perfil, contextoPrevio.nombre_contacto!, telefonoContacto, datos) }
  }

  if (contextoPrevio.intencion === 'cambiar_etapa_lead') {
    if (contextoPrevio.esperando === 'nombre_contacto') {
      const nombreContacto = mensaje.trim()
      if (contextoPrevio.etapa_nueva) {
        return { ok: true, clasificacion: { nombre_contacto: nombreContacto }, accion_descrita: await calcularAccionCambiarEtapaLead(perfil, nombreContacto, contextoPrevio.etapa_nueva) }
      }
      return {
        ok: true, clasificacion: { nombre_contacto: nombreContacto },
        requiere_aclaracion: true,
        siguiente_pregunta: `¿A qué etapa muevo el lead de ${nombreContacto}? (contacto inicial, visita agendada, visita realizada, reservada, ganada o perdida). Responde citando este mensaje 🙂`,
        contexto_para_siguiente_turno: { intencion: 'cambiar_etapa_lead', esperando: 'etapa_nueva', nombre_contacto: nombreContacto },
      }
    }
    const prompt = construirPromptAclaracionEtapa(mensaje)
    const clasificacion = parsearRespuestaGroq(await llamarGroq(prompt)) as { etapa_nueva: string | null }
    const etapaNueva = ETAPAS_VALIDAS_LEAD.includes(clasificacion.etapa_nueva as string) ? clasificacion.etapa_nueva! : null
    if (!etapaNueva) {
      return { ok: true, prompt_enviado_a_ia: prompt, clasificacion, mensaje_respuesta: 'Sigue sin quedarme clara la etapa 😅 Mejor hazlo manualmente desde el CRM.' }
    }
    return {
      ok: true, prompt_enviado_a_ia: prompt, clasificacion,
      accion_descrita: await calcularAccionCambiarEtapaLead(perfil, contextoPrevio.nombre_contacto!, etapaNueva),
    }
  }

  const prompt = construirPromptAclaracionFecha(mensaje)
  const clasificacion = parsearRespuestaGroq(await llamarGroq(prompt)) as { fecha_hora_iso: string | null; confianza_fecha: string }
  if (!fechaEsConfiable(clasificacion.fecha_hora_iso, clasificacion.confianza_fecha)) {
    return { ok: true, prompt_enviado_a_ia: prompt, clasificacion, mensaje_respuesta: 'Sigue sin quedarme clara la fecha 😅 Mejor créala manualmente desde el CRM con la fecha exacta que necesitas.' }
  }
  return {
    ok: true, prompt_enviado_a_ia: prompt, clasificacion,
    accion_descrita: await calcularAccionCrearTarea(perfil, contextoPrevio.titulo_tarea, contextoPrevio.nombre_contacto, clasificacion.fecha_hora_iso, contextoPrevio.prioridad_tarea),
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-notificacion-secret') !== PRUEBA_SECRET) {
    return new Response('No autorizado', { status: 401 })
  }

  let body: {
    fase?: string
    mensaje_asesor?: string
    es_reintento_aclaracion?: boolean
    modo?: 'pregunta_inicial' | 'asistente_general' | 'asistente_general_aclaracion'
    agente_nombre?: string
    tipo_actividad?: string
    contacto_nombre?: string
    perfil_id?: string
    contexto_previo?: ContextoPrevioAsistente
  }
  try {
    body = await req.json()
  } catch {
    return new Response('JSON inválido', { status: 400 })
  }

  // La primera pregunta no pasa por la IA (es un texto fijo que envía el
  // cron); se expone aquí igual para que la página de prueba muestre la
  // conversación completa desde el inicio con la redacción real.
  if (body.modo === 'pregunta_inicial') {
    const pregunta = PREGUNTA_INICIAL(
      body.agente_nombre || 'Asesor',
      body.tipo_actividad || 'cita',
      body.contacto_nombre || 'el cliente'
    )
    return new Response(JSON.stringify({ ok: true, pregunta }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  if (body.modo === 'asistente_general' || body.modo === 'asistente_general_aclaracion') {
    if (!body.perfil_id) return new Response(JSON.stringify({ ok: false, error: 'Falta perfil_id' }), { status: 400 })
    const mensajeAsesor = body.mensaje_asesor ?? ''
    if (!mensajeAsesor.trim()) return new Response(JSON.stringify({ ok: false, error: 'Falta mensaje_asesor' }), { status: 400 })

    const { data: perfil, error: errorPerfil } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, rol, organization_id')
      .eq('id', body.perfil_id)
      .maybeSingle()
    if (errorPerfil || !perfil) {
      return new Response(JSON.stringify({ ok: false, error: 'Perfil no encontrado' }), { status: 400 })
    }

    try {
      const resultado =
        body.modo === 'asistente_general'
          ? await manejarAsistenteGeneral(perfil as PerfilAsistente, mensajeAsesor)
          : await manejarAsistenteGeneralAclaracion(perfil as PerfilAsistente, mensajeAsesor, body.contexto_previo!)
      return new Response(JSON.stringify(resultado), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  const fase = body.fase ?? 'resultado_visita'
  const mensajeAsesor = body.mensaje_asesor ?? ''
  const esAclaracion = body.es_reintento_aclaracion ?? false
  if (!mensajeAsesor.trim()) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta mensaje_asesor' }), { status: 400 })
  }
  const FASES_VALIDAS = [
    'resultado_visita', 'reprogramar', 'ofrecer_siguiente_paso', 'confirmar_reintento_24h',
    'confirmar_envio_propiedades', 'seguimiento_recurrente', 'resultado_firma',
  ]
  if (!FASES_VALIDAS.includes(fase)) {
    return new Response(JSON.stringify({ ok: false, error: `Fase desconocida: ${fase}` }), { status: 400 })
  }

  try {
    const nombreContacto = body.contacto_nombre || 'el cliente'
    const prompt = construirPrompt(fase, mensajeAsesor, esAclaracion)
    const clasificacion = parsearRespuestaGroq(await llamarGroq(prompt))
    const resultado =
      fase === 'resultado_visita' ? evaluarResultadoVisita(clasificacion, esAclaracion, nombreContacto) :
      fase === 'reprogramar' || fase === 'ofrecer_siguiente_paso' ? evaluarConFecha(fase, clasificacion, esAclaracion, nombreContacto) :
      fase === 'confirmar_reintento_24h' ? evaluarConfirmarReintento24h(clasificacion, esAclaracion, nombreContacto) :
      fase === 'confirmar_envio_propiedades' ? evaluarConfirmarEnvioPropiedades(clasificacion) :
      fase === 'seguimiento_recurrente' ? evaluarSeguimientoRecurrente(clasificacion, esAclaracion) :
      evaluarResultadoFirma(clasificacion)

    return new Response(JSON.stringify({ ok: true, prompt_enviado_a_ia: prompt, ...resultado }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
