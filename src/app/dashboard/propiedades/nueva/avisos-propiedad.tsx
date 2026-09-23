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
}: {
  formRef: React.RefObject<HTMLFormElement | null>
  versionExtraccion: number
  operacionAlterna: string | null
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
    const hayRenta = operacionActiva === 'renta' || operacionAlterna === 'renta'
    if (hayRenta && !campo('requisitos_renta').trim()) {
      lista.push(
        operacionActiva !== 'renta'
          ? 'La versión de renta necesita requisitos: selecciona un paquete en "Requisitos de renta".'
          : 'Toda renta debe llevar requisitos: selecciona un paquete (no dejes "Ninguno").'
      )
    }

    setAvisos(lista)
  }, [formRef, operacionAlterna])

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
