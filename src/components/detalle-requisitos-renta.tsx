import type { PaqueteRequisitosRenta } from '@/app/dashboard/propiedades/requisitos-renta'

export default function DetalleRequisitosRenta({
  paquete,
  className = '',
}: {
  paquete: PaqueteRequisitosRenta
  className?: string
}) {
  return (
    <div className={`rounded-lg border border-slate-200 p-4 ${className}`}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {paquete.etiqueta}
      </h2>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 font-semibold text-[#2C3E50]">Titular</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            {paquete.titular.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 font-semibold text-[#2C3E50]">Fiador</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            {paquete.fiador.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-6 border-t border-slate-100 pt-3 text-sm text-slate-600">
        <p>
          <span className="font-medium text-[#2C3E50]">Contrato mínimo: </span>
          {paquete.contratoMinimo}
        </p>
        <p>
          <span className="font-medium text-[#2C3E50]">Depósito: </span>
          {paquete.deposito}
        </p>
      </div>
    </div>
  )
}
