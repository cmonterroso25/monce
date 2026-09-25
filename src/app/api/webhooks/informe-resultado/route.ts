import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { clienteR2 } from '@/lib/r2/cliente'
import { etiquetaCriterio } from '@/lib/informes/etiquetas-criterios'
import fs from 'fs'
import path from 'path'



const NAVY = rgb(0.1725, 0.2431, 0.3137) // #2C3E50
const BLUE = rgb(0.2196, 0.7137, 1.0) // #38B6FF
const GRIS = rgb(0.45, 0.45, 0.45)
// Gris más oscuro para el detalle de criterios (ajustado 15/09/2026 a
// pedido del usuario: el gris claro original quedaba poco legible).
const GRIS_OSCURO = rgb(0.35, 0.35, 0.35)
const VERDE_FONDO = rgb(0.86, 0.95, 0.86)
const VERDE_TEXTO = rgb(0.11, 0.45, 0.11)
const ROJO_FONDO = rgb(0.98, 0.88, 0.88)
const ROJO_TEXTO = rgb(0.7, 0.15, 0.15)
const AMBAR_FONDO = rgb(0.99, 0.93, 0.78)
const AMBAR_TEXTO = rgb(0.6, 0.42, 0.05)

const ALTO_PAGINA = 842
const ANCHO_PAGINA = 595
const MARGEN_X = 50
const MARGEN_INFERIOR = 55
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN_X * 2

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

// Dibuja una línea distribuyendo el espacio extra entre palabras para que
// ocupe exactamente `anchoObjetivo` (alineación justificada tipo
// periódico). Agregado 15/09/2026 a pedido del usuario. Solo se usa en
// líneas que NO son la última de su párrafo — la última línea de un
// párrafo justificado se deja alineada a la izquierda con espaciado
// normal, que es el comportamiento estándar de texto justificado.
function dibujarLineaJustificada(
  pagina: PDFPage,
  linea: string,
  x: number,
  y: number,
  fuente: PDFFont,
  tamano: number,
  color: ReturnType<typeof rgb>,
  anchoObjetivo: number
) {
  const palabras = linea.split(' ').filter((p) => p.length > 0)
  if (palabras.length <= 1) {
    pagina.drawText(linea, { x, y, size: tamano, font: fuente, color })
    return
  }
  const anchoPalabras = palabras.reduce((acc, p) => acc + fuente.widthOfTextAtSize(p, tamano), 0)
  const espacioNormal = fuente.widthOfTextAtSize(' ', tamano)
  const espaciosDisponibles = palabras.length - 1
  const espacioExtra = Math.max(
    0,
    (anchoObjetivo - anchoPalabras - espacioNormal * espaciosDisponibles) / espaciosDisponibles
  )
  let cursorX = x
  palabras.forEach((palabra, i) => {
    pagina.drawText(palabra, { x: cursorX, y, size: tamano, font: fuente, color })
    cursorX += fuente.widthOfTextAtSize(palabra, tamano)
    if (i < palabras.length - 1) {
      cursorX += espacioNormal + espacioExtra
    }
  })
}

