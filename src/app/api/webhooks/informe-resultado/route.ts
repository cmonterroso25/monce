import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { clienteR2 } from '@/lib/r2/cliente'
import { etiquetaCriterio } from '@/lib/informes/etiquetas-criterios'
import fs from 'fs'
import path from 'path'



const NAVY = rgb(0.1725, 0.2431, 0.3137) // #2C3E50
const BLUE = rgb(0.2196, 0.7137, 1.0) // #38B6FF
const GRIS = rgb(0.45, 0.45, 0.45)
const VERDE_FONDO = rgb(0.86, 0.95, 0.86)
const VERDE_TEXTO = rgb(0.11, 0.45, 0.11)
const ROJO_FONDO = rgb(0.98, 0.88, 0.88)
const ROJO_TEXTO = rgb(0.7, 0.15, 0.15)
const AMBAR_FONDO = rgb(0.99, 0.93, 0.78)
const AMBAR_TEXTO = rgb(0.6, 0.42, 0.05)

type ContextoInformePdf = {
  candidato_nombre: string | null
  propiedad_titulo: string | null
  tipo_operacion: string | null
  agente_nombre: string | null
  precio: number | string | null
  moneda: string | null
  creado_en: string | null
}

function envolverTexto(texto: string, fuente: PDFFont, tamano: number, anchoMax: number): string[] {
  const palabras = texto.split(' ')
  const lineas: string[] = []
  let actual = ''
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (fuente.widthOfTextAtSize(prueba, tamano) > anchoMax && actual) {
      lineas.push(actual)
      actual = palabra
    } else {
      actual = prueba
    }
  }
  if (actual) lineas.push(actual)
  return lineas
}

function colorRecomendacion(puntaje: number) {
  if (puntaje >= 70) return { fondo: VERDE_FONDO, texto: VERDE_TEXTO, etiqueta: 'Recomendado' }
  if (puntaje >= 40) return { fondo: AMBAR_FONDO, texto: AMBAR_TEXTO, etiqueta: 'Con reservas' }
  return { fondo: ROJO_FONDO, texto: ROJO_TEXTO, etiqueta: 'No recomendado' }
}

let logoBytesCache: Buffer | null = null
function obtenerLogoBytes(): Buffer | null {
  if (logoBytesCache) return logoBytesCache
  try {
    const rutaLogo = path.join(process.cwd(), 'public', 'monce-logo.png')
    logoBytesCache = fs.readFileSync(rutaLogo)
    return logoBytesCache
  } catch {
    return null
  }
}

