'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronDown, Phone, ArrowUpRight } from 'lucide-react'
import FormularioComentario from './formulario-comentario'

type Comentario = {
  id: string
  contenido: string
  creado_en: string
  creado_por: { nombre_completo: string } | null
}

type TarjetaCitaProps = {
  actividad: any
  estado: string
  colores: Record<string, string>
  etiquetas: Record<string, string>
  etiquetasActividad: Record<string, string>
  estadoIA?: { estado: string; fase: string } | null
}

const ETIQUETA_ESTADO_IA: Record<string, string> = {
  pendiente: 'IA: esperando respuesta del asesor',
  respondido: 'IA: procesando respuesta',
  cerrado: 'IA: seguimiento cerrado',
  vencido: 'IA: vencida (sin respuesta del asesor)',
}

const CLASE_ESTADO_IA: Record<string, string> = {
  pendiente: 'bg-blue-100 text-blue-700',
  respondido: 'bg-blue-100 text-blue-700',
  cerrado: 'bg-slate-100 text-slate-600',
  vencido: 'bg-red-100 text-red-700',
}

export default function TarjetaCita({
  actividad,
  estado,
  colores,
  etiquetas,
  etiquetasActividad,
  estadoIA,
}: TarjetaCitaProps) {
  const [expandida, setExpandida] = useState(false)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [cargandoComentarios, setCargandoComentarios] = useState(false)

  useEffect(() => {
    if (expandida && comentarios.length === 0) {
      cargarComentarios()
    }
  }, [expandida])

  const cargarComentarios = async () => {
    setCargandoComentarios(true)
    try {
      const res = await fetch(`/api/seguimientos/comentarios?actividad_id=${actividad.id}`)
      if (res.ok) {
        const data = await res.json()
        setComentarios(data)
      }
    } catch (err) {
      console.error('Error al cargar comentarios:', err)
    } finally {
      setCargandoComentarios(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <button
        onClick={() => setExpandida(!expandida)}
        className="w-full"
      >
        <div className="flex items-center gap-4 px-4 py-3 sm:px-5">
          <div className="flex flex-shrink-0 flex-col items-start gap-1">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${colores[estado]}`}
            >
              {etiquetas[estado]}
            </span>
            {estadoIA && (
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${CLASE_ESTADO_IA[estadoIA.estado] ?? 'bg-slate-100 text-slate-600'}`}
              >
                {ETIQUETA_ESTADO_IA[estadoIA.estado] ?? `IA: ${estadoIA.estado}`}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-baseline gap-2">
              <h3 className="truncate text-sm font-semibold text-[#2C3E50]">
                {actividad.contacto?.nombre_completo ?? 'Sin contacto'}
              </h3>
              <span className="flex-shrink-0 text-xs text-slate-400">
                {etiquetasActividad[actividad.tipo_actividad] ?? actividad.tipo_actividad}
              </span>
            </div>
            {actividad.contacto?.telefono && (
              <p className="flex items-center gap-1 text-xs text-slate-400">
                <Phone size={11} /> {actividad.contacto.telefono}
              </p>
            )}
            {actividad.agente?.nombre_completo && (
              <p className="text-xs text-slate-400">
                {actividad.agente.nombre_completo}
              </p>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            <time className="text-xs text-slate-500">
              {actividad.programada_en
                ? new Date(actividad.programada_en).toLocaleString('es-GT', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'America/Guatemala',
                  })
                : '—'}
            </time>
            <ChevronDown
              size={18}
              className={`text-slate-400 transition-transform ${expandida ? 'rotate-180' : ''}`}
            />
          </div>
        </div>
      </button>

      {expandida && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
          <div className="space-y-3">
            {/* Detalles */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
              {actividad.notas && (
                <div className="sm:col-span-2">
                  <p className="font-medium text-slate-700">Notas:</p>
                  <p className="text-slate-600">{actividad.notas}</p>
                </div>
              )}
              {actividad.lead_id && (
                <div>
                  <p className="font-medium text-slate-700">Lead:</p>
                  <Link
                    href={`/dashboard/leads/${actividad.lead_id}`}
                    className="inline-flex items-center gap-1 text-[#38B6FF] hover:underline"
                  >
                    Ver lead <ArrowUpRight size={12} />
                  </Link>
                </div>
              )}
            </div>

            {/* Comentarios */}
            <div className="border-t border-slate-200 pt-3">
              <h4 className="mb-2 text-sm font-medium text-slate-700">Seguimientos</h4>

              {cargandoComentarios ? (
                <p className="text-xs text-slate-400">Cargando...</p>
              ) : (
                <div className="mb-3 space-y-2 max-h-48 overflow-y-auto">
                  {comentarios.length > 0 ? (
                    comentarios.map((comentario) => (
                      <div key={comentario.id} className="rounded bg-white p-2 text-xs">
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium text-slate-700">
                            {comentario.creado_por?.nombre_completo ?? 'Agente de seguimiento'}
                          </span>
                          <time className="text-slate-400">
                            {new Date(comentario.creado_en).toLocaleString('es-GT', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                              timeZone: 'America/Guatemala',
                            })}
                          </time>
                        </div>
                        <p className="mt-1 text-slate-600">{comentario.contenido}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400">Sin seguimientos aún.</p>
                  )}
                </div>
              )}

              <FormularioComentario actividadId={actividad.id} onComentarioAgregado={() => cargarComentarios()} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
