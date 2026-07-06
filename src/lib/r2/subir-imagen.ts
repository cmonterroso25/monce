'use server'

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { clienteR2 } from './cliente'

export async function subirImagen(archivo: File, carpeta: string = 'propiedades') {
  const bytes = await archivo.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const extension = archivo.name.split('.').pop()
  const nombreArchivo = `${carpeta}/${crypto.randomUUID()}.${extension}`

  await clienteR2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: nombreArchivo,
      Body: buffer,
      ContentType: archivo.type,
    })
  )

  const urlPublica = `${process.env.R2_PUBLIC_URL}/${nombreArchivo}`
  return urlPublica
}
