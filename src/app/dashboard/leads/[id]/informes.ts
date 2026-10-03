'use server'
import { createClient } from '@/lib/supabase/server'
import { obtenerUrlFirmada } from '@/lib/r2/url-firmada'
import { obtenerUrlSubida } from '@/lib/r2/url-subida'
import { CAMPOS_DOCUMENTOS_INFORME } from './campos-informe'
import { filtrarPropiedadesPermitidas } from '@/lib/propiedades-enviadas'

const EDGE_FUNCTION_URL = 'https://ymvrddvckmwiajcqaled.supabase.co/functions/v1/generar-informe'

function obtenerExtension(nombreArchivo: string): string {
  const partes = nombreArchivo.split('.')
  return partes.length > 1 ? partes[partes.length - 1].toLowerCase() : 'bin'
}

// Paso 1: crea la fila del informe (misma validación de precio/propiedad
// que antes) pero YA NO recibe archivos. Los archivos se suben directo
// del navegador a R2 en un paso aparte (ver obtenerUrlSubidaDocumento),
// para no chocar con el límite de 4.5MB por request de Vercel.
// `comentarios` es contexto libre que el agente escribe sobre los
// documentos adjuntos (agregado 31/07/2026) y se guarda de una vez para
// no depender de un segundo update.
export async function crearInforme(
  leadId: string,
  contactoId: string,
  propiedadId: string,
  comentarios?: string
): Promise<{
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

  if (!propiedadId) return { ok: false, mensaje: 'Selecciona la propiedad a evaluar.' }

  const { data: leadInfo, error: errorLead } = await supabase
    .from('leads')
    .select('contacto_id, propiedad_id')
    .eq('id', leadId)
    .single()

  if (errorLead || !leadInfo) {
    console.error('--- ERROR AL CONSULTAR LEAD ---', errorLead)
    return { ok: false, mensaje: 'No se encontró el lead.' }
  }

  // Solo se aceptan propiedades enviadas al contacto o ya vinculadas al lead.
  const { data: vinculadasData } = await supabase
    .from('lead_propiedades')
    .select('propiedad_id')
    .eq('lead_id', leadId)
  const yaVinculadas = [
    leadInfo.propiedad_id,
    ...(vinculadasData ?? []).map((v) => v.propiedad_id),
  ].filter(Boolean) as string[]

  const permitidas = await filtrarPropiedadesPermitidas(
    supabase,
    leadInfo.contacto_id ?? null,
    [propiedadId],
    yaVinculadas
  )
  if (permitidas.length === 0) {
    return { ok: false, mensaje: 'La propiedad elegida no está relacionada con este contacto.' }
  }

  const { data: propiedad } = await supabase
    .from('propiedades')
    .select('id, titulo, precio')
    .eq('id', propiedadId)
    .single()

  if (!propiedad || propiedad.precio == null) {
    return {
      ok: false,
      mensaje: `La propiedad "${propiedad?.titulo ?? 'seleccionada'}" no tiene precio cargado. Cárgalo antes de generar el informe.`,
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
      propiedad_id: propiedadId,
      comentarios_agente: comentarios?.trim() || null,
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
    .select('id, organization_id, lead_id, contacto_id, comentarios_agente, propiedad_id')
    .eq('id', informeId)
    .single()

  if (errorInforme || !informe) {
    console.error('--- ERROR AL CONSULTAR INFORME ---', errorInforme)
    return { ok: false, mensaje: 'Informe no encontrado o sin permiso.' }
  }

  if (!informe.propiedad_id) {
    return { ok: false, mensaje: 'El informe no tiene una propiedad asociada.' }
  }

  const { data: propiedad, error: errorPropiedad } = await supabase
    .from('propiedades')
    .select('precio, moneda, tipo_operacion')
    .eq('id', informe.propiedad_id)
    .single()

  if (errorPropiedad || !propiedad) {
    console.error('--- ERROR AL CONSULTAR PROPIEDAD DEL INFORME (finalizar) ---', errorPropiedad)
    return { ok: false, mensaje: 'No se encontró la propiedad asociada al informe.' }
  }

  const contextoFinanciero = {
    monto_referencia: propiedad?.precio ?? null,
    moneda: propiedad?.moneda ?? null,
    tipo_operacion: propiedad?.tipo_operacion ?? null,
    comentarios_agente: informe.comentarios_agente ?? null,
  }

  const documentosParaAnalisis: { tipo: string; label: string; url: string }[] = []

  for (const doc of documentos) {
    const urlFirmada = await obtenerUrlFirmada(doc.key, 3600)
    documentosParaAnalisis.push({ tipo: doc.tipo, label: doc.label, url: urlFirmada })

    await supabase.from('documentos').insert({
      organization_id: informe.organization_id,
      // El constraint documentos_tipo_relacionado_check solo permite
      // 'contacto' | 'propiedad' | 'negocio' — la tabla "leads" se
      // referencia como 'negocio' en este campo, no como 'lead'.
      tipo_relacionado: 'negocio',
      id_relacionado: informe.lead_id,
      ruta_almacenamiento: doc.key,
      tipo_documento: `informe_${doc.tipo}`,
      // Vincula el documento a ESTE informe en particular (agregado
      // 14/09/2026), para poder listar/descargar exactamente los
      // documentos usados en una evaluación cuando el mismo lead tiene
      // varios informes generados en momentos distintos.
      informe_id: informe.id,
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

// Trae los documentos vinculados a un informe específico (vía informe_id,
// agregado 14/09/2026) con URL firmada de descarga, para mostrarlos en
// EstadoInforme una vez generado el informe.
export async function obtenerDocumentosInforme(informeId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documentos')
    .select('id, tipo_documento, ruta_almacenamiento')
    .eq('informe_id', informeId)

  if (error || !data) return []

  const documentos = await Promise.all(
    data.map(async (doc) => {
      const tipo = (doc.tipo_documento ?? '').replace(/^informe_/, '')
      const campo = CAMPOS_DOCUMENTOS_INFORME.find((c) => c.key === tipo)
      return {
        id: doc.id as string,
        label: campo?.label ?? tipo,
        url: await obtenerUrlFirmada(doc.ruta_almacenamiento as string, 900),
      }
    })
  )

  return documentos
}
