'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Phone, ArrowUpRight } from 'lucide-react'
import FormularioComentario from './formulario-comentario'

type TarjetaCitaProps = {
  actividad: any
  estado: string
  colores: Record<string, string>
  etiquetas: Record<string, string>
  etiquetasActividad: Record<string, string>
}

export default function TarjetaCita({
  actividad,
  estado,
  colores,
  etiquetas,
  etiquetasActividad,
}: TarjetaCitaProps) {
  const [expandida, setExpandida] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <button
        onClick={() => setExpandida(!expandida)}
        className="w-full"
      >
        <div className="flex items-center gap-4 px-4 py-3 sm:px-5">
          <div className="flex-shrink-0">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${colores[estado]}`}
            >
              {etiquetas[estado]}
            </span>
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

              <div className="mb-3 space-y-2 max-h-48 overflow-y-auto">
                {actividad.comentarios_actividad && actividad.comentarios_actividad.length > 0 ? (
                  actividad.comentarios_actividad.map((comentario: any) => (
                    <div key={comentario.id} className="rounded bg-white p-2 text-xs">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-slate-700">
                          {comentario.creado_por?.nombre_completo ?? 'Anónimo'}
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

              <FormularioComentario actividadId={actividad.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