// Dibuja un bloque de líneas ya envueltas con justificado en todas menos
// la última línea de cada párrafo. Devuelve nada — dibuja directamente,
// avanzando `y` a través de los callbacks `avanzar`/`asegurarEspacio` que
// recibe, para no romper la paginación automática existente.
function dibujarLineasJustificadas(
  pagina: PDFPage,
  lineas: string[],
  x: number,
  fuente: PDFFont,
  tamano: number,
  color: ReturnType<typeof rgb>,
  anchoObjetivo: number,
  alturaLinea: number,
  obtenerY: () => number,
  avanzarY: (delta: number) => void
) {
  lineas.forEach((linea, idx) => {
    const esUltima = idx === lineas.length - 1
    const y = obtenerY()
    if (esUltima) {
      pagina.drawText(linea, { x, y, size: tamano, font: fuente, color })
    } else {
      dibujarLineaJustificada(pagina, linea, x, y, fuente, tamano, color, anchoObjetivo)
    }
    avanzarY(alturaLinea)
  })
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

// Genera el PDF con soporte de paginación automática (agregado 14/09/2026):
// el resumen ahora puede tener varios párrafos y hay hasta 4 criterios con
// detalle extendido, así que el contenido ya no cabe siempre en una sola
// página. `asegurarEspacio` crea una página nueva cuando no queda espacio
// suficiente para el siguiente bloque de contenido.
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
  const logoBytes = obtenerLogoBytes()
  const logoImg = logoBytes ? await pdfDoc.embedPng(logoBytes) : null

  let pagina: PDFPage = pdfDoc.addPage([ANCHO_PAGINA, ALTO_PAGINA])
  let numeroPagina = 1
  let y = ALTO_PAGINA - 45

  function dibujarPie(pag: PDFPage, num: number) {
    pag.drawText(
      `Informe #${datos.informeId} · Página ${num} · Generado automáticamente por el CRM de Monce Inmobiliaria`,
      { x: MARGEN_X, y: 28, size: 7.5, font: fuente, color: GRIS }
    )
  }

  function nuevaPagina() {
    dibujarPie(pagina, numeroPagina)
    pagina = pdfDoc.addPage([ANCHO_PAGINA, ALTO_PAGINA])
    numeroPagina += 1
    y = ALTO_PAGINA - 45
  }

  function asegurarEspacio(altura: number) {
    if (y - altura < MARGEN_INFERIOR) nuevaPagina()
  }

  if (logoImg) {
    const tamanoLogo = 65
    pagina.drawImage(logoImg, { x: MARGEN_X, y: y - tamanoLogo + 10, width: tamanoLogo, height: tamanoLogo })
    pagina.drawText('Informe de evaluación', { x: MARGEN_X + tamanoLogo + 15, y: y - 20, size: 19, font: fuenteBold, color: NAVY })
    pagina.drawText(`Generado el ${datos.fechaEvaluacion}`, { x: MARGEN_X + tamanoLogo + 15, y: y - 38, size: 9, font: fuente, color: GRIS })
    y -= tamanoLogo + 15
  } else {
    pagina.drawText('Informe de evaluación', { x: MARGEN_X, y, size: 19, font: fuenteBold, color: NAVY })
    y -= 20
    pagina.drawText(`Generado el ${datos.fechaEvaluacion}`, { x: MARGEN_X, y, size: 9, font: fuente, color: GRIS })
    y -= 20
  }

  pagina.drawLine({ start: { x: MARGEN_X, y }, end: { x: ANCHO_PAGINA - MARGEN_X, y }, thickness: 1.5, color: BLUE })
  y -= 25

  function tituloSeccion(texto: string) {
    asegurarEspacio(20)
    pagina.drawText(texto, { x: MARGEN_X, y, size: 12, font: fuenteBold, color: NAVY })
    y -= 16
  }

  function lineaDato(etiqueta: string, valor: string) {
    asegurarEspacio(15)
    pagina.drawText(etiqueta, { x: MARGEN_X, y, size: 10, font: fuenteBold, color: GRIS })
    pagina.drawText(valor, { x: MARGEN_X + 130, y, size: 10, font: fuente, color: NAVY })
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

  // Badge de recomendación: solo la etiqueta (Recomendado / Con reservas /
  // No recomendado), sin el número de puntaje (quitado 14/09/2026 a
  // pedido del usuario). El puntaje sigue calculándose internamente
  // (colorRecomendacion lo usa para elegir color y etiqueta).
  asegurarEspacio(45)
  const { fondo, texto, etiqueta } = colorRecomendacion(datos.puntaje)
  pagina.drawRectangle({ x: MARGEN_X, y: y - 22, width: ANCHO_UTIL, height: 30, color: fondo })
  const anchoEtiqueta = fuenteBold.widthOfTextAtSize(etiqueta, 13)
  pagina.drawText(etiqueta, {
    x: MARGEN_X + (ANCHO_UTIL - anchoEtiqueta) / 2,
    y: y - 12,
    size: 13,
    font: fuenteBold,
    color: texto,
  })
  y -= 45

  if (datos.criterios && Object.keys(datos.criterios).length > 0) {
    tituloSeccion('Desglose de criterios')
    const TAMANO_DETALLE = 10
    const X_DETALLE = MARGEN_X + 10
    const ANCHO_DETALLE = ANCHO_UTIL - 10
    for (const [clave, valor] of Object.entries(datos.criterios)) {
      const etiquetaCrit = etiquetaCriterio(clave)
      const cumple = !!valor?.cumple
      const tagTexto = cumple ? 'Cumple' : 'No cumple'
      const tagFondo = cumple ? VERDE_FONDO : ROJO_FONDO
      const tagColor = cumple ? VERDE_TEXTO : ROJO_TEXTO
      const anchoTag = fuenteBold.widthOfTextAtSize(tagTexto, 9) + 14
      const detalle = valor?.detalle ?? ''
      const lineasDetalle = detalle ? envolverTexto(detalle, fuente, TAMANO_DETALLE, ANCHO_DETALLE) : []

      asegurarEspacio(14 + lineasDetalle.length * 13 + 6)
      pagina.drawText(etiquetaCrit, { x: MARGEN_X, y, size: 10.5, font: fuenteBold, color: NAVY })
      pagina.drawRectangle({ x: MARGEN_X + ANCHO_UTIL - anchoTag, y: y - 3, width: anchoTag, height: 14, color: tagFondo })
      pagina.drawText(tagTexto, { x: MARGEN_X + ANCHO_UTIL - anchoTag + 7, y, size: 9, font: fuenteBold, color: tagColor })
      y -= 14

      dibujarLineasJustificadas(
        pagina,
        lineasDetalle,
        X_DETALLE,
        fuente,
        TAMANO_DETALLE,
        GRIS_OSCURO,
        ANCHO_DETALLE,
        13,
        () => y,
        (delta) => { y -= delta }
      )
      y -= 6
    }
    y -= 4
  }

  tituloSeccion('Resumen general')
  const TAMANO_RESUMEN = 10.5
  const parrafos = (datos.resumen || 'Sin resumen disponible.').split(/\n+/).filter((p) => p.trim().length > 0)
  for (const parrafo of parrafos) {
    const lineas = envolverTexto(parrafo, fuente, TAMANO_RESUMEN, ANCHO_UTIL)
    lineas.forEach((linea, indiceLinea) => {
      asegurarEspacio(15)
      const esUltima = indiceLinea === lineas.length - 1
      if (esUltima) {
        pagina.drawText(linea, { x: MARGEN_X, y, size: TAMANO_RESUMEN, font: fuente, color: NAVY })
      } else {
        dibujarLineaJustificada(pagina, linea, MARGEN_X, y, fuente, TAMANO_RESUMEN, NAVY, ANCHO_UTIL)
      }
      y -= 15
    })
    y -= 6
  }

  dibujarPie(pagina, numeroPagina)

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
