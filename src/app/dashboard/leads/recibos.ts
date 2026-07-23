'use server'
import { createClient } from '@/lib/supabase/server'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs/promises'
import path from 'path'

type DatosRecibo = {
  leadId: string
  contactoId: string
  agenteReceptorId: string
  monto: number
  moneda: string
  concepto: string
  metodoPago: string
  fechaPago: string
  detalles?: string
}

function formatearMoneda(monto: number, moneda: string) {
  return `${moneda} ${monto.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatearFecha(fechaISO: string) {
  const [anio, mes, dia] = fechaISO.split('-')
  return `${dia}/${mes}/${anio}`
}

function partirTexto(texto: string, fuente: any, tamano: number, anchoMax: number): string[] {
  const palabras = texto.split(' ')
  const lineas: string[] = []
  let lineaActual = ''

  for (const palabra of palabras) {
    const prueba = lineaActual ? `${lineaActual} ${palabra}` : palabra
    if (fuente.widthOfTextAtSize(prueba, tamano) > anchoMax && lineaActual) {
      lineas.push(lineaActual)
      lineaActual = palabra
    } else {
      lineaActual = prueba
    }
  }
  if (lineaActual) lineas.push(lineaActual)
  return lineas
}

async function generarPdfRecibo(datos: {
  numeroRecibo: number
  contactoNombre: string
  agenteReceptorNombre: string
  monto: number
  moneda: string
  concepto: string
  metodoPago: string
  fechaPago: string
  detalles?: string
  generadoPorNombre: string
}) {
  const pdfDoc = await PDFDocument.create()
  const fuenteRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fuenteNegrita = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const ANCHO_PAGINA = 396
  const ALTO_ENCABEZADO = 90
  const MARGEN_SUPERIOR_CAMPOS = 40
  const ALTO_POR_CAMPO = 46
  const NUM_CAMPOS = 6
  const ALTO_PIE = 66

  const lineasDetalles = datos.detalles
    ? partirTexto(datos.detalles, fuenteRegular, 9, ANCHO_PAGINA - 48)
    : []
  const altoDetalles = datos.detalles ? 11 + lineasDetalles.length * 11 + 10 : 0

  const altoContenido =
    ALTO_ENCABEZADO +
    MARGEN_SUPERIOR_CAMPOS +
    ALTO_POR_CAMPO * NUM_CAMPOS +
    altoDetalles +
    ALTO_PIE

  const altoPagina = Math.max(altoContenido, 420)

  const page = pdfDoc.addPage([ANCHO_PAGINA, altoPagina])
  const { width, height } = page.getSize()

  const azulMonce = rgb(0x38 / 255, 0xb6 / 255, 0xff / 255)
  const oscuro = rgb(0x2c / 255, 0x3e / 255, 0x50 / 255)
  const gris = rgb(0.45, 0.45, 0.45)

  // Encabezado
  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: oscuro })

  try {
    const rutaLogo = path.join(process.cwd(), 'public', 'logo-monce.png')
    const logoBytes = await fs.readFile(rutaLogo)
    const logoImg = await pdfDoc.embedPng(logoBytes)
    const logoAlto = 55
    const logoAncho = (logoImg.width / logoImg.height) * logoAlto
    page.drawImage(logoImg, {
      x: 24,
      y: height - 75,
      width: logoAncho,
      height: logoAlto,
    })
  } catch {
    // Si no se encuentra el logo, seguimos sin bloquear la generación del PDF.
  }

  page.drawText('Inmobiliaria Monce', {
    x: 98,
    y: height - 40,
    size: 14,
    font: fuenteNegrita,
    color: rgb(1, 1, 1),
  })
  page.drawText('Comprobante de pago', {
    x: 98,
    y: height - 58,
    size: 10,
    font: fuenteRegular,
    color: rgb(1, 1, 1),
  })

  // Número de recibo
  const numeroTexto = `No. ${String(datos.numeroRecibo).padStart(4, '0')}`
  const anchoNumero = fuenteNegrita.widthOfTextAtSize(numeroTexto, 16)
  page.drawText(numeroTexto, {
    x: width - 24 - anchoNumero,
    y: height - 50,
    size: 16,
    font: fuenteNegrita,
    color: rgb(1, 1, 1),
  })

  let y = height - ALTO_ENCABEZADO - MARGEN_SUPERIOR_CAMPOS

  function fila(etiqueta: string, valor: string, tamanoValor = 12) {
    page.drawText(etiqueta.toUpperCase(), {
      x: 24,
      y,
      size: 8,
      font: fuenteRegular,
      color: gris,
    })
    y -= 16
    page.drawText(valor, {
      x: 24,
      y,
      size: tamanoValor,
      font: fuenteNegrita,
      color: oscuro,
    })
    y -= 30
  }

  fila('Recibí de', datos.contactoNombre)
  fila('La cantidad de', formatearMoneda(datos.monto, datos.moneda))
  fila('Concepto', datos.concepto)
  fila('Método de pago', datos.metodoPago)
  fila('Fecha de pago', formatearFecha(datos.fechaPago))
  fila('Recibido por', datos.agenteReceptorNombre)

  if (datos.detalles) {
    page.drawText('DETALLES', {
      x: 24,
      y,
      size: 8,
      font: fuenteRegular,
      color: gris,
    })
    y -= 11
    for (const linea of lineasDetalles) {
      page.drawText(linea, {
        x: 24,
        y,
        size: 9,
        font: fuenteRegular,
        color: oscuro,
      })
      y -= 11
    }
  }

  // Sello de validez digital (reemplaza la firma física, que no aplica
  // porque el recibo se descarga y se envía, no se imprime)
  const generadoEn = new Date().toLocaleString('es-GT', { timeZone: 'America/Guatemala' })
  page.drawLine({
    start: { x: 24, y: 40 },
    end: { x: width - 24, y: 40 },
    thickness: 0.5,
    color: azulMonce,
  })
  page.drawText(
    `Documento generado electronicamente el ${generadoEn} por el CRM de Inmobiliaria Monce. No requiere firma.`,
    {
      x: 24,
      y: 26,
      size: 6,
      font: fuenteRegular,
      color: gris,
      maxWidth: width - 48,
    }
  )

  const bytes = await pdfDoc.save()
  return Buffer.from(bytes).toString('base64')
}

export async function generarRecibo(datos: DatosRecibo): Promise<{
  ok: boolean
  mensaje?: string
  pdfBase64?: string
  numeroRecibo?: number
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'No autenticado.' }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const organizationId = perfil?.organization_id
  if (!organizationId) return { ok: false, mensaje: 'No se encontró la organización del usuario.' }

  const { data: numeroData, error: errorNumero } = await supabase.rpc('siguiente_numero_recibo', {
    org_id: organizationId,
  })

  if (errorNumero || numeroData === null) {
    console.error('--- ERROR AL GENERAR NUMERO DE RECIBO ---', errorNumero)
    return { ok: false, mensaje: 'No se pudo generar el número correlativo del recibo.' }
  }

  const numeroRecibo = numeroData as number

  const { error: errorInsert } = await supabase.from('recibos').insert({
    organization_id: organizationId,
    lead_id: datos.leadId,
    contacto_id: datos.contactoId,
    agente_receptor_id: datos.agenteReceptorId,
    numero_recibo: numeroRecibo,
    monto: datos.monto,
    moneda: datos.moneda,
    concepto: datos.concepto,
    metodo_pago: datos.metodoPago,
    fecha_pago: datos.fechaPago,
    detalles: datos.detalles || null,
    creado_por: user.id,
  })

  if (errorInsert) {
    console.error('--- ERROR AL GUARDAR RECIBO ---', errorInsert)
    return { ok: false, mensaje: errorInsert.message }
  }

  const [{ data: contacto }, { data: agenteReceptor }] = await Promise.all([
    supabase.from('contactos').select('nombre_completo').eq('id', datos.contactoId).single(),
    supabase.from('perfiles').select('nombre_completo').eq('id', datos.agenteReceptorId).single(),
  ])

  const { data: perfilGenerador } = await supabase
    .from('perfiles')
    .select('nombre_completo')
    .eq('id', user.id)
    .single()

  const pdfBase64 = await generarPdfRecibo({
    numeroRecibo,
    contactoNombre: contacto?.nombre_completo ?? '—',
    agenteReceptorNombre: agenteReceptor?.nombre_completo ?? '—',
    monto: datos.monto,
    moneda: datos.moneda,
    concepto: datos.concepto,
    metodoPago: datos.metodoPago,
    fechaPago: datos.fechaPago,
    detalles: datos.detalles,
    generadoPorNombre: perfilGenerador?.nombre_completo ?? '—',
  })

  return { ok: true, pdfBase64, numeroRecibo }
}
