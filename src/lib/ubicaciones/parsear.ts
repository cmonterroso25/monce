// Extrae latitud/longitud de un link de Google Maps o Waze pegado por el
// agente. No requiere ninguna API key: solo parsea la URL. Si el link es
// corto (maps.app.goo.gl, goo.gl/maps, waze.com/ul/h...) hace un fetch para
// seguir la redirección y obtener la URL larga con las coordenadas.

function esUrlCorta(url: string): boolean {
  return /maps\.app\.goo\.gl|goo\.gl\/maps|waze\.com\/ul\/h/i.test(url)
}

async function resolverUrlCorta(url: string): Promise<string> {
  try {
    const respuesta = await fetch(url, { method: 'GET', redirect: 'follow' })
    return respuesta.url || url
  } catch (err) {
    console.error('--- ERROR AL RESOLVER URL CORTA DE UBICACION ---', err)
    return url
  }
}

function extraerCoordenadasGoogleMaps(url: string): { lat: number; lng: number } | null {
  // Formato del pin exacto dentro de la URL larga: !3dLAT!4dLNG
  let m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }

  // Formato del centro del mapa: @LAT,LNG,zoom
  m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }

  // Formato de parámetro q= o query=LAT,LNG
  m = url.match(/[?&](?:q|query)=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }

  return null
}

function extraerCoordenadasWaze(url: string): { lat: number; lng: number } | null {
  const decodificada = decodeURIComponent(url)
  const m = decodificada.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
  return null
}

export async function parsearUbicacion(
  googleMapsUrl: string | null,
  wazeUrl: string | null
): Promise<{ lat: number | null; lng: number | null }> {
  if (googleMapsUrl) {
    let url = googleMapsUrl.trim()
    if (esUrlCorta(url)) url = await resolverUrlCorta(url)
    const coords = extraerCoordenadasGoogleMaps(url)
    if (coords) return { lat: coords.lat, lng: coords.lng }
  }

  if (wazeUrl) {
    let url = wazeUrl.trim()
    if (esUrlCorta(url)) url = await resolverUrlCorta(url)
    const coords = extraerCoordenadasWaze(url)
    if (coords) return { lat: coords.lat, lng: coords.lng }
  }

  // No se pudieron extraer coordenadas de ninguno de los dos links. Se
  // guarda igual el registro (con los links) pero sin lat/lng: el mapa
  // simplemente no se mostrará hasta que se corrija el link manualmente.
  return { lat: null, lng: null }
}
