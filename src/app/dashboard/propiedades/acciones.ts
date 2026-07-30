'use server'
import { createClient } from '@/lib/supabase/server'
import { subirImagen, eliminarImagenR2 } from '@/lib/r2/subir-imagen'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { urlSitio } from '@/lib/url'
import { notificarFichaPropiedad } from '@/lib/whatsapp/notificar-propiedad'

function generarSlug(titulo: string) {
  const base = titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
  const sufijo = Math.random().toString(36).substring(2, 8)
  return `${base}-${sufijo}`
}

function numeroOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  const n = Number(valor)
  return Number.isNaN(n) ? null : n
}

function textoOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  return valor as string
}

export async function crearPropiedadDatos(formData: FormData): Promise<{
  ok: boolean
  mensaje?: string
  propiedadId?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, mensaje: 'No autenticado.' }
  }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const organizationId = perfil?.organization_id

  let municipioId = textoOpcional(formData.get('municipio_id'))
  if (municipioId === '__nuevo__') {
    const nombreNuevo = formData.get('municipio_id_nombre_nuevo') as string
    const { data: nuevoMunicipio, error: errorMunicipio } = await supabase
      .from('municipios')
      .insert({ nombre: nombreNuevo, organization_id: organizationId })
      .select()
      .single()
    if (errorMunicipio) {
      return { ok: false, mensaje: errorMunicipio.message }
    }
    municipioId = nuevoMunicipio.id
  }

  let colegaId = textoOpcional(formData.get('colega_id'))
  if (colegaId === '__nuevo__') {
    const nombreNuevo = formData.get('colega_id_nombre_nuevo') as string
    const { data: nuevoColega, error: errorColega } = await supabase
      .from('colegas')
      .insert({ nombre: nombreNuevo, organization_id: organizationId })
      .select()
      .single()
    if (errorColega) {
      return { ok: false, mensaje: errorColega.message }
    }
    colegaId = nuevoColega.id
  }

  const titulo = formData.get('titulo') as string
  const slug = generarSlug(titulo)

  const { data: propiedad, error } = await supabase
    .from('propiedades')
    .insert({
      titulo,
      slug,
      tipo_operacion: formData.get('tipo_operacion') as string,
      tipo_propiedad: formData.get('tipo_propiedad') as string,
      requisitos_renta: textoOpcional(formData.get('requisitos_renta')),
      modalidad_captacion: textoOpcional(formData.get('modalidad_captacion')),
      precio: Number(formData.get('precio')),
      moneda: formData.get('moneda') as string,
      direccion: textoOpcional(formData.get('direccion')),
      zona: textoOpcional(formData.get('zona')),
      ciudad: textoOpcional(formData.get('ciudad')),
      municipio_id: municipioId,
      sector: textoOpcional(formData.get('sector')),
      condominio: textoOpcional(formData.get('condominio')),
      numero_casa: textoOpcional(formData.get('numero_casa')),
      niveles: textoOpcional(formData.get('niveles')),
      dormitorios: textoOpcional(formData.get('dormitorios')),
      banos: textoOpcional(formData.get('banos')),
      sala: textoOpcional(formData.get('sala')),
      comedor: textoOpcional(formData.get('comedor')),
      cocina: textoOpcional(formData.get('cocina')),
      estudio: textoOpcional(formData.get('estudio')),
      sala_familiar: textoOpcional(formData.get('sala_familiar')),
      habitacion_servicio: textoOpcional(formData.get('habitacion_servicio')),
      lavanderia: textoOpcional(formData.get('lavanderia')),
      jardin: textoOpcional(formData.get('jardin')),
      parqueos: numeroOpcional(formData.get('parqueos')),
      extras: textoOpcional(formData.get('extras')),
      area_construccion_m2: numeroOpcional(formData.get('area_construccion_m2')),
      area_terreno_m2: numeroOpcional(formData.get('area_terreno_m2')),
      medidas_terreno: textoOpcional(formData.get('medidas_terreno')),
      mantenimiento: numeroOpcional(formData.get('mantenimiento')),
      iusi: numeroOpcional(formData.get('iusi')),
      comision: textoOpcional(formData.get('comision')),
      hipoteca: textoOpcional(formData.get('hipoteca')),
      valor_hipoteca: numeroOpcional(formData.get('valor_hipoteca')),
      mascota: textoOpcional(formData.get('mascota')),
      acceso: textoOpcional(formData.get('acceso')),
      propietario_nombre: textoOpcional(formData.get('propietario_nombre')),
      colega_id: colegaId,
      captado_por: textoOpcional(formData.get('captado_por')),
      descripcion: textoOpcional(formData.get('descripcion')),
      comentarios: textoOpcional(formData.get('comentarios')),
    })
    .select()
    .single()

  if (error) {
    console.error('--- ERROR AL CREAR PROPIEDAD ---')
    console.error(error)
    return { ok: false, mensaje: error.message }
  }

  // La notificación de "nueva propiedad" ya NO se dispara aquí: se movió a
  // subir-foto/route.ts, en la primera foto subida, para que el enlace
  // siempre tenga imagen cuando WhatsApp genere la vista previa.

  revalidatePath('/dashboard/propiedades')
  return { ok: true, propiedadId: propiedad.id as string }
}

