'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const TIPOS_CONTACTO_DEMANDA = ['comprador', 'inquilino']

function calcularPuntaje(
  contacto: any,
  zonasInteres: string[],
  precio: number | null | undefined,
  textosZona: (string | null | undefined)[],
  tipoPropiedad: string | null | undefined
) {
  let puntaje = 0

  if (contacto.presupuesto_min || contacto.presupuesto_max) {
    const min = Number(contacto.presupuesto_min ?? 0)
    const max = contacto.presupuesto_max ? Number(contacto.presupuesto_max) : Infinity
    const precioNum = Number(precio ?? 0)
    if (precioNum >= min && precioNum <= max) {
      puntaje += 40
    } else {
      const base = max === Infinity ? min : max
      const tolerancia = base * 0.15
      if (precioNum >= min - tolerancia && precioNum <= max + tolerancia) puntaje += 20
    }
  }

  if (zonasInteres.length > 0) {
    const textos = textosZona.map((t) => (t ?? '').toLowerCase()).filter(Boolean)
    const coincideZona = zonasInteres.some((z) =>
      textos.some((t) => t.includes(z) || z.includes(t))
    )
    if (coincideZona) puntaje += 35
  }

  if (contacto.tipo_propiedad_interes) {
    if (tipoPropiedad === contacto.tipo_propiedad_interes) puntaje += 25
  } else {
    puntaje += 10
  }

  return puntaje
}

