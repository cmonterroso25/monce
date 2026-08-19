import { createClient } from '@/lib/supabase/server'
import { urlSitio } from '@/lib/url'

// Mismo proyecto de Supabase que whatsapp-enviar (src/lib/whatsapp/notificar.ts).
// Si tu ref de proyecto es distinta, ajusta esta constante.
const FUNCTIONS_URL = 'https://ymvrddvckmwiajcqaled.supabase.co/functions/v1/generar-cma'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export type ResultadoGenerarCma =
  | { ok: true; informeId: string }
  | { ok: false; error: string }

// Se dispara desde el flujo de "definir precio de un listado nuevo"
// (sección 4.3), antes de generar el kit. Inserta la fila en estado
// 'generando' y llama a la Edge Function de forma asíncrona — no espera
// el resultado, el checkpoint/dashboard se actualiza cuando llega el
// callback a /api/webhooks/cma-resultado.
export async function generarInformeMercado(params: {
  propiedadId: string
  organizationId: string
  agenteId: string
  modelo?: 'sonar' | 'sonar-pro'
}): Promise<ResultadoGenerarCma> {
  const supabase = await createClient()

  const { data: propiedad, error: errorPropiedad } = await supabase
    .from('propiedades')
    .select(`
      titulo, tipo_operacion, tipo_propiedad, precio, moneda,
      area_construccion_m2, area_terreno_m2, zona, direccion,
      municipio:municipios (nombre)
    `)
    .eq('id', params.propiedadId)
    .single()

  if (errorPropiedad || !propiedad) {
    return { ok: false, error: 'No se pudo leer la propiedad para generar el informe de mercado.' }
  }

  const { data: informe, error: errorInsert } = await supabase
    .from('informes_mercado')
    .insert({
      organization_id: params.organizationId,
      propiedad_id: params.propiedadId,
      estado: 'generando',
      creado_por: params.agenteId,
    })
    .select('id')
    .single()

  if (errorInsert || !informe) {
    return { ok: false, error: 'No se pudo crear el registro del informe de mercado.' }
  }

  const municipioNombre = Array.isArray((propiedad as any).municipio)
    ? (propiedad as any).municipio[0]?.nombre ?? null
    : (propiedad as any).municipio?.nombre ?? null

  try {
    const res = await fetch(FUNCTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        informe_id: informe.id,
        modelo: params.modelo,
        propiedad: {
          titulo: propiedad.titulo,
          tipo_operacion: propiedad.tipo_operacion,
          tipo_propiedad: propiedad.tipo_propiedad,
          precio: propiedad.precio,
          moneda: propiedad.moneda,
          area_construccion_m2: propiedad.area_construccion_m2,
          area_terreno_m2: propiedad.area_terreno_m2,
          zona: propiedad.zona,
          municipio: municipioNombre,
          ciudad: null,
          direccion: propiedad.direccion,
        },
        callback_url: urlSitio('/api/webhooks/cma-resultado'),
      }),
    })
    if (!res.ok) {
      console.error('Error invocando generar-cma:', await res.text())
      await supabase
        .from('informes_mercado')
        .update({ estado: 'error', error_mensaje: 'No se pudo invocar el motor de análisis de mercado.' })
        .eq('id', informe.id)
      return { ok: false, error: 'No se pudo invocar el motor de análisis de mercado.' }
    }
  } catch (err) {
    console.error('Error de red invocando generar-cma:', err)
    await supabase
      .from('informes_mercado')
      .update({ estado: 'error', error_mensaje: 'Error de red al invocar el motor de análisis de mercado.' })
      .eq('id', informe.id)
    return { ok: false, error: 'Error de red al invocar el motor de análisis de mercado.' }
  }

  return { ok: true, informeId: informe.id }
}
