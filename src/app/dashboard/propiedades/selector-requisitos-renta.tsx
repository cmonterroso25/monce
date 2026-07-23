'use client'

import { useState } from 'react'
import { OPCIONES_REQUISITOS_RENTA, REQUISITOS_RENTA, type CodigoRequisitosRenta } from './requisitos-renta'

type Seleccion = CodigoRequisitosRenta | ''

export default function SelectorRequisitosRenta({
  defaultValue = '',
}: {
  defaultValue?: Seleccion
}) {
  const [seleccion, setSeleccion] = useState<Seleccion>(defaultValue)
  const paquete = seleccion ? REQUISITOS_RENTA[seleccion] : null

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">Requisitos de renta</label>

      <div className="flex flex-wrap gap-4 rounded-t border border-gray-200 p-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="radio"
            name="requisitos_renta"
            value=""
            checked={seleccion === ''}
            onChange={() => setSeleccion('')}
            className="h-4 w-4"
          />
          Ninguno
        </label>
        {OPCIONES_REQUISITOS_RENTA.map((codigo) => (
          <label key={codigo} className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="requisitos_renta"
              value={codigo}
              checked={seleccion === codigo}
              onChange={() => setSeleccion(codigo)}
              className="h-4 w-4"
            />
            {REQUISITOS_RENTA[codigo].etiqueta}
          </label>
        ))}
      </div>

      {paquete ? (
        <div className="rounded-b border border-t-0 border-gray-200 bg-slate-50 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Titular</h4>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                {paquete.titular.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Fiador</h4>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                {paquete.fiador.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-200 pt-2 text-xs text-slate-600">
            <p><span className="font-medium text-slate-700">Contrato mínimo: </span>{paquete.contratoMinimo}</p>
            <p><span className="font-medium text-slate-700">Depósito: </span>{paquete.deposito}</p>
          </div>
        </div>
      ) : (
        <p className="rounded-b border border-t-0 border-gray-200 bg-slate-50 p-3 text-xs text-slate-500">
          Selecciona un paquete para ver el detalle de requisitos.
        </p>
      )}
    </div>
  )
}
