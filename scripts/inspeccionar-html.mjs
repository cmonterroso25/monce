import { writeFileSync } from 'node:fs'

const url = process.argv[2]
const res = await fetch(url, {
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MonceScraper/1.0)' },
})
const html = await res.text()
writeFileSync('/tmp/pagina-descargada.html', html)

const regex = /href="([^"]*bienes-raices[^"]*\/(\d{6,9}))"/g
const matches = [...html.matchAll(regex)]

const idxLink = matches[0].index
const idxSiguienteLink = matches[1] ? matches[1].index : html.length
const tarjetaCompleta = html.slice(idxLink, idxSiguienteLink)

const idxSpecs = tarjetaCompleta.indexOf('card_specs')
console.log('=== BLOQUE card_specs COMPLETO (2500 chars) ===')
console.log(tarjetaCompleta.slice(idxSpecs, idxSpecs + 2500))
