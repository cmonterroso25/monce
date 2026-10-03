import { createClient } from '@/lib/supabase/server'

type Cliente = Awaited<ReturnType<typeof createClient>>

export const CANALES_ENVIO = ['whatsapp', 'messenger', 'instagram', 'tiktok'] as const

export type PropiedadEnviada = {
  id: string
  titulo: string
  codigo: string | null
  canales: string[]
  ultimoEnvio: string
}

// Propiedades enviadas a un contacto (una fila por propiedad, con los canales usados).
export async function obtenerPropiedadesEnviadas(
  supabase: Cliente,
  contactoId: string
): Promise<PropiedadEnviada[]> {
  const { data, error } = await supabase
    .from('envios_propiedad_contacto')
    .select('canal, creado_en, propiedad:propiedades(id, titulo, codigo)')
    .eq('contacto_id', contactoId)
    .order('creado_en', { ascending: false })

  if (error) {
    console.error('--- ERROR AL LEER PROPIEDADES ENVIADAS ---', error)
    return []
  }

  const mapa = new Map<string, PropiedadEnviada>()
  for (const e of (data ?? []) as any[]) {
    const p = e.propiedad
    if (!p) continue
    const existente = mapa.get(p.id)
    if (existente) {
      if (!existente.canales.includes(e.canal)) existente.canales.push(e.canal)
    } else {
      mapa.set(p.id, {
        id: p.id,
        titulo: p.titulo,
        codigo: p.codigo ?? null,
        canales: [e.canal],
        ultimoEnvio: e.creado_en,
      })
    }
  }
  return [...mapa.values()]
}

// Guarda las propiedades de una actividad. Solo acepta propiedades que ya se
// enviaron a ese contacto. Con reemplazar=true borra las anteriores primero.
export async function guardarPropiedadesVisita(
  supabase: Cliente,
  params: {
    actividadId: string
    contactoId: string | null
    organizationId?: string | null
    propiedadesIds: string[]
    reemplazar: boolean
  }
): Promise<{ ok: boolean; mensaje: string | null }> {
  const ids = [...new Set(params.propiedadesIds.filter(Boolean))]

  if (params.reemplazar) {
    const { error } = await supabase
      .from('actividad_propiedades')
      .delete()
      .eq('actividad_id', params.actividadId)
    if (error) return { ok: false, mensaje: error.message }
  }

  if (ids.length === 0 || !params.contactoId) return { ok: true, mensaje: null }

  const { data: enviadas, error: errorEnviadas } = await supabase
    .from('envios_propiedad_contacto')
    .select('propiedad_id')
    .eq('contacto_id', params.contactoId)
    .in('propiedad_id', ids)
  if (errorEnviadas) return { ok: false, mensaje: errorEnviadas.message }

  const validas = [...new Set((enviadas ?? []).map((e) => e.propiedad_id as string))]
  if (validas.length === 0) return { ok: true, mensaje: null }

  const { error } = await supabase.from('actividad_propiedades').insert(
    validas.map((propiedadId) => ({
      actividad_id: params.actividadId,
      propiedad_id: propiedadId,
      organization_id: params.organizationId ?? undefined,
    }))
  )
  if (error) return { ok: false, mensaje: error.message }
  return { ok: true, mensaje: null }
}

// Devuelve, en el mismo orden recibido, los ids que se pueden vincular a un lead:
// los enviados al contacto o los ya vinculados antes (extraPermitidas).
export async function filtrarPropiedadesPermitidas(
  supabase: Cliente,
  contactoId: string | null,
  ids: string[],
  extraPermitidas: string[] = []
): Promise<string[]> {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return []

  const permitidas = new Set(extraPermitidas)
  if (contactoId) {
    const { data } = await supabase
      .from('envios_propiedad_contacto')
      .select('propiedad_id')
      .eq('contacto_id', contactoId)
      .in('propiedad_id', unicos)
    for (const e of data ?? []) permitidas.add(e.propiedad_id as string)
  }
  return unicos.filter((id) => permitidas.has(id))
}

// Guarda las propiedades de un lead. Con reemplazar=true borra las anteriores primero.
export async function reemplazarPropiedadesLead(
  supabase: Cliente,
  params: {
    leadId: string
    organizationId?: string | null
    propiedadesIds: string[]
    reemplazar: boolean
  }
): Promise<{ ok: boolean; mensaje: string | null }> {
  if (params.reemplazar) {
    const { error } = await supabase.from('lead_propiedades').delete().eq('lead_id', params.leadId)
    if (error) return { ok: false, mensaje: error.message }
  }
  if (params.propiedadesIds.length === 0) return { ok: true, mensaje: null }

  const { error } = await supabase.from('lead_propiedades').insert(
    params.propiedadesIds.map((propiedadId) => ({
      lead_id: params.leadId,
      propiedad_id: propiedadId,
      organization_id: params.organizationId ?? undefined,
    }))
  )
  if (error) return { ok: false, mensaje: error.message }
  return { ok: true, mensaje: null }
}
