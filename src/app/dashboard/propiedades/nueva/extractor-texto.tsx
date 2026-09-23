'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { extraerPropiedadAccion } from './acciones-ia'
import type { PropiedadExtraida } from '@/lib/ia/extraer-propiedad'
import type { DatosOperacionAlterna } from '../acciones'

type Municipio = { id: string; nombre: string }
// La descripción y municipio_texto tienen manejo especial (ver
// aplicarAlFormulario) y no pasan por el loop genérico de CampoIA.
type CampoIA = Exclude<keyof PropiedadExtraida, 'municipio_texto' | 'descripcion'>
type TipoOperacion = 'venta' | 'renta'

// Campos propios de la operación (venta/renta) que representa el formulario.
const CAMPOS_OPERACION: CampoIA[] = ['tipo_operacion', 'precio', 'moneda', 'mantenimiento']

// Resto de campos que llena la IA. La descripción NO está aquí: la IA la
// devuelve ya depurada de datos de contacto (ver aplicarAlFormulario).
const CAMPOS_GENERALES: CampoIA[] = [
  'titulo',
  'tipo_propiedad',
  'zona',
  'sector',
  'condominio',
  'niveles',
  'dormitorios',
  'banos',
  'sala',
  'comedor',
  'cocina',
  'estudio',
  'sala_familiar',
  'habitacion_servicio',
  'lavanderia',
  'jardin',
  'parqueos',
  'bodega',
  'balcon',
  'area_construccion_m2',
  'area_terreno_m2',
  'medidas_terreno',
  'amenidades',
  'extras',
  'mascota',
]

// Selects que nunca deben quedar vacíos: si la IA no trae valor, se deja el actual.
const CAMPOS_SIEMPRE_CON_VALOR = new Set<CampoIA>(['tipo_operacion', 'tipo_propiedad', 'moneda'])

function otraOperacion(op: TipoOperacion): TipoOperacion {
  return op === 'venta' ? 'renta' : 'venta'
}

// Red de seguridad LOCAL (no depende de la IA) para el caso en que la IA no
// devuelva `descripcion`: se usa el texto original del anuncio, pero antes
// se le quita lo más común y riesgoso en cuanto a datos de contacto:
// - Líneas completas que empiezan con una etiqueta típica de contacto
//   (ej. "Asesor: Carlos Pérez - 5555-5555"), etiqueta + resto de la línea.
// - Números de teléfono guatemaltecos sueltos en cualquier parte del texto
//   (8 dígitos, con o sin separador, con o sin +502/502 delante).
// - Correos electrónicos.
// Esto NO es tan confiable como la depuración de la IA para nombres sueltos
// sin etiqueta (ej. "pregunta por Carlos" sin más contexto no se detecta),
// pero cubre el caso más común y más riesgoso (teléfono/WhatsApp), que es
// justo lo que no puede quedar expuesto ni en el detalle interno ni en el
// portal público. Decisión aceptada explícitamente por el usuario.
const ETIQUETAS_CONTACTO =
  /^\s*(asesor|agente|contacto|informes|whats\s*app|whatsapp|tel[eé]fono|tel|cel(ular)?)\s*[:\-].*$/gim
const TELEFONO_GT = /(\+?502[\s.-]?)?\b\d{4}[\s.-]?\d{4}\b/g
const CORREO = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

