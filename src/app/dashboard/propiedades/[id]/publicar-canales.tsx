'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Rocket, X, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import {
  crearSolicitudPublicacion,
  type CanalPublicacionActivo,
  type CuentaSocialLista,
  type SubjobPublicacionResultado,
} from './acciones'

type Props = {
  propiedadId: string
  canalesActivos: CanalPublicacionActivo[]
  // Cuentas sociales disponibles, agrupadas por plataforma (ej. "facebook").
  // Se cargan del lado del servidor en page.tsx porque su visibilidad
  // depende de RLS (cuentas_sociales solo se ven si eres el asesor dueño
  // o admin de la organización).
  cuentasPorPlataforma: Record<string, CuentaSocialLista[]>
}

const ETIQUETAS_ESTADO: Record<string, { texto: string; clase: string; icono: React.ReactNode }> = {
  QUEUED: { texto: 'En cola', clase: 'bg-blue-100 text-blue-700', icono: <Clock size={14} /> },
  VALIDATION_ERROR: { texto: 'Faltan datos', clase: 'bg-amber-100 text-amber-700', icono: <XCircle size={14} /> },
  AUTH_REQUIRED: { texto: 'Cuenta requiere reautenticación', clase: 'bg-amber-100 text-amber-700', icono: <XCircle size={14} /> },
  FAILED: { texto: 'Error', clase: 'bg-red-100 text-red-700', icono: <XCircle size={14} /> },
}

function etiquetaEstado(estado: string) {
  return ETIQUETAS_ESTADO[estado] ?? { texto: estado, clase: 'bg-slate-100 text-slate-700', icono: <CheckCircle2 size={14} /> }
}

export default function PublicarCanales({ propiedadId, canalesActivos, cuentasPorPlataforma }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [canalesSeleccionados, setCanalesSeleccionados] = useState<Set<string>>(new Set())
  const [cuentaPorCanal, setCuentaPorCanal] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<SubjobPublicacionResultado[] | null>(null)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  function alternarCanal(codigo: string) {
    setCanalesSeleccionados((prev) => {
      const siguiente = new Set(prev)
      if (siguiente.has(codigo)) siguiente.delete(codigo)
      else siguiente.add(codigo)
      return siguiente
    })
  }

  function cuentasDelCanal(canal: CanalPublicacionActivo): CuentaSocialLista[] {
    return cuentasPorPlataforma[canal.plataforma] ?? []
  }

  function puedeEnviar(): boolean {
    if (canalesSeleccionados.size === 0) return false
    for (const codigo of canalesSeleccionados) {
      const canal = canalesActivos.find((c) => c.codigo === codigo)
      if (canal?.requiere_cuenta_social && !cuentaPorCanal[codigo]) return false
    }
    return true
  }

  async function enviar() {
    setEnviando(true)
    setErrorGeneral(null)
    setResultado(null)

    const canales = [...canalesSeleccionados].map((codigo) => ({
      canal_codigo: codigo,
      cuenta_social_id: cuentaPorCanal[codigo] ?? null,
    }))

    const respuesta = await crearSolicitudPublicacion(propiedadId, canales)

    setEnviando(false)

    if (!respuesta.ok) {
      setErrorGeneral(respuesta.mensaje)
      return
    }

    setResultado(respuesta.subjobs)
  }

  function cerrarYReiniciar() {
    setAbierto(false)
    setResultado(null)
    setErrorGeneral(null)
    setCanalesSeleccionados(new Set())
    setCuentaPorCanal({})
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-2 rounded bg-[#38B6FF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2A9FE8]"
      >
        <Rocket size={16} />
        Publicar en redes
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={cerrarYReiniciar}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#2C3E50]">Publicar propiedad</h2>
              <button
                type="button"
                onClick={cerrarYReiniciar}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            {!resultado && (
              <>
                {canalesActivos.length === 0 && (
                  <p className="text-sm text-slate-500">
                    Todavía no hay ningún canal de publicación activo.
                  </p>
                )}

                <div className="space-y-3">
                  {canalesActivos.map((canal) => {
                    const cuentas = cuentasDelCanal(canal)
                    const marcado = canalesSeleccionados.has(canal.codigo)
                    return (
                      <div key={canal.id} className="rounded border border-slate-200 p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-[#2C3E50]">
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => alternarCanal(canal.codigo)}
                            className="h-4 w-4"
                          />
                          {canal.nombre}
                        </label>

                        {marcado && canal.requiere_cuenta_social && (
                          <div className="mt-2 pl-6">
                            {cuentas.filter((c) => c.estado === 'READY').length === 0 ? (
                              <p className="text-xs text-amber-600">
                                {cuentas.length === 0
                                  ? <>No tienes ninguna cuenta de {canal.plataforma} lista. <Link href="/dashboard/cuentas" className="underline">Agrega o conecta una en Mis cuentas</Link>.</>
                                  : 'Tus cuentas están ocupadas con otra publicación. Intenta de nuevo en unos minutos.'}
                              </p>
                            ) : (
                              <select
                                value={cuentaPorCanal[canal.codigo] ?? ''}
                                onChange={(e) =>
                                  setCuentaPorCanal((prev) => ({ ...prev, [canal.codigo]: e.target.value }))
                                }
                                className="w-full rounded border border-slate-200 p-2 text-sm"
                              >
                                <option value="">Selecciona una cuenta…</option>
                                {cuentas.map((cuenta) => (
                                  <option key={cuenta.id} value={cuenta.id} disabled={cuenta.estado !== 'READY'}>
                                    {cuenta.etiqueta ?? cuenta.plataforma} ({cuenta.tipo_cuenta}){cuenta.estado !== 'READY' ? ' — ocupada' : ''}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {errorGeneral && (
                  <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{errorGeneral}</p>
                )}

                <button
                  type="button"
                  onClick={enviar}
                  disabled={!puedeEnviar() || enviando}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-[#38B6FF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2A9FE8] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
                  {enviando ? 'Enviando…' : 'Publicar'}
                </button>
              </>
            )}

            {resultado && (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">Resultado por canal:</p>
                {resultado.map((subjob) => {
                  const etiqueta = etiquetaEstado(subjob.estado)
                  return (
                    <div key={subjob.canal_codigo} className="rounded border border-slate-200 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[#2C3E50]">
                          {canalesActivos.find((c) => c.codigo === subjob.canal_codigo)?.nombre ?? subjob.canal_codigo}
                        </span>
                        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${etiqueta.clase}`}>
                          {etiqueta.icono}
                          {etiqueta.texto}
                        </span>
                      </div>
                      {subjob.mensaje_error && (
                        <p className="mt-1 text-xs text-slate-500">{subjob.mensaje_error}</p>
                      )}
                    </div>
                  )
                })}

                <button
                  type="button"
                  onClick={cerrarYReiniciar}
                  className="mt-3 w-full rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
