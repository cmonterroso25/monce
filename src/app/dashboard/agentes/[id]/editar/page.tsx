import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { actualizarAgente } from '../../acciones'

export default async function EditarAgente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: miPerfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (miPerfil?.rol !== 'administrador') {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No tienes permiso para editar agentes. Solo un administrador puede hacerlo.
        </p>
      </div>
    )
  }

  const { data: agente } = await supabase.from('perfiles').select('*').eq('id', id).single()
  if (!agente) return <div className="p-8">Agente no encontrado.</div>

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <h1 className="mb-6 text-xl font-bold text-[#2C3E50] sm:text-2xl">Editar agente</h1>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <form action={actualizarAgente} className="space-y-4">
        <input type="hidden" name="agente_id" value={agente.id} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nombre completo</label>
          <input
            name="nombre_completo"
            defaultValue={agente.nombre_completo}
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Teléfono</label>
          <input
            name="telefono"
            defaultValue={agente.telefono ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Rol</label>
            <select name="rol" defaultValue={agente.rol} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="agente">Agente</option>
              <option value="administrador">Administrador</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Estado</label>
            <select
              name="activo"
              defaultValue={agente.activo === false ? 'false' : 'true'}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>
        </div>

        <button type="submit" className="w-full rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF] sm:w-auto">
          Guardar cambios
        </button>
      </form>
    </div>
  )
}
