'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { DatosSolicitante, DatosFiador } from '@/app/dashboard/leads/[id]/arrendamiento'

export async function enviarSolicitudArrendamiento(
  token: string,
  datosSolicitante: DatosSolicitante,
  datosFiador: DatosFiador
): Promise<{ ok: boolean; mensaje?: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .rpc('enviar_solicitud_arrendamiento_publica', {
      p_token: token,
      p_datos_solicitante: datosSolicitante,
      p_datos_fiador: datosFiador,
    })
    .maybeSingle()

  if (error || !data) {
    console.error('--- ERROR AL GUARDAR SOLICITUD DE ARRENDAMIENTO ---', error)
    return { ok: false, mensaje: 'No se pudo guardar la información. Intenta de nuevo.' }
  }

  if (!data.ok) {
    return { ok: false, mensaje: data.mensaje ?? 'No se pudo guardar la información.' }
  }

  if (data.lead_id) {
    revalidatePath(`/dashboard/leads/${data.lead_id}`)
  }

  return { ok: true }
}
