import { createClient } from '@/lib/supabase/server'
import { urlSitio } from '@/lib/url'
import { notificarWhatsapp, obtenerChatIdGrupo, telefonoAChatId, type GrupoWhatsapp } from '@/lib/whatsapp/notificar'
import { mensajeWhatsappPropiedad, type PropiedadMarketplace } from '@/lib/whatsapp/mensaje-marketplace'
import { ETIQUETAS_CARACTERISTICA } from '@/app/dashboard/requerimientos/constantes'

const ETAPAS_TERMINALES_LEAD = ['ganada', 'reservada', 'perdida']

// Avisa por WhatsApp a cada asesor que tenga leads (no terminales)
// interesados en esta propiedad — por leads.propiedad_id (interés
// principal) o por la tabla lead_propiedades (interés adicional). Un solo
// mensaje por asesor aunque tenga varios leads interesados en la misma
// propiedad; construirMensaje recibe los nombres de esos contactos ya
// unidos en texto.
export async function notificarLeadsInteresadosPropiedad(
  supabase: Awaited<ReturnType<typeof createClient>>,
  propiedadId: string,
  organizationId: string,
  tipoNotificacion: string,
  construirMensaje: (nombresContactos: string) => string
) {
  const [{ data: directos }, { data: relacionados }] = await Promise.all([
    supabase.from('leads').select('id').eq('propiedad_id', propiedadId).eq('organization_id', organizationId),
    supabase.from('lead_propiedades').select('lead_id').eq('propiedad_id', propiedadId),
  ])
  const idsLeads = Array.from(new Set([...(directos ?? []).map((l) => l.id), ...(relacionados ?? []).map((r) => r.lead_id)]))
  if (idsLeads.length === 0) return

  const { data: leads } = await supabase
    .from('leads')
    .select('id, agente_id, etapa, contacto:contactos(nombre_completo), agente:perfiles(nombre_completo, telefono)')
    .in('id', idsLeads)
    .not('etapa', 'in', `(${ETAPAS_TERMINALES_LEAD.join(',')})`)
  if (!leads || leads.length === 0) return

  const porAsesor = new Map<string, { telefono: string; contactos: string[] }>()
  for (const l of leads as any[]) {
    const agente = Array.isArray(l.agente) ? l.agente[0] : l.agente
    const contacto = Array.isArray(l.contacto) ? l.contacto[0] : l.contacto
    if (!agente?.telefono) continue
    const entrada = porAsesor.get(l.agente_id) ?? { telefono: agente.telefono, contactos: [] as string[] }
    entrada.contactos.push(contacto?.nombre_completo ?? 'un cliente')
    porAsesor.set(l.agente_id, entrada)
  }

  for (const [agenteId, { telefono, contactos }] of porAsesor) {
    await notificarWhatsapp({
      chatId: telefonoAChatId(telefono),
      mensaje: construirMensaje(contactos.join(', ')),
      organizationId,
      tipoNotificacion,
      agenteId,
    })
  }
}
export const SELECT_PROPIEDAD_CON_MUNICIPIO = `
  *,
  municipio:municipios (nombre),
  colega:colegas (nombre)
`
export function aPropiedadMarketplace(row: any): PropiedadMarketplace & { codigo: string | null } {
  return {
    titulo: row.titulo,
    tipo_operacion: row.tipo_operacion,
    tipo_propiedad: row.tipo_propiedad,
    direccion: row.direccion,
    condominio: row.condominio,
    numero_casa: row.numero_casa,
    sector: row.sector,
    zona: row.zona,
    ciudad: row.ciudad,
    municipioNombre: row.municipio?.nombre ?? null,
    niveles: row.niveles,
    area_construccion_m2: row.area_construccion_m2,
    area_terreno_m2: row.area_terreno_m2,
    medidas_terreno: row.medidas_terreno,
    dormitorios: row.dormitorios,
    banos: row.banos,
    sala: row.sala,
    comedor: row.comedor,
    cocina: row.cocina,
    estudio: row.estudio,
    sala_familiar: row.sala_familiar,
    habitacion_servicio: row.habitacion_servicio,
    lavanderia: row.lavanderia,
    jardin: row.jardin,
    bodega: row.bodega,
    balcon: row.balcon,
    parqueos: row.parqueos,
    extras: row.extras,
    precio: row.precio,
    moneda: row.moneda,
    iusi: row.iusi,
    mantenimiento: row.mantenimiento,
    mascota: row.mascota,
    requisitos_renta: row.requisitos_renta,
    codigo: row.codigo,
  }
}
export function grupoParaOperacion(tipoOperacion: string | null): GrupoWhatsapp | null {
  if (tipoOperacion === 'venta') return 'ventas'
  if (tipoOperacion === 'renta') return 'rentas'
  return null
}
// El enlace apunta al detalle interno del dashboard (no a la ficha pública
// por slug), porque los grupos de WhatsApp son solo de agentes. Si el
// agente no tiene sesión activa en el navegador, el dashboard lo manda a
// login antes de mostrar la propiedad.
// WhatsApp cachea la vista previa de un enlace por URL exacta, de forma
// indefinida, sin herramienta oficial para forzarlo a refrescar. Se agrega
// un parámetro de versión para que cada notificación (nueva, cambio, ya no
// disponible) obligue a un rastreo nuevo en vez de reusar una miniatura
// vieja — aplica solo cuando se envía como link de texto, no cuando se
// envía la foto como archivo adjunto.
export function urlPropiedadParaWhatsapp(propiedadId: string): string {
  return `${urlSitio(`/dashboard/propiedades/${propiedadId}`)}?wa=${Date.now()}`
}
// Busca la portada actual en la base de datos. Se usa cuando el llamador no
// tiene ya en mano la URL de la imagen recién subida (ej. en ediciones o
// cambios de estado, donde no hubo una subida de foto en esa misma petición).
export async function obtenerUrlPortada(
  supabase: Awaited<ReturnType<typeof createClient>>,
  propiedadId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('imagenes_propiedad')
    .select('ruta_almacenamiento')
    .eq('propiedad_id', propiedadId)
    .eq('es_portada', true)
    .order('orden', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error(`No se pudo obtener portada de propiedad ${propiedadId}:`, error)
    return null
  }
  return data?.ruta_almacenamiento ?? null
}
export async function notificarFichaPropiedad(
  supabase: Awaited<ReturnType<typeof createClient>>,
  propiedadId: string,
  organizationId: string,
  agenteId: string,
  encabezado: string,
  tipoNotificacion: string,
  imagenPortadaUrl?: string | null
) {
  const { data: fresca, error } = await supabase
    .from('propiedades')
    .select(SELECT_PROPIEDAD_CON_MUNICIPIO)
    .eq('id', propiedadId)
    .single()
  if (error || !fresca) {
    console.error(`No se pudo releer propiedad ${propiedadId} para notificar WhatsApp:`, error)
    return
  }
  const grupo = grupoParaOperacion(fresca.tipo_operacion)
  if (!grupo) {
    console.error(`Propiedad ${propiedadId}: tipo_operacion="${fresca.tipo_operacion}" no tiene grupo de WhatsApp configurado.`)
    return
  }
  const chatId = await obtenerChatIdGrupo(supabase, organizationId, grupo)
  if (!chatId) {
    console.error(`Propiedad ${propiedadId}: grupo "${grupo}" no configurado en organizaciones.`)
    return
  }
  const enlace = urlPropiedadParaWhatsapp(propiedadId)
  const { data: agentePerfil } = await supabase
    .from('perfiles')
    .select('nombre_completo')
    .eq('id', agenteId)
    .maybeSingle()
  const mensaje = mensajeWhatsappPropiedad(aPropiedadMarketplace(fresca), {
    encabezado,
    enlace,
    agenteNombre: agentePerfil?.nombre_completo ?? null,
    modalidadCaptacion: fresca.modalidad_captacion ?? null,
    colegaNombre: fresca.colega?.nombre ?? null,
    publicable: fresca.publicable,
  })
  const imagenUrl = imagenPortadaUrl !== undefined
    ? imagenPortadaUrl
    : await obtenerUrlPortada(supabase, propiedadId)
  await notificarWhatsapp({
    chatId,
    mensaje,
    organizationId,
    tipoNotificacion,
    agenteId,
    imagenUrl,
  })
}