export async function actualizarPropiedadDatos(formData: FormData): Promise<{
  ok: boolean
  mensaje?: string
  propiedadId?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, mensaje: 'No autenticado.' }
  }

  const propiedadId = formData.get('propiedad_id') as string

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const organizationId = perfil?.organization_id

  let municipioId = textoOpcional(formData.get('municipio_id'))
  if (municipioId === '__nuevo__') {
    const nombreNuevo = formData.get('municipio_id_nombre_nuevo') as string
    const { data: nuevoMunicipio, error: errorMunicipio } = await supabase
      .from('municipios')
      .insert({ nombre: nombreNuevo, organization_id: organizationId })
      .select()
      .single()
    if (errorMunicipio) {
      return { ok: false, mensaje: errorMunicipio.message }
    }
    municipioId = nuevoMunicipio.id
  }

  let colegaId = textoOpcional(formData.get('colega_id'))
  if (colegaId === '__nuevo__') {
    const nombreNuevo = formData.get('colega_id_nombre_nuevo') as string
    const { data: nuevoColega, error: errorColega } = await supabase
      .from('colegas')
      .insert({ nombre: nombreNuevo, organization_id: organizationId })
      .select()
      .single()
    if (errorColega) {
      return { ok: false, mensaje: errorColega.message }
    }
    colegaId = nuevoColega.id
  }

  const titulo = formData.get('titulo') as string

  const { data: propiedadAnterior } = await supabase
    .from('propiedades')
    .select('precio')
    .eq('id', propiedadId)
    .single()

  const { error } = await supabase
    .from('propiedades')
    .update({
      titulo,
      tipo_operacion: formData.get('tipo_operacion') as string,
      tipo_propiedad: formData.get('tipo_propiedad') as string,
      requisitos_renta: textoOpcional(formData.get('requisitos_renta')),
      modalidad_captacion: textoOpcional(formData.get('modalidad_captacion')),
      precio: Number(formData.get('precio')),
      moneda: formData.get('moneda') as string,
      direccion: textoOpcional(formData.get('direccion')),
      zona: textoOpcional(formData.get('zona')),
      ciudad: textoOpcional(formData.get('ciudad')),
      municipio_id: municipioId,
      sector: textoOpcional(formData.get('sector')),
      condominio: textoOpcional(formData.get('condominio')),
      numero_casa: textoOpcional(formData.get('numero_casa')),
      niveles: textoOpcional(formData.get('niveles')),
      dormitorios: textoOpcional(formData.get('dormitorios')),
      banos: textoOpcional(formData.get('banos')),
      sala: textoOpcional(formData.get('sala')),
      comedor: textoOpcional(formData.get('comedor')),
      cocina: textoOpcional(formData.get('cocina')),
      estudio: textoOpcional(formData.get('estudio')),
      sala_familiar: textoOpcional(formData.get('sala_familiar')),
      habitacion_servicio: textoOpcional(formData.get('habitacion_servicio')),
      lavanderia: textoOpcional(formData.get('lavanderia')),
      jardin: textoOpcional(formData.get('jardin')),
      parqueos: numeroOpcional(formData.get('parqueos')),
      extras: textoOpcional(formData.get('extras')),
      area_construccion_m2: numeroOpcional(formData.get('area_construccion_m2')),
      area_terreno_m2: numeroOpcional(formData.get('area_terreno_m2')),
      medidas_terreno: textoOpcional(formData.get('medidas_terreno')),
      mantenimiento: numeroOpcional(formData.get('mantenimiento')),
      iusi: numeroOpcional(formData.get('iusi')),
      comision: textoOpcional(formData.get('comision')),
      hipoteca: textoOpcional(formData.get('hipoteca')),
      valor_hipoteca: numeroOpcional(formData.get('valor_hipoteca')),
      mascota: textoOpcional(formData.get('mascota')),
      acceso: textoOpcional(formData.get('acceso')),
      propietario_nombre: textoOpcional(formData.get('propietario_nombre')),
      colega_id: colegaId,
      captado_por: textoOpcional(formData.get('captado_por')),
      descripcion: textoOpcional(formData.get('descripcion')),
      comentarios: textoOpcional(formData.get('comentarios')),
    })
    .eq('id', propiedadId)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR PROPIEDAD ---')
    console.error(error)
    return { ok: false, mensaje: error.message }
  }

  if (organizationId) {
    const precioNuevo = Number(formData.get('precio'))
    const precioAnterior = propiedadAnterior?.precio != null ? Number(propiedadAnterior.precio) : null
    let encabezado = '✏️ Propiedad actualizada'
    if (precioAnterior != null && !Number.isNaN(precioNuevo)) {
      if (precioNuevo < precioAnterior) {
        encabezado = '💸 Propiedad baja de precio'
      } else if (precioNuevo > precioAnterior) {
        encabezado = '🔺 Propiedad cambió de precio'
      }
    }
    await notificarFichaPropiedad(
      supabase,
      propiedadId,
      organizationId,
      user.id,
      encabezado,
      'cambio_propiedad'
    )
  }

  revalidatePath('/dashboard/propiedades')
  revalidatePath(`/dashboard/propiedades/${propiedadId}`)
  revalidatePath(`/dashboard/propiedades/${propiedadId}/editar`)
  return { ok: true, propiedadId }
}

