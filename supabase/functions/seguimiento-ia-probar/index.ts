// Simulador de solo lectura del agente de seguimiento IA: deja probar las
// preguntas y la clasificación de la IA sin tocar leads/actividades reales
// ni enviar WhatsApp. Reutiliza exactamente los mismos prompts, esquemas y
// árbol de decisión que seguimiento-ia-webhook/index.ts — si ese archivo
// cambia la lógica, hay que replicar el cambio aquí también (no hay
// carpeta _shared en este proyecto; mismo criterio que el resto de las
// Edge Functions, que duplican su propio código de llamadas a IA).

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const PRUEBA_SECRET = Deno.env.get('WHATSAPP_FUNCTION_SECRET')!
const GROQ_MODEL = 'openai/gpt-oss-120b'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const ETIQUETA_TIPO: Record<string, string> = {
  cita: 'cita', reunion: 'reunión', video_llamada: 'video llamada', llamada: 'llamada',
}

export const PREGUNTA_INICIAL = (agenteNombre: string, tipoActividad: string, contactoNombre: string) =>
  [
    `Hola ${agenteNombre}, ¿qué pasó con tu ${ETIQUETA_TIPO[tipoActividad] ?? tipoActividad} con ${contactoNombre}?`,
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
    if (clasificacion.requiere_revision_documentos) {
      return {
        clasificacion,
        accion_descrita: 'El lead se queda en "Visita realizada" (NO se mueve a Reservada). Se registra el comentario "Documentación en revisión."',
        siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true,
      }
    }
    return {
      clasificacion,
      accion_descrita: 'El lead se queda en "Visita realizada" (NO se mueve a Reservada). Se crea una TAREA "Llamar para gestionar la reserva" con vencimiento en 24 horas.',
      siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true,
    }
  }
  if (clasificacion.resultado_cliente === 'perdido') {
    return { clasificacion, accion_descrita: `Se mueve el lead a "Perdida". Resumen registrado: "${clasificacion.resumen}".`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
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
    return { clasificacion, accion_descrita: `Se crea una nueva CITA para ${fechaIso}, el lead vuelve a "Visita agendada". El ciclo se repetirá 2h después de esa fecha.`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }

  if (decision === 'ninguno_por_ahora') {
    return { clasificacion, accion_descrita: 'El asesor prefiere no agendar nada por ahora: no se mueve el lead, el seguimiento se cierra.', siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  if (decision === 'perdido') {
    return { clasificacion, accion_descrita: 'El cliente ya no está interesado: se mueve el lead a "Perdida".', siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  if (decision === 'enviar_opciones') {
    return {
      clasificacion,
      accion_descrita: `Se crea una TAREA "Enviarle más opciones" con vencimiento ${fechaIso}. 1 hora después de esa fecha se le preguntará al asesor si ya las envió (y de nuevo 2h y 3h después si sigue sin confirmar).`,
      siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true,
    }
  }
  const tipo = decision === 'llamada' ? 'llamada' : 'cita'
  return { clasificacion, accion_descrita: `Se crea una nueva ${ETIQUETA_TIPO[tipo]} de seguimiento para ${fechaIso}. El ciclo se repetirá 2h después de esa fecha.`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
}

function evaluarConfirmarReintento24h(clasificacion: any): Resultado {
  if (clasificacion.volver_a_consultar) {
    return {
      clasificacion,
      accion_descrita: 'Se le avisa al asesor que se le preguntará de nuevo en 24 horas (no se envía nada ahora; el aviso se programa para dentro de 24h).',
      siguiente_fase: 'reprogramar',
      siguiente_pregunta: '¿Qué me cuentas, pudieron reprogramar la visita con el cliente? Responde citando este mensaje.',
      es_reintento_aclaracion_siguiente: false,
      terminal: true, // en la simulación se trata como fin de turno; el aviso real llega 24h después, fuera de este chat de prueba
    }
  }
  return { clasificacion, accion_descrita: 'El cliente no quiere reprogramar: se mueve el lead a "Perdida".', siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
}

function evaluarConfirmarEnvioPropiedades(clasificacion: any): Resultado {
  if (clasificacion.enviadas) {
    return { clasificacion, accion_descrita: 'El asesor confirmó que ya envió las propiedades: se cierra el seguimiento, no se mueve el lead.', siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  return {
    clasificacion,
    accion_descrita: 'El asesor dice que aún no las envía: se reabre la espera y se le volverá a preguntar en el siguiente aviso programado (2h o 3h después, según cuál aviso sea).',
    siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false,
    terminal: true, // en la simulación se trata como fin de turno; el siguiente aviso real llega más tarde, fuera de este chat de prueba
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
    modo?: 'pregunta_inicial'
    agente_nombre?: string
    tipo_actividad?: string
    contacto_nombre?: string
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

  const fase = body.fase ?? 'resultado_visita'
  const mensajeAsesor = body.mensaje_asesor ?? ''
  const esAclaracion = body.es_reintento_aclaracion ?? false
  if (!mensajeAsesor.trim()) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta mensaje_asesor' }), { status: 400 })
  }
  const FASES_VALIDAS = ['resultado_visita', 'reprogramar', 'ofrecer_siguiente_paso', 'confirmar_reintento_24h', 'confirmar_envio_propiedades']
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
      evaluarConfirmarEnvioPropiedades(clasificacion)

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
