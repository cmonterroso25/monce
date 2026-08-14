import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import sharp from 'sharp'
export const runtime = 'nodejs'
const R2_PUBLIC_URL = 'https://pub-55c4b2ef6141404ea53237416303a621.r2.dev'
export async function POST(request: NextRequest) {
  let body: { urls?: unknown; nombreBase?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  const urls = body.urls
  const nombreBase = typeof body.nombreBase === 'string' && body.nombreBase.trim() ? body.nombreBase : 'fotos'
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: 'Sin imágenes' }, { status: 400 })
  }
  if (urls.some((u) => typeof u !== 'string' || !u.startsWith(R2_PUBLIC_URL))) {
    return NextResponse.json({ error: 'URL no permitida' }, { status: 400 })
  }
  const zip = new JSZip()
  const resultados = await Promise.allSettled(
    (urls as string[]).map(async (url, i) => {
      const respuesta = await fetch(url)
      if (!respuesta.ok) throw new Error(`No se pudo obtener ${url}`)
      const bufferOriginal = Buffer.from(await respuesta.arrayBuffer())
      const tipoOriginal = respuesta.headers.get('content-type') ?? ''
      // Mismo motivo que en descargar-imagen/route.ts: las imágenes se
      // guardan en R2 como WebP, pero Messenger y apps similares solo
      // aceptan JPG como adjunto de foto. Se convierte cada imagen del
      // ZIP a JPG antes de empaquetarla.
      let buffer: Buffer = bufferOriginal
      let extension = url.split('.').pop()?.split('?')[0] || 'webp'
      if (tipoOriginal.startsWith('image/') && tipoOriginal !== 'image/jpeg') {
        try {
          buffer = await sharp(bufferOriginal).jpeg({ quality: 90 }).toBuffer()
          extension = 'jpg'
        } catch (err) {
          console.error(`No se pudo convertir ${url} a JPG, se agrega el original:`, err)
        }
      }
      zip.file(`${nombreBase}-${i + 1}.${extension}`, buffer)
    })
  )
  const fallidas = resultados.filter((r) => r.status === 'rejected').length
  if (fallidas === resultados.length) {
    return NextResponse.json({ error: 'No se pudo descargar ninguna imagen' }, { status: 502 })
  }
  const contenido = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  return new NextResponse(contenido, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${nombreBase}.zip"`,
    },
  })
}
