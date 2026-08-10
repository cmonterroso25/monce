'use client'
import { useState, useRef, useEffect } from 'react'

type Ubicacion = {
  id: string
  nombre: string
  google_maps_url?: string | null
  waze_url?: string | null
}

export default function SelectorUbicacion({
  opciones,
  defaultValue = '',
  puedeEditar = false,
}: {
  opciones: Ubicacion[]
  defaultValue?: string
  puedeEditar?: boolean
}) {
  const [modoNuevo, setModoNuevo] = useState(false)
  const [modoEditar, setModoEditar] = useState(false)
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

  // Al cambiar la ubicación seleccionada se cierra cualquier edición
  // abierta, para no enviar por error datos editados de una ubicación
  // distinta a la que quedó finalmente seleccionada.
  useEffect(() => {
    setModoEditar(false)
  }, [ubicacionId])

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">Ubicación</label>

      <input type="hidden" name="ubicacion_id" value={modoNuevo ? '__nuevo__' : ubicacionId} />
      <input type="hidden" name="ubicacion_modo" value={modoEditar ? 'editar' : ''} />

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

          {puedeEditar && seleccionada && !modoEditar && (
            <button
              type="button"
              onClick={() => setModoEditar(true)}
              className="mt-1 text-xs font-medium text-[#38B6FF] hover:underline"
            >
              Editar esta ubicación
            </button>
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

      {modoEditar && seleccionada && (
        <div className="mt-2 space-y-2 rounded border border-amber-200 bg-amber-50/40 p-3">
          <p className="text-xs font-medium text-amber-700">
            Editando &quot;{seleccionada.nombre}&quot; — afecta a todas las propiedades que usan esta ubicación.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Nombre</label>
            <input
              type="text"
              name="ubicacion_nombre_nuevo"
              defaultValue={seleccionada.nombre}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Link de Google Maps</label>
            <input
              type="url"
              name="ubicacion_google_maps_nuevo"
              defaultValue={seleccionada.google_maps_url ?? ''}
              placeholder="https://maps.app.goo.gl/..."
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Link de Waze</label>
            <input
              type="url"
              name="ubicacion_waze_nuevo"
              defaultValue={seleccionada.waze_url ?? ''}
              placeholder="https://waze.com/ul/..."
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setModoEditar(false)}
            className="text-xs text-slate-500 hover:text-red-600"
          >
            Cancelar edición
          </button>
        </div>
      )}
    </div>
  )
}
