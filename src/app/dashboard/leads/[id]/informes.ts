'use server'
import { createClient } from '@/lib/supabase/server'
import { subirDocumento } from '@/lib/r2/subir-documento'
import { obtenerUrlFirmada } from '@/lib/r2/url-firmada'
import { CAMPOS_DOCUMENTOS_INFORME } from './campos-informe'

export async function dispararInforme(formData: FormData): Promise<{
  ok: boolean
  mensaje?: string
  informeId?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'No autenticado.' }

  const leadId = formData.get('lead_id') as string
  const contactoId = formData.get('contacto_id') as string

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const organizationId = perfil?.organization_id
  if (!organizationId) return { ok: false, mensaje: 'No se encontró la organización del usuario.' }

  // El monto de referencia para evaluar capacidad de pago (regla: ingreso
  // mensual >= 3x este monto) sale de propiedades.precio. Si el lead no
  // tiene propiedad asociada, o la propiedad no tiene precio cargado, se
  // bloquea la generación del informe: sin este dato el criterio de
  // capacidad de pago no se puede aplicar.
  const { data: leadInfo, error: errorLead } = await supabase
    .from('leads')
    .select('propiedad_id, propiedades(precio, moneda, tipo_operacion)')
    .eq('id', leadId)
    .single()

  if (errorLead || !leadInfo) {
    console.error('--- ERROR AL CONSULTAR LEAD ---', errorLead)
    return { ok: false, mensaje: 'No se encontró el lead.' }
  }

  const propiedad = Array.isArray(leadInfo.propiedades)
    ? leadInfo.propiedades[0]
    : leadInfo.propiedades

  if (!leadInfo.propiedad_id || !propiedad || propiedad.precio == null) {
    return {
      ok: false,
      mensaje: 'Este lead no tiene una propiedad con precio cargado. Asigna una propiedad con precio antes de generar el informe.',
    }
  }

  const contextoFinanciero = {
    monto_referencia: propiedad.precio,
    moneda: propiedad.moneda ?? null,
    tipo_operacion: propiedad.tipo_operacion ?? null,
  }

  const { data: informe, error: errorInforme } = await supabase
    .from('informes_evaluacion')
    .insert({
      organization_id: organizationId,
      lead_id: leadId,
      contacto_id: contactoId,
      estado: 'procesando',
      creado_por: user.id,
    })
    .select('id')
    .single()

  if (errorInforme || !informe) {
    console.error('--- ERROR AL CREAR INFORME ---', errorInforme)
    return { ok: false, mensaje: 'No se pudo iniciar el informe.' }
  }

  const documentosParaN8n: { tipo: string; label: string; url: string }[] = []

  for (const campo of CAMPOS_DOCUMENTOS_INFORME) {
    const archivos = formData.getAll(campo.key) as File[]
    for (const archivo of archivos) {
      if (!archivo || archivo.size === 0) continue
      const key = await subirDocumento(archivo, `informes/${informe.id}`)
      // URL firmada de corta duración solo para que n8n pueda descargarlo
      // durante el análisis. El objeto en R2 sigue siendo privado.
      const urlFirmada = await obtenerUrlFirmada(key, 3600)
      documentosParaN8n.push({ tipo: campo.key, label: campo.label, url: urlFirmada })

      await supabase.from('documentos').insert({
        organization_id: organizationId,
        tipo_relacionado: 'lead',
        id_relacionado: leadId,
        ruta_almacenamiento: key,
        tipo_documento: `informe_${campo.key}`,
      })
    }
  }

  // Disparo a n8n. Se espera (await) solo el "ack" inmediato del webhook
  // (nodo configurado en modo "Respond Immediately"), no el análisis
  // completo. n8n analiza los documentos y al terminar llama de vuelta a
  // /api/webhooks/informe-resultado (con secreto compartido) — n8n NUNCA
  // escribe directo a Supabase.
  try {
    const respuesta = await fetch(process.env.N8N_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        informe_id: informe.id,
        organization_id: organizationId,
        lead_id: leadId,
        contacto_id: contactoId,
        documentos: documentosParaN8n,
        contexto_financiero: contextoFinanciero,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/informe-resultado`,
      }),
    })
    if (!respuesta.ok) throw new Error(`n8n respondió ${respuesta.status}`)
  } catch (err) {
    console.error('--- ERROR AL LLAMAR WEBHOOK N8N ---', err)
    await supabase
      .from('informes_evaluacion')
      .update({ estado: 'error', error_mensaje: 'No se pudo conectar con el motor de análisis.' })
      .eq('id', informe.id)
    return { ok: false, mensaje: 'No se pudo iniciar el análisis. Intenta de nuevo.' }
  }

  return { ok: true, informeId: informe.id as string }
}

export async function obtenerEstadoInforme(informeId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('informes_evaluacion')
    .select('id, estado, ruta_pdf, resultado_recomendacion, resultado_resumen, error_mensaje, detalle_criterios')
    .eq('id', informeId)
    .single()

  if (error || !data) return null
  return {
    ...data,
    ruta_pdf: data.ruta_pdf ? await obtenerUrlFirmada(data.ruta_pdf, 900) : null,
  }
}

export async function obtenerUltimoInforme(leadId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('informes_evaluacion')
    .select('id, estado, ruta_pdf, resultado_recomendacion, resultado_resumen, error_mensaje, detalle_criterios')
    .eq('lead_id', leadId)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return {
    ...data,
    ruta_pdf: data.ruta_pdf ? await obtenerUrlFirmada(data.ruta_pdf, 900) : null,
  }
}
