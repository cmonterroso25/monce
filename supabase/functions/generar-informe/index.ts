// Reemplaza el workflow de n8n para el análisis de informes de evaluación.
// Recibe la misma forma de payload que antes recibía n8n, arma el mismo
// prompt, y llama a Gemini pasando cada documento como URL externa
// (file_data.file_uri) para que Gemini mismo la descargue — esta función
// nunca baja los bytes de los documentos ni los codifica en base64.
// El resultado se postea al mismo callback_url que ya procesaba la
// respuesta de n8n (/api/webhooks/informe-resultado).
//
// Actualizado 14/09/2026: prompt reescrito para adaptarse dinámicamente a
// los tipos de documento efectivamente cargados (no menciona ni penaliza
// documentos ausentes), agrega criterios condicionales de antecedentes
// legales y formalidad de negocio, y pide un resumen profesional en
// varios párrafos en vez de un resumen de una línea. También agrega una
// regla de negocio determinística: un registro positivo en RENAS fuerza
// el resultado a "No recomendado" en el código, sin depender de que
// Gemini calibre correctamente un caso tan sensible.
//
// Actualizado 15/09/2026: se agrega response_schema (fuerza la
// estructura JSON exacta en vez de depender solo de instrucciones en
// texto — corrige errores de "JSON.parse" cuando Gemini metía caracteres
// de control sin escapar dentro del resumen), temperature bajo (0.2,
// menos varianza entre corridas) y reintento automático ante errores
// transitorios de Gemini (503/429).

const INFORME_CALLBACK_SECRET = Deno.env.get('INFORME_CALLBACK_SECRET')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')?.trim()!
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const EXTENSIONES_SOPORTADAS: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
}

// Guía de interpretación por tipo de documento (verificada contra fuentes
// oficiales guatemaltecas el 14/09/2026, no inventada). Solo se incluyen
// en el prompt los tipos que efectivamente se cargaron para este informe.
const GUIA_TIPOS_DOCUMENTO: Record<string, string> = {
  constancia_laboral:
    'Constancia laboral: confirma relación laboral vigente, cargo, tiempo de servicio e ingreso mensual declarado por el empleador. Contrasta este ingreso contra estados de cuenta, Infornet o SIB.',
  estados_cuenta:
    'Estados de cuenta bancarios: revela el flujo real de ingresos y egresos, sobregiros, saldos negativos recurrentes o movimientos que no calcen con el ingreso declarado.',
  dpi:
    'DPI: úsalo como ancla de identidad (nombre completo y número de DPI) para verificar consistencia contra el resto de documentos.',
  infornet:
    'Infornet: historial de crédito no bancario y moras reportadas. Señala moras activas o mal historial de pago.',
  sib:
    'Historial crediticio SIB (Superintendencia de Bancos): reporte oficial de créditos, morosidad y endeudamiento en el sistema bancario regulado de los últimos 60 meses. Es la fuente más confiable de capacidad de pago e historial crediticio disponible — dale más peso que a estados de cuenta o Infornet cuando esté presente.',
  antecedentes_penales:
    'Antecedentes penales (Organismo Judicial): confirma si la persona tiene condenas penales registradas. Cualquier antecedente activo es una señal de riesgo relevante.',
  antecedentes_policiacos:
    'Antecedentes policiacos (PNC): complementa a los antecedentes penales con registros policiales. Trátalo con el mismo criterio: una señal de riesgo si aparece algo activo.',
  renas:
    'RENAS (Registro Nacional de Agresores Sexuales, Ministerio Público): certifica si la persona tiene condenas firmes por delitos sexuales. Es una señal de riesgo grave y determinante si el registro es positivo.',
  rtu:
    'RTU (Registro Tributario Unificado, SAT): confirma actividad tributaria formal. Relevante sobre todo si el ingreso del candidato depende de un negocio propio.',
  patente_comercio:
    'Patente de comercio: confirma que un negocio está formalmente registrado. Úsalo como respaldo de formalidad cuando el ingreso depende de negocio propio.',
  otros:
    'Documento adicional aportado por el agente sin categoría específica: analízalo según su contenido y menciona brevemente qué aportó, si es relevante para tu conclusión.',
}

