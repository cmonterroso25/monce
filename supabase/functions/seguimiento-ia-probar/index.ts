// Simulador de solo lectura del agente de seguimiento IA: deja probar las
// preguntas y la clasificación de Gemini sin tocar leads/actividades reales
// ni enviar WhatsApp. Reutiliza exactamente los mismos prompts, esquemas y
// árbol de decisión que seguimiento-ia-webhook/index.ts — si ese archivo
// cambia la lógica, hay que replicar el cambio aquí también (no hay
// carpeta _shared en este proyecto; mismo criterio que el resto de las
// Edge Functions, que duplican su propio código de Gemini).

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const PRUEBA_SECRET = Deno.env.get('WHATSAPP_FUNCTION_SECRET')!
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

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
  return [
    contextoFecha,
    esAclaracion
      ? 'El asesor ya dijo qué siguiente paso quiere, pero su mensaje anterior no dejó clara la fecha/hora. Se le volvió a preguntar.'
      : 'El cliente quedó indeciso tras la visita. Se le preguntó al asesor si programan una llamada o una nueva visita de seguimiento, y para cuándo.',
    `Respuesta del asesor: "${mensajeAsesor}"`,
    'Determina proximo_paso: "llamada" (llamada de seguimiento), "nueva_visita" (otra cita presencial), "ninguno_por_ahora" (no quiere agendar nada todavía), o "perdido" (en realidad ya no sigue interesado). Si es llamada o nueva_visita, conviértela a fecha_hora_iso igual que arriba, con confianza_fecha. No inventes una fecha si no la mencionó.',
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
      siguiente_pregunta: 'No me quedó claro: ¿el cliente quiere reservar, no le interesó, o se quedó indeciso? Responde citando este mensaje.',
      es_reintento_aclaracion_siguiente: true,
      terminal: false,
    }
  }
  if (clasificacion.resultado_cliente === 'reservo') {
    return { clasificacion, accion_descrita: `Se mueve el lead a "Reservada" 🎉. Resumen registrado: "${clasificacion.resumen}".`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  if (clasificacion.resultado_cliente === 'perdido') {
    return { clasificacion, accion_descrita: `Se mueve el lead a "Perdida". Resumen registrado: "${clasificacion.resumen}".`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  // indeciso_mas_opciones / indeciso_sin_decision
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
    (fase === 'ofrecer_siguiente_paso' && typeof decision === 'string' && ['llamada', 'nueva_visita'].includes(decision))

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
      return { clasificacion, accion_descrita: 'El cliente no quiere reprogramar: se mueve el lead a "Perdida".', siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
    }
    return { clasificacion, accion_descrita: `Se crea una nueva CITA para ${fechaIso}, el lead vuelve a "Visita agendada". El ciclo se repetirá 2h después de esa fecha.`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }

  if (decision === 'ninguno_por_ahora') {
    return { clasificacion, accion_descrita: 'El asesor prefiere no agendar nada por ahora: no se mueve el lead, el seguimiento se cierra.', siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  if (decision === 'perdido') {
    return { clasificacion, accion_descrita: 'El cliente ya no está interesado: se mueve el lead a "Perdida".', siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
  }
  const tipo = decision === 'llamada' ? 'llamada' : 'cita'
  return { clasificacion, accion_descrita: `Se crea una nueva ${ETIQUETA_TIPO[tipo]} de seguimiento para ${fechaIso}. El ciclo se repetirá 2h después de esa fecha.`, siguiente_fase: null, siguiente_pregunta: null, es_reintento_aclaracion_siguiente: false, terminal: true }
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

  // La primera pregunta no pasa por Gemini (es un texto fijo que envía el
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
  if (!['resultado_visita', 'reprogramar', 'ofrecer_siguiente_paso'].includes(fase)) {
    return new Response(JSON.stringify({ ok: false, error: `Fase desconocida: ${fase}` }), { status: 400 })
  }

  const schema =
    fase === 'resultado_visita' ? SCHEMA_RESULTADO_VISITA :
    fase === 'reprogramar' ? SCHEMA_REPROGRAMAR :
    SCHEMA_OFRECER_SIGUIENTE_PASO

  try {
    const prompt = construirPrompt(fase, mensajeAsesor, esAclaracion)
    const clasificacion = parsearRespuestaGemini(await llamarGemini(prompt, schema))
    const resultado =
      fase === 'resultado_visita'
        ? evaluarResultadoVisita(clasificacion, esAclaracion)
        : evaluarConFecha(fase, clasificacion, esAclaracion)

    return new Response(JSON.stringify({ ok: true, prompt_enviado_a_gemini: prompt, ...resultado }), {
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
