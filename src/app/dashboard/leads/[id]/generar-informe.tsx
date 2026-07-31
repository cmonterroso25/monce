'use client'
import { useState, useTransition } from 'react'
import { FileSearch, X } from 'lucide-react'
import { crearInforme, obtenerUrlSubidaDocumento, finalizarInforme } from './informes'
import { CAMPOS_DOCUMENTOS_INFORME, type CampoArchivo } from './campos-informe'
import { useInforme } from './contexto-informe'

export default function GenerarInforme({
  leadId,
  contactoId,
  contactoNombre,
}: {
  leadId: string
  contactoId: string
  contactoNombre: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progreso, setProgreso] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { setInforme } = useInforme()

  function cerrar() {
    setAbierto(false)
    setError(null)
    setProgreso(null)
  }

  // Sube un archivo directo del navegador a R2 (PUT a la URL firmada),
  // sin pasar por el Server Action — evita el límite de 4.5MB por request
  // de las funciones serverless de Vercel.
  async function subirArchivo(informeId: string, campo: CampoArchivo, archivo: File) {
    const preparado = await obtenerUrlSubidaDocumento(
      informeId,
      archivo.name,
      archivo.type || 'application/octet-stream'
    )
    if (!preparado.ok || !preparado.url || !preparado.key) {
      throw new Error(preparado.mensaje ?? `No se pudo preparar la subida de ${campo.label}.`)
    }
    const respuestaPut = await fetch(preparado.url, {
      method: 'PUT',
      headers: { 'Content-Type': archivo.type || 'application/octet-stream' },
      body: archivo,
    })
    if (!respuestaPut.ok) {
      throw new Error(`Error al subir ${campo.label} (${respuestaPut.status})`)
    }
    return { tipo: campo.key, label: campo.label, key: preparado.key }
  }

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    const comentarios = (formData.get('comentarios_agente') as string) || ''

    startTransition(async () => {
      try {
        setProgreso('Iniciando informe...')
        const creado = await crearInforme(leadId, contactoId, comentarios)
        if (!creado.ok || !creado.informeId) {
          setError(creado.mensaje ?? 'No se pudo generar el informe.')
          setProgreso(null)
          return
        }
        const informeId = creado.informeId

        const documentos: { tipo: string; label: string; key: string }[] = []
        for (const campo of CAMPOS_DOCUMENTOS_INFORME) {
          const archivos = formData.getAll(campo.key) as File[]
          for (const archivo of archivos) {
            if (!archivo || archivo.size === 0) continue
            setProgreso(`Subiendo: ${campo.label}...`)
            const doc = await subirArchivo(informeId, campo, archivo)
            documentos.push(doc)
          }
        }

        setProgreso('Iniciando análisis...')
        const finalizado = await finalizarInforme(informeId, documentos)
        if (!finalizado.ok) {
          setError(finalizado.mensaje ?? 'No se pudo iniciar el análisis.')
          setProgreso(null)
          return
        }

        setInforme({
          id: informeId,
          estado: 'procesando',
          ruta_pdf: null,
          resultado_recomendacion: null,
          resultado_resumen: null,
          error_mensaje: null,
          detalle_criterios: null,
        })
        cerrar()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al subir los documentos.')
        setProgreso(null)
      }
    })
  }

  const titular = CAMPOS_DOCUMENTOS_INFORME.filter((c) => c.key.startsWith('titular_'))
  const fiador = CAMPOS_DOCUMENTOS_INFORME.filter((c) => c.key.startsWith('fiador_'))

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 rounded bg-[#2C3E50] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#38B6FF]"
      >
        <FileSearch size={14} />
        Generar informe
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#2C3E50]">Generar informe de evaluación</h2>
              <button type="button" onClick={cerrar} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={alEnviar} className="space-y-4">
              <p className="text-sm text-slate-500">
                Candidato: <span className="font-medium text-[#2C3E50]">{contactoNombre}</span>
              </p>

              {error && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}

              {progreso && !error && (
                <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  {progreso}
                </div>
              )}

              <fieldset className="space-y-2 rounded border border-gray-200 p-3">
                <legend className="px-1 text-xs font-semibold text-[#2C3E50]">Documentos del titular</legend>
                {titular.map((campo) => (
                  <div key={campo.key}>
                    <label className="mb-1 block text-xs font-medium text-slate-600">{campo.label}</label>
                    <input
                      name={campo.key}
                      type="file"
                      multiple={campo.key.includes('estados_cuenta') || campo.key.includes('dpi')}
                      accept="application/pdf,image/*"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-[#2C3E50] file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[#38B6FF]"
                    />
                  </div>
                ))}
              </fieldset>

              <fieldset className="space-y-2 rounded border border-gray-200 p-3">
                <legend className="px-1 text-xs font-semibold text-[#2C3E50]">Fiador</legend>
                {fiador.map((campo) => (
                  <div key={campo.key}>
                    <label className="mb-1 block text-xs font-medium text-slate-600">{campo.label}</label>
                    <input
                      name={campo.key}
                      type="file"
                      multiple={campo.key.includes('estados_cuenta') || campo.key.includes('dpi')}
                      accept="application/pdf,image/*"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-[#2C3E50] file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-[#38B6FF]"
                    />
                  </div>
                ))}
              </fieldset>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Comentarios (opcional)
                </label>
                <textarea
                  name="comentarios_agente"
                  rows={3}
                  placeholder="Contexto adicional sobre los documentos, por ejemplo: 'El DPI del titular está vencido, ya tramita renovación' o 'El fiador es dueño de negocio, ingresos variables'."
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-[#2C3E50] placeholder:text-slate-400 focus:border-[#38B6FF] focus:outline-none"
                />
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
                  {isPending ? 'Enviando...' : 'Iniciar análisis'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
