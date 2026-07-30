import { createClient } from '@/lib/supabase/server'
import { urlSitio } from '@/lib/url'
import { notificarWhatsapp, obtenerChatIdGrupo, type GrupoWhatsapp } from '@/lib/whatsapp/notificar'
import { mensajeWhatsappPropiedad, type PropiedadMarketplace } from '@/lib/whatsapp/mensaje-marketplace'

const SELECT_PROPIEDAD_CON_MUNICIPIO = `
  *,
  municipio:municipios (nombre)
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

// WhatsApp cachea la vista previa de un enlace por URL exacta, de forma
// indefinida, sin herramienta oficial para forzarlo a refrescar. Se agrega
// un parámetro de versión para que cada notificación (nueva, cambio, ya no
// disponible) obligue a un rastreo nuevo en vez de reusar una miniatura
// vieja — importante sobre todo si la foto de portada cambia después.
export function urlPropiedadParaWhatsapp(slug: string | null): string | null {
  if (!slug) return null
  return `${urlSitio(`/propiedades/${slug}`)}?wa=${Date.now()}`
}

export async function notificarFichaPropiedad(
  supabase: Awaited<ReturnType<typeof createClient>>,
  propiedadId: string,
  organizationId: string,
  agenteId: string,
  encabezado: string,
  tipoNotificacion: string
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

  const enlace = urlPropiedadParaWhatsapp(fresca.slug)
  const mensaje = mensajeWhatsappPropiedad(aPropiedadMarketplace(fresca), { encabezado, enlace })

  await notificarWhatsapp({
    chatId,
    mensaje,
    organizationId,
    tipoNotificacion,
    agenteId,
  })
}
