// Prueba rápida: ¿este portal bloquea un fetch() simple con challenge de Cloudflare?
// Uso: node scripts/probar-fetch-simple.mjs "<url>"

const url = process.argv[2]
if (!url) {
  console.error('Uso: node scripts/probar-fetch-simple.mjs "<url>"')
  process.exit(1)
}

const res = await fetch(url, {
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MonceScraper/1.0)' },
})
console.log('Status:', res.status)
console.log('cf-mitigated:', res.headers.get('cf-mitigated') ?? '(no presente)')
console.log('server:', res.headers.get('server') ?? '(no presente)')
const body = await res.text()
console.log('Largo del body:', body.length)
console.log('¿Contiene "Just a moment"?', body.includes('Just a moment'))
console.log('¿Contiene "/propiedades/" o similar patrón de anuncio?', /\/propiedades\/|\/casa|\/alquiler/i.test(body))