const ETIQUETAS_TIPOS_DOCUMENTO: Record<string, string> = {
  constancia_laboral: 'Constancia laboral',
  estados_cuenta: 'Estados de cuenta',
  dpi: 'DPI',
  infornet: 'Infornet',
  sib: 'Historial crediticio SIB',
  antecedentes_penales: 'Antecedentes penales',
  antecedentes_policiacos: 'Antecedentes policiacos',
  renas: 'RENAS',
  rtu: 'RTU',
  patente_comercio: 'Patente de comercio',
  otros: 'Otros documentos',
}

function tipoBase(tipo: string): string {
  return tipo.replace(/^titular_/, '').replace(/^fiador_/, '')
}

function obtenerExtension(url: string): string {
  try {
    const sinQuery = url.split('?')[0]
    const partes = sinQuery.split('.')
    return partes[partes.length - 1].toLowerCase()
  } catch {
    return ''
  }
}

type Documento = { tipo: string; label: string; url: string }
type ContextoFinanciero = {
  monto_referencia: number | null
  moneda: string | null
  tipo_operacion: string | null
  comentarios_agente?: string | null
}

// Schema JSON que se pasa a Gemini vía generationConfig.response_schema.
// Fuerza la estructura exacta de la respuesta (agregado 15/09/2026) — ya
// no depende únicamente de que el modelo respete el formato pedido en
// texto libre. Los campos condicionales (antecedentes_legales,
// formalidad_negocio, renas_positivo) solo se agregan al schema cuando
// el prompt efectivamente los pide, igual que ya hacía armarPartes con
// el texto del prompt.
function armarResponseSchema(tieneLegales: boolean, tieneFormalidadNegocio: boolean, tieneRenas: boolean) {
  const criterioSchema = {
    type: 'OBJECT',
    properties: {
      cumple: { type: 'BOOLEAN' },
      detalle: { type: 'STRING' },
    },
    required: ['cumple', 'detalle'],
  }

  const criteriosProperties: Record<string, unknown> = {
    consistencia_datos: criterioSchema,
    capacidad_pago: criterioSchema,
  }
  const criteriosRequired = ['consistencia_datos', 'capacidad_pago']

  if (tieneLegales) {
    criteriosProperties.antecedentes_legales = criterioSchema
    criteriosRequired.push('antecedentes_legales')
  }
  if (tieneFormalidadNegocio) {
    criteriosProperties.formalidad_negocio = criterioSchema
    criteriosRequired.push('formalidad_negocio')
  }

  const properties: Record<string, unknown> = {
    puntaje: { type: 'INTEGER' },
    resumen: { type: 'STRING' },
    criterios: {
      type: 'OBJECT',
      properties: criteriosProperties,
      required: criteriosRequired,
    },
  }
  const required = ['puntaje', 'resumen', 'criterios']

  if (tieneRenas) {
    properties.renas_positivo = { type: 'BOOLEAN' }
    required.push('renas_positivo')
  }

  return {
    type: 'OBJECT',
    properties,
    required,
  }
}

