import Link from 'next/link'

type Cita = {
  id: string
  programada_en: string
  contacto: { nombre_completo: string } | null
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export default function CalendarioMensual({ mes, anio, citas }: { mes: number; anio: number; citas: Cita[] }) {
  const primerDia = new Date(anio, mes - 1, 1)
  const diasEnMes = new Date(anio, mes, 0).getDate()
  const offsetInicio = (primerDia.getDay() + 6) % 7 // lunes = 0

  const citasPorDia: Record<number, Cita[]> = {}
  citas.forEach((c) => {
    const fecha = new Date(c.programada_en)
    const dia = fecha.getDate()
    if (!citasPorDia[dia]) citasPorDia[dia] = []
    citasPorDia[dia].push(c)
  })

  const celdas: (number | null)[] = [
    ...Array(offsetInicio).fill(null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ]
  while (celdas.length % 7 !== 0) celdas.push(null)

  const hoy = new Date()
  const esHoy = (dia: number) =>
    hoy.getDate() === dia && hoy.getMonth() + 1 === mes && hoy.getFullYear() === anio

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {DIAS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {celdas.map((dia, i) => (
            <div
              key={i}
              className={`min-h-[90px] border-b border-r border-slate-100 p-1.5 ${dia === null ? 'bg-slate-50/50' : ''}`}
            >
              {dia !== null && (
                <>
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      esHoy(dia) ? 'bg-[#38B6FF] font-semibold text-white' : 'text-slate-500'
                    }`}
                  >
                    {dia}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {(citasPorDia[dia] ?? []).slice(0, 3).map((c) => (
                      <Link
                        key={c.id}
                        href={`/dashboard/actividades/${c.id}/editar`}
                        className="block truncate rounded bg-[#38B6FF]/10 px-1 py-0.5 text-[10px] text-[#2C3E50] hover:bg-[#38B6FF]/20"
                        title={`${c.contacto?.nombre_completo ?? ''} — clic para editar`}
                      >
                        {new Date(c.programada_en).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}{' '}
                        {c.contacto?.nombre_completo ?? ''}
                      </Link>
                    ))}
                    {(citasPorDia[dia]?.length ?? 0) > 3 && (
                      <p className="text-[10px] text-slate-400">+{citasPorDia[dia]!.length - 3} más</p>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
