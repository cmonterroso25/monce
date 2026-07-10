import Link from 'next/link'
import { ETIQUETAS_ETAPA, COLORES_ETAPA } from './constantes'

type Lead = {
  id: string
  etapa: string
  valor_negocio: number | null
  probabilidad: number | null
  contacto: { nombre_completo: string; telefono: string | null } | null
  propiedad: { titulo: string } | null
  agente: { nombre_completo: string } | null
}

const GRID_COLS = 'grid-cols-[1.6fr_1.6fr_1fr_1fr_100px_140px]'

export default function TablaLeads({ leads }: { leads: Lead[] }) {
  if (!leads || leads.length === 0) {
    return <p className="mt-6 text-sm text-slate-500">No se encontraron leads con esos filtros.</p>
  }

  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="min-w-[900px]">
        <div
          className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500`}
        >
          <div>Contacto</div>
          <div>Propiedad</div>
          <div>Agente</div>
          <div className="text-right">Valor negocio</div>
          <div className="text-center">Prob.</div>
          <div>Etapa</div>
        </div>

        {leads.map((lead) => (
          <Link
            key={lead.id}
            href={`/dashboard/leads/${lead.id}`}
            className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-100 px-3 py-2 transition hover:bg-slate-50 last:border-b-0`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#2C3E50]">{lead.contacto?.nombre_completo ?? '—'}</p>
              {lead.contacto?.telefono && <p className="truncate text-xs text-slate-400">{lead.contacto.telefono}</p>}
            </div>
            <div className="truncate text-sm text-slate-600">{lead.propiedad?.titulo ?? '—'}</div>
            <div className="truncate text-sm text-slate-600">{lead.agente?.nombre_completo ?? '—'}</div>
            <div className="text-right text-sm font-medium text-slate-700">
              {lead.valor_negocio ? `Q${Number(lead.valor_negocio).toLocaleString()}` : '—'}
            </div>
            <div className="text-center text-sm text-slate-600">{lead.probabilidad ? `${lead.probabilidad}%` : '—'}</div>
            <div>
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${COLORES_ETAPA[lead.etapa] || 'bg-slate-100 text-slate-700'}`}>
                {ETIQUETAS_ETAPA[lead.etapa] ?? lead.etapa}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