async function generarPdfInforme(datos: {
  informeId: string
  puntaje: number
  resumen: string
  criterios: Record<string, { cumple: boolean; detalle: string }> | null
  candidatoNombre: string
  propiedadTitulo: string
  tipoOperacion: string
  montoReferencia: string
  agenteNombre: string
  fechaEvaluacion: string
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const fuente = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fuenteBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const page = pdfDoc.addPage([595, 842])
  const margenX = 50
  const anchoUtil = 595 - margenX * 2
  let y = 842 - 45

  const logoBytes = obtenerLogoBytes()
  if (logoBytes) {
    const logoImg = await pdfDoc.embedPng(logoBytes)
    const tamanoLogo = 65
    page.drawImage(logoImg, { x: margenX, y: y - tamanoLogo + 10, width: tamanoLogo, height: tamanoLogo })
    page.drawText('Informe de evaluación', { x: margenX + tamanoLogo + 15, y: y - 20, size: 19, font: fuenteBold, color: NAVY })
    page.drawText(`Generado el ${datos.fechaEvaluacion}`, { x: margenX + tamanoLogo + 15, y: y - 38, size: 9, font: fuente, color: GRIS })
    y -= tamanoLogo + 15
  } else {
    page.drawText('Informe de evaluación', { x: margenX, y, size: 19, font: fuenteBold, color: NAVY })
    y -= 20
    page.drawText(`Generado el ${datos.fechaEvaluacion}`, { x: margenX, y, size: 9, font: fuente, color: GRIS })
    y -= 20
  }

  page.drawLine({ start: { x: margenX, y }, end: { x: 595 - margenX, y }, thickness: 1.5, color: BLUE })
  y -= 25

  function tituloSeccion(texto: string) {
    page.drawText(texto, { x: margenX, y, size: 12, font: fuenteBold, color: NAVY })
    y -= 16
  }

  function lineaDato(etiqueta: string, valor: string) {
    page.drawText(etiqueta, { x: margenX, y, size: 10, font: fuenteBold, color: GRIS })
    page.drawText(valor, { x: margenX + 130, y, size: 10, font: fuente, color: NAVY })
    y -= 15
  }

  tituloSeccion('Datos del candidato')
  lineaDato('Nombre:', datos.candidatoNombre)
  y -= 8

  tituloSeccion('Datos del negocio')
  lineaDato('Propiedad:', datos.propiedadTitulo)
  lineaDato('Tipo de operación:', datos.tipoOperacion)
  lineaDato('Monto de referencia:', datos.montoReferencia)
  y -= 8

  tituloSeccion('Evaluación')
  lineaDato('Agente responsable:', datos.agenteNombre)
  lineaDato('Fecha de evaluación:', datos.fechaEvaluacion)
  y -= 4

  const { fondo, texto, etiqueta } = colorRecomendacion(datos.puntaje)
  page.drawRectangle({ x: margenX, y: y - 22, width: anchoUtil, height: 30, color: fondo })
  page.drawText(`Puntaje: ${datos.puntaje}/100`, { x: margenX + 12, y: y - 12, size: 12, font: fuenteBold, color: texto })
  const anchoEtiqueta = fuenteBold.widthOfTextAtSize(etiqueta, 12)
  page.drawText(etiqueta, { x: margenX + anchoUtil - anchoEtiqueta - 12, y: y - 12, size: 12, font: fuenteBold, color: texto })
  y -= 45

  if (datos.criterios && Object.keys(datos.criterios).length > 0) {
    tituloSeccion('Desglose de criterios')
    for (const [clave, valor] of Object.entries(datos.criterios)) {
      const etiquetaCrit = etiquetaCriterio(clave)
      const cumple = !!valor?.cumple
      const tagTexto = cumple ? 'Cumple' : 'No cumple'
      const tagFondo = cumple ? VERDE_FONDO : ROJO_FONDO
      const tagColor = cumple ? VERDE_TEXTO : ROJO_TEXTO
      const anchoTag = fuenteBold.widthOfTextAtSize(tagTexto, 9) + 14

      page.drawText(etiquetaCrit, { x: margenX, y, size: 10.5, font: fuenteBold, color: NAVY })
      page.drawRectangle({ x: margenX + anchoUtil - anchoTag, y: y - 3, width: anchoTag, height: 14, color: tagFondo })
      page.drawText(tagTexto, { x: margenX + anchoUtil - anchoTag + 7, y, size: 9, font: fuenteBold, color: tagColor })
      y -= 14

      const detalle = valor?.detalle ?? ''
      if (detalle) {
        const lineas = envolverTexto(detalle, fuente, 9.5, anchoUtil - 10)
        for (const linea of lineas) {
          page.drawText(linea, { x: margenX + 10, y, size: 9.5, font: fuente, color: GRIS })
          y -= 13
        }
      }
      y -= 6
    }
    y -= 4
  }

  tituloSeccion('Resumen general')
  const lineasResumen = envolverTexto(datos.resumen || 'Sin resumen disponible.', fuente, 10.5, anchoUtil)
  for (const linea of lineasResumen) {
    page.drawText(linea, { x: margenX, y, size: 10.5, font: fuente, color: NAVY })
    y -= 15
  }

  page.drawText(`Informe #${datos.informeId} · Generado automáticamente por el CRM de Monce Inmobiliaria`, {
    x: margenX,
    y: 30,
    size: 7.5,
    font: fuente,
    color: GRIS,
  })

  return pdfDoc.save()
}

export async function POST(req: NextRequest) {
  const secreto = req.headers.get('x-informe-secret')
  if (!process.env.INFORME_CALLBACK_SECRET || secreto !== process.env.INFORME_CALLBACK_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const { informe_id, recomendacion, resumen, error, criterios } = body

  if (!informe_id) {
    return NextResponse.json({ error: 'Falta informe_id' }, { status: 400 })
  }

  if (error) {
    await supabaseAdmin.rpc('informe_marcar_error', {
      p_informe_id: informe_id,
      p_mensaje: typeof error === 'string' ? error : 'El motor de análisis reportó un error.',
    })
    return NextResponse.json({ ok: true })
  }

  try {
    const { data: contextoRaw, error: errorContexto } = await supabaseAdmin
      .rpc('informe_obtener_contexto_pdf', { p_informe_id: informe_id })
      .maybeSingle()

    const contexto = contextoRaw as ContextoInformePdf | null

    if (errorContexto) {
      console.error('--- Error al enriquecer datos del informe (algunos campos pueden quedar en N/D) ---', informe_id, errorContexto)
    }

    const candidatoNombre = contexto?.candidato_nombre ?? 'N/D'
    const propiedadTitulo = contexto?.propiedad_titulo ?? 'N/D'
    const tipoOperacion = contexto?.tipo_operacion ?? 'N/D'
    const agenteNombre = contexto?.agente_nombre ?? 'N/D'
    const montoReferencia = contexto?.precio != null
      ? `${contexto.moneda ?? ''} ${Number(contexto.precio).toLocaleString('es-GT')}`.trim()
      : 'N/D'
    const fechaEvaluacion = contexto?.creado_en
      ? new Date(contexto.creado_en).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' })

    const puntajeNumerico = Number(recomendacion) || 0

    const pdfBytes = await generarPdfInforme({
      informeId: informe_id,
      puntaje: puntajeNumerico,
      resumen: resumen ?? '',
      criterios: criterios ?? null,
      candidatoNombre,
      propiedadTitulo,
      tipoOperacion,
      montoReferencia,
      agenteNombre,
      fechaEvaluacion,
    })

    const key = `informes/${informe_id}/reporte.pdf`
    await clienteR2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: Buffer.from(pdfBytes),
        ContentType: 'application/pdf',
      })
    )

    await supabaseAdmin.rpc('informe_marcar_completado', {
      p_informe_id: informe_id,
      p_recomendacion: recomendacion != null ? String(recomendacion) : null,
      p_resumen: resumen ?? null,
      p_criterios: criterios ?? null,
      p_ruta_pdf: key,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('--- ERROR PROCESANDO CALLBACK DE INFORME ---', err)
    await supabaseAdmin.rpc('informe_marcar_error', {
      p_informe_id: informe_id,
      p_mensaje: 'Error al generar el PDF del informe.',
    })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
