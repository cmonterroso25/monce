'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib'
import fs from 'fs/promises'
import path from 'path'
import { urlSitio } from '@/lib/url'

const AZUL_CLARO = rgb(0.78, 0.9, 0.98)
const NAVY = rgb(0.1725, 0.2431, 0.3137)
const GRIS = rgb(0.45, 0.45, 0.45)
const GRIS_LINEA = rgb(0.75, 0.75, 0.75)

type DatosPersona = {
  primerNombre?: string
  segundoNombre?: string
  primerApellido?: string
  segundoApellido?: string
  documentoIdentificacion?: string
  documentoExtendidoEn?: string
  nacionalidad?: string
  profesion?: string
  edad?: string
  telefono?: string
  lugarTrabajo?: string
  telefonoTrabajo?: string
  cargo?: string
  ingresoMensual?: string
  direccionTrabajo?: string
}

export type DatosSolicitante = DatosPersona & {
  cantidadMascotas?: string
  personasConviven?: string
  fechaTraslado?: string
  referencia1Nombre?: string
  referencia1Telefono?: string
  referencia2Nombre?: string
  referencia2Telefono?: string
  actualArrendadorNombre?: string
  actualArrendadorTelefono?: string
  montoReserva?: string
  transferenciaNumero?: string
  numeroCuenta?: string
  banco?: string
}

export type DatosFiador = DatosPersona & {
  direccionResidencia?: string
}

export async function obtenerOCrearSolicitud(leadId: string, contactoId: string) {
  const supabase = await createClient()

  const { data: existente } = await supabase
    .from('solicitudes_arrendamiento')
    .select('id, estado, datos_solicitante, datos_fiador, completado_en')
    .eq('lead_id', leadId)
    .maybeSingle()

  if (existente) {
    return {
      ok: true,
      solicitud: existente,
      link: urlSitio(`/formulario-arrendamiento/${existente.id}`),
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'No autenticado.' }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!perfil?.organization_id) {
    return { ok: false, mensaje: 'No se encontró la organización del usuario.' }
  }

  const { data: nueva, error } = await supabase
    .from('solicitudes_arrendamiento')
    .insert({
      organization_id: perfil.organization_id,
      lead_id: leadId,
      contacto_id: contactoId,
    })
    .select('id, estado, datos_solicitante, datos_fiador, completado_en')
    .single()

  if (error || !nueva) {
    console.error('--- ERROR AL CREAR SOLICITUD DE ARRENDAMIENTO ---', error)
    return { ok: false, mensaje: error?.message ?? 'No se pudo crear la solicitud.' }
  }

  revalidatePath(`/dashboard/leads/${leadId}`)
  return { ok: true, solicitud: nueva, link: urlSitio(`/formulario-arrendamiento/${nueva.id}`) }
}

async function obtenerLogo(pdfDoc: PDFDocument) {
  try {
    const rutaLogo = path.join(process.cwd(), 'public', 'logo-monce.png')
    const logoBytes = await fs.readFile(rutaLogo)
    return await pdfDoc.embedPng(logoBytes)
  } catch {
    return null
  }
}

