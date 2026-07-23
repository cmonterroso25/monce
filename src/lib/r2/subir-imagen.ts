'use server'

import sharp from 'sharp'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { clienteR2 } from './cliente'

const MAX_ANCHO = 1600
const MAX_ALTO = 1600
const CALIDAD_WEBP = 75

export async function subirImagen(archivo: File, carpeta: string = 'propiedades') {
  const bytes = await archivo.arrayBuffer()
  let buffer = Buffer.from(bytes)
  let contentType = archivo.type
  let extension = archivo.name.split('.').pop() || 'jpg'

  if (archivo.type.startsWith('image/')) {
    try {
      buffer = await sharp(buffer)
        .resize(MAX_ANCHO, MAX_ALTO, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: CALIDAD_WEBP })
        .toBuffer()
      contentType = 'image/webp'
      extension = 'webp'
    } catch (err) {
      // Si sharp falla (formato raro, archivo corrupto), se sube el original sin optimizar
      console.error('No se pudo optimizar la imagen, subiendo original:', err)
    }
  }

  const nombreArchivo = `${carpeta}/${crypto.randomUUID()}.${extension}`

  await clienteR2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: nombreArchivo,
      Body: buffer,
      ContentType: contentType,
    })
  )

  const urlPublica = `${process.env.R2_PUBLIC_URL}/${nombreArchivo}`
  return urlPublica
}

export async function eliminarImagenR2(rutaAlmacenamiento: string) {
  const urlPublica = process.env.R2_PUBLIC_URL
  let key = rutaAlmacenamiento

  // ruta_almacenamiento se guarda como URL pública completa; hay que
  // extraer solo la Key (lo que va después del dominio) para borrar en R2.
  if (urlPublica && rutaAlmacenamiento.startsWith(urlPublica)) {
    key = rutaAlmacenamiento.slice(urlPublica.length).replace(/^\//, '')
  }

  await clienteR2.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    })
  )
}
