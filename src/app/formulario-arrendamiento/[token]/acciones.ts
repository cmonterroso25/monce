'use server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { DatosSolicitante, DatosFiador } from '@/app/dashboard/leads/[id]/arrendamiento'

export async function enviarSolicitudArrendamiento(
  token: string,
  datosSolicitante: DatosSolicitante,
  datosFiador: DatosFiador
): Promise<{ ok: boolean; mensaje?: string }> {
  const { data: solicitud, error: errorConsulta } = await supabaseAdmin
    .from('solicitudes_arrendamiento')
    .select('id, estado, lead_id')
    .eq('id', token)
    .maybeSingle()

  if (errorConsulta || !solicitud) {
    return { ok: false, mensaje: 'Este link no es válido.' }
  }

  if (solicitud.estado === 'completado') {
    return { ok: false, mensaje: 'Esta solicitud ya fue enviada anteriormente.' }
  }

  const { error: errorUpdate } = await supabaseAdmin
    .from('solicitudes_arrendamiento')
    .update({
      datos_solicitante: datosSolicitante,
      datos_fiador: datosFiador,
      estado: 'completado',
      completado_en: new Date().toISOString(),
    })
    .eq('id', token)

  if (errorUpdate) {
    console.error('--- ERROR AL GUARDAR SOLICITUD DE ARRENDAMIENTO ---', errorUpdate)
    return { ok: false, mensaje: 'No se pudo guardar la información. Intenta de nuevo.' }
  }

  revalidatePath(`/dashboard/leads/${solicitud.lead_id}`)
  return { ok: true }
}
