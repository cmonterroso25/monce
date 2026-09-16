'use client'
import { useEffect, useState } from 'react'
import { FileCheck2, FileWarning, Loader2, Download } from 'lucide-react'
import { obtenerEstadoInforme, obtenerDocumentosInforme } from './informes'
import { useInforme } from './contexto-informe'
import { etiquetaCriterio } from '@/lib/informes/etiquetas-criterios'

type DocumentoInforme = { id: string; label: string; url: string }

export default function EstadoInforme() {
  const { informe, setInforme } = useInforme()
  const [documentos, setDocumentos] = useState<DocumentoInforme[]>([])
  const [descargandoZip, setDescargandoZip] = useState(false)
  const [errorZip, setErrorZip] = useState<string | null>(null)

  useEffect(() => {
    if (!informe || informe.estado !== 'procesando') return
    const intervalo = setInterval(async () => {
      const actualizado = await obtenerEstadoInforme(informe.id)
      if (actualizado) setInforme(actualizado)
    }, 8000)
    return () => clearInterval(intervalo)
  }, [informe, setInforme])

  useEffect(() => {
    if (!informe) {
      setDocumentos([])
      return
    }
    obtenerDocumentosInforme(informe.id).then(setDocumentos)
  }, [informe?.id])

  if (!informe) return null

  if (informe.estado === 'procesando') {
    return (
      <div className="mb-6 flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
        <Loader2 size={14} className="animate-spin" />
        Analizando documentos del candidato...
      </div>
    )
  }

  if (informe.estado === 'error') {
    return (
      <div className="mb-6 flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
        <FileWarning size={14} />
        {informe.error_mensaje ?? 'Ocurrió un error al generar el informe.'}
      </div>
    )
  }

  const enlaceDescarga = informe.ruta_pdf

  // Descarga en un solo ZIP todos los documentos del informe (agregado
  // 15/09/2026 a pedido del usuario, reemplaza los links de descarga
  // individuales por documento).
  async function descargarDocumentosZip() {
    if (!informe) return
    setErrorZip(null)
    setDescargandoZip(true)
    try {
      const respuesta = await fetch('/api/descargar-documentos-informe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ informeId: informe.id }),
      })
      if (!respuesta.ok) {
        const data = await respuesta.json().catch(() => null)
        throw new Error(data?.error || 'No se pudo descargar el ZIP.')
      }
      const blob = await respuesta.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `documentos-informe-${informe.id}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setErrorZip(err instanceof Error ? err.message : 'No se pudo descargar el ZIP.')
    } finally {
      setDescargandoZip(false)
    }
  }

  return (
    <div className="mb-6 space-y-1.5 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
      <div className="flex items-center gap-2 font-medium">
        <FileCheck2 size={14} />
        Informe listo{informe.resultado_recomendacion ? `: ${informe.resultado_recomendacion}` : ''}
      </div>
      {informe.resultado_resumen && <p className="text-green-700">{informe.resultado_resumen}</p>}
      {informe.detalle_criterios && Object.keys(informe.detalle_criterios).length > 0 && (
        <div className="space-y-1.5 pt-1">
          {Object.entries(informe.detalle_criterios).map(([clave, valor]) => (
            <div key={clave} className="rounded border border-green-200 bg-white px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-green-900">{etiquetaCriterio(clave)}</span>
                <span
                  className={
                    valor.cumple
                      ? 'shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-800'
                      : 'shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-800'
                  }
                >
                  {valor.cumple ? 'Cumple' : 'No cumple'}
                </span>
              </div>
              {valor.detalle && <p className="mt-0.5 text-green-700">{valor.detalle}</p>}
            </div>
          ))}
        </div>
      )}
      {documentos.length > 0 && (
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-green-900">Documentos utilizados ({documentos.length})</p>
            <button
              type="button"
              onClick={descargarDocumentosZip}
              disabled={descargandoZip}
              className="inline-flex items-center gap-1 rounded bg-green-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-green-800 disabled:opacity-60"
            >
              {descargandoZip ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              {descargandoZip ? 'Preparando ZIP...' : 'Descargar todos (ZIP)'}
            </button>
          </div>
          <ul className="list-disc space-y-0.5 pl-4 text-green-700">
            {documentos.map((doc) => (
              <li key={doc.id}>{doc.label}</li>
            ))}
          </ul>
          {errorZip && <p className="text-red-700">{errorZip}</p>}
        </div>
      )}
      {enlaceDescarga && (
        <a href={enlaceDescarga} target="_blank" rel="noopener noreferrer" className="inline-block font-medium underline">Descargar informe (PDF)</a>
      )}
    </div>
  )
}