function armarPartes(documentos: Documento[], contexto: ContextoFinanciero) {
  const soportados = documentos.filter((d) => EXTENSIONES_SOPORTADAS[obtenerExtension(d.url)])
  const excluidos = documentos.filter((d) => !EXTENSIONES_SOPORTADAS[obtenerExtension(d.url)])

  const tiposPresentes = Array.from(new Set(soportados.map((d) => tipoBase(d.tipo))))
  const tieneLegales = tiposPresentes.some((t) =>
    ['antecedentes_penales', 'antecedentes_policiacos', 'renas'].includes(t)
  )
  const tieneFormalidadNegocio = tiposPresentes.some((t) => ['rtu', 'patente_comercio'].includes(t))
  const tieneRenas = tiposPresentes.includes('renas')

  const guiaDinamica = tiposPresentes
    .filter((t) => GUIA_TIPOS_DOCUMENTO[t])
    .map((t) => `- ${ETIQUETAS_TIPOS_DOCUMENTO[t]}: ${GUIA_TIPOS_DOCUMENTO[t]}`)
    .join('\n')

  const montoReferencia = contexto.monto_referencia
  const moneda = contexto.moneda || ''
  const tipoOperacion = contexto.tipo_operacion || 'operación'
  const comentariosAgente = (contexto.comentarios_agente || '').trim()

  let numeroCriterioLegal = 3
  let numeroCriterioNegocio = tieneLegales ? 4 : 3

  let promptTexto = `Eres un analista de riesgo senior para una inmobiliaria en Guatemala, con años de experiencia evaluando candidatos a arrendamiento y compra. Evalúa a un candidato (titular y, si aplica, fiador) para un negocio de tipo "${tipoOperacion}" con un monto de referencia de ${montoReferencia} ${moneda}.

Analiza ÚNICAMENTE los documentos efectivamente listados abajo. Si un tipo de documento no fue cargado, no asumas su contenido, no lo menciones como una carencia relevante salvo que sea crítico para tu conclusión, y no penalices su ausencia — evalúa con la información disponible, no con la que falta.
`

  if (guiaDinamica) {
    promptTexto += `\nGuía de interpretación de los documentos disponibles en este caso:\n${guiaDinamica}\n`
  }

  promptTexto += `\nCriterios de evaluación obligatorios (ambos aplican siempre, con criterio experto y sentido común, no de forma mecánica):
1. Consistencia de datos entre documentos: verifica que el nombre y el DPI coincidan entre los documentos. Sé tolerante con diferencias menores que no comprometan la identificación real de la persona (errores de tipeo, mayúsculas/minúsculas, acentos, orden o abreviación de nombres compuestos, formato de fecha, un dígito que claramente sea error de captura). NO consideres el estado civil como criterio de inconsistencia bajo ninguna circunstancia: es común que varíe entre documentos porque el más antiguo no se ha renovado, y no es relevante para este análisis. Marca inconsistencia real solo cuando la diferencia sugiera razonablemente que podría tratarse de una persona distinta o de un documento alterado.
2. Capacidad de pago: como referencia general, el ingreso mensual del titular (y del fiador si aplica) debería acercarse a 2 veces el monto de referencia. No lo trates como un corte estricto: si el ingreso está razonablemente cerca de ese umbral (por ejemplo, hasta un 15-20% por debajo), o si hay otros factores que compensan (ingresos adicionales declarados, fiador solvente, estabilidad laboral), puedes considerar que el criterio se cumple, usando tu criterio experto. Si hay historial crediticio SIB disponible, dale más peso que a estados de cuenta o Infornet por ser la fuente oficial más completa y confiable del sistema bancario regulado. Si el monto de referencia no aplica a esta regla (por ejemplo compra), usa tu criterio experto para evaluar la capacidad de pago frente al monto.`

  if (tieneLegales) {
    promptTexto += `\n${numeroCriterioLegal}. Antecedentes legales: evalúa si hay condenas o registros activos relevantes en los documentos de antecedentes penales, policiacos o RENAS disponibles. Un registro positivo en RENAS es una señal grave que debes señalar explícitamente y con claridad en tu análisis, aunque la decisión final de descartar al candidato por esto quede en manos del agente inmobiliario, no en la tuya.`
  }

  if (tieneFormalidadNegocio) {
    promptTexto += `\n${numeroCriterioNegocio}. Formalidad del negocio: si el ingreso del candidato depende de un negocio propio, evalúa con el RTU y/o la patente de comercio disponibles si esa actividad económica está formalmente registrada, como respaldo adicional de la capacidad de pago declarada.`
  }

  promptTexto += `\n\nRestricción de privacidad: en el resumen y en el detalle de cada criterio, NUNCA incluyas números de teléfono, aunque los veas en los documentos. Puedes usar cualquier otro dato (nombres, DPI, montos) con normalidad.

Documentos disponibles para tu análisis:
${soportados.map((d) => '- ' + d.label).join('\n')}`

  if (comentariosAgente) {
    promptTexto += `\n\nContexto adicional proporcionado por el agente inmobiliario sobre este caso (tómalo en cuenta, pero no lo aceptes como verificación documental — es información de apoyo, no un documento):\n${comentariosAgente}`
  }

  if (excluidos.length > 0) {
    promptTexto += `\n\nDocumentos NO disponibles para tu análisis (formato no soportado en esta etapa):\n${excluidos.map((d) => '- ' + d.label).join('\n')}\nMenciona explícitamente en tu resumen que estos documentos no se analizaron, y si alguno es crítico para tu conclusión, baja el puntaje de forma proporcional a esa incertidumbre.`
  }

  promptTexto += `\n\nEscribe un resumen profesional y detallado, no un resumen de una sola línea: explica con claridad las distintas aristas de tu evaluación — qué encontraste en cada criterio, por qué pesa a favor o en contra, y cuál es tu recomendación final y por qué. Usa un tono profesional, como el informe que un analista de riesgo entregaría a un gerente. Estructura el resumen en 2 a 4 párrafos cortos, separados por doble salto de línea (\\n\\n): un párrafo de consistencia de datos, uno de capacidad de pago${tieneLegales ? ', uno de antecedentes legales' : ''}${tieneFormalidadNegocio ? ', uno de formalidad del negocio' : ''}, y un párrafo final de conclusión y recomendación. Máximo 1800 caracteres en total.

Responde con un objeto JSON que siga estrictamente el schema configurado. En el campo "resumen", usa el carácter de escape "\\n\\n" (barra invertida, ene, barra invertida, ene) entre párrafos — nunca insertes un salto de línea real dentro del string, siempre la secuencia de escape.`

  const parts: Record<string, unknown>[] = [{ text: promptTexto }]
  for (const doc of soportados) {
    const mimeType = EXTENSIONES_SOPORTADAS[obtenerExtension(doc.url)]
    parts.push({ file_data: { mime_type: mimeType, file_uri: doc.url } })
  }
  const responseSchema = armarResponseSchema(tieneLegales, tieneFormalidadNegocio, tieneRenas)
  return { parts, tieneRenas, responseSchema }
}

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Reintenta ante errores transitorios de Gemini (503 "service unavailable"
// o 429 "rate limited"). Agregado 15/09/2026: se observó un 503 real en
// producción que hacía fallar el informe sin necesidad — un segundo
// intento con espera corta suele resolverlo. No reintenta ante errores
// 4xx que no sean 429 (esos son errores del payload/prompt, reintentar
// no ayuda).
async function llamarGemini(parts: Record<string, unknown>[], responseSchema: Record<string, unknown>) {
  const maxIntentos = 3
  let ultimoError: Error | null = null

  for (let intento = 1; intento <= maxIntentos; intento++) {
    const respuesta = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          response_mime_type: 'application/json',
          response_schema: responseSchema,
          temperature: 0.2,
        },
      }),
    })

    if (respuesta.ok) return respuesta.json()

    const texto = await respuesta.text()
    ultimoError = new Error(`Gemini respondió ${respuesta.status}: ${texto}`)

    const esTransitorio = respuesta.status === 503 || respuesta.status === 429
    if (!esTransitorio || intento === maxIntentos) throw ultimoError

    console.log(`Gemini respondió ${respuesta.status} (transitorio), reintento ${intento}/${maxIntentos - 1}...`)
    await esperar(1000 * intento)
  }

  throw ultimoError ?? new Error('Gemini no respondió')
}