// cambiarEstadoPropiedad: sin uso confirmado en src/ (solo su propia
// definición). Se deja intacta, sin notificación, hasta que confirmes si
// se elimina o se retoma en algún flujo.
export async function cambiarEstadoPropiedad(propiedadId: string, nuevoEstado: string) {
  const supabase = await createClient()
  await supabase
    .from('propiedades')
    .update({ estado: nuevoEstado })
    .eq('id', propiedadId)
  revalidatePath('/dashboard/propiedades')
}

// ============================================================
// Gestión de fotos existentes (sesión #5)
// ============================================================

export async function establecerPortada(propiedadId: string, imagenId: string) {
  const supabase = await createClient()

  await supabase
    .from('imagenes_propiedad')
    .update({ es_portada: false })
    .eq('propiedad_id', propiedadId)

  await supabase
    .from('imagenes_propiedad')
    .update({ es_portada: true })
    .eq('id', imagenId)

  revalidatePath(`/dashboard/propiedades/${propiedadId}/editar`)
  revalidatePath(`/dashboard/propiedades/${propiedadId}`)
}

export async function eliminarImagenPropiedad(
  propiedadId: string,
  imagenId: string,
  rutaAlmacenamiento: string
) {
  const supabase = await createClient()

  await eliminarImagenR2(rutaAlmacenamiento)

  await supabase.from('imagenes_propiedad').delete().eq('id', imagenId)

  const { data: quedaPortada } = await supabase
    .from('imagenes_propiedad')
    .select('id')
    .eq('propiedad_id', propiedadId)
    .eq('es_portada', true)

  if (!quedaPortada || quedaPortada.length === 0) {
    const { data: restantes } = await supabase
      .from('imagenes_propiedad')
      .select('id')
      .eq('propiedad_id', propiedadId)
      .order('orden', { ascending: true })
      .limit(1)

    if (restantes && restantes.length > 0) {
      await supabase
        .from('imagenes_propiedad')
        .update({ es_portada: true })
        .eq('id', restantes[0].id)
    }
  }

  revalidatePath(`/dashboard/propiedades/${propiedadId}/editar`)
  revalidatePath(`/dashboard/propiedades/${propiedadId}`)
  revalidatePath('/dashboard/propiedades')
}

