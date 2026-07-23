'use server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { clienteR2 } from './cliente'

// A diferencia de subirImagen, este helper no optimiza/comprime — los
// documentos (DPI, estados de cuenta, Infornet) deben mantener su calidad
// original para que el modelo de IA los pueda leer correctamente.
//
// Devuelve el KEY del objeto (no una URL pública): estos documentos son
// sensibles y el bucket/prefijo debe mantenerse privado. Usa
// obtenerUrlFirmada() cuando necesites una URL temporal de acceso.
export async function subirDocumento(archivo: File, carpeta: string = 'documentos') {
  const bytes = await archivo.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const extension = archivo.name.split('.').pop() || 'pdf'
  const nombreArchivo = `${carpeta}/${crypto.randomUUID()}.${extension}`
  await clienteR2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: nombreArchivo,
      Body: buffer,
      ContentType: archivo.type || 'application/octet-stream',
    })
  )
  return nombreArchivo
}
