// Scraper de propiedades externas (inventario paralelo, sección "prospección
// / captación" — NO es el motor de CMA de generar-cma). Corre por cron
// externo, recorre los portales configurados en PORTAL_ADAPTERS, y
// escribe/actualiza filas en public.propiedades_externas usando el
// service role (bypassa RLS).
//
// Mismo patrón de fondo que generar-cma: responde 200 de inmediato y
// procesa en background con EdgeRuntime.waitUntil.
//
// SEGURIDAD: valida un secreto compartido en el header x-scraper-secret
// (SCRAPER_TRIGGER_SECRET) en vez de verify_jwt, porque la dispara un
// scheduler, no el usuario final.
//
// ESTADO DE CADA ADAPTADOR (actualizado con pruebas reales, no supuestos):
//   - encuentra24: IMPLEMENTADO, expandido el 16 sept 2026 para cubrir
//     venta + renta, varios tipos de propiedad, solo San José Pinula.
//     Cobertura por endpoint (ver ENCUENTRA24_ENDPOINTS):
//       - renta-casas: VERIFICADO end-to-end con node script contra HTML
//         real (16 sept 2026, 20 anuncios, specs coherentes).
//       - renta-apartamentos, renta-comercios, venta-casas,
//         venta-apartamentos, venta-terrenos, venta-comercios: URLs
//         confirmadas reales (fetch/búsqueda con contenido genuino de
//         San José Pinula), pero el parseo por regex (card_price/
//         card_spec/card_title) NO se ha corrido contra el HTML crudo de
//         estas categorías específicas — se asume que reutilizan el
//         mismo componente de tarjeta que renta-casas (mismo dominio,
//         mismo diseño), pero eso es una inferencia, no una verificación
//         directa. CORRER scripts/probar-parseo-encuentra24.mjs contra
//         cada endpoint antes de confiar en los datos que produzcan.
//       - fincas, oficinas (venta y renta), lotes-y-terrenos en renta:
//         NO incluidos. Solo se vieron como links de navegación lateral,
//         nunca se confirmó contenido real filtrado a San José Pinula.
//         No agregar sin verificar con fetch real primero.
//   - mapainmueble: BLOQUEADO. Confirmado con fetch real: Cloudflare
//     Managed Challenge (cf-mitigated: challenge, HTML "Just a moment...").
//     Un fetch() simple nunca pasa esto. Se deja la función pero retorna
//     [] de inmediato para no gastar la llamada de red en vano. Requiere
//     Cloudflare Browser Rendering u otro navegador headless — fuera del
//     alcance de esta Edge Function.
//   - citymax, bienesonline, mappi: NO VERIFICADOS. Sin lógica de parseo.
//
// CLASIFICACIÓN DE TIPO EN CATEGORÍAS MIXTAS ("comercios"):
//   Encuentra24 agrupa bodega, ofibodega y local comercial bajo una sola
//   categoría ("Locales comerciales y bodegas"). No hay forma de separar
//   por slug de URL, así que se clasifica por texto del título con
//   clasificarTipoComercio(). Si el título no menciona ninguna palabra
//   reconocible, la propiedad se descarta (no se adivina el tipo).
//
// LÓGICA DE PERSISTENCIA (guardarPropiedades):
//   - precio_anterior: antes de sobreescribir `precio`, se consulta el
//     valor guardado. Si cambió, ese valor viejo pasa a precio_anterior.
//     Si no cambió, se conserva el precio_anterior que ya existiera (no
//     se borra el último cambio conocido solo porque esta corrida no
//     trajo cambio nuevo).
//   - hash_duplicado: clave compuesta normalizada (operación + tipo +
//     zona sin acentos + bucket de área cada 10m² + bucket de precio
//     cada 500 en su moneda). No es un hash criptográfico, es una clave
//     de agrupación legible para detectar el mismo inmueble publicado en
//     varios portales vía `group by hash_duplicado`.
//   - estado_publicacion (activo -> posible_baja -> eliminado): en cada
//     corrida, todo lo encontrado se marca 'activo' explícitamente
//     (revierte un 'posible_baja' si el anuncio reapareció). Lo que
//     existía como 'activo' y ya no aparece pasa a 'posible_baja'; lo
//     que ya estaba en 'posible_baja' y sigue sin aparecer pasa a
//     'eliminado'. Así una baja real toma 2 corridas en confirmarse,
//     evitando falsos positivos por un fetch fallido puntual.
//   LIMITACIÓN CONOCIDA: si un adaptador devuelve [] (por bloqueo, error
//   de red no lanzado como excepción, o legítimamente cero anuncios ese
//   día), guardarPropiedades no corre la detección de bajas para ese
//   portal — devuelve 0 de inmediato. Se prefiere no marcar todo el
//   inventario de un portal como baja ante un fetch vacío ambiguo.
//   IMPORTANTE: esta detección de bajas es POR PORTAL, no por endpoint.
//   Si un solo endpoint de Encuentra24 (ej. venta-terrenos) falla pero
//   los demás endpoints del mismo portal sí traen datos, las
//   propiedades de ese endpoint fallido NO se marcarán como posible_baja
//   en esta corrida, porque `conFuenteId` mezcla resultados de todos los
//   endpoints del portal antes de comparar contra lo existente.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SCRAPER_TRIGGER_SECRET = Deno.env.get('SCRAPER_TRIGGER_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const USER_AGENT = 'Mozilla/5.0 (compatible; MonceScraper/1.0)'

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

