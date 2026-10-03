'use client'
import { useEffect, useState } from 'react'
import SelectorPropiedadesVisita from './selector-propiedades-visita'
import type { PropiedadEnviada } from '@/lib/propiedades-enviadas'
import { listarPropiedadesEnviadas } from '@/app/dashboard/contactos/envios'

// Caja de propiedades del formulario de nuevo lead. Si el contacto viene fijo
// (?contacto_id=) carga sus propiedades enviadas; si se elige en el <select>
// del formulario, se recarga cada vez que cambia.
export default function SelectorPropiedadesLead({
  contactoIdInicial,
}: {
  contactoIdInicial: string | null
}) {
  const [contactoId, setContactoId] = useState<string | null>(contactoIdInicial)
  const [opciones, setOpciones] = useState<PropiedadEnviada[]>([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (contactoIdInicial) return
    const select = document.querySelector<HTMLSelectElement>('select[name="contacto_id"]')
    if (!select) return
    const alCambiar = () => setContactoId(select.value || null)
    select.addEventListener('change', alCambiar)
    return () => select.removeEventListener('change', alCambiar)
  }, [contactoIdInicial])

  useEffect(() => {
    if (!contactoId) {
      setOpciones([])
      return
    }
    let cancelado = false
    setCargando(true)
    listarPropiedadesEnviadas(contactoId)
      .then((r) => {
        if (!cancelado) setOpciones(r)
      })
      .catch((e) => {
        console.error('No se pudieron cargar las propiedades enviadas', e)
        if (!cancelado) setOpciones([])
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [contactoId])

  if (!contactoId) {
    return (
      <div>
        <input type="hidden" name="selector_propiedades" value="1" />
        <label className="mb-1 block text-sm font-medium text-gray-700">Propiedades de interés (opcional)</label>
        <p className="rounded border border-dashed border-gray-300 px-3 py-2 text-xs text-slate-400">
          Selecciona un contacto para ver las propiedades que se le han enviado.
        </p>
      </div>
    )
  }

  return (
    <SelectorPropiedadesVisita
      opciones={opciones}
      cargando={cargando}
      etiqueta="Propiedades de interés (enviadas a este contacto)"
    />
  )
}
