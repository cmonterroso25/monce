import { createClient } from '@/lib/supabase/server'
import { cerrarSesion } from './acciones'

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

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bienvenido, {perfil?.nombre_completo}</h1>
        <form action={cerrarSesion}>
          <button className="rounded bg-gray-200 px-4 py-2 text-sm hover:bg-gray-300">
            Cerrar sesión
          </button>
        </form>
      </div>
      <p className="text-sm text-gray-600">Rol: {perfil?.rol}</p>
      <p className="text-sm text-gray-600">Correo: {user?.email}</p>
    </div>
  )
}
