'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'

const campoBase =
  'h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-[#2C3E50] transition-colors focus:border-[#38B6FF] focus:outline-none focus:ring-1 focus:ring-[#38B6FF]'

const ETIQUETAS_TIPO_OPERACION: Record<string, string> = {
  venta: 'Venta',
  renta: 'Renta',
}

const ETIQUETAS_ESTADO_PUBLICACION: Record<string, string> = {
  activo: 'Activo',
  posible_baja: 'Posible baja',
  eliminado: 'Eliminado',
}

const ETIQUETAS_ESTADO_SEGUIMIENTO: Record<string, string> = {
  sin_contactar: 'Sin contactar',
  descartado: 'Descartado',
  nuevo_colega: 'Nuevo colega',
}

export default function FiltrosExternas({
  fuentes,
  tiposOperacion,
  tiposPropiedad,
  estadosPublicacion,
  estadosSeguimiento,
}: {
  fuentes: string[]
  tiposOperacion: string[]
  tiposPropiedad: string[]
  estadosPublicacion: string[]
  estadosSeguimiento: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function actualizarFiltro(clave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (valor) {
      params.set(clave, valor)
    } else {
      params.delete(clave)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const totalFiltrosActivos = [
    searchParams.get('fuente_portal'),
    searchParams.get('tipo_operacion'),
    searchParams.get('tipo_propiedad'),
    searchParams.get('estado_publicacion'),
    searchParams.get('estado_seguimiento'),
    searchParams.get('zona'),
  ].filter(Boolean).length

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <select
          defaultValue={searchParams.get('tipo_operacion') || ''}
          onChange={(e) => actualizarFiltro('tipo_operacion', e.target.value)}
          className={`${campoBase} pr-7`}
        >
          <option value="">Renta / Venta</option>
          {tiposOperacion.map((op) => (
            <option key={op} value={op}>
              {ETIQUETAS_TIPO_OPERACION[op] ?? op}
            </option>
          ))}
        </select>

        <select
          defaultValue={searchParams.get('tipo_propiedad') || ''}
          onChange={(e) => actualizarFiltro('tipo_propiedad', e.target.value)}
          className={`${campoBase} pr-7`}
        >
          <option value="">Tipo</option>
          {tiposPropiedad.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo}
            </option>
          ))}
        </select>

        <select
          defaultValue={searchParams.get('fuente_portal') || ''}
          onChange={(e) => actualizarFiltro('fuente_portal', e.target.value)}
          className={`${campoBase} pr-7`}
        >
          <option value="">Portal</option>
          {fuentes.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <select
          defaultValue={searchParams.get('estado_publicacion') || ''}
          onChange={(e) => actualizarFiltro('estado_publicacion', e.target.value)}
          className={`${campoBase} pr-7`}
        >
          <option value="">Estado publicación</option>
          {estadosPublicacion.map((e) => (
            <option key={e} value={e}>
              {ETIQUETAS_ESTADO_PUBLICACION[e] ?? e}
            </option>
          ))}
        </select>

        <select
          defaultValue={searchParams.get('estado_seguimiento') || ''}
          onChange={(e) => actualizarFiltro('estado_seguimiento', e.target.value)}
          className={`${campoBase} pr-7`}
        >
          <option value="">Seguimiento</option>
          {estadosSeguimiento.map((e) => (
            <option key={e} value={e}>
              {ETIQUETAS_ESTADO_SEGUIMIENTO[e] ?? e}
            </option>
          ))}
        </select>

        <input
          type="text"
          defaultValue={searchParams.get('zona') || ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') actualizarFiltro('zona', (e.target as HTMLInputElement).value)
          }}
          onBlur={(e) => actualizarFiltro('zona', e.target.value)}
          placeholder="Zona / municipio…"
          className={`${campoBase} col-span-2 w-full sm:w-48`}
        />

        {totalFiltrosActivos > 0 && (
          <button
            type="button"
            onClick={() => router.push(pathname)}
            className="col-span-2 ml-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-50 hover:text-[#38B6FF] sm:col-auto"
          >
            <X size={14} />
            Limpiar filtros ({totalFiltrosActivos})
          </button>
        )}
      </div>
    </div>
  )
}