function saneandoContacto(texto: string): string {
  return texto
    .replace(ETIQUETAS_CONTACTO, '')
    .replace(CORREO, '')
    .replace(TELEFONO_GT, '')
    // Colapsa espacios en blanco que quedaron huecos tras quitar los patrones.
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// La comisión y los requisitos de renta de la operación ALTERNA (la que no
// está activa en el formulario) se leen del estado controlado que vive en
// el padre (comisión por operación, y requisitos de renta), así que basta
// con cambiar de pestaña venta/renta para que ambos se guarden por separado
// — no hay caché propio de este componente ni escritura directa al DOM.
function construirDatosAlterna(
  p: PropiedadExtraida,
  comision: string,
  requisitosRenta: string
): DatosOperacionAlterna {
  const precioNum = Number(p.precio)
  const mantenimientoBruto = p.mantenimiento
  const mantenimientoNum =
    mantenimientoBruto === null || mantenimientoBruto === undefined
      ? null
      : Number(mantenimientoBruto)
  return {
    tipo_operacion: p.tipo_operacion,
    precio: Number.isNaN(precioNum) ? 0 : precioNum,
    moneda: p.moneda || 'GTQ',
    mantenimiento: mantenimientoNum !== null && Number.isNaN(mantenimientoNum) ? null : mantenimientoNum,
    comision: comision || null,
    requisitos_renta: p.tipo_operacion === 'renta' ? (requisitosRenta || null) : null,
  }
}

export default function ExtractorTexto({
  formRef,
  municipios,
  onMunicipioDetectado,
  onOtraOperacionDetectada,
  onExtraccionAplicada,
  onComisionCambiada,
  obtenerComisionOperacion,
  obtenerRequisitosRentaGuardados,
}: {
  formRef: React.RefObject<HTMLFormElement | null>
  municipios: Municipio[]
  onMunicipioDetectado: (municipioId: string | undefined) => void
  onOtraOperacionDetectada: (datos: DatosOperacionAlterna | null) => void
  // `operacion`, cuando se pasa, es el tipo_operacion que acaba de quedar
  // activo en el formulario — permite al padre actualizar su estado en el
  // mismo tick, sin esperar al sondeo por retraso del DOM (ver
  // formulario-nueva-propiedad.tsx).
  onExtraccionAplicada: (textoOriginal: string, operacion?: TipoOperacion) => void
  // Resetea (o fija) la comisión guardada para una operación en el estado
  // controlado del padre. Se usa al iniciar una extracción nueva, para
  // limpiar cualquier valor de una extracción anterior.
  onComisionCambiada: (operacion: TipoOperacion, valor: string) => void
  // Lee del padre la comisión ya guardada (estado controlado) para una
  // operación (venta o renta), para armar los datos de la operación alterna.
  obtenerComisionOperacion: (operacion: TipoOperacion) => string
  // Lee del padre los requisitos de renta ya guardados (estado controlado;
  // solo aplica si la operación alterna es renta, se ignora si es venta).
  obtenerRequisitosRentaGuardados: () => string
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [propiedades, setPropiedades] = useState<PropiedadExtraida[]>([])
  const [indiceActivo, setIndiceActivo] = useState(0)

  // Texto exacto con el que se hizo la última extracción (el agente puede
  // seguir editando el cuadro de texto después). Se usa como respaldo de la
  // descripción SOLO si la IA no devuelve nada, y siempre pasado primero por
  // saneandoContacto() (ver aplicarAlFormulario) — nunca se usa crudo.
  const textoExtraido = useRef('')

  // Nombres de los campos que el agente tocó a mano. Los eventos "input" y
  // "change" solo cuentan si son de una interacción real (isTrusted); asignar
  // `.value` por código, como hace este componente, no los dispara.
  const editados = useRef<Set<string>>(new Set())

  useEffect(() => {
    const form = formRef.current
    if (!form) return
    const marcar = (e: Event) => {
      const nombre = (e.target as HTMLInputElement | null)?.name
      if (nombre && e.isTrusted) editados.current.add(nombre)
    }
    form.addEventListener('input', marcar)
    form.addEventListener('change', marcar)
    return () => {
      form.removeEventListener('input', marcar)
      form.removeEventListener('change', marcar)
    }
  }, [formRef])

  function buscarMunicipioId(municipioTexto: string | null): string | undefined {
    const objetivo = municipioTexto?.trim().toLowerCase()
    if (!objetivo) return undefined
    const encontrado = municipios.find(
      (m) => m.nombre.toLowerCase().includes(objetivo) || objetivo.includes(m.nombre.toLowerCase())
    )
    return encontrado?.id
  }

  function notificarOtraOperacion(lista: PropiedadExtraida[], indiceElegido: number, comisionDeLaAlterna: string) {
    if (lista.length !== 2) {
      onOtraOperacionDetectada(null)
      return
    }
    const indiceOtra = indiceElegido === 0 ? 1 : 0
    onOtraOperacionDetectada(
      construirDatosAlterna(lista[indiceOtra], comisionDeLaAlterna, obtenerRequisitosRentaGuardados())
    )
  }

  // Llena el formulario con lo que devolvió la IA, salvo los campos que el
  // agente ya editó a mano. Un campo que la IA no pudo determinar (null) se
  // vacía, para que no queden valores de una extracción o pestaña anterior.
  //
  // `elegirOperacion` = true cuando el agente hace clic en la pestaña
  // venta/renta: esa elección define qué operación representa el formulario,
  // así que los 4 campos de la operación se reemplazan siempre y dejan de
  // contar como editados (lo que se hubiera escrito era de la otra operación).
  function aplicarAlFormulario(p: PropiedadExtraida, elegirOperacion: boolean) {
    const form = formRef.current
    if (!form) return

    if (elegirOperacion) {
      CAMPOS_OPERACION.forEach((c) => editados.current.delete(c))
    }

    for (const campo of [...CAMPOS_OPERACION, ...CAMPOS_GENERALES]) {
      if (editados.current.has(campo)) continue

      const el = form.elements.namedItem(campo) as
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement
        | null
      if (!el) continue

      const valor = p[campo]
      if (valor === null || valor === undefined) {
        if (!CAMPOS_SIEMPRE_CON_VALOR.has(campo)) el.value = ''
        continue
      }

      const anterior = el.value
      el.value = String(valor)
      // Si la IA devolvió una opción que el select no tiene, se conserva la actual.
      if (el instanceof HTMLSelectElement && el.selectedIndex === -1) el.value = anterior
    }

    // La descripción viene de la IA ya depurada de datos de contacto de
    // asesores (nombre, teléfono, correo). Si la IA no la devolvió, se usa
    // el texto original del anuncio, pero SIEMPRE pasado por saneandoContacto()
    // antes: nunca se muestra el texto crudo sin filtrar. Ese saneo local
    // cubre teléfonos y líneas etiquetadas de contacto, pero no es tan
    // confiable como la IA para nombres sueltos sin etiqueta — riesgo
    // aceptado explícitamente por el usuario a cambio de conservar el texto
    // original en vez de dejar el campo vacío.
    if (!editados.current.has('descripcion')) {
      const descripcion = form.elements.namedItem('descripcion') as HTMLTextAreaElement | null
      if (descripcion) {
        descripcion.value = p.descripcion ?? saneandoContacto(textoExtraido.current)
      }
    }

    if (!editados.current.has('municipio_id')) {
      onMunicipioDetectado(buscarMunicipioId(p.municipio_texto) ?? '')
    }
  }

  async function extraer() {
    setError(null)
    setCargando(true)
    const textoAExtraer = texto
    try {
      const resultado = await extraerPropiedadAccion(textoAExtraer)
      if (!resultado.ok) {
        setError(resultado.mensaje ?? 'No se pudo extraer la información.')
        setPropiedades([])
        onOtraOperacionDetectada(null)
        return
      }
      textoExtraido.current = textoAExtraer
      setPropiedades(resultado.propiedades)
      setIndiceActivo(0)
      onComisionCambiada('venta', '')
      onComisionCambiada('renta', '')
      aplicarAlFormulario(resultado.propiedades[0], false)
      notificarOtraOperacion(resultado.propiedades, 0, '')
      onExtraccionAplicada(textoAExtraer, resultado.propiedades[0]?.tipo_operacion)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al extraer con IA.')
    } finally {
      setCargando(false)
    }
  }

  function seleccionarPropiedad(indice: number) {
    setIndiceActivo(indice)
    aplicarAlFormulario(propiedades[indice], true)

    const nuevaOperacion = propiedades[indice].tipo_operacion
    const alternaOperacion = otraOperacion(nuevaOperacion)

    notificarOtraOperacion(propiedades, indice, obtenerComisionOperacion(alternaOperacion))
    onExtraccionAplicada(textoExtraido.current, nuevaOperacion)
  }

  const alterna =
    propiedades.length === 2 ? propiedades[indiceActivo === 0 ? 1 : 0] : null
  const alternaSinPrecio = alterna !== null && !(Number(alterna.precio) > 0)

  return (
    <div className="mb-6 rounded-lg border border-dashed border-[#38B6FF]/50 bg-[#38B6FF]/5 p-4">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between text-left text-sm font-medium text-[#2C3E50]"
      >
        <span className="flex items-center gap-2">
          <Sparkles size={16} className="text-[#38B6FF]" />
          ¿Tienes el texto del anuncio? Pégalo y llena el formulario automáticamente
        </span>
        <span className="text-xs text-slate-400">{abierto ? 'Ocultar' : 'Mostrar'}</span>
      </button>

      {abierto && (
        <div className="mt-3 space-y-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={8}
            placeholder="Pega aquí el texto completo del anuncio, tal como lo recibiste por WhatsApp..."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={extraer}
            disabled={cargando || texto.trim().length < 10}
            className="flex items-center gap-1 rounded bg-[#2C3E50] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#38B6FF] disabled:opacity-50"
          >
            <Sparkles size={13} />
            {cargando ? 'Extrayendo...' : 'Extraer con IA'}
          </button>

          {error && <p className="text-xs text-red-600">{error}</p>}

          {propiedades.length > 1 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3">
              <p className="mb-2 text-xs font-medium text-amber-800">
                El texto describe {propiedades.length} operaciones para la misma propiedad. Al
                guardar, se creará automáticamente la propiedad de la pestaña activa (con los
                datos del formulario de abajo) y también la de la otra operación, copiando las
                mismas fotos. Como es una propiedad aparte, cambia a su pestaña abajo para
                definir su propia comisión (y, si es renta, sus requisitos de renta) en los
                campos de Información interna: cada operación guarda lo suyo por separado.
              </p>
              {alternaSinPrecio && alterna && (
                <p className="mb-2 text-xs font-medium text-red-700">
                  La IA no detectó el precio de {alterna.tipo_operacion}: esa versión se creará con
                  precio 0 y tendrás que editarla después.
                </p>
              )}
              <div className="flex gap-2">
                {propiedades.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => seleccionarPropiedad(i)}
                    className={`rounded px-2 py-1 text-xs font-medium capitalize ${
                      i === indiceActivo
                        ? 'bg-[#2C3E50] text-white'
                        : 'border border-slate-300 text-slate-600 hover:border-[#38B6FF]'
                    }`}
                  >
                    {p.tipo_operacion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {propiedades.length > 0 && (
            <p className="text-xs text-slate-500">
              Formulario llenado. Revisa cada campo antes de guardar — la IA puede equivocarse.
              Los campos que edites a mano no se vuelven a sobrescribir.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
