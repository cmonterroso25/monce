'use client'
import { useState, useTransition } from 'react'
import { Eye } from 'lucide-react'
import { obtenerAnaliticaVistas, type AnaliticaVistas } from './acciones'

type Preset = '7' | '30' | '90' | 'todo'

function rangoDesdePreset(preset: Preset): { desde: string; hasta: string } {
  const hasta = new Date()
  hasta.setHours(23, 59, 59, 999)
  if (preset === 'todo') {
    // Fecha muy anterior a la existencia del sistema, para cubrir "todo".
    return { desde: new Date('2020-01-01').toISOString(), hasta: hasta.toISOString() }
  }
  const dias = Number(preset)
  const desde = new Date()
  desde.setDate(desde.getDate() - dias)
  desde.setHours(0, 0, 0, 0)
  return { desde: desde.toISOString(), hasta: hasta.toISOString() }
}

export default function AnaliticaPropiedad({
  propiedadId,
  datosIniciales,
}: {
  propiedadId: string
  datosIniciales: AnaliticaVistas
}) {
  const [preset, setPreset] = useState<Preset>('30')
  const [datos, setDatos] = useState<AnaliticaVistas>(datosIniciales)
  const [isPending, startTransition] = useTransition()

  function cambiarPreset(nuevo: Preset) {
    setPreset(nuevo)
    const { desde, hasta } = rangoDesdePreset(nuevo)
    startTransition(async () => {
      const resultado = await obtenerAnaliticaVistas(propiedadId, desde, hasta)
      setDatos(resultado)
    })
  }

  return (
    <div className="mt-4 border-t border-amber-200 pt-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Eye size={14} />
          Visitas al portal público
        </h3>
        <select
          value={preset}
          onChange={(e) => cambiarPreset(e.target.value as Preset)}
          disabled={isPending}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 focus:border-[#38B6FF] focus:outline-none disabled:opacity-50"
        >
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="90">Últimos 90 días</option>
          <option value="todo">Todo el tiempo</option>
        </select>
      </div>

      <div className={isPending ? 'opacity-50 transition-opacity' : undefined}>
        <div className="mb-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-2xl font-bold text-[#2C3E50]">{datos.total}</p>
          <p className="text-xs text-slate-500">Visitas totales en el rango seleccionado</p>
        </div>

        {datos.porAgente.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase text-slate-400">
                  <th className="px-3 py-2 font-medium">Agente</th>
                  <th className="px-3 py-2 text-right font-medium">Visitas</th>
                </tr>
              </thead>
              <tbody>
                {datos.porAgente.map((fila) => (
                  <tr key={fila.agenteId ?? 'sin-atribuir'} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2 text-slate-700">{fila.nombre}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-700">{fila.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Sin visitas registradas en este rango.</p>
        )}
      </div>
    </div>
  )
}