type TipoOperacion = 'venta' | 'renta'

type TipoPropiedad =
  | 'casa' | 'apartamento' | 'terreno' | 'bodega' | 'ofibodega'
  | 'oficina' | 'finca' | 'granja' | 'local'

type EstadoPublicacion = 'activo' | 'posible_baja' | 'eliminado'

type PropiedadExternaCruda = {
  fuente_portal: string
  fuente_id: string | null
  fuente_url: string
  tipo_operacion: TipoOperacion
  tipo_propiedad: TipoPropiedad
  titulo: string
  precio: number | null
  moneda: string | null
  zona_municipio: string
  condominio_sector: string | null
  dormitorios: string | null
  banos: string | null
  parqueos: number | null
  area_construccion_m2: number | null
  area_terreno_m2: number | null
  atributos_extra: Record<string, unknown>
}

type ResultadoPortal = {
  portal: string
  ok: boolean
  propiedades_encontradas: number
  posibles_bajas?: number
  eliminadas?: number
  error?: string
}

// ---------------------------------------------------------------------
// Adaptador: Encuentra24
// ---------------------------------------------------------------------
//
// Estructura real confirmada (16 sept 2026) por tarjeta de anuncio, en
// la categoría alquiler-casas:
//   href="/guatemala-es/bienes-raices-<slug>/<titulo-slug>/<id-numerico>"
//   <span class="card_price ...">Q<!-- --> <!-- -->6,000</span>
//   <p class="card_subtitle ...">Guatemala, San José Pinula</p>
//   <span class="card_spec ..."><svg class="lucide-bed ...">...</svg>3 Recámaras</span>
//   <span class="card_spec ..."><svg class="lucide-bath ...">...</svg>2.5 Baños</span>
//   <span class="card_spec ..."><svg class="lucide-maximize... ...">...</svg>183 m²</span>
//   <h3 class="card_title ...">Alquilo Casa En San José Pinula</h3>
//
// No se vio ícono de parqueos en las tarjetas de listado — queda null
// salvo que aparezca en algún caso; no se adivina.
//
// Para categorías distintas a alquiler-casas (apartamentos, comercios,
// terrenos, venta-*): se asume el mismo componente de tarjeta por ser
// el mismo dominio/diseño, PERO esto no se ha corrido contra HTML real
// de esas categorías específicas. Verificar con
// scripts/probar-parseo-encuentra24.mjs antes de confiar en los datos.

type EndpointEncuentra24 = {
  url: string
  tipoOperacion: TipoOperacion
  // null = categoría mixta (ej. "comercios" agrupa bodega/ofibodega/local),
  // se clasifica por título con clasificarTipoComercio(). Si no matchea,
  // la propiedad se descarta en vez de adivinar el tipo.
  tipoPropiedad: TipoPropiedad | null
  zonaMunicipio: string
}