export async function moverImagen(
  propiedadId: string,
  imagenId: string,
  direccion: 'izquierda' | 'derecha'
) {
  const supabase = await createClient()

  const { data: imagenes } = await supabase
    .from('imagenes_propiedad')
    .select('id, orden')
    .eq('propiedad_id', propiedadId)
    .order('orden', { ascending: true })

  if (!imagenes) return

  const index = imagenes.findIndex((img) => img.id === imagenId)
  const nuevoIndex = direccion === 'izquierda' ? index - 1 : index + 1
  if (index === -1 || nuevoIndex < 0 || nuevoIndex >= imagenes.length) return

  const actual = imagenes[index]
  const vecino = imagenes[nuevoIndex]

  await supabase.from('imagenes_propiedad').update({ orden: vecino.orden }).eq('id', actual.id)
  await supabase.from('imagenes_propiedad').update({ orden: actual.orden }).eq('id', vecino.id)

  revalidatePath(`/dashboard/propiedades/${propiedadId}/editar`)
}

export async function eliminarPropiedad(propiedadId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (miPerfil?.rol !== 'administrador') {
    throw new Error('Solo un administrador puede eliminar propiedades.')
  }

  const { data: leads } = await supabase
    .from('leads')
    .select('id')
    .eq('propiedad_id', propiedadId)

  const leadIds = (leads ?? []).map((l) => l.id)

  if (leadIds.length > 0) {
    await supabase.from('documentos').delete().eq('tipo_relacionado', 'lead').in('id_relacionado', leadIds)
    await supabase.from('actividades').delete().in('lead_id', leadIds)
    await supabase.from('tareas').delete().in('lead_id', leadIds)
    await supabase.from('recibos').delete().in('lead_id', leadIds)
    await supabase.from('informes_evaluacion').delete().in('lead_id', leadIds)
    await supabase.from('leads').delete().in('id', leadIds)
  }

  const { data: imagenes } = await supabase
    .from('imagenes_propiedad')
    .select('id, ruta_almacenamiento')
    .eq('propiedad_id', propiedadId)

  for (const imagen of imagenes ?? []) {
    try {
      await eliminarImagenR2(imagen.ruta_almacenamiento)
    } catch (err) {
      console.error('No se pudo eliminar imagen de R2 (se continua con el borrado):', err)
    }
  }
  await supabase.from('imagenes_propiedad').delete().eq('propiedad_id', propiedadId)

  await supabase.from('coincidencias_propiedad').delete().eq('propiedad_id', propiedadId)

  await supabase.from('documentos').delete().eq('tipo_relacionado', 'propiedad').eq('id_relacionado', propiedadId)

  const { error } = await supabase.from('propiedades').delete().eq('id', propiedadId)

  if (error) {
    console.error('--- ERROR AL ELIMINAR PROPIEDAD ---', error)
    throw new Error(error.message)
  }

  revalidatePath('/dashboard/propiedades')
}
