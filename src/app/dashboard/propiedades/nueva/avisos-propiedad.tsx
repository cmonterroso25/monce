'use client'

import { useCallback, useEffect, useState } from 'react'

// Avisos en rojo (no bloquean el guardado) sobre las reglas de negocio de
// una propiedad nueva. Se reevalúan cuando el agente edita el formulario y
// después de cada extracción con IA (la IA llena los campos por código, sin
// disparar eventos, por eso también depende de `versionExtraccion`).
export default function AvisosPropiedad({
  formRef,
  versionExtraccion,
  operacionAlterna,
  requisitosRentaGuardados,
}: {
  formRef: React.RefObject<HTMLFormElement | null>
  versionExtraccion: number
  operacionAlterna: string | null
  // Valor de "Requisitos de renta" que vive en el estado del padre
  // (formulario-nueva-propiedad.tsx). Es necesario porque, cuando la
  // pestaña activa es "venta", el campo <SelectorRequisitosRenta> ni
  // siquiera está montado en el DOM ({esRenta && ...}) — leerlo con
  // form.elements.namedItem() ahí siempre da vacío, aunque el agente ya
  // haya seleccionado un paquete mientras estuvo en la pestaña de renta.
  // Sin este valor, el aviso saltaba SIEMPRE que había una operación
  // alterna de renta, sin importar si ya se había seleccionado algo.
  requisitosRentaGuardados: string
}) {
  const [avisos, setAvisos] = useState<string[]>([])

  const evaluar = useCallback(() => {
    const form = formRef.current
    if (!form) return

    const campo = (nombre: string): string => {
      const el = form.elements.namedItem(nombre) as unknown as { value?: string } | null
      return el?.value ?? ''
    }

    const lista: string[] = []

    if (!campo('municipio_id').trim()) {
      lista.push('Falta el municipio.')
    }

    const operacionActiva = campo('tipo_operacion')
    const esRentaActiva = operacionActiva === 'renta'
    const hayRenta = esRentaActiva || operacionAlterna === 'renta'

    // Si la pestaña activa es renta, el campo existe en el DOM y se lee de
    // ahí (así refleja cambios en tiempo real). Si la pestaña activa es
    // venta pero la operación ALTERNA es renta, el campo del DOM no existe
    // (está desmontado), así que se usa el valor guardado en el estado del
    // padre, que es el que realmente se va a guardar para esa operación.
    const requisitosActuales = esRentaActiva ? campo('requisitos_renta') : requisitosRentaGuardados

    if (hayRenta && !requisitosActuales.trim()) {
      lista.push(
        !esRentaActiva
          ? 'La versión de renta necesita requisitos: cambia a la pestaña de renta y selecciona un paquete en "Requisitos de renta".'
          : 'Toda renta debe llevar requisitos: selecciona un paquete (no dejes "Ninguno").'
      )
    }

    setAvisos(lista)
  }, [formRef, operacionAlterna, requisitosRentaGuardados])

  useEffect(() => {
    const form = formRef.current
    if (!form) return
    const alCambiar = () => evaluar()
    form.addEventListener('input', alCambiar)
    form.addEventListener('change', alCambiar)
    // El select de municipio se actualiza un render después de la extracción:
    // se reevalúa con un pequeño retraso para leer el valor ya aplicado.
    const temporizador = window.setTimeout(evaluar, 60)
    return () => {
      form.removeEventListener('input', alCambiar)
      form.removeEventListener('change', alCambiar)
      window.clearTimeout(temporizador)
    }
  }, [formRef, evaluar, versionExtraccion])

  if (avisos.length === 0) return null

  return (
    <div className="rounded border border-red-300 bg-red-50 p-3">
      <p className="mb-1 text-xs font-semibold text-red-700">Revisa antes de guardar:</p>
      <ul className="list-disc space-y-0.5 pl-4 text-xs text-red-700">
        {avisos.map((aviso) => (
          <li key={aviso}>{aviso}</li>
        ))}
      </ul>
    </div>
  )
}
