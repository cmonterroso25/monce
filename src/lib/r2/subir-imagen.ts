'use server'

import sharp from 'sharp'
import { PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3'
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

// Copia un objeto ya existente en R2 hacia la carpeta de otra propiedad,
// sin volver a pasar el archivo por el navegador del agente. Se usa al
// duplicar una propiedad para la operación alterna (venta<->renta) desde
// el mismo texto de anuncio, para no obligar a subir las fotos dos veces
// y para que cada propiedad tenga su propio objeto físico en R2 (si se
// borra una propiedad, la otra no se queda con la foto rota).
export async function copiarImagenR2(rutaAlmacenamientoOrigen: string, nuevoPropiedadId: string) {
  const urlPublica = process.env.R2_PUBLIC_URL
  let keyOrigen = rutaAlmacenamientoOrigen

  if (urlPublica && rutaAlmacenamientoOrigen.startsWith(urlPublica)) {
    keyOrigen = rutaAlmacenamientoOrigen.slice(urlPublica.length).replace(/^\//, '')
  }

  const extension = keyOrigen.split('.').pop() || 'webp'
  const keyDestino = `propiedades/${nuevoPropiedadId}/${crypto.randomUUID()}.${extension}`

  await clienteR2.send(
    new CopyObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      // Los "/" deben quedar literales en CopySource; solo se codifican
      // los caracteres especiales dentro de cada segmento.
      CopySource: `${process.env.R2_BUCKET_NAME}/${encodeURIComponent(keyOrigen).replace(/%2F/g, '/')}`,
      Key: keyDestino,
    })
  )

  return `${process.env.R2_PUBLIC_URL}/${keyDestino}`
}
