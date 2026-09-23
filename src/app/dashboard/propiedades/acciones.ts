'use server'
import { createClient } from '@/lib/supabase/server'
import { subirImagen, eliminarImagenR2, copiarImagenR2 } from '@/lib/r2/subir-imagen'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { urlSitio } from '@/lib/url'
import { notificarFichaPropiedad } from '@/lib/whatsapp/notificar-propiedad'
import { parsearUbicacion } from '@/lib/ubicaciones/parsear'

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

// El radio de "publicable" siempre envia "true" o "false" (tiene default
// seleccionado en el formulario). Si por algun motivo llega ausente, se
// asume true para no bloquear la publicacion por defecto.
function booleano(valor: FormDataEntryValue | null, porDefecto = true) {
  if (valor === null || valor === '') return porDefecto
  return valor === 'true'
}

// Resuelve la ubicación de la propiedad en tres modos, según lo que
// envía SelectorUbicacion:
// - Selección existente sin editar: se usa el id tal cual.
// - "__nuevo__": se inserta una ubicación nueva (flujo original).
// - Existente + ubicacion_modo="editar": se actualiza esa fila en la
//   tabla `ubicaciones` (nombre y links), recalculando lat/lng. Esto
//   afecta a TODAS las propiedades que comparten esa ubicación, ya que
//   es un catálogo compartido por organización. RLS exige admin o
//   propietario de plataforma para el UPDATE (política "Solo admin
//   edita ubicaciones"), así que un agente sin permiso recibirá el
//   error de Supabase aquí mismo.
async function resolverUbicacionId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
  organizationId: string | undefined
): Promise<{ ubicacionId: string | null; error?: string }> {
  const ubicacionId = textoOpcional(formData.get('ubicacion_id'))
  const modo = textoOpcional(formData.get('ubicacion_modo'))

  if (ubicacionId && ubicacionId !== '__nuevo__' && modo === 'editar') {
    const nombreNuevo = formData.get('ubicacion_nombre_nuevo') as string
    const googleMapsUrl = textoOpcional(formData.get('ubicacion_google_maps_nuevo'))
    const wazeUrl = textoOpcional(formData.get('ubicacion_waze_nuevo'))

    const { lat, lng } = await parsearUbicacion(googleMapsUrl, wazeUrl)

    const { error } = await supabase
      .from('ubicaciones')
      .update({
        nombre: nombreNuevo,
        google_maps_url: googleMapsUrl,
        waze_url: wazeUrl,
        latitud: lat,
        longitud: lng,
      })
      .eq('id', ubicacionId)

    if (error) {
      return { ubicacionId: null, error: error.message }
    }

    return { ubicacionId }
  }

  if (ubicacionId !== '__nuevo__') {
    return { ubicacionId }
  }

  const nombreNuevo = formData.get('ubicacion_nombre_nuevo') as string
  const googleMapsUrl = textoOpcional(formData.get('ubicacion_google_maps_nuevo'))
  const wazeUrl = textoOpcional(formData.get('ubicacion_waze_nuevo'))

  const { lat, lng } = await parsearUbicacion(googleMapsUrl, wazeUrl)

  const { data: nuevaUbicacion, error } = await supabase
    .from('ubicaciones')
    .insert({
      nombre: nombreNuevo,
      google_maps_url: googleMapsUrl,
      waze_url: wazeUrl,
      latitud: lat,
      longitud: lng,
      organization_id: organizationId,
    })
    .select()
    .single()

  if (error) {
    return { ubicacionId: null, error: error.message }
  }

  return { ubicacionId: nuevaUbicacion.id }
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

  const { ubicacionId, error: errorUbicacion } = await resolverUbicacionId(supabase, formData, organizationId)
  if (errorUbicacion) {
    return { ok: false, mensaje: errorUbicacion }
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
      bodega: textoOpcional(formData.get('bodega')),
      balcon: textoOpcional(formData.get('balcon')),
      acceso: textoOpcional(formData.get('acceso')),
      propietario_nombre: textoOpcional(formData.get('propietario_nombre')),
      colega_id: colegaId,
      ubicacion_id: ubicacionId,
      captado_por: textoOpcional(formData.get('captado_por')),
      descripcion: textoOpcional(formData.get('descripcion')),
      comentarios: textoOpcional(formData.get('comentarios')),
      publicable: booleano(formData.get('publicable')),
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

  const { ubicacionId, error: errorUbicacion } = await resolverUbicacionId(supabase, formData, organizationId)
  if (errorUbicacion) {
    return { ok: false, mensaje: errorUbicacion }
  }

  const titulo = formData.get('titulo') as string

  // Se trae la fila completa (no solo "precio") para poder comparar,
  // campo por campo, contra los datos nuevos y así saber si hubo un
  // cambio real antes de decidir si se notifica por WhatsApp.
  const { data: propiedadAnterior } = await supabase
    .from('propiedades')
    .select('*')
    .eq('id', propiedadId)
    .single()

  const nuevosDatos = {
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
    bodega: textoOpcional(formData.get('bodega')),
    balcon: textoOpcional(formData.get('balcon')),
    acceso: textoOpcional(formData.get('acceso')),
    propietario_nombre: textoOpcional(formData.get('propietario_nombre')),
    colega_id: colegaId,
    ubicacion_id: ubicacionId,
    captado_por: textoOpcional(formData.get('captado_por')),
    descripcion: textoOpcional(formData.get('descripcion')),
    comentarios: textoOpcional(formData.get('comentarios')),
    publicable: booleano(formData.get('publicable')),
  }

  // ¿Hubo algún cambio real? Se compara cada campo contra el valor que
  // ya existía en la base de datos. Si no hay fila anterior (no debería
  // pasar) se asume que sí hay cambios, para no bloquear la notificación
  // por un error inesperado de lectura.
  const hayCambios = propiedadAnterior
    ? (Object.keys(nuevosDatos) as (keyof typeof nuevosDatos)[]).some(
        (campo) => (propiedadAnterior as Record<string, unknown>)[campo] !== nuevosDatos[campo]
      )
    : true

  const { error } = await supabase
    .from('propiedades')
    .update(nuevosDatos)
    .eq('id', propiedadId)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR PROPIEDAD ---')
    console.error(error)
    return { ok: false, mensaje: error.message }
  }

  if (organizationId && hayCambios) {
    const precioNuevo = Number(formData.get('precio'))
    const precioAnterior = propiedadAnterior?.precio != null ? Number(propiedadAnterior.precio) : null
    let encabezado = '✏️ Propiedad actualizada'
    let tipoNotificacion = 'cambio_propiedad'
    if (precioAnterior != null && !Number.isNaN(precioNuevo)) {
      if (precioNuevo < precioAnterior) {
        encabezado = '💸 Propiedad baja de precio'
        tipoNotificacion = 'baja_precio'
      } else if (precioNuevo > precioAnterior) {
        encabezado = '💰 Propiedad sube de precio'
        tipoNotificacion = 'sube_precio'
      }
    }
    await notificarFichaPropiedad(
      supabase,
      propiedadId,
      organizationId,
      user.id,
      encabezado,
      tipoNotificacion
    )
  }

  revalidatePath('/dashboard/propiedades')
  revalidatePath(`/dashboard/propiedades/${propiedadId}`)
  revalidatePath(`/dashboard/propiedades/${propiedadId}/editar`)
  return { ok: true, propiedadId }
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

export async function reordenarImagenes(propiedadId: string, idsEnOrden: string[]) {
  const supabase = await createClient()

  await Promise.all(
    idsEnOrden.map((id, index) =>
      supabase.from('imagenes_propiedad').update({ orden: index }).eq('id', id)
    )
  )

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

// ============================================================
// Duplicar propiedad para la operación alterna (venta<->renta)
// cuando el texto pegado en el extractor de IA describe ambas.
// Se copian todos los campos de la propiedad recién guardada
// (misma ubicación, municipio, colega, m², descripción, etc.) y
// solo se sobreescriben los campos que realmente cambian entre
// un anuncio de venta y uno de renta. Las fotos se copian en R2
// (no se vuelven a subir desde el navegador).
// ============================================================

export type DatosOperacionAlterna = {
  tipo_operacion: string
  precio: number
  moneda: string
  mantenimiento: number | null
  // Comisión propia de la operación alterna: NO se copia de la propiedad
  // origen porque venta y renta suelen tener comisiones distintas. Si el
  // agente no la selecciona (vía el campo "Comisión" de Información
  // interna, cambiando de pestaña venta/renta), queda null y debe
  // completarse luego editando esa propiedad.
  comision: string | null
  // Requisitos de renta propios de la operación alterna, con el mismo
  // criterio que comisión: solo aplica si la alterna es renta, y se toma
  // de lo que el agente seleccionó en "Requisitos de renta" mientras esa
  // pestaña estuvo activa (no se hereda de la propiedad origen).
  requisitos_renta: string | null
}

export async function duplicarPropiedadOperacionAlterna(
  propiedadIdOrigen: string,
  datos: DatosOperacionAlterna
): Promise<{ ok: boolean; mensaje?: string; propiedadId?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, mensaje: 'No autenticado.' }
  }

  const { data: origen, error: errorOrigen } = await supabase
    .from('propiedades')
    .select('*')
    .eq('id', propiedadIdOrigen)
    .single()

  if (errorOrigen || !origen) {
    return { ok: false, mensaje: errorOrigen?.message ?? 'No se encontró la propiedad original.' }
  }

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const slug = generarSlug(origen.titulo as string)

  // Se excluyen: id/creado_en (los genera la base), slug (se recalcula),
  // codigo (lo asigna un trigger propio, debe ser único por propiedad),
  // notificado_nueva_propiedad (debe arrancar en false para la nueva fila).
  const {
    id: _id,
    creado_en: _creadoEn,
    slug: _slugOrigen,
    codigo: _codigo,
    notificado_nueva_propiedad: _notificado,
    ...resto
  } = origen as Record<string, unknown>

  const { data: nuevaPropiedad, error: errorInsert } = await supabase
    .from('propiedades')
    .insert({
      ...resto,
      slug,
      tipo_operacion: datos.tipo_operacion,
      precio: datos.precio,
      moneda: datos.moneda,
      mantenimiento: datos.mantenimiento,
      // Se sobreescriben explícitamente (no se heredan de `resto`, que trae
      // los valores de la propiedad origen): venta y renta cobran comisión
      // distinta y solo renta lleva requisitos, así que cada operación debe
      // declarar los suyos en vez de heredar los de la propiedad origen.
      comision: datos.comision,
      requisitos_renta: datos.tipo_operacion === 'renta' ? (datos.requisitos_renta ?? null) : null,
    })
    .select()
    .single()

  if (errorInsert) {
    console.error('--- ERROR AL DUPLICAR PROPIEDAD (operación alterna) ---', errorInsert)
    return { ok: false, mensaje: errorInsert.message }
  }

  const nuevoId = nuevaPropiedad.id as string

  const { data: imagenesOrigen } = await supabase
    .from('imagenes_propiedad')
    .select('ruta_almacenamiento, es_portada, orden')
    .eq('propiedad_id', propiedadIdOrigen)
    .order('orden', { ascending: true })

  let urlPortadaNueva: string | undefined

  for (const imagen of imagenesOrigen ?? []) {
    try {
      const nuevaRuta = await copiarImagenR2(imagen.ruta_almacenamiento, nuevoId)
      await supabase.from('imagenes_propiedad').insert({
        propiedad_id: nuevoId,
        ruta_almacenamiento: nuevaRuta,
        es_portada: imagen.es_portada,
        orden: imagen.orden,
      })
      if (imagen.es_portada) urlPortadaNueva = nuevaRuta
    } catch (err) {
      console.error('No se pudo copiar una imagen a la propiedad duplicada (se continúa con el resto):', err)
    }
  }

  if (miPerfil?.organization_id) {
    const { data: gano, error: errorFlag } = await supabase
      .from('propiedades')
      .update({ notificado_nueva_propiedad: true })
      .eq('id', nuevoId)
      .eq('notificado_nueva_propiedad', false)
      .select('id')
      .maybeSingle()

    if (!errorFlag && gano) {
      try {
        await notificarFichaPropiedad(
          supabase,
          nuevoId,
          miPerfil.organization_id,
          user.id,
          '🆕 Nueva propiedad publicada',
          'nueva_propiedad',
          urlPortadaNueva
        )
      } catch (errNotif) {
        console.error(`--- ERROR AL NOTIFICAR WHATSAPP (propiedad duplicada ${nuevoId}) ---`, errNotif)
      }
    }
  }

  revalidatePath('/dashboard/propiedades')
  return { ok: true, propiedadId: nuevoId }
}
