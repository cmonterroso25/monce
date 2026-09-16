// Prueba aislada del parseo de Mapainmueble — SIN Supabase, SIN Docker,
// SIN Edge Functions. Solo valida si el fetch + regex extraen datos reales.
// Uso: node scripts/probar-parseo-mapainmueble.mjs

function tipoPropiedadDesdeTexto(texto) {
  const t = texto.toLowerCase()
  if (t.includes('bodega') || t.includes('ofibodega')) return t.includes('ofibodega') ? 'ofibodega' : 'bodega'
  if (t.includes('apartamento')) return 'apartamento'
  if (t.includes('terreno')) return 'terreno'
  if (t.includes('oficina')) return 'oficina'
  if (t.includes('finca')) return 'finca'
  if (t.includes('granja')) return 'granja'
  if (t.includes('local')) return 'local'
  if (t.includes('casa')) return 'casa'
  return null
}

function decodificarBloqueNumerico(bloque) {
  const matchArea = bloque.match(/([\d.,]+)\s*m²/)
  const area = matchArea ? parseFloat(matchArea[1].replace(',', '')) : null
  const antesDeArea = matchArea ? bloque.slice(0, matchArea.index) : bloque
  const tokens = antesDeArea.match(/\d+(\.\d+)?/g) ?? []
  if (tokens.length >= 3) return { dormitorios: tokens[0], banos: tokens[1], parqueos: parseInt(tokens[2], 10) || null, area_m2: area }
  if (tokens.length === 2) return { dormitorios: tokens[0], banos: tokens[1], parqueos: null, area_m2: area }
  if (tokens.length === 1) return { dormitorios: tokens[0], banos: null, parqueos: null, area_m2: area }
  return { dormitorios: null, banos: null, parqueos: null, area_m2: area }
}

async function probar() {
  const url = 'https://mapainmueble.com/san-jose-pinula'
  console.log('Fetching:', url)
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MonceScraper/1.0)' } })
  console.log('Status:', res.status)
  const html = await res.text()
  console.log('Largo del HTML recibido:', html.length, 'caracteres')

  const bloques = html.split(/(?=href="https:\/\/mapainmueble\.com\/propiedades\/)/)
  console.log('Bloques encontrados (deberían ser > 1 si el patrón de enlace es correcto):', bloques.length)

  let extraidas = 0
  for (const bloque of bloques.slice(0, 40)) {
    const matchHref = bloque.match(/href="(https:\/\/mapainmueble\.com\/propiedades\/[^"]+)"/)
    if (!matchHref) continue
    const texto = bloque.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const tipo = tipoPropiedadDesdeTexto(texto)
    if (!tipo) continue
    const operacion = /en\s+venta/i.test(texto) ? 'venta' : /en\s+alquiler|en\s+renta/i.test(texto) ? 'renta' : null
    if (!operacion) continue
    const nums = decodificarBloqueNumerico(texto)
    extraidas++
    console.log('---')
    console.log('URL:', matchHref[1])
    console.log('Tipo:', tipo, '| Operación:', operacion)
    console.log('Números decodificados:', nums)
    console.log('Texto (primeros 150 chars):', texto.slice(0, 150))
  }
  console.log('===')
  console.log(`Total propiedades extraídas correctamente: ${extraidas} de ${bloques.length - 1} bloques`)
}

probar().catch((err) => console.error('ERROR:', err))

async function verRespuestaCompleta() {
  const res = await fetch('https://mapainmueble.com/san-jose-pinula', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MonceScraper/1.0)' },
  })
  console.log('=== HEADERS DE RESPUESTA ===')
  for (const [k, v] of res.headers.entries()) console.log(`${k}: ${v}`)
  console.log('=== BODY COMPLETO ===')
  console.log(await res.text())
}
verRespuestaCompleta().catch((err) => console.error('ERROR:', err))