// ---------------------------------------------------------------------
// Ben: avisa a un agente cuando una propiedad recién ingresada coincide
// con un requerimiento que él registró. dormitorios/banos/niveles son
// columnas de texto en propiedades (igual que en el resto del proyecto),
// por eso se parsean con Number(...) en vez de compararse directo.
// ---------------------------------------------------------------------

const UMBRAL_COINCIDENCIA_REQUERIMIENTO = 80

function numeroONull(valor: unknown): number | null {
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

function propiedadTieneCaracteristica(propiedad: any, caracteristica: string): boolean {
  const texto = `${propiedad.amenidades ?? ''} ${propiedad.extras ?? ''} ${propiedad.descripcion ?? ''}`.toLowerCase()
  switch (caracteristica) {
    case 'mascotas': return !!propiedad.mascota && propiedad.mascota.trim().toLowerCase() !== 'no'
    case 'closets': return texto.includes('closet')
    case 'pergola': return texto.includes('pérgola') || texto.includes('pergola')
    case 'parqueo_techado': return texto.includes('techado')
    case 'piscina': return texto.includes('piscina')
    case 'gimnasio': return texto.includes('gimnasio') || texto.includes('gym')
    case 'salon_eventos': return texto.includes('salón') || texto.includes('salon') || texto.includes('eventos')
    case 'seguridad_24h': return texto.includes('seguridad')
    case 'cancha_deportiva': return texto.includes('cancha')
    case 'area_de_juegos': return texto.includes('juegos')
    case 'amueblado': return texto.includes('amueblado') || texto.includes('amoblad')
    case 'jardin': return !!propiedad.jardin || texto.includes('jardín') || texto.includes('jardin')
    case 'terraza': return texto.includes('terraza')
    case 'bodega': return propiedad.bodega === 'Si' || texto.includes('bodega')
    default: return false
  }
}

// Puntaje 0-100: se reparte en 6 "cubetas" (operación, tipo, ubicación,
// precio, distribución de ambientes, características) de peso fijo. Una
// cubeta solo cuenta si el requerimiento de verdad pidió algo en ella —
// si no, no entra ni al numerador ni al denominador, para que un
// requerimiento con pocos criterios llenados igual pueda llegar a 100%
// en vez de quedar artificialmente bajo por campos que nunca se pidieron.
export function evaluarCoincidenciaRequerimiento(
  propiedad: any,
  requerimiento: any
): { score: number; caracteristicasCoincidentes: string[] } {
  let ganados = 0
  let aplicables = 0

  if (requerimiento.tipo_operacion) {
    aplicables += 10
    if (propiedad.tipo_operacion === requerimiento.tipo_operacion) ganados += 10
  }

  if (requerimiento.tipo_propiedad) {
    aplicables += 10
    if (propiedad.tipo_propiedad === requerimiento.tipo_propiedad) ganados += 10
  }

  if (requerimiento.zona || requerimiento.sector || requerimiento.municipio_id) {
    aplicables += 20
    const zonaOk = !!requerimiento.zona && !!propiedad.zona && propiedad.zona.toLowerCase().includes(String(requerimiento.zona).toLowerCase())
    const sectorOk = !!requerimiento.sector && !!propiedad.sector && propiedad.sector.toLowerCase().includes(String(requerimiento.sector).toLowerCase())
    const municipioOk = !!requerimiento.municipio_id && requerimiento.municipio_id === propiedad.municipio_id
    if (zonaOk || sectorOk || municipioOk) ganados += 20
  }

  // Si las monedas no coinciden no se compara (evita asumir un tipo de
  // cambio que podría quedar desactualizado) — esa cubeta simplemente no aplica.
  if ((requerimiento.precio_min || requerimiento.precio_max) && requerimiento.moneda === propiedad.moneda) {
    aplicables += 20
    const min = requerimiento.precio_min ?? 0
    const max = requerimiento.precio_max ?? Infinity
    const precioProp = Number(propiedad.precio ?? NaN)
    if (Number.isFinite(precioProp) && precioProp >= min && precioProp <= max) ganados += 20
  }

  const subcriteriosDistribucion: Array<[number | null | undefined, number | null]> = [
    [requerimiento.dormitorios_min, numeroONull(propiedad.dormitorios)],
    [requerimiento.banos_min, numeroONull(propiedad.banos)],
    [requerimiento.niveles_min, numeroONull(propiedad.niveles)],
    [requerimiento.parqueos_min, propiedad.parqueos ?? null],
    [requerimiento.area_min, propiedad.area_construccion_m2 ?? propiedad.area_terreno_m2 ?? null],
  ]
  const aplicablesDistribucion = subcriteriosDistribucion.filter(([req]) => req !== null && req !== undefined)
  if (aplicablesDistribucion.length > 0) {
    aplicables += 20
    const cumplidos = aplicablesDistribucion.filter(([req, val]) => val !== null && val >= req!).length
    ganados += 20 * (cumplidos / aplicablesDistribucion.length)
  }

  const caracteristicasPedidas: string[] = requerimiento.caracteristicas_deseadas ?? []
  const otras = String(requerimiento.otras_caracteristicas ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const totalCaracteristicas = caracteristicasPedidas.length + otras.length
  const caracteristicasCoincidentes: string[] = []
  if (totalCaracteristicas > 0) {
    aplicables += 20
    const textoPropiedad = `${propiedad.amenidades ?? ''} ${propiedad.extras ?? ''} ${propiedad.descripcion ?? ''}`.toLowerCase()
    for (const c of caracteristicasPedidas) {
      if (propiedadTieneCaracteristica(propiedad, c)) caracteristicasCoincidentes.push(ETIQUETAS_CARACTERISTICA[c] ?? c)
    }
    for (const o of otras) {
      if (textoPropiedad.includes(o.toLowerCase())) caracteristicasCoincidentes.push(o)
    }
    ganados += 20 * (caracteristicasCoincidentes.length / totalCaracteristicas)
  }

  if (aplicables === 0) return { score: 0, caracteristicasCoincidentes: [] }
  return { score: Math.round((ganados / aplicables) * 100), caracteristicasCoincidentes }
}

// Se llama al crear una propiedad (no al editarla): recorre los
// requerimientos de la organización y avisa por WhatsApp, en privado, al
// agente que registró cada uno que llegue al umbral — nunca al grupo, esto
// es un aviso dirigido a una sola persona sobre su propio cliente.
export async function notificarRequerimientosCoincidentes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  propiedadId: string,
  organizationId: string
) {
  const { data: propiedad } = await supabase.from('propiedades').select('*').eq('id', propiedadId).single()
  if (!propiedad) return

  const { data: requerimientos } = await supabase
    .from('requerimientos')
    .select('*, contacto:contactos(nombre_completo), creador:perfiles!creado_por(nombre_completo, telefono)')
    .eq('organization_id', organizationId)
    .eq('estado', 'abierto')
  if (!requerimientos || requerimientos.length === 0) return

  for (const requerimiento of requerimientos as any[]) {
    const { score, caracteristicasCoincidentes } = evaluarCoincidenciaRequerimiento(propiedad, requerimiento)
    if (score < UMBRAL_COINCIDENCIA_REQUERIMIENTO) continue

    const creador = Array.isArray(requerimiento.creador) ? requerimiento.creador[0] : requerimiento.creador
    const contacto = Array.isArray(requerimiento.contacto) ? requerimiento.contacto[0] : requerimiento.contacto
    if (!creador?.telefono) continue

    const ubicacion = [propiedad.zona ? `Zona ${propiedad.zona}` : null, propiedad.sector].filter(Boolean).join(' · ')
    const area = propiedad.area_construccion_m2 ?? propiedad.area_terreno_m2
    const detalles = [
      propiedad.dormitorios ? `${propiedad.dormitorios} hab` : null,
      propiedad.banos ? `${propiedad.banos} baños` : null,
      area ? `${area} m²` : null,
    ].filter(Boolean).join(' · ')
    const precioTxt = `${propiedad.moneda ?? 'GTQ'} ${Number(propiedad.precio ?? 0).toLocaleString()}`

    const mensaje = [
      `🎯 *¡Posible coincidencia con un requerimiento!* (${score}%)`,
      `Esta propiedad recién ingresada podría interesarle a ${contacto?.nombre_completo ?? 'tu cliente'}:`,
      '',
      `🏠 ${propiedad.titulo}`,
      `🔑 Código: ${propiedad.codigo}`,
      ubicacion ? `📍 ${ubicacion}` : null,
      `💰 ${precioTxt}`,
      detalles ? `📐 ${detalles}` : null,
      caracteristicasCoincidentes.length > 0 ? `✅ Coincide en: ${caracteristicasCoincidentes.join(', ')}` : null,
      '',
      urlPropiedadParaWhatsapp(propiedadId),
    ].filter(Boolean).join('\n')

    await notificarWhatsapp({
      chatId: telefonoAChatId(creador.telefono),
      mensaje,
      organizationId,
      tipoNotificacion: 'requerimiento_coincidente',
      agenteId: requerimiento.creado_por,
      contactoId: requerimiento.contacto_id,
    })
  }
}
