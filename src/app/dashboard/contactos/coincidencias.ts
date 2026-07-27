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

  // Antes de tocar nada, traemos lo que ya existía para este contacto,
  // así podemos preservar el estado `notificado` ("completada") de las
  // coincidencias que se siguen calificando, en vez de borrar todo y
  // volver a insertar desde cero.
  const { data: existentes, error: errorExistentes } = await supabase
    .from('coincidencias_propiedad')
    .select('id, propiedad_id, notificado')
    .eq('contacto_id', contactoId)

  if (errorExistentes) {
    console.error('--- ERROR AL LEER COINCIDENCIAS EXISTENTES ---', errorExistentes)
    return { ok: false, mensaje: errorExistentes.message, total: 0 }
  }

  const existentesPorPropiedad = new Map(
    (existentes ?? []).map((e) => [e.propiedad_id, e])
  )
  const idsTop = new Set(top.map((t) => t.propiedad_id))

  // 1) Borrar solo las coincidencias viejas que ya no califican.
  const idsABorrar = (existentes ?? [])
    .filter((e) => !idsTop.has(e.propiedad_id))
    .map((e) => e.id)

  if (idsABorrar.length > 0) {
    const { error: errorBorrar } = await supabase
      .from('coincidencias_propiedad')
      .delete()
      .in('id', idsABorrar)

    if (errorBorrar) {
      console.error('--- ERROR AL BORRAR COINCIDENCIAS OBSOLETAS ---', errorBorrar)
      return { ok: false, mensaje: errorBorrar.message, total: 0 }
    }
  }

  // 2) Actualizar el puntaje de las que ya existían y se mantienen top,
  //    sin tocar su `notificado`.
  const aActualizar = top.filter((t) => existentesPorPropiedad.has(t.propiedad_id))
  for (const t of aActualizar) {
    const existente = existentesPorPropiedad.get(t.propiedad_id)!
    const { error: errorActualizar } = await supabase
      .from('coincidencias_propiedad')
      .update({ puntaje_coincidencia: t.puntaje_coincidencia })
      .eq('id', existente.id)

    if (errorActualizar) {
      console.error('--- ERROR AL ACTUALIZAR PUNTAJE DE COINCIDENCIA ---', errorActualizar)
    }
  }

  // 3) Insertar las nuevas que no existían todavía.
  const aInsertar = top.filter((t) => !existentesPorPropiedad.has(t.propiedad_id))
  if (aInsertar.length > 0) {
    const { error: errorInsertar } = await supabase.from('coincidencias_propiedad').insert(
      aInsertar.map((t) => ({
        contacto_id: contactoId,
        propiedad_id: t.propiedad_id,
        puntaje_coincidencia: t.puntaje_coincidencia,
        notificado: false,
        organization_id: perfil?.organization_id,
      }))
    )

    if (errorInsertar) {
      console.error('--- ERROR AL INSERTAR NUEVAS COINCIDENCIAS ---', errorInsertar)
      return { ok: false, mensaje: errorInsertar.message, total: 0 }
    }
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
