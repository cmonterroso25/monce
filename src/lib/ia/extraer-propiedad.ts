// Extrae datos estructurados de propiedades a partir de texto libre
// (el típico mensaje de WhatsApp con el anuncio de una propiedad).
// Usa Gemini con una API key separada (GEMINI_API_KEY_PROPIEDADES) para
// no compartir el cupo gratuito con generar-cma / generar-informe.
//
// Si el texto describe la misma propiedad en venta Y renta con precios
// distintos, se devuelven dos entradas separadas en el arreglo, una por
// cada tipo_operacion, con el resto de los campos duplicados.
//
// El campo `municipio_texto` es solo un nombre libre (ej. "Fraijanes",
// "zona 16") — la IA NO conoce los ids reales de la tabla `municipios`,
// así que el emparejamiento a un municipio_id existente se hace en el
// cliente (ver extractor-texto.tsx), nunca aquí.

import { TIPOS_PROPIEDAD } from '@/lib/tipos-propiedad'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY_PROPIEDADES?.trim()

// Se prueba en orden: si el primer modelo está saturado (503) o al
// límite de uso (429), o no responde a tiempo, se reintenta con el
// siguiente en vez de insistir con el mismo modelo caído.
// gemini-2.5-flash NO sirve en esta cuenta (404 "no longer available to
// new users").
const MODELOS_EN_ORDEN = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']

// La extracción de texto a JSON no necesita razonamiento. gemini-3.6-flash
// usa thinking "medium" por defecto (más latencia); "minimal" está
// soportado por los tres modelos de la lista.
const NIVEL_THINKING = 'MINIMAL'

