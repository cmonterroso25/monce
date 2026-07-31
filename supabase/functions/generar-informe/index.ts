// Reemplaza el workflow de n8n para el análisis de informes de evaluación.
// Recibe la misma forma de payload que antes recibía n8n, arma el mismo
// prompt, y llama a Gemini pasando cada documento como URL externa
// (file_data.file_uri) para que Gemini mismo la descargue — esta función
// nunca baja los bytes de los documentos ni los codifica en base64.
// El resultado se postea al mismo callback_url que ya procesaba la
// respuesta de n8n (/api/webhooks/informe-resultado).

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

function armarPartes(documentos: Documento[], contexto: ContextoFinanciero) {
  const soportados = documentos.filter((d) => EXTENSIONES_SOPORTADAS[obtenerExtension(d.url)])
  const excluidos = documentos.filter((d) => !EXTENSIONES_SOPORTADAS[obtenerExtension(d.url)])

  const montoReferencia = contexto.monto_referencia
  const moneda = contexto.moneda || ''
  const tipoOperacion = contexto.tipo_operacion || 'operación'
  const comentariosAgente = (contexto.comentarios_agente || '').trim()

  // Regla de capacidad de pago: 2x el monto de referencia como referencia
  // general, no como corte estricto (ajustado el 31/07/2026 para ser más
  // tolerante, a pedido del usuario). Consistencia de datos también
  // ajustada para tolerar diferencias menores de captura/formato, y para
  // ignorar el estado civil explícitamente (ajustado el 31/07/2026: es
  // común que varíe entre documentos por documentos desactualizados y no
  // es relevante para este análisis).
  let promptTexto = `Eres un analista de riesgo para una inmobiliaria en Guatemala. Evalúa a un candidato (titular y, si aplica, fiador) para un negocio de tipo "${tipoOperacion}" con un monto de referencia de ${montoReferencia} ${moneda}.
Criterios de evaluación (ambos son obligatorios, pero aplícalos con criterio experto y sentido común, no de forma mecánica):
1. Consistencia de datos entre documentos: verifica que el nombre y el DPI coincidan entre los documentos. Sé tolerante con diferencias menores que no comprometan la identificación real de la persona (errores de tipeo, mayúsculas/minúsculas, acentos, orden o abreviación de nombres compuestos, formato de fecha, un dígito que claramente sea error de captura). NO consideres el estado civil como criterio de inconsistencia bajo ninguna circunstancia: es común que varíe entre documentos porque el más antiguo no se ha renovado, y no es relevante para este análisis. Marca inconsistencia real solo cuando la diferencia sugiera razonablemente que podría tratarse de una persona distinta o de un documento alterado.
2. Capacidad de pago: como referencia general, el ingreso mensual del titular (y del fiador si aplica) debería acercarse a 2 veces el monto de referencia. No lo trates como un corte estricto: si el ingreso está razonablemente cerca de ese umbral (por ejemplo, hasta un 15-20% por debajo), o si hay otros factores que compensan (ingresos adicionales declarados, fiador solvente, estabilidad laboral), puedes considerar que el criterio se cumple, usando tu criterio experto. Si el monto de referencia no aplica a esta regla (por ejemplo compra), usa tu criterio experto para evaluar la capacidad de pago frente al monto.
Documentos disponibles para tu análisis:
${soportados.map((d) => '- ' + d.label).join('\n')}`

  if (comentariosAgente) {
    promptTexto += `\n\nContexto adicional proporcionado por el agente inmobiliario sobre este caso (tómalo en cuenta, pero no lo aceptes como verificación documental — es información de apoyo, no un documento):\n${comentariosAgente}`
  }

  if (excluidos.length > 0) {
    promptTexto += `\n\nDocumentos NO disponibles para tu análisis (formato no soportado en esta etapa):\n${excluidos.map((d) => '- ' + d.label).join('\n')}\nMenciona explícitamente en tu resumen que estos documentos no se analizaron, y si alguno es crítico para tu conclusión, baja el puntaje de forma proporcional a esa incertidumbre.`
  }

  promptTexto += `\n\nResponde ÚNICAMENTE con un objeto JSON con este formato exacto, sin texto adicional:\n{"puntaje": <número entero 0-100>, "resumen": "<resumen breve y claro de tu evaluación, en español, máximo 400 caracteres>", "criterios": {"consistencia_datos": {"cumple": <true o false>, "detalle": "<explicación breve, máximo 200 caracteres>"}, "capacidad_pago": {"cumple": <true o false>, "detalle": "<explicación breve, máximo 200 caracteres>"}}}`

  const parts: Record<string, unknown>[] = [{ text: promptTexto }]
  for (const doc of soportados) {
    const mimeType = EXTENSIONES_SOPORTADAS[obtenerExtension(doc.url)]
    parts.push({ file_data: { mime_type: mimeType, file_uri: doc.url } })
  }
  return parts
}

async function llamarGemini(parts: Record<string, unknown>[]) {
  const respuesta = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { response_mime_type: 'application/json' },
    }),
  })
  if (!respuesta.ok) {
    const texto = await respuesta.text()
    throw new Error(`Gemini respondió ${respuesta.status}: ${texto}`)
  }
  return respuesta.json()
}

function parsearRespuestaGemini(data: any) {
  const contenido = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!contenido) throw new Error('Respuesta de Gemini sin contenido: ' + JSON.stringify(data))
  const parsed = JSON.parse(contenido)
  const puntaje = Number(parsed.puntaje)
  if (Number.isNaN(puntaje)) throw new Error('Puntaje inválido: ' + parsed.puntaje)
  return {
    recomendacion: puntaje,
    resumen: parsed.resumen || '',
    criterios: parsed.criterios || null,
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
    const parts = armarPartes(documentos || [], contexto_financiero || {})
    const data = await llamarGemini(parts)
    const { recomendacion, resumen, criterios } = parsearRespuestaGemini(data)
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
