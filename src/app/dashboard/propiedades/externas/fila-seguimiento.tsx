'use client'

import { useState, useTransition } from 'react'
import { ClipboardEdit } from 'lucide-react'
import { actualizarSeguimientoExterna } from './acciones'

type Colega = { id: string; nombre: string }

const ETIQUETAS: Record<string, string> = {
  sin_contactar: 'Sin contactar',
  descartado: 'Descartado',
  nuevo_colega: 'Nuevo colega',
}

const campoBase =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-[#2C3E50] focus:border-[#38B6FF] focus:outline-none focus:ring-1 focus:ring-[#38B6FF]'

export default function FilaSeguimiento({
  propiedadExternaId,
  estadoSeguimientoActual,
  notasActuales,
  colegaIdActual,
  colegas,
  estadosSeguimiento,
}: {
  propiedadExternaId: string
  estadoSeguimientoActual: string
  notasActuales: string | null
  colegaIdActual: string | null
  colegas: Colega[]
  estadosSeguimiento: string[]
}) {
  const [abierto, setAbierto] = useState(false)
  const [estado, setEstado] = useState(estadoSeguimientoActual)
  const [notas, setNotas] = useState(notasActuales ?? '')
  const [colegaId, setColegaId] = useState(colegaIdActual ?? '')
  const [colegaNuevoNombre, setColegaNuevoNombre] = useState('')
  const [colegaNuevoTelefono, setColegaNuevoTelefono] = useState('')
  const [colegaNuevoInmobiliaria, setColegaNuevoInmobiliaria] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function guardar() {
    setError(null)

    if (estado === 'nuevo_colega' && !colegaId) {
      setError('Selecciona un colega o crea uno nuevo.')
      return
    }
    if (estado === 'nuevo_colega' && colegaId === '__nuevo__' && !colegaNuevoNombre.trim()) {
      setError('El nombre del nuevo colega es obligatorio.')
      return
    }

    const formData = new FormData()
    formData.set('id', propiedadExternaId)
    formData.set('estado_seguimiento', estado)
    formData.set('notas_agente', notas)
    formData.set('colega_id', estado === 'nuevo_colega' ? colegaId : '')
    if (colegaId === '__nuevo__') {
      formData.set('colega_nombre_nuevo', colegaNuevoNombre)
      formData.set('colega_telefono_nuevo', colegaNuevoTelefono)
      formData.set('colega_inmobiliaria_nuevo', colegaNuevoInmobiliaria)
    }

    startTransition(async () => {
      const res = await actualizarSeguimientoExterna(formData)
      if (!res.ok) {
        setError(res.mensaje ?? 'No se pudo guardar.')
        return
      }
      setAbierto(false)
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center justify-center rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#38B6FF]"
        title="Gestionar seguimiento"
      >
        <ClipboardEdit size={16} />
      </button>

      {abierto && (
        <div className="absolute right-0 top-9 z-20 w-72 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Estado de seguimiento
          </p>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className={`${campoBase} mb-3`}
          >
            {estadosSeguimiento.map((e) => (
              <option key={e} value={e}>
                {ETIQUETAS[e] ?? e}
              </option>
            ))}
          </select>

          {estado === 'nuevo_colega' && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Colega
              </p>
              <select
                value={colegaId}
                onChange={(e) => setColegaId(e.target.value)}
                className={`${campoBase} mb-3`}
              >
                <option value="">Selecciona…</option>
                {colegas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
                <option value="__nuevo__">+ Nuevo colega</option>
              </select>

              {colegaId === '__nuevo__' && (
                <div className="mb-3 space-y-2">
                  <input
                    type="text"
                    value={colegaNuevoNombre}
                    onChange={(e) => setColegaNuevoNombre(e.target.value)}
                    placeholder="Nombre del colega"
                    className={campoBase}
                  />
                  <input
                    type="text"
                    value={colegaNuevoTelefono}
                    onChange={(e) => setColegaNuevoTelefono(e.target.value)}
                    placeholder="Teléfono (opcional)"
                    className={campoBase}
                  />
                  <input
                    type="text"
                    value={colegaNuevoInmobiliaria}
                    onChange={(e) => setColegaNuevoInmobiliaria(e.target.value)}
                    placeholder="Inmobiliaria (opcional)"
                    className={campoBase}
                  />
                </div>
              )}
            </>
          )}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Notas
          </p>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            placeholder="Notas del contacto con el anunciante…"
            className={`${campoBase} mb-3 resize-none`}
          />

          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

          <button
            type="button"
            onClick={guardar}
            disabled={pending}
            className="w-full rounded-md bg-[#2C3E50] py-2 text-sm font-medium text-white transition-colors hover:bg-[#38B6FF] disabled:opacity-60"
          >
            {pending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  )
}