function partirTexto(texto: string, fuente: PDFFont, tamano: number, anchoMax: number): string[] {
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

async function generarPdfSolicitudArrendamiento(datos: {
  solicitante: DatosSolicitante | null
  fiador: DatosFiador | null
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const fuente = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fuenteBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const page = pdfDoc.addPage([595, 842])
  const { width } = page.getSize()
  const margenX = 40
  const anchoUtil = width - margenX * 2
  let y = 842 - 45

  const s = datos.solicitante
  const f = datos.fiador

  const logo = await obtenerLogo(pdfDoc)
  if (logo) {
    const tamanoLogo = 46
    page.drawImage(logo, { x: margenX, y: y - tamanoLogo + 12, width: tamanoLogo, height: tamanoLogo })
    page.drawText('Formulario de solicitud de arrendamiento', {
      x: margenX + tamanoLogo + 12,
      y: y - 12,
      size: 14,
      font: fuenteBold,
      color: NAVY,
    })
    page.drawText('Inmobiliaria Monce', {
      x: margenX + tamanoLogo + 12,
      y: y - 28,
      size: 9,
      font: fuente,
      color: GRIS,
    })
    y -= tamanoLogo + 12
  } else {
    page.drawText('Formulario de solicitud de arrendamiento', { x: margenX, y, size: 14, font: fuenteBold, color: NAVY })
    y -= 22
  }
  y -= 10

  function tituloSeccion(texto: string) {
    page.drawRectangle({ x: margenX, y: y - 4, width: anchoUtil, height: 16, color: AZUL_CLARO })
    page.drawText(texto, { x: margenX + 6, y, size: 9, font: fuenteBold, color: NAVY })
    y -= 22
  }

  function valorOLinea(pageRef: PDFPage, x: number, yPos: number, anchoCol: number, valor: string | undefined) {
    if (valor) {
      pageRef.drawText(valor, { x, y: yPos, size: 9.5, font: fuente, color: NAVY, maxWidth: anchoCol })
    } else {
      pageRef.drawLine({
        start: { x, y: yPos - 2 },
        end: { x: x + anchoCol, y: yPos - 2 },
        thickness: 0.6,
        color: GRIS_LINEA,
      })
    }
  }

  function campo(x: number, anchoCol: number, etiqueta: string, valor: string | undefined) {
    page.drawText(etiqueta, { x, y, size: 7, font: fuente, color: GRIS })
    valorOLinea(page, x, y - 11, anchoCol, valor)
  }

  function fila2(etiqueta1: string, valor1: string | undefined, etiqueta2: string, valor2: string | undefined) {
    const colAncho = (anchoUtil - 20) / 2
    campo(margenX, colAncho, etiqueta1, valor1)
    campo(margenX + colAncho + 20, colAncho, etiqueta2, valor2)
    y -= 22
  }

  function fila3(
    etiqueta1: string,
    valor1: string | undefined,
    etiqueta2: string,
    valor2: string | undefined,
    etiqueta3: string,
    valor3: string | undefined
  ) {
    const colAncho = (anchoUtil - 40) / 3
    campo(margenX, colAncho, etiqueta1, valor1)
    campo(margenX + colAncho + 20, colAncho, etiqueta2, valor2)
    campo(margenX + (colAncho + 20) * 2, colAncho, etiqueta3, valor3)
    y -= 22
  }

  function filaCompleta(etiqueta: string, valor: string | undefined) {
    campo(margenX, anchoUtil, etiqueta, valor)
    y -= 22
  }

  // --- Solicitante ---
  tituloSeccion('DATOS DE SOLICITUD DE NUEVO INQUILINO')
  fila2('Primer nombre', s?.primerNombre, 'Segundo nombre', s?.segundoNombre)
  fila2('Primer apellido', s?.primerApellido, 'Segundo apellido', s?.segundoApellido)
  filaCompleta('No. Documento de identificación', s?.documentoIdentificacion)
  fila2('Extendido en', s?.documentoExtendidoEn, 'Nacionalidad', s?.nacionalidad)
  fila3('Profesión', s?.profesion, 'Edad', s?.edad, 'Teléfono', s?.telefono)
  fila2('Lugar de trabajo', s?.lugarTrabajo, 'Teléfono de la empresa', s?.telefonoTrabajo)
  fila2('Cargo', s?.cargo, 'Ingreso mensual promedio', s?.ingresoMensual)
  filaCompleta('Dirección de trabajo', s?.direccionTrabajo)
  fila2('¿Cuántas mascotas tiene?', s?.cantidadMascotas, '¿Cuántas personas vivirán en la propiedad?', s?.personasConviven)
  filaCompleta('¿Cuándo desea trasladarse?', s?.fechaTraslado)
  fila2('Referencia personal 1 - Nombre', s?.referencia1Nombre, 'Teléfono', s?.referencia1Telefono)
  fila2('Referencia personal 2 - Nombre', s?.referencia2Nombre, 'Teléfono', s?.referencia2Telefono)
  fila2('Nombre del actual arrendador', s?.actualArrendadorNombre, 'Teléfono', s?.actualArrendadorTelefono)
  y -= 6

  // --- Fiador ---
  tituloSeccion('DATOS GENERALES DEL FIADOR')
  fila2('Primer nombre', f?.primerNombre, 'Segundo nombre', f?.segundoNombre)
  fila2('Primer apellido', f?.primerApellido, 'Segundo apellido', f?.segundoApellido)
  filaCompleta('No. Documento de identificación', f?.documentoIdentificacion)
  fila2('Extendido en', f?.documentoExtendidoEn, 'Nacionalidad', f?.nacionalidad)
  fila3('Profesión', f?.profesion, 'Edad', f?.edad, 'Teléfono', f?.telefono)
  filaCompleta('Dirección residencia actual', f?.direccionResidencia)
  fila2('Lugar de trabajo', f?.lugarTrabajo, 'Teléfono', f?.telefonoTrabajo)
  fila2('Cargo', f?.cargo, 'Ingreso mensual', f?.ingresoMensual)
  filaCompleta('Dirección de trabajo', f?.direccionTrabajo)
  y -= 6

  // --- Reserva ---
  tituloSeccion('DATOS DE RESERVA')
  fila2('Monto de la reserva (Q)', s?.montoReserva, 'No. de transferencia', s?.transferenciaNumero)
  fila2('Número de cuenta', s?.numeroCuenta, 'Banco', s?.banco)
  y -= 4

  const disclaimer =
    'En caso de superar los 10 días o desistir del proceso de renta, la casa volverá a estar libre para promover y se devolverá el 50% de la reserva. Si el interesado no califica, se devolverá el 100% de la reserva.'
  const lineasDisclaimer = partirTexto(disclaimer, fuente, 8, anchoUtil)
  for (const linea of lineasDisclaimer) {
    page.drawText(linea, { x: margenX, y, size: 8, font: fuente, color: GRIS })
    y -= 11
  }

  y -= 30
  page.drawLine({ start: { x: margenX + 80, y }, end: { x: width - margenX - 80, y }, thickness: 0.6, color: GRIS_LINEA })
  y -= 12
  const textoFirma = 'Nombre y firma del solicitante'
  const anchoFirma = fuente.widthOfTextAtSize(textoFirma, 8)
  page.drawText(textoFirma, { x: (width - anchoFirma) / 2, y, size: 8, font: fuente, color: GRIS })

  return pdfDoc.save()
}

export async function generarPdfArrendamientoEnBlanco(): Promise<{ ok: boolean; pdfBase64?: string }> {
  const pdfBytes = await generarPdfSolicitudArrendamiento({ solicitante: null, fiador: null })
  return { ok: true, pdfBase64: Buffer.from(pdfBytes).toString('base64') }
}

export async function generarPdfArrendamientoLleno(
  solicitudId: string
): Promise<{ ok: boolean; mensaje?: string; pdfBase64?: string }> {
  const supabase = await createClient()
  const { data: solicitud, error } = await supabase
    .from('solicitudes_arrendamiento')
    .select('datos_solicitante, datos_fiador, estado')
    .eq('id', solicitudId)
    .single()

  if (error || !solicitud) {
    return { ok: false, mensaje: 'No se encontró la solicitud.' }
  }
  if (solicitud.estado !== 'completado') {
    return { ok: false, mensaje: 'El cliente todavía no ha completado el formulario.' }
  }

  const pdfBytes = await generarPdfSolicitudArrendamiento({
    solicitante: solicitud.datos_solicitante as DatosSolicitante,
    fiador: solicitud.datos_fiador as DatosFiador,
  })
  return { ok: true, pdfBase64: Buffer.from(pdfBytes).toString('base64') }
}

export async function eliminarSolicitudArrendamiento(
  solicitudId: string,
  leadId: string
): Promise<{ ok: boolean; mensaje?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('solicitudes_arrendamiento').delete().eq('id', solicitudId)

  if (error) {
    console.error('--- ERROR AL ELIMINAR SOLICITUD DE ARRENDAMIENTO ---', error)
    return { ok: false, mensaje: error.message }
  }

  revalidatePath(`/dashboard/leads/${leadId}`)
  return { ok: true }
}
