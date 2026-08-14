import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
export const runtime = 'nodejs'
const R2_PUBLIC_URL = 'https://pub-55c4b2ef6141404ea53237416303a621.r2.dev'
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  const nombre = request.nextUrl.searchParams.get('nombre') ?? 'imagen'
  if (!url || !url.startsWith(R2_PUBLIC_URL)) {
    return NextResponse.json({ error: 'URL no permitida' }, { status: 400 })
  }
  const respuesta = await fetch(url)
  if (!respuesta.ok) {
    return NextResponse.json({ error: 'No se pudo obtener la imagen' }, { status: 502 })
  }
  const bufferOriginal = Buffer.from(await respuesta.arrayBuffer())
  const tipoOriginal = respuesta.headers.get('content-type') ?? ''
  // Las imágenes se guardan en R2 como WebP (ver src/lib/r2/subir-imagen.ts).
  // Messenger (y otras apps de mensajería) no aceptan WebP como adjunto de
  // foto, solo JPG. Se convierte aquí, al momento de la descarga, para no
  // afectar el formato de almacenamiento usado por el sitio/portal público.
  let buffer: Buffer = bufferOriginal
  let tipo = tipoOriginal || 'application/octet-stream'
  let nombreFinal = nombre
  if (tipoOriginal.startsWith('image/') && tipoOriginal !== 'image/jpeg') {
    try {
      buffer = await sharp(bufferOriginal).jpeg({ quality: 90 }).toBuffer()
      tipo = 'image/jpeg'
      nombreFinal = nombre.replace(/\.[^./]+$/, '') + '.jpg'
    } catch (err) {
      console.error('No se pudo convertir la imagen a JPG, se entrega el original:', err)
    }
  }
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': tipo,
      'Content-Disposition': `attachment; filename="${nombreFinal}"`,
    },
  })
}
