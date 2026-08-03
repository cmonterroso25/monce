import Link from 'next/link'
import { Phone, ArrowUpRight, Pencil } from 'lucide-react'
import MarcarCompletada from '../actividades/marcar-completada'
import { colorParaAgente } from '@/lib/ui/color-agente'
type Cita = {
  id: string
  notas: string | null
  programada_en: string
  completada_en: string | null
  lead_id: string | null
  agente_id: string | null
  contacto: { nombre_completo: string; telefono: string | null } | null
  lead: { id: string; propiedad: { titulo: string } | null } | null
  agente: { nombre_completo: string } | null
}
const GRID_COLS = 'grid-cols-[140px_1.6fr_1.4fr_1.2fr_130px]'
export default function TablaCitas({ citas }: { citas: Cita[] }) {
  if (!citas || citas.length === 0) {
    return <p className="mt-6 text-sm text-slate-500">No hay citas próximas programadas.</p>
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="min-w-[820px]">
        <div
          className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500`}
        >
          <div>Fecha / hora</div>
          <div>Contacto</div>
          <div>Propiedad / Lead</div>
          <div>Agente</div>
          <div className="text-right">Acción</div>
        </div>
        {citas.map((cita) => {
          const fecha = new Date(cita.programada_en)
          const color = colorParaAgente(cita.agente_id)
          return (
            <div
              key={cita.id}
              className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-100 px-3 py-2 transition hover:bg-slate-50 last:border-b-0`}
            >
              <div>
                <p className="text-sm font-semibold text-[#2C3E50]">
                  {fecha.toLocaleDateString('es-GT', { day: 'numeric', month: 'short', timeZone: 'America/Guatemala' })}
                </p>
                <p className="text-xs text-slate-500">
                  {fecha.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guatemala' })}
                </p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#2C3E50]">
                  {cita.contacto?.nombre_completo ?? 'Sin contacto'}
                </p>
                {cita.contacto?.telefono && (
                  <p className="flex items-center gap-1 truncate text-xs text-slate-400">
                    <Phone size={11} /> {cita.contacto.telefono}
                  </p>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-600">{cita.lead?.propiedad?.titulo ?? '—'}</p>
                {cita.lead_id && (
                  <Link href={`/dashboard/leads/${cita.lead_id}`} className="inline-flex items-center gap-1 text-xs text-[#38B6FF] hover:underline">
                    Ver lead <ArrowUpRight size={10} />
                  </Link>
                )}
              </div>
              <div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} />
                  {cita.agente?.nombre_completo ?? '—'}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Link
                  href={`/dashboard/actividades/${cita.id}/editar`}
                  className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#38B6FF]"
                  title="Editar cita"
                >
                  <Pencil size={14} />
                </Link>
                <MarcarCompletada actividadId={cita.id} leadId={cita.lead_id} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
