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

  return (
    <div className="flex min-h-screen">
      <Sidebar
        nombreCompleto={perfil?.nombre_completo ?? null}
        rol={perfil?.rol ?? null}
        email={user?.email ?? null}
      />
      <main className="flex-1 overflow-y-auto bg-gray-50">{children}</main>
    </div>
  )
}
