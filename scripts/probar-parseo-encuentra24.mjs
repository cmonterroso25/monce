// Prueba aislada del parser de Encuentra24 — SIN Supabase, SIN Docker.
// Misma lógica exacta que la Edge Function, para confirmar que cada
// endpoint extrae datos reales antes de desplegar.
// Uso: node scripts/probar-parseo-encuentra24.mjs

const USER_AGENT = 'Mozilla/5.0 (compatible; MonceScraper/1.0)'

const ENDPOINTS = [
  { url: 'https://www.encuentra24.com/guatemala-es/bienes-raices-alquiler-casas/guatemala-san-jose-pinula', tipoOperacion: 'renta', tipoPropiedad: 'casa' },
  { url: 'https://www.encuentra24.com/guatemala-es/bienes-raices-alquiler-apartamentos/guatemala-san-jose-pinula', tipoOperacion: 'renta', tipoPropiedad: 'apartamento' },
  { url: 'https://www.encuentra24.com/guatemala-es/bienes-raices-alquiler-comercios/guatemala-san-jose-pinula', tipoOperacion: 'renta', tipoPropiedad: null },
  { url: 'https://www.encuentra24.com/guatemala-es/bienes-raices-venta-de-propiedades-casas/guatemala-san-jose-pinula', tipoOperacion: 'venta', tipoPropiedad: 'casa' },
  { url: 'https://www.encuentra24.com/guatemala-es/bienes-raices-venta-de-propiedades-apartamentos/guatemala-san-jose-pinula', tipoOperacion: 'venta', tipoPropiedad: 'apartamento' },
  { url: 'https://www.encuentra24.com/guatemala-es/bienes-raices-venta-de-propiedades-lotes-y-terrenos/guatemala-san-jose-pinula', tipoOperacion: 'venta', tipoPropiedad: 'terreno' },
  { url: 'https://www.encuentra24.com/guatemala-es/bienes-raices-venta-de-propiedades-comercios/guatemala-san-jose-pinula', tipoOperacion: 'venta', tipoPropiedad: null },
]

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
    const matchNumero = textoTrasIcono.match(/^([\d,]+(?:\.\d+)?)/)
    if (!matchNumero) continue
    const valorLimpio = matchNumero[1].replace(/,/g, '')
    if (contenido.includes('lucide-bed')) dormitorios = valorLimpio
    else if (contenido.includes('lucide-bath')) banos = valorLimpio
    else if (contenido.includes('lucide-maximize')) area_m2 = parseFloat(valorLimpio)
  }
  return { dormitorios, banos, area_m2 }
}

function clasificarTipoComercio(titulo) {
  const t = titulo.toLowerCase()
  if (t.includes('ofibodega') || t.includes('ofi bodega')) return 'ofibodega'
  if (t.includes('bodega')) return 'bodega'
  if (t.includes('local')) return 'local'
  return null
}

function normalizarTexto(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

async function probarEndpoint(endpoint) {
  console.log('\n=== ' + endpoint.url + ' ===')
  const res = await fetch(endpoint.url, { headers: { 'User-Agent': USER_AGENT } })
  console.log('Status:', res.status)
  if (!res.ok) {
    console.log('FALLO: respuesta no-OK, este endpoint no debería agregarse asi.')
    return
  }
  const html = await res.text()

  const enlaces = [...html.matchAll(/href="(\/guatemala-es\/bienes-raices-[^"]*\/(\d{6,9}))"/g)]
  console.log('Anuncios encontrados:', enlaces.length)

  if (enlaces.length === 0) {
    console.log('ADVERTENCIA: 0 anuncios. Puede que el regex de enlace no matchee esta categoria, o que legitimamente no haya anuncios.')
  }

  let sinPrecioNiSpecs = 0
  let descartadosPorTipo = 0

  for (let i = 0; i < enlaces.length; i++) {
    const [, hrefRelativo, fuenteId] = enlaces[i]
    const idxInicio = enlaces[i].index
    const idxFin = enlaces[i + 1] ? enlaces[i + 1].index : html.length
    const tarjeta = html.slice(idxInicio, idxFin)

    const { precio, moneda } = extraerPrecio(tarjeta)
    const { dormitorios, banos, area_m2 } = extraerSpecs(tarjeta)
    const matchTitulo = tarjeta.match(/class="card_title[^"]*">([\s\S]*?)<\/h3>/)
    const titulo = matchTitulo ? limpiarTextoConComentariosReact(matchTitulo[1]) : hrefRelativo

    const matchSubtitulo = tarjeta.match(/class="card_subtitle[^"]*">([\s\S]*?)<\/p>/)
    const subtitulo = matchSubtitulo ? limpiarTextoConComentariosReact(matchSubtitulo[1]) : '(sin subtitulo encontrado)'
    const zonaCoincide = normalizarTexto(subtitulo).includes(normalizarTexto('San José Pinula'))

    let tipoPropiedad = endpoint.tipoPropiedad
    if (tipoPropiedad === null) {
      tipoPropiedad = clasificarTipoComercio(titulo)
      if (tipoPropiedad === null) {
        descartadosPorTipo++
        continue
      }
    }

    if (precio === null && area_m2 === null) sinPrecioNiSpecs++

    console.log('---')
    console.log('ID:', fuenteId, '| Tipo:', tipoPropiedad, '| Título:', titulo)
    console.log('Subtitulo:', subtitulo, '| Zona coincide con "San José Pinula"?:', zonaCoincide)
    console.log('Precio:', precio, moneda, '| Dorm:', dormitorios, '| Baños:', banos, '| m²:', area_m2)
  }

  if (sinPrecioNiSpecs > 0) {
    console.log(`ADVERTENCIA: ${sinPrecioNiSpecs} anuncios sin precio NI area — revisar si card_price/card_spec matchea bien en esta categoria.`)
  }
  if (descartadosPorTipo > 0) {
    console.log(`Info: ${descartadosPorTipo} anuncios descartados por no poder clasificar el tipo (categoria mixta).`)
  }
}

async function probar() {
  for (const endpoint of ENDPOINTS) {
    await probarEndpoint(endpoint)
  }
}

probar().catch((err) => console.error('ERROR:', err))
