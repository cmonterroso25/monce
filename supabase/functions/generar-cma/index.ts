// Genera el informe de análisis de mercado (CMA, sección 4 del documento
// maestro) usando Perplexity Sonar. Mismo patrón que generar-informe:
// recibe el payload, responde 200 de inmediato, procesa en background con
// EdgeRuntime.waitUntil, y postea el resultado al callback_url.
//
// Encuadre obligatorio (sección 4.5): esto NUNCA se presenta como
// "valuación" o "avalúo" — son términos regulados en la mayoría de países
// y reservados a peritos certificados. El prompt se lo recuerda a Sonar
// explícitamente y el propio texto de esta función lo llama "informe de
// posicionamiento de precio" en todo momento.

const CMA_CALLBACK_SECRET = Deno.env.get('CMA_CALLBACK_SECRET')!
const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY')!
const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions'

// 'sonar' por defecto (más barato, sección 4.4). Se puede pasar 'sonar-pro'
// en el payload cuando el agente pide un informe más profundo.
const MODELO_DEFAULT = 'sonar'

type PropiedadContexto = {
  titulo: string
  tipo_operacion: string | null
  tipo_propiedad: string | null
  precio: number | null
  moneda: string | null
  area_construccion_m2: number | null
  area_terreno_m2: number | null
  zona: string | null
  municipio: string | null
  ciudad: string | null
  direccion: string | null
}

type Payload = {
  informe_id: string
  propiedad: PropiedadContexto
  modelo?: 'sonar' | 'sonar-pro'
  callback_url: string
}

function armarPrompt(p: PropiedadContexto): string {
  const ubicacion = [p.direccion, p.zona, p.municipio, p.ciudad].filter(Boolean).join(', ')
  const areaRelevante = p.area_construccion_m2 ?? p.area_terreno_m2
  const operacion = p.tipo_operacion === 'renta' ? 'renta' : 'venta'

  return `Eres un analista de mercado inmobiliario en Guatemala. NO estás haciendo una valuación ni un avalúo formal — esos términos están reservados a peritos certificados. Estás generando un "informe informativo de posicionamiento de precio" para uso interno de un agente inmobiliario, usando fuentes públicas (prioriza Encuentra24 y Mapainmueble si encuentras datos ahí, y cualquier otra fuente pública confiable de Guatemala).

Propiedad a analizar:
- Tipo: ${p.tipo_propiedad ?? 'no especificado'}, en ${operacion}
- Ubicación: ${ubicacion || 'no especificada'}
- Área relevante: ${areaRelevante ? `${areaRelevante} m²` : 'no especificada'}
- Precio actual del listado: ${p.precio ? `${p.moneda ?? 'Q'}${p.precio.toLocaleString()}` : 'no fijado aún'}

Busca 3 a 6 propiedades comparables en la misma zona, en ${operacion}, de tipo y tamaño similar. Con eso:
1. Calcula el precio por m² del listado (si tiene precio) y el precio por m² promedio y mediana de los comparables de la zona.
2. Posiciona el listado como "por_encima", "en_linea" o "por_debajo" del mercado de esa zona.
3. Escribe una narrativa breve (3-5 líneas) explicando el porqué, en español neutro para Guatemala.
4. Lista tus fuentes con URL.

Responde ÚNICAMENTE con un objeto JSON con este formato exacto, sin texto adicional, sin markdown:
{
  "precio_m2": <número o null>,
  "precio_m2_promedio_zona": <número o null>,
  "precio_m2_mediana_zona": <número o null>,
  "posicionamiento": "<por_encima|en_linea|por_debajo>",
  "comparables": [{"titulo": "<string>", "precio": <número>, "area_m2": <número>, "precio_m2": <número>, "zona": "<string>", "url": "<string o null>"}],
  "narrativa": "<string>",
  "fuentes": [{"titulo": "<string>", "url": "<string>"}]
}`
}

async function llamarPerplexity(prompt: string, modelo: string) {
  const res = await fetch(PERPLEXITY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_schema', json_schema: { schema: {} } },
    }),
  })
  if (!res.ok) {
    const texto = await res.text()
    throw new Error(`Perplexity respondió ${res.status}: ${texto}`)
  }
  return res.json()
}

// Perplexity cobra por tokens de entrada/salida + un cargo fijo por
// búsqueda ("request fee"). El desglose exacto viene en `usage` — se
// calcula aquí un estimado conservador si el campo no viene completo.
// AJUSTA esta función con las tarifas reales de tu cuenta antes de
// confiar en `costo_usd` para facturar al cliente (sección 13).
function estimarCostoUsd(data: any, modelo: string): number {
  const usage = data?.usage
  if (!usage) return modelo === 'sonar-pro' ? 0.04 : 0.015
  const promptTokens = usage.prompt_tokens ?? 0
  const completionTokens = usage.completion_tokens ?? 0
  const tarifaEntrada = modelo === 'sonar-pro' ? 0.000003 : 0.000001
  const tarifaSalida = modelo === 'sonar-pro' ? 0.000015 : 0.000001
  const cargoBusqueda = modelo === 'sonar-pro' ? 0.008 : 0.005
  return promptTokens * tarifaEntrada + completionTokens * tarifaSalida + cargoBusqueda
}

function parsearRespuesta(data: any) {
  const contenido = data?.choices?.[0]?.message?.content
  if (!contenido) throw new Error('Respuesta de Perplexity sin contenido: ' + JSON.stringify(data))
  const limpio = contenido.replace(/```json|```/g, '').trim()
  return JSON.parse(limpio)
}

async function enviarCallback(callbackUrl: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cma-secret': CMA_CALLBACK_SECRET,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.error('Callback de CMA respondió con error:', res.status, await res.text())
    }
  } catch (err) {
    console.error('Error de red al enviar callback de CMA:', err)
  }
}

async function procesarCma(payload: Payload) {
  const { informe_id, propiedad, callback_url } = payload
  const modelo = payload.modelo ?? MODELO_DEFAULT
  try {
    const prompt = armarPrompt(propiedad)
    const data = await llamarPerplexity(prompt, modelo)
    const resultado = parsearRespuesta(data)
    const costoUsd = estimarCostoUsd(data, modelo)

    await enviarCallback(callback_url, {
      informe_id,
      modelo,
      precio_m2: resultado.precio_m2 ?? null,
      precio_m2_promedio_zona: resultado.precio_m2_promedio_zona ?? null,
      precio_m2_mediana_zona: resultado.precio_m2_mediana_zona ?? null,
      posicionamiento: resultado.posicionamiento ?? null,
      comparables: resultado.comparables ?? [],
      narrativa: resultado.narrativa ?? null,
      fuentes: resultado.fuentes ?? [],
      costo_usd: costoUsd,
    })
  } catch (err) {
    console.error('--- ERROR AL PROCESAR CMA ---', informe_id, err)
    await enviarCallback(callback_url, {
      informe_id,
      error: err instanceof Error ? err.message : 'Error desconocido al generar el informe de mercado.',
    })
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), { status: 405 })
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 })
  }

  if (!payload.informe_id || !payload.propiedad || !payload.callback_url) {
    return new Response(JSON.stringify({ error: 'Falta informe_id, propiedad o callback_url' }), { status: 400 })
  }

  // @ts-ignore EdgeRuntime es global en el runtime de Supabase Edge Functions
  EdgeRuntime.waitUntil(procesarCma(payload))

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
