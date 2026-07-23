'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function buscarCoincidencias(contactoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'No autenticado', total: 0 }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const { data: contacto } = await supabase.from('contactos').select('*').eq('id', contactoId).single()
  if (!contacto) return { ok: false, mensaje: 'Contacto no encontrado', total: 0 }

  const { data: propiedades } = await supabase
    .from('propiedades')
    .select('id, precio, zona, tipo_propiedad, municipio:municipios(nombre)')
    .in('estado', ['disponible', 'reservada'])

  const zonasInteres = (contacto.zonas_interes ?? []).map((z: string) => z.toLowerCase())

  const candidatos = (propiedades ?? []).map((p: any) => {
    let puntaje = 0

    if (contacto.presupuesto_min || contacto.presupuesto_max) {
      const min = Number(contacto.presupuesto_min ?? 0)
      const max = contacto.presupuesto_max ? Number(contacto.presupuesto_max) : Infinity
      const precio = Number(p.precio ?? 0)
      if (precio >= min && precio <= max) {
        puntaje += 40
      } else {
        const base = max === Infinity ? min : max
        const tolerancia = base * 0.15
        if (precio >= min - tolerancia && precio <= max + tolerancia) puntaje += 20
      }
    }

    if (zonasInteres.length > 0) {
      const zonaPropiedad = (p.zona ?? '').toLowerCase()
      const municipioPropiedad = (p.municipio?.nombre ?? '').toLowerCase()
      const coincideZona = zonasInteres.some(
        (z: string) =>
          (zonaPropiedad && (zonaPropiedad.includes(z) || z.includes(zonaPropiedad))) ||
          (municipioPropiedad && municipioPropiedad.includes(z))
      )
      if (coincideZona) puntaje += 35
    }

    if (contacto.tipo_propiedad_interes) {
      if (p.tipo_propiedad === contacto.tipo_propiedad_interes) puntaje += 25
    } else {
      puntaje += 10
    }

    return { propiedad_id: p.id, puntaje_coincidencia: puntaje }
  })

  const top = candidatos
    .filter((c) => c.puntaje_coincidencia >= 30)
    .sort((a, b) => b.puntaje_coincidencia - a.puntaje_coincidencia)
    .slice(0, 8)

  await supabase.from('coincidencias_propiedad').delete().eq('contacto_id', contactoId)

  if (top.length > 0) {
    await supabase.from('coincidencias_propiedad').insert(
      top.map((t) => ({
        contacto_id: contactoId,
        propiedad_id: t.propiedad_id,
        puntaje_coincidencia: t.puntaje_coincidencia,
        notificado: false,
        organization_id: perfil?.organization_id,
      }))
    )
  }

  revalidatePath(`/dashboard/contactos/${contactoId}`)
  return { ok: true, mensaje: null, total: top.length }
}

export async function marcarCoincidenciaNotificada(coincidenciaId: string, contactoId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('coincidencias_propiedad')
    .update({ notificado: true })
    .eq('id', coincidenciaId)

  revalidatePath(`/dashboard/contactos/${contactoId}`)

  if (error) return { ok: false, mensaje: error.message }
  return { ok: true, mensaje: null }
}
