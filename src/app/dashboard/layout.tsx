import { createClient } from '@/lib/supabase/server'
import Sidebar from './sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre_completo, rol')
    .eq('id', user?.id)
    .single()
  const inicioHoy = new Date()
  inicioHoy.setHours(0, 0, 0, 0)
  const finHoy = new Date(inicioHoy.getTime() + 24 * 60 * 60 * 1000)
  const { count: citasHoy } = await supabase
    .from('actividades')
    .select('id', { count: 'exact', head: true })
    .in('tipo_actividad', ['cita', 'reunion'])
    .is('completada_en', null)
    .gte('programada_en', inicioHoy.toISOString())
    .lt('programada_en', finHoy.toISOString())
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        nombreCompleto={perfil?.nombre_completo ?? null}
        rol={perfil?.rol ?? null}
        email={user?.email ?? null}
        citasHoy={citasHoy ?? 0}
      />
      <main className="min-w-0 flex-1 overflow-y-auto bg-gray-50">{children}</main>
    </div>
  )
}
