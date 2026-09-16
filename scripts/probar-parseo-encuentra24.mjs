// Prueba aislada del parser de Encuentra24 — SIN Supabase, SIN Docker.
// Misma lógica exacta que la Edge Function, para confirmar que extrae
// datos reales antes de desplegar.
// Uso: node scripts/probar-parseo-encuentra24.mjs

const USER_AGENT = 'Mozilla/5.0 (compatible; MonceScraper/1.0)'

function limpiarTextoConComentariosReact(texto) {
  return texto.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim()
}

function extraerPrecio(tarjeta) {
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

function extraerSpecs(tarjeta) {
  const spans = [...tarjeta.matchAll(/<span class="card_spec[^"]*">([\s\S]*?)<\/span>/g)]
  let dormitorios = null, banos = null, area_m2 = null
  for (const span of spans) {
    const contenido = span[1]
    const idxCierreSvg = contenido.lastIndexOf('</svg>')
    if (idxCierreSvg === -1) continue
    const textoTrasIcono = contenido.slice(idxCierreSvg + 6).trim()
    const matchNumero = textoTrasIcono.match(/^([\d.]+)/)
    if (!matchNumero) continue
    if (contenido.includes('lucide-bed')) dormitorios = matchNumero[1]
    else if (contenido.includes('lucide-bath')) banos = matchNumero[1]
    else if (contenido.includes('lucide-maximize')) area_m2 = parseFloat(matchNumero[1])
  }
  return { dormitorios, banos, area_m2 }
}

async function probar() {
  const url = 'https://www.encuentra24.com/guatemala-es/bienes-raices-alquiler-casas/guatemala-san-jose-pinula'
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  console.log('Status:', res.status)
  const html = await res.text()

  const enlaces = [...html.matchAll(/href="(\/guatemala-es\/bienes-raices-[^"]*\/(\d{6,9}))"/g)]
  console.log('Anuncios encontrados:', enlaces.length)

  for (let i = 0; i < enlaces.length; i++) {
    const [, hrefRelativo, fuenteId] = enlaces[i]
    const idxInicio = enlaces[i].index
    const idxFin = enlaces[i + 1] ? enlaces[i + 1].index : html.length
    const tarjeta = html.slice(idxInicio, idxFin)

    const { precio, moneda } = extraerPrecio(tarjeta)
    const { dormitorios, banos, area_m2 } = extraerSpecs(tarjeta)
    const matchTitulo = tarjeta.match(/class="card_title[^"]*">([\s\S]*?)<\/h3>/)
    const titulo = matchTitulo ? limpiarTextoConComentariosReact(matchTitulo[1]) : hrefRelativo

    console.log('---')
    console.log('ID:', fuenteId, '| Título:', titulo)
    console.log('Precio:', precio, moneda, '| Dorm:', dormitorios, '| Baños:', banos, '| m²:', area_m2)
  }
}

probar().catch((err) => console.error('ERROR:', err))
