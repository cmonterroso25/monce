import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TarjetaCita from './tarjeta-cita'
import { ETIQUETAS_ACTIVIDAD } from '../leads/constantes'

type Actividad = {
  id: string
  tipo_actividad: string
  notas: string | null
  programada_en: string | null
  completada_en: string | null
  creado_en: string
  lead_id: string | null
  contacto: { nombre_completo: string; telefono: string | null } | null
  lead: { id: string; etapa: string } | null
  agente: { id: string; nombre_completo: string } | null
  comentarios_actividad: { id: string; contenido: string; creado_por: { nombre_completo: string } | null; creado_en: string }[] | null
}

const COLORES_ESTADO_ACTIVIDAD: Record<string, string> = {
  vencida: 'bg-red-100 text-red-700',
  hoy: 'bg-blue-100 text-blue-700',
  proxima: 'bg-slate-100 text-slate-700',
  sin_fecha: 'bg-slate-100 text-slate-500',
  completada: 'bg-green-100 text-green-700',
}

const ETIQUETAS_ESTADO_ACTIVIDAD: Record<string, string> = {
  vencida: 'Vencida',
  hoy: 'Hoy',
  proxima: 'Próxima',
  sin_fecha: 'Sin fecha',
  completada: 'Completada',
}

function calcularEstado(a: Actividad, inicioHoy: Date, finHoy: Date): string {
  if (a.completada_en) return 'completada'
  if (!a.programada_en) return 'sin_fecha'
  const fecha = new Date(a.programada_en)
  if (fecha < inicioHoy) return 'vencida'
  if (fecha < finHoy) return 'hoy'
  return 'proxima'
}

export default async function PaginaSeguimientos() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle()
  const esAdmin = miPerfil?.rol === 'administrador'

  if (!esAdmin) redirect('/dashboard')

  const ahora = new Date()
  const hace7Dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000)

  const { data: actividadesData, error: errorActividades } = await supabase
    .from('actividades')
    .select(
      '*, contacto:contactos(nombre_completo, telefono), lead:leads(id, etapa), agente:perfiles!actividades_agente_id_fkey(id, nombre_completo), comentarios_actividad(id, contenido, creado_en, creado_por:perfiles(nombre_completo))'
    )
    .not('programada_en', 'is', null)
    .gte('programada_en', hace7Dias.toISOString())
    .order('programada_en', { ascending: true })

  if (errorActividades) {
    console.error('--- ERROR AL CARGAR ACTIVIDADES ---', errorActividades)
  }

  const actividades = (actividadesData ?? []) as unknown as Actividad[]

  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  const finHoy = new Date(inicioHoy.getTime() + 24 * 60 * 60 * 1000)

  const filasConEstado = actividades.map((a) => ({
    ...a,
    estadoCalculado: calcularEstado(a, inicioHoy, finHoy),
  }))

  const ordenEstado: Record<string, number> = {
    vencida: 0,
    hoy: 1,
    proxima: 2,
    sin_fecha: 3,
    completada: 4,
  }

  filasConEstado.sort((a, b) => {
    const ordenDiff = ordenEstado[a.estadoCalculado] - ordenEstado[b.estadoCalculado]
    if (ordenDiff !== 0) return ordenDiff
    const fechaA = a.programada_en ?? a.creado_en
    const fechaB = b.programada_en ?? b.creado_en
    return fechaA.localeCompare(fechaB)
  })

  const totalPendientes = filasConEstado.filter((a) => a.estadoCalculado !== 'completada').length

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#2C3E50] sm:text-2xl">Seguimientos de citas</h1>
        <p className="text-sm text-slate-500">
          {totalPendientes === 0
            ? 'No hay citas pendientes.'
            : `${totalPendientes} cita(s) pendiente(s).`}
        </p>
      </div>

      {filasConEstado.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">
          Aún no hay citas registradas.
        </p>
      )}

      {filasConEstado.length > 0 && (
        <div className="space-y-3">
          {filasConEstado.map((a) => (
            <TarjetaCita
              key={a.id}
              actividad={a}
              estado={a.estadoCalculado}
              colores={COLORES_ESTADO_ACTIVIDAD}
              etiquetas={ETIQUETAS_ESTADO_ACTIVIDAD}
              etiquetasActividad={ETIQUETAS_ACTIVIDAD}
            />
          ))}
        </div>
      )}
    </div>
  )
}
