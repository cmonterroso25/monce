'use server'
import { createClient } from '@/lib/supabase/server'
import { obtenerUrlFirmada } from '@/lib/r2/url-firmada'
import { obtenerUrlSubida } from '@/lib/r2/url-subida'
import { CAMPOS_DOCUMENTOS_INFORME } from './campos-informe'

const EDGE_FUNCTION_URL = 'https://ymvrddvckmwiajcqaled.supabase.co/functions/v1/generar-informe'

function obtenerExtension(nombreArchivo: string): string {
  const partes = nombreArchivo.split('.')
  return partes.length > 1 ? partes[partes.length - 1].toLowerCase() : 'bin'
}

// Paso 1: crea la fila del informe (misma validación de precio/propiedad
// que antes) pero YA NO recibe archivos. Los archivos se suben directo
// del navegador a R2 en un paso aparte (ver obtenerUrlSubidaDocumento),
// para no chocar con el límite de 4.5MB por request de Vercel.
export async function crearInforme(leadId: string, contactoId: string): Promise<{
  ok: boolean
  mensaje?: string
  informeId?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'No autenticado.' }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const organizationId = perfil?.organization_id
  if (!organizationId) return { ok: false, mensaje: 'No se encontró la organización del usuario.' }

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

  return { ok: true, informeId: informe.id as string }
}

// Paso 2: se llama una vez por cada archivo, desde el navegador, antes de
// subirlo. Verifica (vía RLS del SELECT) que el informe le pertenezca al
// usuario, y devuelve una URL firmada de PUT + la key resultante en R2.
export async function obtenerUrlSubidaDocumento(
  informeId: string,
  nombreArchivo: string,
  contentType: string
): Promise<{ ok: boolean; mensaje?: string; url?: string; key?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'No autenticado.' }

  const { data: informe } = await supabase
    .from('informes_evaluacion')
    .select('id')
    .eq('id', informeId)
    .single()

  if (!informe) return { ok: false, mensaje: 'Informe no encontrado o sin permiso.' }

  const extension = obtenerExtension(nombreArchivo)
  const key = `informes/${informeId}/${crypto.randomUUID()}.${extension}`

  try {
    const url = await obtenerUrlSubida(key, contentType || 'application/octet-stream')
    return { ok: true, url, key }
  } catch (err) {
    console.error('--- ERROR AL GENERAR URL DE SUBIDA ---', err)
    return { ok: false, mensaje: 'No se pudo preparar la subida del archivo.' }
  }
}

// Paso 3: una vez que TODOS los archivos ya están en R2 (subidos directo
// desde el navegador), registra los documentos y dispara la Edge Function
// de análisis — mismo comportamiento de "ack + background" que antes.
export async function finalizarInforme(
  informeId: string,
  documentos: { tipo: string; label: string; key: string }[]
): Promise<{ ok: boolean; mensaje?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'No autenticado.' }

  const { data: informe, error: errorInforme } = await supabase
    .from('informes_evaluacion')
    .select('id, organization_id, lead_id, contacto_id')
    .eq('id', informeId)
    .single()

  if (errorInforme || !informe) {
    console.error('--- ERROR AL CONSULTAR INFORME ---', errorInforme)
    return { ok: false, mensaje: 'Informe no encontrado o sin permiso.' }
  }

  const { data: leadInfo, error: errorLead } = await supabase
    .from('leads')
    .select('propiedades(precio, moneda, tipo_operacion)')
    .eq('id', informe.lead_id)
    .single()

  if (errorLead || !leadInfo) {
    console.error('--- ERROR AL CONSULTAR LEAD (finalizar) ---', errorLead)
    return { ok: false, mensaje: 'No se encontró el lead asociado al informe.' }
  }

  const propiedad = Array.isArray(leadInfo.propiedades) ? leadInfo.propiedades[0] : leadInfo.propiedades

  const contextoFinanciero = {
    monto_referencia: propiedad?.precio ?? null,
    moneda: propiedad?.moneda ?? null,
    tipo_operacion: propiedad?.tipo_operacion ?? null,
  }

  const documentosParaAnalisis: { tipo: string; label: string; url: string }[] = []

  for (const doc of documentos) {
    const urlFirmada = await obtenerUrlFirmada(doc.key, 3600)
    documentosParaAnalisis.push({ tipo: doc.tipo, label: doc.label, url: urlFirmada })

    await supabase.from('documentos').insert({
      organization_id: informe.organization_id,
      tipo_relacionado: 'lead',
      id_relacionado: informe.lead_id,
      ruta_almacenamiento: doc.key,
      tipo_documento: `informe_${doc.tipo}`,
    })
  }

  try {
    const respuesta = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        'x-informe-secret': process.env.INFORME_CALLBACK_SECRET!,
      },
      body: JSON.stringify({
        informe_id: informe.id,
        organization_id: informe.organization_id,
        lead_id: informe.lead_id,
        contacto_id: informe.contacto_id,
        documentos: documentosParaAnalisis,
        contexto_financiero: contextoFinanciero,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/informe-resultado`,
      }),
    })
    if (!respuesta.ok) throw new Error(`Edge Function respondió ${respuesta.status}`)
  } catch (err) {
    console.error('--- ERROR AL LLAMAR EDGE FUNCTION DE INFORME ---', err)
    await supabase
      .from('informes_evaluacion')
      .update({ estado: 'error', error_mensaje: 'No se pudo conectar con el motor de análisis.' })
      .eq('id', informeId)
    return { ok: false, mensaje: 'No se pudo iniciar el análisis. Intenta de nuevo.' }
  }

  return { ok: true }
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
