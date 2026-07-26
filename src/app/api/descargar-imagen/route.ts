import { NextRequest, NextResponse } from 'next/server'

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

  const buffer = await respuesta.arrayBuffer()
  const tipo = respuesta.headers.get('content-type') ?? 'application/octet-stream'

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': tipo,
      'Content-Disposition': `attachment; filename="${nombre}"`,
    },
  })
}