function urlGemini(modelo: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`
}

export type PropiedadExtraida = {
  titulo: string
  tipo_operacion: 'venta' | 'renta'
  tipo_propiedad: string
  precio: number | null
  moneda: 'GTQ' | 'USD' | null
  mantenimiento: number | null
  zona: string | null
  municipio_texto: string | null
  sector: string | null
  condominio: string | null
  niveles: string | null
  dormitorios: string | null
  banos: string | null
  sala: string | null
  comedor: string | null
  cocina: string | null
  estudio: string | null
  sala_familiar: string | null
  habitacion_servicio: string | null
  lavanderia: string | null
  jardin: string | null
  parqueos: number | null
  bodega: 'Si' | 'No' | null
  balcon: 'Si' | 'No' | null
  area_construccion_m2: number | null
  area_terreno_m2: number | null
  medidas_terreno: string | null
  extras: string | null
  mascota: string | null
  descripcion: string | null
}

// Categorías de error pensadas para decidir el mensaje que ve el agente,
// no el detalle técnico (ese siempre va a console.error). El detalle
// completo de Gemini nunca se muestra en pantalla: puede incluir texto
// interno de la API que no aporta nada a un agente inmobiliario y que
// solo confunde.
type CategoriaError = 'saturado' | 'limite_uso' | 'timeout' | 'configuracion' | 'formato' | 'red' | 'desconocido'

function mensajeAmigable(categoria: CategoriaError): string {
  switch (categoria) {
    case 'saturado':
      return 'El asistente de IA está muy solicitado en este momento (incluyendo los modelos de respaldo). Espera uno o dos minutos e intenta de nuevo — o llena el formulario manualmente mientras tanto.'
    case 'limite_uso':
      return 'Se alcanzó el límite de uso de la IA por ahora. Intenta de nuevo en unos minutos, o llena el formulario manualmente.'
    case 'timeout':
      return 'El asistente de IA está tardando más de lo normal en responder. Intenta de nuevo en un momento.'
    case 'configuracion':
      return 'El asistente de IA no está disponible en este momento por un problema de configuración. Puedes llenar el formulario manualmente; avísale al equipo técnico.'
    case 'formato':
      return 'El asistente de IA devolvió una respuesta que no se pudo leer. Intenta de nuevo — si el problema sigue, prueba con un texto más corto o simple.'
    case 'red':
      return 'No se pudo conectar con el asistente de IA. Revisa tu conexión e intenta de nuevo.'
    default:
      return 'No se pudo extraer la información con IA. Intenta de nuevo o llena el formulario manualmente.'
  }
}

function categoriaPorStatus(status: number): CategoriaError {
  if (status === 503) return 'saturado'
  if (status === 429) return 'limite_uso'
  if (status === 404 || status === 401 || status === 403) return 'configuracion'
  return 'desconocido'
}

function armarPrompt(textoOriginal: string): string {
  const tiposValidos = TIPOS_PROPIEDAD.map((t) => t.value).join(', ')

  return `Eres un asistente que convierte anuncios de propiedades inmobiliarias en Guatemala (texto libre, como se comparten por WhatsApp, con emojis y formato inconsistente) en datos estructurados para un CRM.

Reglas importantes:
- "tipo_propiedad" debe ser EXACTAMENTE uno de estos valores: ${tiposValidos}. Si no estás seguro, usa "casa".
- "zona" solo debe llenarse si el texto menciona una zona numerada de Ciudad de Guatemala (ej. "Zona 16" -> zona: "16", solo el número, sin la palabra "Zona"). Si la ubicación es un municipio como Fraijanes, San José Pinula, Carretera a El Salvador, etc., NO uses este campo — usa "municipio_texto" en su lugar.
- "municipio_texto" es el nombre del municipio si se menciona uno explícitamente (ej. "Fraijanes"). Si no se menciona, deja null.
- "condominio" es el nombre del residencial/condominio si el texto lo menciona (ej. "Villas de Entre Verdes", "Edificio Lirios Cayalá 1").
- "mantenimiento" SIEMPRE se expresa en quetzales (Q) en este mercado, sin importar la moneda del precio de venta/renta. Extrae solo el número, sin el símbolo.
- "bodega" y "balcon" deben ser exactamente "Si", "No", o null si el texto no lo menciona.
- "extras" debe resumir amenidades y extras mencionados (piscina, gimnasio, seguridad, amueblada, etc.) como una sola cadena separada por comas.
- "descripcion" es un párrafo breve y limpio (no una lista con viñetas) que resuma la propiedad, en español neutro, para mostrar en un portal público.
- Si el texto menciona precio de VENTA y precio de RENTA por separado con montos distintos (ej. "PRECIO VENTA US395 mil" y "Renta us1350 incluye mant"), debes devolver DOS objetos en el arreglo "propiedades": uno con tipo_operacion "venta" y su precio, otro con tipo_operacion "renta" y su precio — el resto de los campos (dormitorios, baños, área, amenidades, etc.) se repiten igual en ambos porque es la misma propiedad física.
- Si solo se menciona una operación, devuelve un solo objeto en el arreglo.
- Cualquier campo que no puedas determinar con confianza del texto: usa null. No inventes datos.

Responde ÚNICAMENTE con un objeto JSON con este formato exacto, sin texto adicional, sin markdown, sin backticks:
{
  "propiedades": [
    {
      "titulo": "<string>",
      "tipo_operacion": "venta" | "renta",
      "tipo_propiedad": "<uno de los valores permitidos>",
      "precio": <número o null>,
      "moneda": "GTQ" | "USD" | null,
      "mantenimiento": <número o null>,
      "zona": "<string o null>",
      "municipio_texto": "<string o null>",
      "sector": "<string o null>",
      "condominio": "<string o null>",
      "niveles": "<string o null>",
      "dormitorios": "<string o null>",
      "banos": "<string o null>",
      "sala": "<string o null>",
      "comedor": "<string o null>",
      "cocina": "<string o null>",
      "estudio": "<string o null>",
      "sala_familiar": "<string o null>",
      "habitacion_servicio": "<string o null>",
      "lavanderia": "<string o null>",
      "jardin": "<string o null>",
      "parqueos": <número o null>,
      "bodega": "Si" | "No" | null,
      "balcon": "Si" | "No" | null,
      "area_construccion_m2": <número o null>,
      "area_terreno_m2": <número o null>,
      "medidas_terreno": "<string o null>",
      "extras": "<string o null>",
      "mascota": "<string o null>",
      "descripcion": "<string o null>"
    }
  ]
}

Texto del anuncio a analizar:
"""
${textoOriginal}
"""`
}

function parsearJson(texto: string) {
  const limpio = texto.replace(/```json|```/g, '').trim()
  return JSON.parse(limpio)
}

export async function extraerPropiedadesDeTexto(textoOriginal: string): Promise<{
  ok: boolean
  propiedades: PropiedadExtraida[]
  mensaje?: string
}> {
  if (!GEMINI_API_KEY) {
    console.error('--- FALTA GEMINI_API_KEY_PROPIEDADES ---')
    return { ok: false, propiedades: [], mensaje: mensajeAmigable('configuracion') }
  }

  if (!textoOriginal || textoOriginal.trim().length < 10) {
    return { ok: false, propiedades: [], mensaje: 'Pega el texto completo del anuncio antes de extraer.' }
  }

  const TIMEOUT_MS = 20_000
  const prompt = armarPrompt(textoOriginal)

  // Se recuerda la categoría del último error visto (sin importar si vino
  // de un status HTTP o de una excepción) para poder mostrar, al agotar
  // todos los modelos, un mensaje coherente con lo que realmente está
  // pasando en vez de uno genérico.
  let ultimaCategoria: CategoriaError = 'desconocido'

  for (let i = 0; i < MODELOS_EN_ORDEN.length; i++) {
    const modelo = MODELOS_EN_ORDEN[i]
    const esUltimoModelo = i === MODELOS_EN_ORDEN.length - 1
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const inicio = Date.now()

    try {
      const res = await fetch(urlGemini(modelo), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingLevel: NIVEL_THINKING },
          },
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        const texto = await res.text()
        console.error(
          `--- ERROR AL LLAMAR GEMINI (extraer-propiedad, modelo ${modelo}, ${Date.now() - inicio}ms) ---`,
          res.status,
          texto
        )
        ultimaCategoria = categoriaPorStatus(res.status)
        // "saturado" (503) y "limite_uso" (429) valen la pena resolver
        // probando el siguiente modelo de la lista; el resto (404, 401,
        // 403, key inválida, etc.) es un problema de configuración que
        // no se va a resolver cambiando de modelo.
        const vale_la_pena_seguir =
          (ultimaCategoria === 'saturado' || ultimaCategoria === 'limite_uso') && !esUltimoModelo
        if (vale_la_pena_seguir) continue
        return { ok: false, propiedades: [], mensaje: mensajeAmigable(ultimaCategoria) }
      }

      return await procesarRespuestaGemini(res, modelo, inicio)
    } catch (err) {
      clearTimeout(timeoutId)
      const esAbort = err instanceof Error && err.name === 'AbortError'
      ultimaCategoria = esAbort ? 'timeout' : 'red'
      console.error(
        `--- ERROR AL EXTRAER PROPIEDAD CON IA (modelo ${modelo}, ${Date.now() - inicio}ms) ---`,
        esAbort ? `Timeout de ${TIMEOUT_MS / 1000}s` : err
      )
      if (!esUltimoModelo) continue
      return { ok: false, propiedades: [], mensaje: mensajeAmigable(ultimaCategoria) }
    }
  }

  return { ok: false, propiedades: [], mensaje: mensajeAmigable(ultimaCategoria) }
}

async function procesarRespuestaGemini(
  res: Response,
  modelo: string,
  inicio: number
): Promise<{
  ok: boolean
  propiedades: PropiedadExtraida[]
  mensaje?: string
}> {
  try {
    const data = await res.json()
    console.log(
      `[extraer-propiedad] respuesta de ${modelo} en ${Date.now() - inicio}ms`,
      JSON.stringify(data?.usageMetadata ?? {})
    )

    const contenido = data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text)
      .filter(Boolean)
      .join('')

    if (!contenido) {
      console.error('--- RESPUESTA DE GEMINI SIN CONTENIDO ---', JSON.stringify(data))
      return { ok: false, propiedades: [], mensaje: mensajeAmigable('formato') }
    }

    const resultado = parsearJson(contenido)
    const propiedades = Array.isArray(resultado.propiedades) ? resultado.propiedades : []

    if (propiedades.length === 0) {
      return { ok: false, propiedades: [], mensaje: 'No se pudo extraer ninguna propiedad de ese texto. Intenta con un texto más detallado.' }
    }

    return { ok: true, propiedades }
  } catch (err) {
    console.error('--- ERROR AL PROCESAR RESPUESTA DE GEMINI ---', err)
    return { ok: false, propiedades: [], mensaje: mensajeAmigable('formato') }
  }
}
