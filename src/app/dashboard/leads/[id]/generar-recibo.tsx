'use client'
import { useState, useTransition } from 'react'
import { Receipt, X } from 'lucide-react'
import { generarRecibo } from '../recibos'

const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Cheque']
const CONCEPTOS_SUGERIDOS = ['Depósito', 'Primer mes de renta', 'Pago de renta', 'Reserva']

export default function GenerarRecibo({
  leadId,
  contactoId,
  contactoNombre,
  agentes,
  agenteActualId,
}: {
  leadId: string
  contactoId: string
  contactoNombre: string
  agentes: { id: string; nombre_completo: string }[]
  agenteActualId: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  function cerrar() {
    setAbierto(false)
    setError(null)
    setExito(null)
  }

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const datos = new FormData(form)

    const monto = Number(datos.get('monto'))
    if (!monto || monto <= 0) {
      setError('Ingresa un monto válido.')
      return
    }

    startTransition(async () => {
      const resultado = await generarRecibo({
        leadId,
        contactoId,
        agenteReceptorId: datos.get('agente_receptor_id') as string,
        monto,
        moneda: datos.get('moneda') as string,
        concepto: datos.get('concepto') as string,
        metodoPago: datos.get('metodo_pago') as string,
        fechaPago: datos.get('fecha_pago') as string,
        detalles: (datos.get('detalles') as string) || undefined,
      })

      if (!resultado.ok || !resultado.pdfBase64) {
        setError(resultado.mensaje ?? 'No se pudo generar el recibo.')
        return
      }

      // Descargar el PDF generado
      const bytes = Uint8Array.from(atob(resultado.pdfBase64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = `recibo-${String(resultado.numeroRecibo).padStart(4, '0')}.pdf`
      document.body.appendChild(enlace)
      enlace.click()
      document.body.removeChild(enlace)
      URL.revokeObjectURL(url)

      setExito(resultado.numeroRecibo ?? null)
      form.reset()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 rounded bg-[#2C3E50] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#38B6FF]"
      >
        <Receipt size={14} />
        Generar recibo
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#2C3E50]">Generar recibo</h2>
              <button type="button" onClick={cerrar} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {exito !== null ? (
              <div className="space-y-4">
                <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                  Recibo No. {String(exito).padStart(4, '0')} generado y descargado.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setExito(null)
                      setError(null)
                    }}
                    className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Generar otro
                  </button>
                  <button
                    type="button"
                    onClick={cerrar}
                    className="rounded bg-[#2C3E50] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#38B6FF]"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={alEnviar} className="space-y-3">
                <p className="text-sm text-slate-500">
                  Para: <span className="font-medium text-[#2C3E50]">{contactoNombre}</span>
                </p>

                {error && (
                  <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Monto</label>
                    <input
                      name="monto"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Moneda</label>
                    <select
                      name="moneda"
                      required
                      defaultValue="GTQ"
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="GTQ">GTQ</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Concepto</label>
                  <input
                    name="concepto"
                    type="text"
                    required
                    list="conceptos-sugeridos"
                    placeholder="Ej. Depósito, Primer mes de renta..."
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                  <datalist id="conceptos-sugeridos">
                    {CONCEPTOS_SUGERIDOS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Método de pago</label>
                    <select
                      name="metodo_pago"
                      required
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    >
                      {METODOS_PAGO.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Fecha de pago</label>
                    <input
                      name="fecha_pago"
                      type="date"
                      required
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Detalles <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <textarea
                    name="detalles"
                    rows={2}
                    placeholder="Notas adicionales sobre esta transacción..."
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Recibido por</label>
                  <select
                    name="agente_receptor_id"
                    required
                    defaultValue={agenteActualId}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    {agentes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre_completo}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={cerrar}
                    className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded bg-[#2C3E50] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#38B6FF] disabled:opacity-50"
                  >
                    {isPending ? 'Generando...' : 'Generar y descargar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
