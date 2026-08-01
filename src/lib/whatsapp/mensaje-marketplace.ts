import { REQUISITOS_RENTA, type CodigoRequisitosRenta } from '@/app/dashboard/propiedades/requisitos-renta'

const EMOJI_TIPO: Record<string, string> = {
  casa: '🛏️',
  apartamento: '🏢',
  terreno: '🌳',
  bodega: '📦',
  oficina: '💼',
  ofibodega: '🏭',
  finca: '🌾',
  granja: '🐄',
}

export type PropiedadMarketplace = {
  codigo?: string | null
  titulo: string
  tipo_operacion: string | null
  tipo_propiedad: string | null
  direccion: string | null
  condominio: string | null
  numero_casa: string | null
  sector: string | null
  zona: string | null
  ciudad: string | null
  municipioNombre: string | null
  niveles: string | null
  area_construccion_m2: number | null
  area_terreno_m2: number | null
  medidas_terreno: string | null
  dormitorios: string | null
  banos: string | null
  estudio: string | null
  sala_familiar: string | null
  habitacion_servicio: string | null
  lavanderia: string | null
  jardin: string | null
  parqueos: number | null
  extras: string | null
  precio: number | null
  moneda: string | null
  iusi: number | null
  mantenimiento: number | null
  mascota: string | null
  requisitos_renta: string | null
}

// Núcleo compartido. "codigo" es opcional a propósito: cuando no se pasa
// (el botón "Copiar para Marketplace" no lo pasa), no aparece esa fila,
// así que generarTextoMarketplace() sigue produciendo exactamente el mismo
// texto que hoy usa el botón — nada cambia para Facebook Marketplace.
function generarBloquesPropiedad(p: PropiedadMarketplace): (string | false | null)[] {
  const emojiTipo = EMOJI_TIPO[p.tipo_propiedad ?? ''] ?? '🏠'
  const negocio = p.tipo_operacion === 'renta' ? 'RENTA' : 'VENTA'
  const tipoLabel = (p.tipo_propiedad ?? 'PROPIEDAD').toUpperCase()

  const ubicacion = [p.direccion, p.condominio, p.numero_casa && `Casa ${p.numero_casa}`, p.sector, p.zona, p.municipioNombre, p.ciudad]
    .filter(Boolean)
    .join(', ')

  const lineasDetalle = [
    p.niveles && `▪️ Niveles: ${p.niveles}`,
    p.area_construccion_m2 && `▪️ Construcción: ${p.area_construccion_m2} m²`,
    p.area_terreno_m2 && `▪️ Terreno: ${p.area_terreno_m2} m²`,
    p.medidas_terreno && `▪️ Medidas del terreno: ${p.medidas_terreno}`,
  ].filter(Boolean)

  const lineasDistribucion = [
    p.dormitorios && `• ${p.dormitorios} Dormitorios`,
    p.banos && `• ${p.banos} Baños`,
    '• Sala | Comedor | Cocina',
    p.estudio && '• Estudio',
    p.sala_familiar && '• Sala familiar',
    p.habitacion_servicio && '• Cuarto de servicio',
    p.lavanderia && '• Área de lavandería',
    p.jardin && '• Jardín',
    p.parqueos && `• Parqueo para ${p.parqueos} vehículo${p.parqueos > 1 ? 's' : ''} 🚗`,
  ].filter(Boolean)

  const textoMantenimiento =
    !p.mantenimiento || Number(p.mantenimiento) === 0
      ? '🛠️ Mantenimiento incluido'
      : `🛠️ Mantenimiento: ${p.moneda ?? 'Q'} ${Number(p.mantenimiento).toLocaleString()}`

  const textoMascota = p.mascota === 'Si' ? '🐾 Se aceptan mascotas' : null

  const requisitos =
    p.tipo_operacion === 'renta' && p.requisitos_renta
      ? REQUISITOS_RENTA[p.requisitos_renta as CodigoRequisitosRenta]
      : null

  const lineasRequisitos = requisitos
    ? [
        '📋 Requisitos para aplicar:',
        ...requisitos.titular.map((r) => `• ${r}`),
        `• Contrato mínimo: ${requisitos.contratoMinimo}`,
        `• Depósito: ${requisitos.deposito}`,
      ]
    : []

  return [
    `${tipoLabel} EN ${negocio}${ubicacion ? ` - ${ubicacion}` : ''}`,
    p.codigo ? `📌 Código: ${p.codigo}` : null,
    lineasDetalle.length > 0 && `📐 Detalles de la propiedad:\n${lineasDetalle.join('\n')}`,
    lineasDistribucion.length > 0 && `${emojiTipo} Distribución:\n${lineasDistribucion.join('\n')}`,
    p.extras && `✨ Extras:\n${p.extras}`,
    textoMascota,
    lineasRequisitos.length > 0 && lineasRequisitos.join('\n'),
    p.precio ? `💰 PRECIO DE ${negocio}: ${p.moneda ?? 'Q'} ${Number(p.precio).toLocaleString()}` : false,
    p.iusi ? `📑 IUSI: ${p.moneda ?? 'Q'} ${Number(p.iusi).toLocaleString()}` : false,
    textoMantenimiento,
  ]
}

export function generarTextoMarketplace(p: PropiedadMarketplace): string {
  return generarBloquesPropiedad(p).filter(Boolean).join('\n\n')
}

export function mensajeWhatsappPropiedad(
  p: PropiedadMarketplace & { codigo: string | null },
  opts: { encabezado: string; enlace: string | null }
): string {
  const bloques = [opts.encabezado, ...generarBloquesPropiedad(p)]
  if (opts.enlace) bloques.push(opts.enlace)
  return bloques.filter(Boolean).join('\n\n')
}
