import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { clienteR2 } from './cliente'

// A diferencia de obtenerUrlFirmada (lectura), esta genera una URL firmada
// de escritura (PUT) para que el navegador suba el archivo directo a R2,
// sin que los bytes pasen por la función de Vercel — evita el límite de
// 4.5MB por request de los Server Actions en Vercel.
export async function obtenerUrlSubida(key: string, contentType: string, expiraEnSegundos = 300) {
  const comando = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(clienteR2, comando, { expiresIn: expiraEnSegundos })
}