function parsearRespuestaGemini(data: any) {
  const contenido = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!contenido) throw new Error('Respuesta de Gemini sin contenido: ' + JSON.stringify(data))

  let parsed: any
  try {
    parsed = JSON.parse(contenido)
  } catch (errorParseo) {
    // Defensa adicional además de response_schema: si a pesar del schema
    // Gemini metió un carácter de control sin escapar dentro de algún
    // string (salto de línea real, tab, etc.), se sanea antes de tirar
    // la toalla, en vez de fallar el informe completo por eso.
    const saneado = contenido.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').replace(/\r?\n/g, '\\n')
    try {
      parsed = JSON.parse(saneado)
      console.log('JSON de Gemini requirió saneo de caracteres de control antes de parsear.')
    } catch {
      throw errorParseo
    }
  }

  const puntaje = Number(parsed.puntaje)
  if (Number.isNaN(puntaje)) throw new Error('Puntaje inválido: ' + parsed.puntaje)
  return {
    recomendacion: puntaje,
    resumen: parsed.resumen || '',
    criterios: parsed.criterios || null,
    renasPositivo: parsed.renas_positivo === true,
  }
}

async function enviarCallback(callbackUrl: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-informe-secret': INFORME_CALLBACK_SECRET,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.error('Callback de informe respondió con error:', res.status, await res.text())
    } else {
      console.log('Callback de informe enviado correctamente para', body.informe_id)
    }
  } catch (err) {
    console.error('Error de red al enviar callback de informe:', err)
  }
}

