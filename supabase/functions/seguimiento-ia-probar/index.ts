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

function evaluarResultadoVisita(clasificacion: any, esAclaracion: boolean): Resultado {
  // En una aclaración de esta fase, "asistio" ya es un hecho confirmado
  // del turno anterior — se fuerza para no dejar que el modelo lo
  // reclasifique mal con un texto que ya no habla de eso.
  if (esAclaracion) clasificacion.asistio = true
  if (!clasificacion.asistio) {
    return {
      clasificacion,
      accion_descrita: `Se registra en Seguimientos: "El cliente no asistió/atendió. ${clasificacion.resumen}". No se mueve el lead todavía.`,
      siguiente_fase: 'reprogramar',
      siguiente_pregunta: '¿Quieren reprogramar la visita? Si es así, dime para cuándo. Responde citando este mensaje.',
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
        accion_descrita: `Se mueve el lead a "Reservada" y se cierra el seguimiento de esta cita. Mensaje al asesor: "${MENSAJE_RESERVADA}"`,
        siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true,
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

function evaluarConFecha(fase: string, clasificacion: any, esAclaracion: boolean): Resultado {
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
        siguiente_pregunta: '¿Quieres que te vuelva a preguntar en 24 horas sobre esto, o prefieres que marque el lead como perdido ahora? Responde citando este mensaje.',
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

function evaluarConfirmarReintento24h(clasificacion: any): Resultado {
  if (clasificacion.volver_a_consultar) {
    return {
      clasificacion,
      accion_descrita: 'Mensaje al asesor: "¡Va! 😊 Te pregunto de nuevo en 24 horas. Gracias por el seguimiento." (no se envía la siguiente pregunta ahora; se programa para dentro de 24h).',
      siguiente_fase: 'reprogramar',
      siguiente_pregunta: '¿Qué me cuentas, pudieron reprogramar la visita con el cliente? Responde citando este mensaje.',
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
    return { clasificacion, accion_descrita: `Se mueve el lead a "Reservada". Fin del ciclo. Mensaje al asesor: "${MENSAJE_RESERVADA}"`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
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
const TIPOS_PROPIEDAD_VALIDOS = ['casa', 'apartamento', 'terreno', 'bodega', 'oficina', 'ofibodega', 'finca', 'granja']
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
    'Clasifica la intención en exactamente una de estas 5 categorías: "consultar_leads" (cuántos leads tiene o en qué etapa están, o resumen de ganados/perdidos), "consultar_citas" (qué citas/visitas/llamadas tiene agendadas), "buscar_propiedades" (buscar propiedades del inventario por criterios), "crear_tarea" (crear una tarea o recordatorio para sí mismo), "conversacion_general" (cualquier otra cosa, saludos incluidos).',
    'Llena solo los campos que correspondan a la intención detectada; deja los demás en null:',
    '- etapa_lead: "contacto_inicial"|"visita_agendada"|"visita_realizada"|"reservada"|"ganada"|"perdida"|"activos"|"todos" (usa "activos" si no mencionó etapa; "todos" solo si pidió el total incluyendo ganados y perdidos).',
    '- rango_fecha_leads: "hoy"|"esta_semana"|"este_mes"|"todo" (solo si etapa_lead es "ganada" o "perdida"; si no especificó, usa "este_mes").',
    '- rango_fecha_citas: "hoy"|"mañana"|"esta_semana"|"vencidas" (si no especificó, usa "hoy").',
    '- tipo_operacion: "venta"|"renta"|null.',
    '- tipo_propiedad: "casa"|"apartamento"|"terreno"|"bodega"|"oficina"|"ofibodega"|"finca"|"granja"|null.',
    '- zona: el texto de zona/ubicación mencionado, o null.',
    '- precio_min, precio_max, dormitorios_min, banos_min: número o null.',
    '- titulo_tarea: para crear_tarea, un título breve (ej. "Llamar a Juan Pérez"), o null.',
    '- nombre_contacto: para crear_tarea, el nombre de la persona mencionada si la tarea es sobre un cliente específico, o null.',
    '- fecha_hora_iso: para crear_tarea, la fecha/hora convertida a ISO 8601 con zona -06:00 (usa la fecha actual de arriba para expresiones relativas como "mañana"), o null si no la mencionó.',
    '- confianza_fecha: "alta"|"media"|"baja"|"ninguna" (alta solo si es inequívoca — no inventes fecha).',
    '- prioridad_tarea: "baja"|"media"|"alta" (infiere la urgencia; si no es claro, usa "media").',
    'Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente estos campos: {"intencion": "...", "etapa_lead": string|null, "rango_fecha_leads": string|null, "rango_fecha_citas": string|null, "tipo_operacion": string|null, "tipo_propiedad": string|null, "zona": string|null, "precio_min": number|null, "precio_max": number|null, "dormitorios_min": number|null, "banos_min": number|null, "titulo_tarea": string|null, "nombre_contacto": string|null, "fecha_hora_iso": string|null, "confianza_fecha": string|null, "prioridad_tarea": string|null}.',
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

async function calcularRespuestaBusquedaPropiedades(perfil: PerfilAsistente, c: Record<string, any>): Promise<string> {
  let query = supabase
    .from('propiedades')
    .select('id, titulo, tipo_operacion, zona, ciudad, precio, moneda, dormitorios, banos, area_construccion_m2')
    .eq('organization_id', perfil.organization_id)
    .eq('estado', 'disponible')
    .order('creado_en', { ascending: false })
    .limit(5)
  if (c.tipo_operacion === 'venta' || c.tipo_operacion === 'renta') query = query.eq('tipo_operacion', c.tipo_operacion)
  if (TIPOS_PROPIEDAD_VALIDOS.includes(c.tipo_propiedad)) query = query.eq('tipo_propiedad', c.tipo_propiedad)
  if (c.zona) query = query.ilike('zona', `%${String(c.zona).trim()}%`)
  if (typeof c.precio_min === 'number') query = query.gte('precio', c.precio_min)
  if (typeof c.precio_max === 'number') query = query.lte('precio', c.precio_max)
  if (typeof c.dormitorios_min === 'number') query = query.gte('dormitorios', c.dormitorios_min)
  if (typeof c.banos_min === 'number') query = query.gte('banos', c.banos_min)

  const { data, error } = await query
  if (error) return 'Uy, no pude buscar en el inventario en este momento 😓'
  if (!data || data.length === 0) return 'No encontré propiedades disponibles con esos criterios 😕 ¿Quieres que busque con otros filtros?'
  const lineas = data.map((p: any) => {
    const zonaTxt = formatearZonaDup(p.zona) ?? p.ciudad ?? ''
    const precioTxt = `${p.moneda ?? 'GTQ'} ${Number(p.precio ?? 0).toLocaleString('es-GT')}`
    const detalles = [p.dormitorios ? `${p.dormitorios} hab` : null, p.banos ? `${p.banos} baños` : null, p.area_construccion_m2 ? `${p.area_construccion_m2} m²` : null].filter(Boolean).join(' · ')
    return `• ${p.titulo} — ${zonaTxt} — ${precioTxt}${detalles ? ` (${detalles})` : ''} [propiedad ${p.id}]`
  })
  return [`🏠 Encontré ${data.length} propiedad${data.length === 1 ? '' : 'es'}:`, '', ...lineas].join('\n')
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
        contexto_para_siguiente_turno: { titulo_tarea: titulo, nombre_contacto: c.nombre_contacto ?? null, prioridad_tarea: prioridad },
      }
    }
    return { ok: true, prompt_enviado_a_ia: prompt, clasificacion: c, accion_descrita: await calcularAccionCrearTarea(perfil, titulo, c.nombre_contacto ?? null, c.fecha_hora_iso, prioridad) }
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
      '¿En qué te ayudo? 🙂',
    ].join('\n'),
  }
}

async function manejarAsistenteGeneralAclaracion(perfil: PerfilAsistente, mensaje: string, contextoPrevio: { titulo_tarea: string; nombre_contacto: string | null; prioridad_tarea: string }): Promise<ResultadoAsistenteGeneral> {
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
    contexto_previo?: { titulo_tarea: string; nombre_contacto: string | null; prioridad_tarea: string }
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
    const prompt = construirPrompt(fase, mensajeAsesor, esAclaracion)
    const clasificacion = parsearRespuestaGroq(await llamarGroq(prompt))
    const resultado =
      fase === 'resultado_visita' ? evaluarResultadoVisita(clasificacion, esAclaracion) :
      fase === 'reprogramar' || fase === 'ofrecer_siguiente_paso' ? evaluarConFecha(fase, clasificacion, esAclaracion) :
      fase === 'confirmar_reintento_24h' ? evaluarConfirmarReintento24h(clasificacion) :
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
