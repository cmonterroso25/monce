'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'

type Opcion = { id: string; nombre: string }

const campoBase =
  'h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-[#2C3E50] transition-colors focus:border-[#38B6FF] focus:outline-none focus:ring-1 focus:ring-[#38B6FF]'

export default function FiltrosPropiedades({
  estados,
  tipos,
  municipios,
  colegas,
  agentes,
  modalidades,
}: {
  estados: string[]
  tipos: string[]
  municipios: Opcion[]
  colegas: Opcion[]
  agentes: Opcion[]
  modalidades: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const panelRef = useRef<HTMLDivElement>(null)

  const [precioMin, setPrecioMin] = useState(searchParams.get('precio_min') || '')
  const [precioMax, setPrecioMax] = useState(searchParams.get('precio_max') || '')
  const [m2Min, setM2Min] = useState(searchParams.get('m2_min') || '')
  const [m2Max, setM2Max] = useState(searchParams.get('m2_max') || '')
  const [panelAbierto, setPanelAbierto] = useState(false)

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelAbierto(false)
      }
    }
    document.addEventListener('mousedown', alHacerClicFuera)
    return () => document.removeEventListener('mousedown', alHacerClicFuera)
  }, [])

  function actualizarFiltro(clave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (valor) {
      params.set(clave, valor)
    } else {
      params.delete(clave)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  function aplicarRangos() {
    const params = new URLSearchParams(searchParams.toString())
    const valores: Record<string, string> = {
      precio_min: precioMin,
      precio_max: precioMax,
      m2_min: m2Min,
      m2_max: m2Max,
    }
    for (const [clave, valor] of Object.entries(valores)) {
      if (valor) {
        params.set(clave, valor)
      } else {
        params.delete(clave)
      }
    }
    router.push(`${pathname}?${params.toString()}`)
    setPanelAbierto(false)
  }

  const rangosActivos =
    !!searchParams.get('precio_min') ||
    !!searchParams.get('precio_max') ||
    !!searchParams.get('m2_min') ||
    !!searchParams.get('m2_max')

  const totalFiltrosActivos = [
    searchParams.get('estado'),
    searchParams.get('tipo'),
    searchParams.get('municipio_id'),
    searchParams.get('colega_id'),
    searchParams.get('captado_por'),
    searchParams.get('modalidad_captacion'),
    searchParams.get('precio_min'),
    searchParams.get('precio_max'),
    searchParams.get('m2_min'),
    searchParams.get('m2_max'),
  ].filter(Boolean).length

  function limpiarFiltros() {
    setPrecioMin('')
    setPrecioMax('')
    setM2Min('')
    setM2Max('')
    setPanelAbierto(false)
    router.push(pathname)
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Selects rápidos */}
        <select
          defaultValue={searchParams.get('estado') || ''}
          onChange={(e) => actualizarFiltro('estado', e.target.value)}
          className={`${campoBase} pr-7`}
        >
          <option value="">Estado</option>
          {estados.map((estado) => (
            <option key={estado} value={estado}>
              {estado.charAt(0).toUpperCase() + estado.slice(1)}
            </option>
          ))}
        </select>

        <select
          defaultValue={searchParams.get('tipo') || ''}
          onChange={(e) => actualizarFiltro('tipo', e.target.value)}
          className={`${campoBase} pr-7`}
        >
          <option value="">Tipo</option>
          {tipos.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo}
            </option>
          ))}
        </select>

        <select
          defaultValue={searchParams.get('municipio_id') || ''}
          onChange={(e) => actualizarFiltro('municipio_id', e.target.value)}
          className={`${campoBase} pr-7`}
        >
          <option value="">Municipio</option>
          {municipios.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>

        <select
          defaultValue={searchParams.get('modalidad_captacion') || ''}
          onChange={(e) => actualizarFiltro('modalidad_captacion', e.target.value)}
          className={`${campoBase} pr-7`}
        >
          <option value="">Modalidad</option>
          {modalidades.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          defaultValue={searchParams.get('captado_por') || ''}
          onChange={(e) => actualizarFiltro('captado_por', e.target.value)}
          className={`${campoBase} pr-7`}
        >
          <option value="">Captado por</option>
          {agentes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>

        <select
          defaultValue={searchParams.get('colega_id') || ''}
          onChange={(e) => actualizarFiltro('colega_id', e.target.value)}
          className={`${campoBase} pr-7`}
        >
          <option value="">Colega</option>
          {colegas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>

        <div className="mx-1 h-6 w-px bg-slate-200" />

        {/* Panel de rangos (precio / m2) */}
        <div className="relative" ref={panelRef}>
          <button
            type="button"
            onClick={() => setPanelAbierto((v) => !v)}
            className={`flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors ${
              rangosActivos
                ? 'border-[#38B6FF] bg-[#38B6FF]/10 text-[#2C3E50]'
                : 'border-slate-300 text-slate-600 hover:border-slate-400'
            }`}
          >
            <SlidersHorizontal size={14} />
            Precio y m²
          </button>

          {panelAbierto && (
            <div className="absolute left-0 top-11 z-10 w-72 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Precio
              </p>
              <div className="mb-4 flex items-center gap-2">
                <input
                  type="number"
                  value={precioMin}
                  onChange={(e) => setPrecioMin(e.target.value)}
                  placeholder="Mín."
                  className={`${campoBase} w-full`}
                />
                <span className="text-slate-400">–</span>
                <input
                  type="number"
                  value={precioMax}
                  onChange={(e) => setPrecioMax(e.target.value)}
                  placeholder="Máx."
                  className={`${campoBase} w-full`}
                />
              </div>

              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Área (m²)
              </p>
              <div className="mb-4 flex items-center gap-2">
                <input
                  type="number"
                  value={m2Min}
                  onChange={(e) => setM2Min(e.target.value)}
                  placeholder="Mín."
                  className={`${campoBase} w-full`}
                />
                <span className="text-slate-400">–</span>
                <input
                  type="number"
                  value={m2Max}
                  onChange={(e) => setM2Max(e.target.value)}
                  placeholder="Máx."
                  className={`${campoBase} w-full`}
                />
              </div>

              <button
                type="button"
                onClick={aplicarRangos}
                className="w-full rounded-md bg-[#2C3E50] py-2 text-sm font-medium text-white transition-colors hover:bg-[#38B6FF]"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>

        {/* Filtros activos / limpiar */}
        {totalFiltrosActivos > 0 && (
          <button
            type="button"
            onClick={limpiarFiltros}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-50 hover:text-[#38B6FF]"
          >
            <X size={14} />
            Limpiar filtros ({totalFiltrosActivos})
          </button>
        )}
      </div>
    </div>
  )
}