async function procesarInforme(payload: any) {
  const { informe_id, documentos, contexto_financiero, callback_url } = payload
  try {
    const { parts, tieneRenas, responseSchema } = armarPartes(documentos || [], contexto_financiero || {})
    const data = await llamarGemini(parts, responseSchema)
    // eslint-disable-next-line prefer-const
    let { recomendacion, resumen, criterios, renasPositivo } = parsearRespuestaGemini(data)

    // Regla de negocio (agregada 14/09/2026, confirmada explícitamente por
    // el usuario): un registro positivo en RENAS fuerza el resultado a
    // "No recomendado" (puntaje 0) de forma determinística en el código.
    // No se confía esta decisión al criterio libre del modelo por lo
    // sensible del caso.
    if (tieneRenas && renasPositivo) {
      recomendacion = 0
      const alerta =
        'ALERTA: se detectó un registro positivo en RENAS (Registro Nacional de Agresores Sexuales) para una de las personas evaluadas. Por política interna, este informe se marca automáticamente como No recomendado, independientemente del resto de los criterios evaluados.\n\n'
      resumen = alerta + (resumen || '')
      if (criterios && criterios.antecedentes_legales) {
        criterios.antecedentes_legales.cumple = false
        criterios.antecedentes_legales.detalle =
          'Registro positivo en RENAS detectado. ' + (criterios.antecedentes_legales.detalle || '')
      } else {
        criterios = {
          ...(criterios || {}),
          antecedentes_legales: { cumple: false, detalle: 'Registro positivo en RENAS detectado.' },
        }
      }
    }

    await enviarCallback(callback_url, { informe_id, recomendacion, resumen, criterios })
  } catch (err) {
    console.error('--- ERROR AL PROCESAR INFORME ---', informe_id, err)
    await enviarCallback(callback_url, {
      informe_id,
      error: err instanceof Error ? err.message : 'Error desconocido al analizar los documentos.',
    })
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), { status: 405 })
  }

  const secreto = req.headers.get('x-informe-secret')
  if (!INFORME_CALLBACK_SECRET || secreto !== INFORME_CALLBACK_SECRET) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 })
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 })
  }

  if (!payload.informe_id || !payload.callback_url) {
    return new Response(JSON.stringify({ error: 'Falta informe_id o callback_url' }), { status: 400 })
  }

  // Respuesta inmediata (ack) — el análisis real corre en background con
  // waitUntil, sin bloquear al Server Action que llamó esta función.
  // @ts-ignore EdgeRuntime es global en el runtime de Supabase Edge Functions
  EdgeRuntime.waitUntil(procesarInforme(payload))

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
