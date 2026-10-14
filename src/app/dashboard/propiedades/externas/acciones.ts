'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type TrabajoScraperExternas = {
  id: string
  estado: 'SOLICITADO' | 'EN_PROGRESO' | 'COMPLETADO' | 'FALLIDO'
  solicitado_en: string
  completado_en: string | null
  resultado: { guardadas: number; posiblesBajas: number; eliminadas: number; errores: string[] } | null
  mensaje_error: string | null
}

// El monce-worker (Playwright, en la Mac) es el único que puede reclamar y
// ejecutar el scraping real: fetch() simple ya no pasa el bloqueo de
// Cloudflare de Encuentra24. Este botón solo deja la "solicitud" en la cola.
export async function solicitarScrapingExternas(): Promise<{ ok: boolean; mensaje?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'No autenticado.' }

  const { data: enCurso } = await supabase
    .from('trabajos_scraper_externas')
    .select('id')
    .in('estado', ['SOLICITADO', 'EN_PROGRESO'])
    .eq('portal', 'encuentra24')
    .limit(1)
    .maybeSingle()

  if (enCurso) {
    return { ok: false, mensaje: 'Ya hay un scraping solicitado o en curso. Espera a que termine.' }
  }

  const { error } = await supabase.from('trabajos_scraper_externas').insert({
    portal: 'encuentra24',
    solicitado_por: user.id,
  })

  if (error) {
    console.error('--- ERROR AL SOLICITAR SCRAPING DE EXTERNAS ---', error)
    return { ok: false, mensaje: error.message }
  }

  revalidatePath('/dashboard/propiedades/externas')
  return { ok: true }
}

export async function obtenerUltimoTrabajoScraperExternas(): Promise<TrabajoScraperExternas | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('trabajos_scraper_externas')
    .select('id, estado, solicitado_en, completado_en, resultado, mensaje_error')
    .eq('portal', 'encuentra24')
    .order('solicitado_en', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as TrabajoScraperExternas) ?? null
}

export async function actualizarSeguimientoExterna(formData: FormData): Promise<{
  ok: boolean
  mensaje?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, mensaje: 'No autenticado.' }
  }

  const id = formData.get('id') as string
  const estadoSeguimiento = formData.get('estado_seguimiento') as string
  const notasAgenteRaw = formData.get('notas_agente') as string
  const notasAgente = notasAgenteRaw && notasAgenteRaw.trim() !== '' ? notasAgenteRaw : null

  let colegaId = (formData.get('colega_id') as string) || null
  if (colegaId === '') colegaId = null

  if (colegaId === '__nuevo__') {
    const nombreNuevo = formData.get('colega_nombre_nuevo') as string
    if (!nombreNuevo || nombreNuevo.trim() === '') {
      return { ok: false, mensaje: 'El nombre del nuevo colega es obligatorio.' }
    }
    const telefonoNuevo = (formData.get('colega_telefono_nuevo') as string) || null
    const inmobiliariaNuevo = (formData.get('colega_inmobiliaria_nuevo') as string) || null

    const { data: perfil } = await supabase
      .from('perfiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    const { data: nuevoColega, error: errorColega } = await supabase
      .from('colegas')
      .insert({
        nombre: nombreNuevo,
        telefono: telefonoNuevo,
        inmobiliaria: inmobiliariaNuevo,
        organization_id: perfil?.organization_id,
      })
      .select()
      .single()

    if (errorColega) {
      console.error('--- ERROR AL CREAR COLEGA DESDE PROPIEDAD EXTERNA ---', errorColega)
      return { ok: false, mensaje: errorColega.message }
    }

    colegaId = nuevoColega.id as string
  }

  // "Contactado por" no es un campo que el usuario elija: se fija
  // automáticamente al usuario logueado en cada guardado de esta
  // pantalla, independientemente del estado de seguimiento o si se
  // asignó un colega.
  const { error } = await supabase
    .from('propiedades_externas')
    .update({
      estado_seguimiento: estadoSeguimiento,
      notas_agente: notasAgente,
      colega_id: colegaId,
      agente_que_contacto: user.id,
    })
    .eq('id', id)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR SEGUIMIENTO DE PROPIEDAD EXTERNA ---', error)
    return { ok: false, mensaje: error.message }
  }

  revalidatePath('/dashboard/propiedades/externas')
  return { ok: true }
}
