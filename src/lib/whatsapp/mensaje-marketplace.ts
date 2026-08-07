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

// Umbral (en caracteres) que decide la estructura del texto en
// "Copiar para Marketplace": por debajo, se agrega la descripción a la
// estructura completa; en o por encima, se usa la estructura reducida
// (Título, Código, Descripción, Requisitos).
const UMBRAL_DESCRIPCION_CORTA = 50

export type PropiedadMarketplace = {
  codigo?: string | null
  titulo: string
  descripcion?: string | null
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

function lineasRequisitos(p: PropiedadMarketplace): string[] {
  const requisitos =
    p.tipo_operacion === 'renta' && p.requisitos_renta
      ? REQUISITOS_RENTA[p.requisitos_renta as CodigoRequisitosRenta]
      : null

  if (!requisitos) return []

  return [
    '📋 Requisitos para aplicar:',
    ...requisitos.titular.map((r) => `• ${r}`),
    `• Contrato mínimo: ${requisitos.contratoMinimo}`,
    `• Depósito: ${requisitos.deposito}`,
  ]
}

// Núcleo compartido. "codigo" es opcional a propósito: cuando no se pasa,
// no aparece esa fila. `incluirDescripcion` solo lo activa la rama de
// descripción corta de generarTextoMarketplace(); mensajeWhatsappPropiedad()
// (notificaciones automáticas a grupos) nunca lo pasa, así que su salida
// no cambia.
function generarBloquesPropiedad(
  p: PropiedadMarketplace,
  opts?: { incluirDescripcion?: boolean }
): (string | false | null)[] {
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
      : `🛠️ Mantenimiento: ${p.moneda ?? 'Q'}${Number(p.mantenimiento).toLocaleString()}`

  const textoMascota = p.mascota === 'Si' ? '🐾 Se aceptan mascotas' : null

  const requisitos = lineasRequisitos(p)

  return [
    `${tipoLabel} EN ${negocio}${ubicacion ? ` - ${ubicacion}` : ''}`,
    p.codigo ? `📌 Código: ${p.codigo}` : null,
    opts?.incluirDescripcion && p.descripcion ? `📝 Descripción:\n${p.descripcion}` : null,
    lineasDetalle.length > 0 && `📐 Detalles de la propiedad:\n${lineasDetalle.join('\n')}`,
    lineasDistribucion.length > 0 && `${emojiTipo} Distribución:\n${lineasDistribucion.join('\n')}`,
    p.extras && `✨ Extras:\n${p.extras}`,
    textoMascota,
    requisitos.length > 0 && requisitos.join('\n'),
    p.precio ? `💰 PRECIO DE ${negocio}: ${p.moneda ?? 'Q'}${Number(p.precio).toLocaleString()}` : false,
    p.iusi ? `📑 IUSI: ${p.moneda ?? 'Q'}${Number(p.iusi).toLocaleString()}` : false,
    textoMantenimiento,
  ]
}

// Estructura reducida: Título, Código, Descripción, Requisitos para
// aplicar. Se usa cuando la descripción ya trae suficiente detalle
// (>= UMBRAL_DESCRIPCION_CORTA caracteres), para no duplicar información.
function generarBloquesResumen(p: PropiedadMarketplace): (string | false | null)[] {
  const requisitos = lineasRequisitos(p)

  return [
    p.titulo,
    p.codigo ? `📌 Código: ${p.codigo}` : null,
    p.descripcion ?? null,
    requisitos.length > 0 && requisitos.join('\n'),
  ]
}

export function generarTextoMarketplace(p: PropiedadMarketplace): string {
  const descripcionCorta = (p.descripcion?.trim().length ?? 0) < UMBRAL_DESCRIPCION_CORTA

  const bloques = descripcionCorta
    ? generarBloquesPropiedad(p, { incluirDescripcion: true })
    : generarBloquesResumen(p)

  return bloques.filter(Boolean).join('\n\n')
}

export function mensajeWhatsappPropiedad(
  p: PropiedadMarketplace & { codigo: string | null },
  opts: { encabezado: string; enlace: string | null }
): string {
  const bloques = [opts.encabezado, ...generarBloquesPropiedad(p)]
  if (opts.enlace) bloques.push(opts.enlace)
  return bloques.filter(Boolean).join('\n\n')
}