// Solo se agregan aquí endpoints con URL confirmada por fetch/búsqueda
// real (contenido genuino de San José Pinula, no adivinado por analogía
// de slug). Ver comentario de cabecera para el detalle de qué se
// verificó end-to-end (parseo) vs. solo la existencia de la URL.
const ENCUENTRA24_ENDPOINTS: EndpointEncuentra24[] = [
  // --- Renta / Alquiler ---
  {
    url: 'https://www.encuentra24.com/guatemala-es/bienes-raices-alquiler-casas/guatemala-san-jose-pinula',
    tipoOperacion: 'renta',
    tipoPropiedad: 'casa',
    zonaMunicipio: 'San José Pinula',
  },
  {
    url: 'https://www.encuentra24.com/guatemala-es/bienes-raices-alquiler-apartamentos/guatemala-san-jose-pinula',
    tipoOperacion: 'renta',
    tipoPropiedad: 'apartamento',
    zonaMunicipio: 'San José Pinula',
  },
  {
    url: 'https://www.encuentra24.com/guatemala-es/bienes-raices-alquiler-comercios/guatemala-san-jose-pinula',
    tipoOperacion: 'renta',
    tipoPropiedad: null,
    zonaMunicipio: 'San José Pinula',
  },

  // --- Venta ---
  {
    url: 'https://www.encuentra24.com/guatemala-es/bienes-raices-venta-de-propiedades-casas/guatemala-san-jose-pinula',
    tipoOperacion: 'venta',
    tipoPropiedad: 'casa',
    zonaMunicipio: 'San José Pinula',
  },
  {
    url: 'https://www.encuentra24.com/guatemala-es/bienes-raices-venta-de-propiedades-apartamentos/guatemala-san-jose-pinula',
    tipoOperacion: 'venta',
    tipoPropiedad: 'apartamento',
    zonaMunicipio: 'San José Pinula',
  },
  {
    url: 'https://www.encuentra24.com/guatemala-es/bienes-raices-venta-de-propiedades-lotes-y-terrenos/guatemala-san-jose-pinula',
    tipoOperacion: 'venta',
    tipoPropiedad: 'terreno',
    zonaMunicipio: 'San José Pinula',
  },
  {
    url: 'https://www.encuentra24.com/guatemala-es/bienes-raices-venta-de-propiedades-comercios/guatemala-san-jose-pinula',
    tipoOperacion: 'venta',
    tipoPropiedad: null,
    zonaMunicipio: 'San José Pinula',
  },

  // TODO (verificar con fetch real antes de agregar, no adivinar):
  // - bienes-raices-venta-de-propiedades-fincas/guatemala-san-jose-pinula
  // - bienes-raices-venta-de-propiedades-oficinas/guatemala-san-jose-pinula
  // - bienes-raices-alquiler-lotes-y-terrenos/guatemala-san-jose-pinula
  //   (la categoria general "alquiler-lotes-y-terrenos" existe y trae
  //   resultados de SJP mezclados con otros municipios, pero no se
  //   confirmo la URL filtrada especificamente a San Jose Pinula)
  // - bienes-raices-alquiler-fincas y bienes-raices-alquiler-oficinas
  //   (no confirmados en absoluto)
]

function limpiarTextoConComentariosReact(texto: string): string {
  // React SSR intercala <!-- --> entre nodos de texto (ej. "Q<!-- --> <!-- -->6,000")
  return texto.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim()
}

function extraerPrecio(tarjeta: string): { precio: number | null; moneda: string | null } {
  const match = tarjeta.match(/class="card_price[^"]*">([\s\S]*?)<\/span>/)
  if (!match) return { precio: null, moneda: null }
  const limpio = limpiarTextoConComentariosReact(match[1])
  const matchNumero = limpio.match(/([Q$])\s*([\d,]+(?:\.\d+)?)/)
  if (!matchNumero) return { precio: null, moneda: null }
  return {
    precio: parseFloat(matchNumero[2].replace(/,/g, '')),
    moneda: matchNumero[1] === 'Q' ? 'GTQ' : 'USD',
  }
}