export async function buscarCoincidencias(contactoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'No autenticado', total: 0, totalInterno: 0, totalExterno: 0 }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const { data: contacto } = await supabase.from('contactos').select('*').eq('id', contactoId).single()
  if (!contacto) return { ok: false, mensaje: 'Contacto no encontrado', total: 0, totalInterno: 0, totalExterno: 0 }

  const zonasInteres = (contacto.zonas_interes ?? []).map((z: string) => z.toLowerCase())

  // ---------------------------------------------------------------
  // 1) Inventario interno (propiedades)
  // ---------------------------------------------------------------
  const { data: propiedades } = await supabase
    .from('propiedades')
    .select('id, precio, zona, tipo_propiedad, municipio:municipios(nombre)')
    .in('estado', ['disponible', 'reservada'])

  const candidatosInternos = (propiedades ?? []).map((p: any) => ({
    propiedad_id: p.id,
    puntaje_coincidencia: calcularPuntaje(
      contacto,
      zonasInteres,
      p.precio,
      [p.zona, p.municipio?.nombre],
      p.tipo_propiedad
    ),
  }))

  const topInterno = candidatosInternos
    .filter((c) => c.puntaje_coincidencia >= 30)
    .sort((a, b) => b.puntaje_coincidencia - a.puntaje_coincidencia)
    .slice(0, 8)

  const { data: existentesInternos, error: errorExistentesInternos } = await supabase
    .from('coincidencias_propiedad')
    .select('id, propiedad_id, notificado')
    .eq('contacto_id', contactoId)

  if (errorExistentesInternos) {
    console.error('--- ERROR AL LEER COINCIDENCIAS EXISTENTES ---', errorExistentesInternos)
    return { ok: false, mensaje: errorExistentesInternos.message, total: 0, totalInterno: 0, totalExterno: 0 }
  }

  const existentesInternosPorPropiedad = new Map(
    (existentesInternos ?? []).map((e) => [e.propiedad_id, e])
  )
  const idsTopInterno = new Set(topInterno.map((t) => t.propiedad_id))

  const idsABorrarInterno = (existentesInternos ?? [])
    .filter((e) => !idsTopInterno.has(e.propiedad_id))
    .map((e) => e.id)

  if (idsABorrarInterno.length > 0) {
    const { error } = await supabase
      .from('coincidencias_propiedad')
      .delete()
      .in('id', idsABorrarInterno)
    if (error) console.error('--- ERROR AL BORRAR COINCIDENCIAS OBSOLETAS ---', error)
  }

  for (const t of topInterno.filter((t) => existentesInternosPorPropiedad.has(t.propiedad_id))) {
    const existente = existentesInternosPorPropiedad.get(t.propiedad_id)!
    const { error } = await supabase
      .from('coincidencias_propiedad')
      .update({ puntaje_coincidencia: t.puntaje_coincidencia })
      .eq('id', existente.id)
    if (error) console.error('--- ERROR AL ACTUALIZAR PUNTAJE DE COINCIDENCIA ---', error)
  }

  const aInsertarInterno = topInterno.filter((t) => !existentesInternosPorPropiedad.has(t.propiedad_id))
  if (aInsertarInterno.length > 0) {
    const { error } = await supabase.from('coincidencias_propiedad').insert(
      aInsertarInterno.map((t) => ({
        contacto_id: contactoId,
        propiedad_id: t.propiedad_id,
        puntaje_coincidencia: t.puntaje_coincidencia,
        notificado: false,
        organization_id: perfil?.organization_id,
      }))
    )
    if (error) {
      console.error('--- ERROR AL INSERTAR NUEVAS COINCIDENCIAS ---', error)
      return { ok: false, mensaje: error.message, total: 0, totalInterno: 0, totalExterno: 0 }
    }
  }

  // ---------------------------------------------------------------
  // 2) Inventario externo (propiedades_externas)
  //    Solo aplica a contactos que buscan propiedad (demanda), no a
  //    vendedores/propietarios que ofrecen la suya.
  // ---------------------------------------------------------------
  let topExterno: { propiedad_externa_id: string; puntaje_coincidencia: number }[] = []

  if (TIPOS_CONTACTO_DEMANDA.includes(contacto.tipo_contacto)) {
    const { data: propiedadesExternas } = await supabase
      .from('propiedades_externas')
      .select('id, precio, zona_municipio, condominio_sector, tipo_propiedad')
      .eq('estado_publicacion', 'activo')

    const candidatosExternos = (propiedadesExternas ?? []).map((p: any) => ({
      propiedad_externa_id: p.id,
      puntaje_coincidencia: calcularPuntaje(
        contacto,
        zonasInteres,
        p.precio,
        [p.zona_municipio, p.condominio_sector],
        p.tipo_propiedad
      ),
    }))

    topExterno = candidatosExternos
      .filter((c) => c.puntaje_coincidencia >= 30)
      .sort((a, b) => b.puntaje_coincidencia - a.puntaje_coincidencia)
      .slice(0, 8)
  }

  const { data: existentesExternos, error: errorExistentesExternos } = await supabase
    .from('coincidencias_propiedad_externa')
    .select('id, propiedad_externa_id, notificado')
    .eq('contacto_id', contactoId)

  if (errorExistentesExternos) {
    console.error('--- ERROR AL LEER COINCIDENCIAS EXTERNAS EXISTENTES ---', errorExistentesExternos)
    return { ok: false, mensaje: errorExistentesExternos.message, total: 0, totalInterno: 0, totalExterno: 0 }
  }

  const existentesExternosPorPropiedad = new Map(
    (existentesExternos ?? []).map((e) => [e.propiedad_externa_id, e])
  )
  const idsTopExterno = new Set(topExterno.map((t) => t.propiedad_externa_id))

  const idsABorrarExterno = (existentesExternos ?? [])
    .filter((e) => !idsTopExterno.has(e.propiedad_externa_id))
    .map((e) => e.id)

  if (idsABorrarExterno.length > 0) {
    const { error } = await supabase
      .from('coincidencias_propiedad_externa')
      .delete()
      .in('id', idsABorrarExterno)
    if (error) console.error('--- ERROR AL BORRAR COINCIDENCIAS EXTERNAS OBSOLETAS ---', error)
  }

  for (const t of topExterno.filter((t) => existentesExternosPorPropiedad.has(t.propiedad_externa_id))) {
    const existente = existentesExternosPorPropiedad.get(t.propiedad_externa_id)!
    const { error } = await supabase
      .from('coincidencias_propiedad_externa')
      .update({ puntaje_coincidencia: t.puntaje_coincidencia })
      .eq('id', existente.id)
    if (error) console.error('--- ERROR AL ACTUALIZAR PUNTAJE DE COINCIDENCIA EXTERNA ---', error)
  }

  const aInsertarExterno = topExterno.filter((t) => !existentesExternosPorPropiedad.has(t.propiedad_externa_id))
  if (aInsertarExterno.length > 0) {
    const { error } = await supabase.from('coincidencias_propiedad_externa').insert(
      aInsertarExterno.map((t) => ({
        contacto_id: contactoId,
        propiedad_externa_id: t.propiedad_externa_id,
        puntaje_coincidencia: t.puntaje_coincidencia,
        notificado: false,
        organization_id: perfil?.organization_id,
      }))
    )
    if (error) {
      console.error('--- ERROR AL INSERTAR NUEVAS COINCIDENCIAS EXTERNAS ---', error)
      return { ok: false, mensaje: error.message, total: 0, totalInterno: 0, totalExterno: 0 }
    }
  }

  revalidatePath(`/dashboard/contactos/${contactoId}`)
  return {
    ok: true,
    mensaje: null,
    total: topInterno.length + topExterno.length,
    totalInterno: topInterno.length,
    totalExterno: topExterno.length,
  }
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

export async function marcarCoincidenciaExternaNotificada(coincidenciaId: string, contactoId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('coincidencias_propiedad_externa')
    .update({ notificado: true })
    .eq('id', coincidenciaId)

  revalidatePath(`/dashboard/contactos/${contactoId}`)

  if (error) return { ok: false, mensaje: error.message }
  return { ok: true, mensaje: null }
}
