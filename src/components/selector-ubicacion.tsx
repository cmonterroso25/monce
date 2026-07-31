'use client'
import { useState, useRef, useEffect } from 'react'

type Ubicacion = { id: string; nombre: string }

export default function SelectorUbicacion({
  opciones,
  defaultValue = '',
}: {
  opciones: Ubicacion[]
  defaultValue?: string
}) {
  const [modoNuevo, setModoNuevo] = useState(false)
  const [ubicacionId, setUbicacionId] = useState(defaultValue)
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(false)
  const contenedorRef = useRef<HTMLDivElement>(null)

  const seleccionada = opciones.find((o) => o.id === ubicacionId)
  const filtradas = opciones.filter((o) =>
    o.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  useEffect(() => {
    function alClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', alClickFuera)
    return () => document.removeEventListener('mousedown', alClickFuera)
  }, [])

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">Ubicación</label>

      <input type="hidden" name="ubicacion_id" value={modoNuevo ? '__nuevo__' : ubicacionId} />

      {!modoNuevo && (
        <div className="relative" ref={contenedorRef}>
          <input
            type="text"
            value={abierto ? busqueda : seleccionada?.nombre ?? ''}
            onChange={(e) => {
              setBusqueda(e.target.value)
              setAbierto(true)
              if (ubicacionId) setUbicacionId('')
            }}
            onFocus={() => {
              setAbierto(true)
              setBusqueda('')
            }}
            placeholder="Buscar condominio, residencial, edificio..."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          {abierto && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
              {filtradas.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setUbicacionId(o.id)
                    setBusqueda('')
                    setAbierto(false)
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  {o.nombre}
                </button>
              ))}
              {filtradas.length === 0 && (
                <p className="px-3 py-2 text-sm text-slate-400">Sin resultados.</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setModoNuevo(true)
                  setAbierto(false)
                }}
                className="block w-full border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-[#38B6FF] hover:bg-slate-50"
              >
                + Agregar nueva ubicación...
              </button>
            </div>
          )}
        </div>
      )}

      {modoNuevo && (
        <div className="space-y-2 rounded border border-gray-200 p-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Nombre</label>
            <input
              type="text"
              name="ubicacion_nombre_nuevo"
              placeholder="(Condominio, Residencial, edificio, colonia, finca, etc)"
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Link de Google Maps</label>
            <input
              type="url"
              name="ubicacion_google_maps_nuevo"
              placeholder="https://maps.app.goo.gl/..."
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Link de Waze</label>
            <input
              type="url"
              name="ubicacion_waze_nuevo"
              placeholder="https://waze.com/ul/..."
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setModoNuevo(false)}
            className="text-xs text-slate-500 hover:text-red-600"
          >
            Cancelar y elegir una existente
          </button>
        </div>
      )}
    </div>
  )
}