function extraerSpecs(tarjeta: string): {
  dormitorios: string | null
  banos: string | null
  area_m2: number | null
} {
  const spans = [...tarjeta.matchAll(/<span class="card_spec[^"]*">([\s\S]*?)<\/span>/g)]
  let dormitorios: string | null = null
  let banos: string | null = null
  let area_m2: number | null = null

  for (const span of spans) {
    const contenido = span[1]
    const idxCierreSvg = contenido.lastIndexOf('</svg>')
    if (idxCierreSvg === -1) continue
    const textoTrasIcono = contenido.slice(idxCierreSvg + 6).trim()
    // Incluye la coma de miles en el match (ej. "80,000 m2"); se limpia
    // antes de convertir a numero. Sin esto, terrenos con area >= 1000
    // se truncaban en la primera coma (bug detectado el 16 sept 2026
    // via scripts/probar-parseo-encuentra24.mjs: "80,000 m2" -> 80).
    const matchNumero = textoTrasIcono.match(/^([\d,]+(?:\.\d+)?)/)
    if (!matchNumero) continue
    const valorLimpio = matchNumero[1].replace(/,/g, '')

    if (contenido.includes('lucide-bed')) dormitorios = valorLimpio
    else if (contenido.includes('lucide-bath')) banos = valorLimpio
    else if (contenido.includes('lucide-maximize')) area_m2 = parseFloat(valorLimpio)
  }

  return { dormitorios, banos, area_m2 }
}

// Clasifica el tipo de propiedad para la categoría mixta "comercios"
// (Locales comerciales y bodegas). No adivina: si el título no
// menciona ninguna palabra reconocible, retorna null y la propiedad
// se descarta en el llamador.
function clasificarTipoComercio(titulo: string): TipoPropiedad | null {
  const t = titulo.toLowerCase()
  // "Ofi Bodega En Renta..." (con espacio) tambien cuenta como ofibodega -
  // encontrado el 16 sept 2026 via probar-parseo-encuentra24.mjs, se
  // estaba clasificando como 'bodega' a secas.
  if (t.includes('ofibodega') || t.includes('ofi bodega')) return 'ofibodega'
  if (t.includes('bodega')) return 'bodega'
  if (t.includes('local')) return 'local'
  return null
}

async function scrapearEncuentra24(): Promise<PropiedadExternaCruda[]> {
  const resultados: PropiedadExternaCruda[] = []

  for (const endpoint of ENCUENTRA24_ENDPOINTS) {
    const res = await fetch(endpoint.url, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) {
      console.error(`--- ENCUENTRA24: respuesta no-OK (${res.status}) para ${endpoint.url} ---`)
      continue
    }
    const html = await res.text()
    const enlaces = [...html.matchAll(/href="(\/guatemala-es\/bienes-raices-[^"]*\/(\d{6,9}))"/g)]

    for (let i = 0; i < enlaces.length; i++) {
      const [, hrefRelativo, fuenteId] = enlaces[i]
      const idxInicio = enlaces[i].index!
      const idxFin = enlaces[i + 1] ? enlaces[i + 1].index! : html.length
      const tarjeta = html.slice(idxInicio, idxFin)

      const { precio, moneda } = extraerPrecio(tarjeta)
      const { dormitorios, banos, area_m2 } = extraerSpecs(tarjeta)

      const matchTitulo = tarjeta.match(/class="card_title[^"]*">([\s\S]*?)<\/h3>/)
      const titulo = matchTitulo ? limpiarTextoConComentariosReact(matchTitulo[1]) : hrefRelativo

      // El filtro de municipio de Encuentra24 no es estricto: devuelve
      // anuncios "similares" de municipios cercanos (Santa Catarina
      // Pinula, Muxbal, Zona 10, etc.) aunque la URL este filtrada a
      // San Jose Pinula. Se descarta cualquier tarjeta cuyo subtitulo de
      // ubicacion no mencione la zona esperada, en vez de guardar
      // propiedades fuera de la zona de interes con la etiqueta
      // incorrecta.
      const matchSubtitulo = tarjeta.match(/class="card_subtitle[^"]*">([\s\S]*?)<\/p>/)
      const subtitulo = matchSubtitulo ? limpiarTextoConComentariosReact(matchSubtitulo[1]) : ''
      if (!normalizarTexto(subtitulo).includes(normalizarTexto(endpoint.zonaMunicipio))) {
        continue
      }

      let tipoPropiedad: TipoPropiedad | null = endpoint.tipoPropiedad
      if (tipoPropiedad === null) {
        tipoPropiedad = clasificarTipoComercio(titulo)
        if (tipoPropiedad === null) {
          // No se pudo determinar el tipo con certeza — se descarta en
          // vez de adivinar (misma disciplina que el resto del proyecto).
          continue
        }
      }

      resultados.push({
        fuente_portal: 'encuentra24',
        fuente_id: fuenteId,
        fuente_url: `https://www.encuentra24.com${hrefRelativo}`,
        tipo_operacion: endpoint.tipoOperacion,
        tipo_propiedad: tipoPropiedad,
        titulo,
        precio,
        moneda,
        zona_municipio: endpoint.zonaMunicipio,
        condominio_sector: null,
        dormitorios,
        banos,
        parqueos: null, // no se vio ícono de parqueos en la tarjeta de listado
        area_construccion_m2: area_m2,
        area_terreno_m2: null,
        atributos_extra: {},
      })
    }
  }

  return resultados
}

// ---------------------------------------------------------------------
// Adaptador: Mapainmueble — BLOQUEADO (Cloudflare Managed Challenge)
// ---------------------------------------------------------------------

async function scrapearMapainmueble(): Promise<PropiedadExternaCruda[]> {
  // Confirmado con fetch real el 16 sept 2026: 403 + cf-mitigated: challenge.
  // No tiene sentido reintentar con fetch() simple — se necesita un
  // navegador headless (Cloudflare Browser Rendering u otro), que no
  // corre dentro de una Edge Function de Supabase (Deno). Se retorna []
  // de inmediato para no gastar la llamada de red en cada corrida hasta
  // que se decida esa pieza de arquitectura aparte.
  return []
}

// ---------------------------------------------------------------------
// Adaptadores pendientes — sin verificar, sin lógica de parseo
// ---------------------------------------------------------------------

async function scrapearCityMax(): Promise<PropiedadExternaCruda[]> {
  // TODO: sin verificar con fetch real. Dos dominios independientes
  // (citymax-gt.com, citymax-mix.com) — franquicias separadas.
  return []
}

async function scrapearBienesOnline(): Promise<PropiedadExternaCruda[]> {
  // TODO: sin verificar con fetch real. Confirmar dominio estable
  // (bienesonline.ai vs guatemala.bienesonline.com) antes de implementar.
  return []
}

async function scrapearMappi(): Promise<PropiedadExternaCruda[]> {
  // TODO: NO implementable como fetch simple — SPA renderizada por JS.
  return []
}

// ---------------------------------------------------------------------
// Registro de adaptadores
// ---------------------------------------------------------------------

const PORTAL_ADAPTERS: { nombre: string; fn: () => Promise<PropiedadExternaCruda[]> }[] = [
  { nombre: 'encuentra24', fn: scrapearEncuentra24 },
  { nombre: 'mapainmueble', fn: scrapearMapainmueble },
  { nombre: 'citymax', fn: scrapearCityMax },
  { nombre: 'bienesonline', fn: scrapearBienesOnline },
  { nombre: 'mappi', fn: scrapearMappi },
]

// ---------------------------------------------------------------------
// hash_duplicado: clave de agrupación normalizada (no criptográfica)
// ---------------------------------------------------------------------

function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function calcularHashDuplicado(p: PropiedadExternaCruda): string {
  const zona = normalizarTexto(p.zona_municipio)
  const areaBucket =
    p.area_construccion_m2 != null ? `m${Math.round(p.area_construccion_m2 / 10) * 10}` : 'm_na'
  const precioBucket =
    p.precio != null && p.moneda ? `${p.moneda}${Math.round(p.precio / 500) * 500}` : 'precio_na'
  return `${p.tipo_operacion}|${p.tipo_propiedad}|${zona}|${areaBucket}|${precioBucket}`
}

// ---------------------------------------------------------------------
// Persistencia: upsert por (fuente_portal, fuente_id) + precio_anterior
// + hash_duplicado + ciclo de vida de estado_publicacion
// ---------------------------------------------------------------------

type FilaExistente = {
  id: string
  fuente_id: string
  precio: number | null
  precio_anterior: number | null
  estado_publicacion: EstadoPublicacion
}

async function guardarPropiedades(
  portal: string,
  propiedades: PropiedadExternaCruda[]
): Promise<{ guardadas: number; posiblesBajas: number; eliminadas: number }> {
  if (propiedades.length === 0) return { guardadas: 0, posiblesBajas: 0, eliminadas: 0 }

  const conFuenteId = propiedades.filter((p) => p.fuente_id !== null)
  const sinFuenteId = propiedades.filter((p) => p.fuente_id === null)

  let guardadas = 0
  let posiblesBajas = 0
  let eliminadas = 0

  if (conFuenteId.length > 0) {
    // Trae el estado actual de todo lo que este portal tiene registrado
    // (para comparar precio y para detectar qué ya no aparece).
    const { data: existentes, error: errorConsulta } = await supabase
      .from('propiedades_externas')
      .select('id, fuente_id, precio, precio_anterior, estado_publicacion')
      .eq('fuente_portal', portal)
      .not('fuente_id', 'is', null)

    if (errorConsulta) {
      throw new Error(`Consultando existentes de ${portal}: ${errorConsulta.message}`)
    }

    const mapaExistentes = new Map<string, FilaExistente>(
      (existentes as FilaExistente[]).map((e) => [e.fuente_id, e])
    )

    const filas = conFuenteId.map((p) => {
      const existente = mapaExistentes.get(p.fuente_id!)
      const precioAnterior = existente
        ? existente.precio !== null && existente.precio !== p.precio
          ? existente.precio
          : existente.precio_anterior
        : null

      return {
        ...p,
        precio_anterior: precioAnterior,
        hash_duplicado: calcularHashDuplicado(p),
        estado_publicacion: 'activo' as EstadoPublicacion, // revierte posible_baja si reapareció
        ultima_actualizacion: new Date().toISOString(),
      }
    })

    const { error: errorUpsert, count } = await supabase
      .from('propiedades_externas')
      .upsert(filas, { onConflict: 'fuente_portal,fuente_id', count: 'exact' })

    if (errorUpsert) {
      throw new Error(`Guardando propiedades con fuente_id de ${portal}: ${errorUpsert.message}`)
    }
    guardadas += count ?? filas.length

    // Detección de bajas: lo que existía y no vino en esta corrida.
    const idsEncontrados = new Set(conFuenteId.map((p) => p.fuente_id!))
    const noEncontrados = (existentes as FilaExistente[]).filter(
      (e) => !idsEncontrados.has(e.fuente_id)
    )

    const idsPosibleBaja = noEncontrados.filter((e) => e.estado_publicacion === 'activo').map((e) => e.id)
    const idsEliminar = noEncontrados
      .filter((e) => e.estado_publicacion === 'posible_baja')
      .map((e) => e.id)

    if (idsPosibleBaja.length > 0) {
      const { error } = await supabase
        .from('propiedades_externas')
        .update({ estado_publicacion: 'posible_baja', ultima_actualizacion: new Date().toISOString() })
        .in('id', idsPosibleBaja)
      if (error) throw new Error(`Marcando posible_baja en ${portal}: ${error.message}`)
      posiblesBajas = idsPosibleBaja.length
    }

    if (idsEliminar.length > 0) {
      const { error } = await supabase
        .from('propiedades_externas')
        .update({ estado_publicacion: 'eliminado', ultima_actualizacion: new Date().toISOString() })
        .in('id', idsEliminar)
      if (error) throw new Error(`Marcando eliminado en ${portal}: ${error.message}`)
      eliminadas = idsEliminar.length
    }
  }

  if (sinFuenteId.length > 0) {
    // Sin fuente_id no hay forma de rastrear el mismo anuncio entre
    // corridas, así que siempre se inserta como nuevo: no aplica
    // precio_anterior (no hay versión previa que comparar) ni
    // detección de baja (no se puede volver a identificar).
    const filas = sinFuenteId.map((p) => ({
      ...p,
      precio_anterior: null,
      hash_duplicado: calcularHashDuplicado(p),
      estado_publicacion: 'activo' as EstadoPublicacion,
      ultima_actualizacion: new Date().toISOString(),
    }))

    const { error, count } = await supabase
      .from('propiedades_externas')
      .insert(filas, { count: 'exact' })

    if (error) {
      throw new Error(`Guardando propiedades sin fuente_id de ${portal}: ${error.message}`)
    }
    guardadas += count ?? filas.length
  }

  return { guardadas, posiblesBajas, eliminadas }
}

// ---------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------

async function procesarScraping(): Promise<ResultadoPortal[]> {
  const resultados: ResultadoPortal[] = []

  for (const adaptador of PORTAL_ADAPTERS) {
    try {
      const propiedades = await adaptador.fn()
      const { guardadas, posiblesBajas, eliminadas } = await guardarPropiedades(
        adaptador.nombre,
        propiedades
      )
      resultados.push({
        portal: adaptador.nombre,
        ok: true,
        propiedades_encontradas: guardadas,
        posibles_bajas: posiblesBajas,
        eliminadas,
      })
    } catch (err) {
      console.error(`--- ERROR AL SCRAPEAR PORTAL: ${adaptador.nombre} ---`, err)
      resultados.push({
        portal: adaptador.nombre,
        ok: false,
        propiedades_encontradas: 0,
        error: err instanceof Error ? err.message : 'Error desconocido',
      })
    }
  }

  console.log('--- RESUMEN SCRAPING PROPIEDADES EXTERNAS ---', JSON.stringify(resultados))
  return resultados
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), { status: 405 })
  }

  const secretRecibido = req.headers.get('x-scraper-secret')
  if (secretRecibido !== SCRAPER_TRIGGER_SECRET) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 })
  }

  // @ts-ignore EdgeRuntime es global en el runtime de Supabase Edge Functions
  EdgeRuntime.waitUntil(procesarScraping())

  return new Response(JSON.stringify({ ok: true, mensaje: 'Scraping iniciado en background' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
