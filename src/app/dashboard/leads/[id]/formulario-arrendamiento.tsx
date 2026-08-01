'use client'
import { useState, useTransition } from 'react'
import { FileSignature, X, Copy, Check, Download, Trash2 } from 'lucide-react'
import {
  obtenerOCrearSolicitud,
  generarPdfArrendamientoEnBlanco,
  generarPdfArrendamientoLleno,
  eliminarSolicitudArrendamiento,
} from './arrendamiento'

type EstadoSolicitud = {
  id: string
  estado: string
  link: string
} | null

function descargarBase64(base64: string, nombreArchivo: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  URL.revokeObjectURL(url)
}

export default function FormularioArrendamiento({
  leadId,
  contactoId,
  solicitudInicial,
}: {
  leadId: string
  contactoId: string
  solicitudInicial: EstadoSolicitud
}) {
  const [abierto, setAbierto] = useState(false)
  const [solicitud, setSolicitud] = useState<EstadoSolicitud>(solicitudInicial)
  const [copiado, setCopiado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false)

  function manejarGenerarLink() {
    setError(null)
    startTransition(async () => {
      const resultado = await obtenerOCrearSolicitud(leadId, contactoId)
      if (!resultado.ok || !resultado.solicitud || !resultado.link) {
        setError(resultado.mensaje ?? 'No se pudo generar el link.')
        return
      }
      setSolicitud({ id: resultado.solicitud.id, estado: resultado.solicitud.estado, link: resultado.link })
      copiarLink(resultado.link)
    })
  }

  function copiarLink(link: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  function manejarDescargarBlanco() {
    setError(null)
    startTransition(async () => {
      const resultado = await generarPdfArrendamientoEnBlanco()
      if (!resultado.ok || !resultado.pdfBase64) {
        setError('No se pudo generar el PDF en blanco.')
        return
      }
      descargarBase64(resultado.pdfBase64, 'formulario-arrendamiento-en-blanco.pdf')
    })
  }

  function manejarDescargarLleno() {
    if (!solicitud) return
    setError(null)
    startTransition(async () => {
      const resultado = await generarPdfArrendamientoLleno(solicitud.id)
      if (!resultado.ok || !resultado.pdfBase64) {
        setError(resultado.mensaje ?? 'No se pudo generar el PDF.')
        return
      }
      descargarBase64(resultado.pdfBase64, 'formulario-arrendamiento.pdf')
    })
  }

  function manejarEliminarSolicitud() {
    if (!solicitud) return
    setError(null)
    startTransition(async () => {
      const resultado = await eliminarSolicitudArrendamiento(solicitud.id, leadId)
      if (!resultado.ok) {
        setError(resultado.mensaje ?? 'No se pudo eliminar la solicitud.')
        setConfirmandoEliminar(false)
        return
      }
      setSolicitud(null)
      setConfirmandoEliminar(false)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 rounded bg-[#2C3E50] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#38B6FF]"
      >
        <FileSignature size={14} />
        Formulario arrendamiento
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#2C3E50]">Formulario de arrendamiento</h2>
              <button type="button" onClick={() => setAbierto(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            )}

            {!solicitud && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">
                  Genera un link para que el cliente llene sus datos y los del fiador. Se copiará automáticamente al portapapeles.
                </p>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={manejarGenerarLink}
                  className="w-full rounded bg-[#2C3E50] px-3 py-2 text-sm font-medium text-white hover:bg-[#38B6FF] disabled:opacity-50"
                >
                  {isPending ? 'Generando...' : 'Generar link para el cliente'}
                </button>
              </div>
            )}

            {solicitud && (
              <div className="space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        solicitud.estado === 'completado'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {solicitud.estado === 'completado' ? 'Completado por el cliente' : 'Esperando al cliente'}
                    </span>
                    {confirmandoEliminar ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500">¿Eliminar?</span>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={manejarEliminarSolicitud}
                          className="font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          {isPending ? 'Eliminando...' : 'Sí, eliminar'}
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setConfirmandoEliminar(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setConfirmandoEliminar(true)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                        Eliminar solicitud
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={solicitud.link}
                      className="w-full truncate rounded border border-gray-300 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                    />
                    <button
                      type="button"
                      onClick={() => copiarLink(solicitud.link)}
                      className="flex shrink-0 items-center gap-1 rounded bg-[#2C3E50] px-3 py-2 text-xs font-medium text-white hover:bg-[#38B6FF]"
                    >
                      {copiado ? <Check size={14} /> : <Copy size={14} />}
                      {copiado ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>

                {solicitud.estado === 'completado' && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={manejarDescargarLleno}
                    className="flex w-full items-center justify-center gap-1.5 rounded bg-[#38B6FF] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <Download size={14} />
                    Descargar PDF con los datos del cliente
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="mb-2 text-xs text-slate-500">
                ¿El cliente prefiere llenarlo a mano? Descarga el formulario en blanco para imprimir.
              </p>
              <button
                type="button"
                disabled={isPending}
                onClick={manejarDescargarBlanco}
                className="flex w-full items-center justify-center gap-1.5 rounded border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download size={14} />
                Descargar PDF en blanco
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
