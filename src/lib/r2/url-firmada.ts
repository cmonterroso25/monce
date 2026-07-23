import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { clienteR2 } from './cliente'

export async function obtenerUrlFirmada(key: string, expiraEnSegundos = 900) {
  const comando = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  })
  return getSignedUrl(clienteR2, comando, { expiresIn: expiraEnSegundos })
}
