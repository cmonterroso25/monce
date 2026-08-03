import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import CalendarioMensual from './calendario-mensual'
import TablaCitas from './tabla-citas'
import { inicioDeMesGT, finDeMesGT } from '@/lib/fecha-gt'
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export default async function Calendario({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; anio?: string }>
}) {
  const params = await searchParams
  const ahora = new Date()
  const mes = params.mes ? parseInt(params.mes, 10) : ahora.getMonth() + 1
  const anio = params.anio ? parseInt(params.anio, 10) : ahora.getFullYear()
  const supabase = await createClient()
  const inicioMes = inicioDeMesGT(anio, mes)
  const finMes = finDeMesGT(anio, mes)
  const { data: citasMes } = await supabase
    .from('actividades')
    .select('id, programada_en, contacto:contactos(nombre_completo)')
    .in('tipo_actividad', ['cita', 'reunion'])
    .gte('programada_en', inicioMes.toISOString())
    .lt('programada_en', finMes.toISOString())
    .order('programada_en', { ascending: true })
  const limiteProximas = new Date()
  limiteProximas.setDate(limiteProximas.getDate() + 14)
  const { data: proximasCitas } = await supabase
    .from('actividades')
    .select(
      'id, notas, programada_en, completada_en, lead_id, agente_id, contacto:contactos(nombre_completo, telefono), lead:leads(id, propiedad:propiedades(titulo)), agente:perfiles(nombre_completo)'
    )
    .in('tipo_actividad', ['cita', 'reunion'])
    .is('completada_en', null)
    .gte('programada_en', new Date().toISOString())
    .lte('programada_en', limiteProximas.toISOString())
    .order('programada_en', { ascending: true })
    .limit(100)
  let mesAnterior = mes - 1
  let anioAnterior = anio
  if (mesAnterior < 1) {
    mesAnterior = 12
    anioAnterior -= 1
  }
  let mesSiguiente = mes + 1
  let anioSiguiente = anio
  if (mesSiguiente > 12) {
    mesSiguiente = 1
    anioSiguiente += 1
  }
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#2C3E50] sm:text-2xl">Calendario de citas</h1>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/dashboard/calendario?mes=${mesAnterior}&anio=${anioAnterior}`} className="flex items-center gap-1 rounded p-2 text-slate-500 hover:bg-slate-100">
          <ChevronLeft size={20} />
        </Link>
        <h2 className="text-base font-semibold text-[#2C3E50] sm:text-lg">
          {MESES[mes - 1]} {anio}
        </h2>
        <Link href={`/dashboard/calendario?mes=${mesSiguiente}&anio=${anioSiguiente}`} className="flex items-center gap-1 rounded p-2 text-slate-500 hover:bg-slate-100">
          <ChevronRight size={20} />
        </Link>
      </div>
      <CalendarioMensual mes={mes} anio={anio} citas={(citasMes ?? []) as any} />
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Próximas citas</h2>
        <TablaCitas citas={(proximasCitas ?? []) as any} />
      </div>
    </div>
  )
}
