import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  Target,
  CalendarCheck,
  Home,
  Clock,
  Trophy,
  Sparkles,
} from 'lucide-react'

const ETAPAS_TERMINADAS = ['ganada', 'perdida']

export default async function Dashboard() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', user?.id)
    .single()

  const ahora = new Date()
  const inicioHoy = new Date(ahora)
  inicioHoy.setHours(0, 0, 0, 0)
  const finHoy = new Date(inicioHoy.getTime() + 24 * 60 * 60 * 1000)
  const en48h = new Date(ahora.getTime() + 48 * 60 * 60 * 1000)
  const en7dias = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000)
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  const inicioSemana = new Date(ahora)
  inicioSemana.setDate(ahora.getDate() - 7)

  const [
    { data: leadsActivos },
    { count: citasHoy },
    { count: citasProximas },
    { count: propiedadesActivas },
    { count: actividadesVencidas },
    { count: actividadesProximas },
    { count: leadsGanadosMes },
    { count: actividadesCompletadasSemana },
  ] = await Promise.all([
    supabase
      .from('leads')
      .select('etapa')
      .not('etapa', 'in', `(${ETAPAS_TERMINADAS.join(',')})`),
    supabase
      .from('actividades')
      .select('id', { count: 'exact', head: true })
      .in('tipo_actividad', ['cita', 'reunion'])
      .is('completada_en', null)
      .gte('programada_en', inicioHoy.toISOString())
      .lt('programada_en', finHoy.toISOString()),
    supabase
      .from('actividades')
      .select('id', { count: 'exact', head: true })
      .in('tipo_actividad', ['cita', 'reunion'])
      .is('completada_en', null)
      .gte('programada_en', finHoy.toISOString())
      .lte('programada_en', en7dias.toISOString()),
    supabase
      .from('propiedades')
      .select('id', { count: 'exact', head: true })
      .eq('captado_por', user?.id)
      .in('estado', ['disponible', 'reservada']),
    supabase
      .from('actividades')
      .select('id', { count: 'exact', head: true })
      .is('completada_en', null)
      .lt('programada_en', ahora.toISOString()),
    supabase
      .from('actividades')
      .select('id', { count: 'exact', head: true })
      .is('completada_en', null)
      .gte('programada_en', ahora.toISOString())
      .lte('programada_en', en48h.toISOString()),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('etapa', 'ganada')
      .gte('actualizado_en', inicioMes.toISOString()),
    supabase
      .from('actividades')
      .select('id', { count: 'exact', head: true })
      .not('completada_en', 'is', null)
      .gte('completada_en', inicioSemana.toISOString()),
  ])

  const totalLeadsActivos = leadsActivos?.length ?? 0
  const leadsPorEtapa = (leadsActivos ?? []).reduce<Record<string, number>>((acc, l) => {
    const clave = l.etapa ?? 'sin_etapa'
    acc[clave] = (acc[clave] ?? 0) + 1
    return acc
  }, {})

  const totalPendientes = (actividadesVencidas ?? 0) + (actividadesProximas ?? 0)
  const primerNombre = perfil?.nombre_completo?.split(' ')[0] ?? ''

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#2C3E50]">
          {primerNombre ? `Hola, ${primerNombre}` : 'Bienvenido de nuevo'}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {(actividadesCompletadasSemana ?? 0) > 0
            ? `Llevas ${actividadesCompletadasSemana} actividades completadas esta semana. Vas muy bien.`
            : 'Este es tu resumen de hoy. A cerrar negocios.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/dashboard/leads"
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-full bg-[#38B6FF]/10 p-2">
              <Target className="h-5 w-5 text-[#38B6FF]" />
            </div>
            <span className="text-3xl font-bold text-[#2C3E50]">{totalLeadsActivos}</span>
          </div>
          <p className="text-sm font-medium text-gray-700">Leads activos</p>
          <p className="mt-1 text-xs text-gray-500">
            {leadsPorEtapa['visita_agendada'] ?? 0} con visita agendada
          </p>
        </Link>

        <Link
          href="/dashboard/calendario"
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-full bg-[#38B6FF]/10 p-2">
              <CalendarCheck className="h-5 w-5 text-[#38B6FF]" />
            </div>
            <span className="text-3xl font-bold text-[#2C3E50]">{citasHoy ?? 0}</span>
          </div>
          <p className="text-sm font-medium text-gray-700">Citas de hoy</p>
          <p className="mt-1 text-xs text-gray-500">
            {citasProximas ?? 0} mas en los proximos 7 dias
          </p>
        </Link>

        <Link
          href="/dashboard/propiedades"
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-full bg-[#38B6FF]/10 p-2">
              <Home className="h-5 w-5 text-[#38B6FF]" />
            </div>
            <span className="text-3xl font-bold text-[#2C3E50]">{propiedadesActivas ?? 0}</span>
          </div>
          <p className="text-sm font-medium text-gray-700">Mis propiedades activas</p>
          <p className="mt-1 text-xs text-gray-500">Disponibles o reservadas</p>
        </Link>

        <Link
          href="/dashboard/actividades"
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-full bg-orange-50 p-2">
              <Clock className="h-5 w-5 text-orange-500" />
            </div>
            <span className="text-3xl font-bold text-[#2C3E50]">{totalPendientes}</span>
          </div>
          <p className="text-sm font-medium text-gray-700">Actividades pendientes</p>
          <p className="mt-1 text-xs text-gray-500">
            {(actividadesVencidas ?? 0) > 0
              ? `${actividadesVencidas} vencidas, dales prioridad`
              : 'Al dia, sin vencidas'}
          </p>
        </Link>

        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-full bg-yellow-50 p-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
            </div>
            <span className="text-3xl font-bold text-[#2C3E50]">{leadsGanadosMes ?? 0}</span>
          </div>
          <p className="text-sm font-medium text-gray-700">Cierres este mes</p>
          <p className="mt-1 text-xs text-gray-500">Leads ganados desde el dia 1</p>
        </div>

        <div className="flex flex-col justify-center rounded-lg border border-dashed border-[#38B6FF] bg-[#38B6FF]/5 p-5">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#38B6FF]" />
            <p className="text-sm font-semibold text-[#2C3E50]">Tip del dia</p>
          </div>
          <p className="text-xs text-gray-600">
            Un lead contactado en la primera hora tiene muchas mas probabilidades de avanzar.
            Revisa tus actividades pendientes antes de que se enfrien.
          </p>
        </div>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-4 text-xs text-gray-400">
        <p>Rol: {perfil?.rol} - {user?.email}</p>
      </div>
    </div>
  )
}
