import { createClient } from '@/lib/supabase/server'
import { urlSitio } from '@/lib/url'
import { notificarWhatsapp, obtenerChatIdGrupo, type GrupoWhatsapp } from '@/lib/whatsapp/notificar'
import { mensajeWhatsappPropiedad, type PropiedadMarketplace } from '@/lib/whatsapp/mensaje-marketplace'
const SELECT_PROPIEDAD_CON_MUNICIPIO = `
  *,
  municipio:municipios (nombre),
  colega:colegas (nombre)
`
function aPropiedadMarketplace(row: any): PropiedadMarketplace & { codigo: string | null } {
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
