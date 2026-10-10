'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { ocultarPropiedad } from './acciones'

export default function BotonOcultar({ propiedadId }: { propiedadId: string }) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const manejarOcultar = async () => {
    if (!confirm('¿Ocultar esta propiedad en Mis Publicaciones? Podrás verla nuevamente desde el panel de propiedades.')) {
      return
    }

    setCargando(true)
    setError('')

    try {
      const resultado = await ocultarPropiedad(propiedadId)
      if (!resultado.ok) {
        setError(resultado.mensaje || 'Error al ocultar la propiedad')
      }
    } catch (err) {
      setError('Error al ocultar la propiedad')
      console.error(err)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div>
      <button
        onClick={manejarOcultar}
        disabled={cargando}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
        title="Ocultar de Mis Publicaciones"
      >
        <Eye size={14} />
        {cargando ? 'Ocultando...' : 'Ocultar'}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
