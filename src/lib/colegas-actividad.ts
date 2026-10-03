import { createClient } from '@/lib/supabase/server'

type Cliente = Awaited<ReturnType<typeof createClient>>

// Deja solo los ids de colegas que existen (y pertenecen a la organización), conservando el orden.
export async function validarColegas(
  supabase: Cliente,
  ids: string[],
  organizationId?: string | null
): Promise<string[]> {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return []

  let consulta = supabase.from('colegas').select('id').in('id', unicos)
  if (organizationId) consulta = consulta.eq('organization_id', organizationId)
  const { data, error } = await consulta
  if (error) {
    console.error('--- ERROR AL VALIDAR COLEGAS ---', error)
    return []
  }
  const existentes = new Set((data ?? []).map((c) => c.id as string))
  return unicos.filter((id) => existentes.has(id))
}

// Guarda los colegas de una actividad. Con reemplazar=true borra los anteriores primero.
export async function guardarColegasActividad(
  supabase: Cliente,
  params: {
    actividadId: string
    organizationId?: string | null
    colegasIds: string[]
    reemplazar: boolean
  }
): Promise<{ ok: boolean; mensaje: string | null }> {
  if (params.reemplazar) {
    const { error } = await supabase.from('actividad_colegas').delete().eq('actividad_id', params.actividadId)
    if (error) return { ok: false, mensaje: error.message }
  }
  if (params.colegasIds.length === 0) return { ok: true, mensaje: null }

  const { error } = await supabase.from('actividad_colegas').insert(
    params.colegasIds.map((colegaId) => ({
      actividad_id: params.actividadId,
      colega_id: colegaId,
      organization_id: params.organizationId ?? undefined,
    }))
  )
  if (error) return { ok: false, mensaje: error.message }
  return { ok: true, mensaje: null }
}

// Ids de colegas de una actividad; si no hay filas, usa el colega principal como respaldo.
export async function idsColegasDeActividad(
  supabase: Cliente,
  actividadId: string,
  respaldoId?: string | null
): Promise<string[]> {
  const { data } = await supabase.from('actividad_colegas').select('colega_id').eq('actividad_id', actividadId)
  const ids = (data ?? []).map((c) => c.colega_id as string)
  if (ids.length > 0) return ids
  return respaldoId ? [respaldoId] : []
}

// Nombres de colegas en el mismo orden de los ids recibidos.
export async function nombresDeColegas(supabase: Cliente, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const { data } = await supabase.from('colegas').select('id, nombre').in('id', ids)
  const porId = new Map((data ?? []).map((c) => [c.id as string, c.nombre as string]))
  return ids.map((id) => porId.get(id)).filter(Boolean) as string[]
}
