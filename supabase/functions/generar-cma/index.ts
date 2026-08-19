// Genera el informe de análisis de mercado (CMA, sección 4 del documento
// maestro) usando Gemini con la herramienta de Google Search grounding —
// mismo proveedor que ya usa generar-informe, sin agregar Perplexity como
// dependencia nueva. Mismo patrón de fondo: recibe el payload, responde
// 200 de inmediato, procesa en background con EdgeRuntime.waitUntil, y
// postea el resultado al callback_url.
//
// Encuadre obligatorio (sección 4.5): esto NUNCA se presenta como
// "valuación" o "avalúo" — son términos regulados en la mayoría de países
// y reservados a peritos certificados. El prompt se lo recuerda a Gemini
// explícitamente.
//
// NOTA TÉCNICA: la API de Gemini no permite combinar la herramienta de
// grounding (`google_search`) con `response_mime_type: 'application/json'`
// en la misma llamada. Por eso el JSON se pide como instrucción de texto
// y se parsea limpiando posibles fences de markdown — igual que se hacía
// con la respuesta de Perplexity en la versión anterior de esta función.
// Las fuentes ("fuentes") se toman de `groundingMetadata.groundingChunks`,
// que trae las URLs reales que Gemini efectivamente consultó — no se
// confía en URLs que el modelo pudiera escribir de memoria en el JSON.

const CMA_CALLBACK_SECRET = Deno.env.get('CMA_CALLBACK_SECRET')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!.trim()

// 'gemini-2.5-flash' por defecto (más barato). Se puede pasar
// 'gemini-2.5-pro' en el payload para un informe más profundo.
const MODELO_DEFAULT = 'gemini-2.5-flash'

function urlGemini(modelo: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`
}

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
  modelo?: 'gemini-2.5-flash' | 'gemini-2.5-pro'
  callback_url: string
}

function armarPrompt(p: PropiedadContexto): string {
  const ubicacion = [p.direccion, p.zona, p.municipio, p.ciudad].filter(Boolean).join(', ')
  const areaRelevante = p.area_construccion_m2 ?? p.area_terreno_m2
  const operacion = p.tipo_operacion === 'renta' ? 'renta' : 'venta'

  return `Eres un analista de mercado inmobiliario en Guatemala. NO estás haciendo una valuación ni un avalúo formal — esos términos están reservados a peritos certificados. Estás generando un "informe informativo de posicionamiento de precio" para uso interno de un agente inmobiliario. Usa la herramienta de búsqueda web para encontrar datos reales y actuales (prioriza Encuentra24 y Mapainmueble si encuentras datos ahí, y cualquier otra fuente pública confiable de Guatemala).

Propiedad a analizar:
- Tipo: ${p.tipo_propiedad ?? 'no especificado'}, en ${operacion}
- Ubicación: ${ubicacion || 'no especificada'}
- Área relevante: ${areaRelevante ? `${areaRelevante} m²` : 'no especificada'}
- Precio actual del listado: ${p.precio ? `${p.moneda ?? 'Q'}${p.precio.toLocaleString()}` : 'no fijado aún'}

Busca 3 a 6 propiedades comparables en la misma zona, en ${operacion}, de tipo y tamaño similar. Con eso:
1. Calcula el precio por m² del listado (si tiene precio) y el precio por m² promedio y mediana de los comparables de la zona.
2. Posiciona el listado como "por_encima", "en_linea" o "por_debajo" del mercado de esa zona.
3. Escribe una narrativa breve (3-5 líneas) explicando el porqué, en español neutro para Guatemala.

Responde ÚNICAMENTE con un objeto JSON con este formato exacto, sin texto adicional, sin markdown, sin backticks:
{
  "precio_m2": <número o null>,
  "precio_m2_promedio_zona": <número o null>,
  "precio_m2_mediana_zona": <número o null>,
  "posicionamiento": "<por_encima|en_linea|por_debajo>",
  "comparables": [{"titulo": "<string>", "precio": <número>, "area_m2": <número>, "precio_m2": <número>, "zona": "<string>"}],
  "narrativa": "<string>"
}`
}

async function llamarGemini(prompt: string, modelo: string) {
  const res = await fetch(urlGemini(modelo), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
  })
  if (!res.ok) {
    const texto = await res.text()
    throw new Error(`Gemini respondió ${res.status}: ${texto}`)
  }
  return res.json()
}

// El costo de Gemini con grounding = tokens normales + un cargo fijo por
// cada solicitud de búsqueda que el modelo dispare (puede hacer varias
// por llamada). El free tier de Gemini incluye un cupo diario de
// solicitudes de grounding — para el volumen del piloto (sección 13,
// ~20 kits/mes) debería alcanzar sin pagar, pero AJUSTA este estimado
// contra tu cuenta real si empiezas a facturar costo_usd al cliente.
function estimarCostoUsd(data: any, modelo: string): number {
  const usage = data?.usageMetadata
  const numeroBusquedas =
    data?.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length ?? 1
  const tarifaEntrada = modelo === 'gemini-2.5-pro' ? 0.00000125 : 0.0000003
  const tarifaSalida = modelo === 'gemini-2.5-pro' ? 0.00001 : 0.0000025
  const cargoPorBusqueda = 0.035 // aplica solo fuera del cupo gratis diario
  const promptTokens = usage?.promptTokenCount ?? 0
  const completionTokens = usage?.candidatesTokenCount ?? 0
  return promptTokens * tarifaEntrada + completionTokens * tarifaSalida + numeroBusquedas * cargoPorBusqueda
}

function extraerTexto(data: any): string {
  const contenido = data?.candidates?.[0]?.content?.parts
    ?.map((parte: any) => parte.text)
    .filter(Boolean)
    .join('')
  if (!contenido) throw new Error('Respuesta de Gemini sin contenido: ' + JSON.stringify(data))
  return contenido
}

function extraerFuentes(data: any): { titulo: string; url: string }[] {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  const fuentes = chunks
    .map((c: any) => c?.web)
    .filter((web: any) => web?.uri)
    .map((web: any) => ({ titulo: web.title ?? web.uri, url: web.uri }))
  // dedupe por URL
  const vistos = new Set<string>()
  return fuentes.filter((f: { url: string }) => {
    if (vistos.has(f.url)) return false
    vistos.add(f.url)
    return true
  })
}

function parsearJson(texto: string) {
  const limpio = texto.replace(/```json|```/g, '').trim()
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
    const data = await llamarGemini(prompt, modelo)
    const resultado = parsearJson(extraerTexto(data))
    const fuentes = extraerFuentes(data)
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
      fuentes,
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
