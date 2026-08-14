import { REQUISITOS_RENTA, type CodigoRequisitosRenta } from '@/app/dashboard/propiedades/requisitos-renta'
import { formatearZona } from '@/lib/formato-zona'

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
  sala: string | null
  comedor: string | null
  cocina: string | null
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

// Paquete completo (titular + fiador + condiciones) del código A/B/C
// asignado a la propiedad. Deja una línea en blanco entre el último
// requisito del fiador y las condiciones de contrato/depósito.
// Usado solo por "Copiar para Marketplace" (botón manual); la notificación
// automática de WhatsApp ya no incluye este bloque (ver incluirRequisitos).
function lineasRequisitos(p: PropiedadMarketplace): string[] {
  const requisitos =
    p.tipo_operacion === 'renta' && p.requisitos_renta
      ? REQUISITOS_RENTA[p.requisitos_renta as CodigoRequisitosRenta]
      : null

  if (!requisitos) return []

  return [
    '📋 Requisitos para aplicar:',
    'Titular:',
    ...requisitos.titular.map((r) => `• ${r}`),
    'Fiador:',
    ...requisitos.fiador.map((r) => `• ${r}`),
    '',
    `• Contrato mínimo: ${requisitos.contratoMinimo}`,
    `• Depósito: ${requisitos.deposito}`,
  ]
}

// Núcleo compartido. "codigo" es opcional a propósito: cuando no se pasa,
// no aparece esa fila. `incluirDescripcion` solo lo activa la rama de
// descripción corta de generarTextoMarketplace(). `incluirRequisitos`
// (default true) se pone en false desde mensajeWhatsappPropiedad() para
// que la notificación automática a grupos no incluya el paquete de
// requisitos de renta — Green API rechaza captions de más de 1024
// caracteres en sendFileByUrl, y ese bloque era el que más hacía crecer
// el mensaje. `noPublicar` (default false) agrega una advertencia debajo
// del título cuando la propiedad no debe publicarse (propiedades.publicable
// = false); solo lo activa mensajeWhatsappPropiedad().
function generarBloquesPropiedad(
  p: PropiedadMarketplace,
  opts?: { incluirDescripcion?: boolean; incluirRequisitos?: boolean; noPublicar?: boolean }
): (string | false | null)[] {
  const emojiTipo = EMOJI_TIPO[p.tipo_propiedad ?? ''] ?? '🏠'
  const negocio = p.tipo_operacion === 'renta' ? 'RENTA' : 'VENTA'
  const tipoLabel = (p.tipo_propiedad ?? 'PROPIEDAD').toUpperCase()

  const ubicacion = [p.direccion, p.condominio, p.numero_casa && `Casa ${p.numero_casa}`, p.sector, formatearZona(p.zona), p.municipioNombre, p.ciudad]
    .filter(Boolean)
    .join(', ')

  const lineasDetalle = [
    p.niveles && `▪️ Niveles: ${p.niveles}`,
    p.area_construccion_m2 && `▪️ Construcción: ${p.area_construccion_m2} m²`,
    p.area_terreno_m2 && `▪️ Terreno: ${p.area_terreno_m2} m²`,
    p.medidas_terreno && `▪️ Medidas del terreno: ${p.medidas_terreno}`,
  ].filter(Boolean)

  // Solo se arma la línea "Sala | Comedor | Cocina" con los ambientes que
  // la propiedad realmente tiene marcados. Propiedades sin ninguno de los
  // tres (terrenos, bodegas, fincas, etc.) simplemente no muestran la línea,
  // en vez de asumir que toda propiedad los tiene.
  const ambientesSalaComedorCocina = [
    p.sala && 'Sala',
    p.comedor && 'Comedor',
    p.cocina && 'Cocina',
  ].filter(Boolean) as string[]

  const lineasDistribucion = [
    p.dormitorios && `• ${p.dormitorios} Dormitorios`,
    p.banos && `• ${p.banos} Baños`,
    ambientesSalaComedorCocina.length > 0 && `• ${ambientesSalaComedorCocina.join(' | ')}`,
    p.estudio && '• Estudio',
    p.sala_familiar && '• Sala familiar',
    p.habitacion_servicio && '• Cuarto de servicio',
    p.lavanderia && '• Área de lavandería',
    p.jardin && '• Jardín',
    p.parqueos && `• Parqueo para ${p.parqueos} vehículo${p.parqueos > 1 ? 's' : ''} 🚗`,
  ].filter(Boolean)

  // El mantenimiento siempre se muestra en quetzales, sin importar la
  // moneda configurada para precio/IUSI de la propiedad.
  const textoMantenimiento =
    !p.mantenimiento || Number(p.mantenimiento) === 0
      ? '🛠️ Mantenimiento incluido'
      : `🛠️ Mantenimiento: Q${Number(p.mantenimiento).toLocaleString()}`

  const textoMascota = p.mascota === 'Si' ? '🐾 Se aceptan mascotas' : null

  const incluirRequisitos = opts?.incluirRequisitos ?? true
  const requisitos = incluirRequisitos ? lineasRequisitos(p) : []

  return [
    `${tipoLabel} EN ${negocio}${ubicacion ? ` - ${ubicacion}` : ''}`,
    opts?.noPublicar ? '🔴 No publicar' : null,
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
// Solo la usa "Copiar para Marketplace" (nunca la notificación automática).
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

// Notificación automática a grupos de WhatsApp (Green API). No incluye el
// bloque de requisitos de renta: ver nota en generarBloquesPropiedad.
// `agenteNombre` se muestra como "Ingresado por: <nombre>". Si la propiedad
// es de modalidad "Compartida" y viene `colegaNombre`, se agrega debajo una
// línea "Colega: <nombre>" — antes del enlace (si el enlace no viene, queda
// al final del todo). Si `publicable` es false, se agrega "🔴 No publicar"
// debajo del título (ver generarBloquesPropiedad).
export function mensajeWhatsappPropiedad(
  p: PropiedadMarketplace & { codigo: string | null },
  opts: {
    encabezado: string
    enlace: string | null
    agenteNombre?: string | null
    modalidadCaptacion?: string | null
    colegaNombre?: string | null
    publicable?: boolean | null
  }
): string {
  const bloques = [
    opts.encabezado,
    ...generarBloquesPropiedad(p, { incluirRequisitos: false, noPublicar: opts.publicable === false }),
  ]
  if (opts.agenteNombre) bloques.push(`Ingresado por: ${opts.agenteNombre}`)
  if (opts.modalidadCaptacion === 'Compartida' && opts.colegaNombre) {
    bloques.push(`Colega: ${opts.colegaNombre}`)
  }
  if (opts.enlace) bloques.push(opts.enlace)
  return bloques.filter(Boolean).join('\n\n')
}
