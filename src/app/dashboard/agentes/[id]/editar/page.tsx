import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { actualizarAgente, reasignarOrganizacionAgente } from '../../acciones'
import { supabaseAdmin } from '@/lib/supabase/admin'
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
  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol, es_propietario_plataforma')
    .eq('id', user.id)
    .single()
  // Mismo fix que en acciones.ts: el propietario de plataforma debe poder
  // entrar a editar agentes de cualquier organización aunque su propio
  // rol de perfil no sea literalmente 'administrador'.
  const puedeAcceder = miPerfil?.rol === 'administrador' || miPerfil?.es_propietario_plataforma === true
  if (!puedeAcceder) {
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
  const { data: usuarioAuth } = await supabaseAdmin.auth.admin.getUserById(id)
  const correoActual = usuarioAuth?.user?.email ?? ''
  const esPropietario = miPerfil?.es_propietario_plataforma === true
  const organizaciones = esPropietario
    ? (
        await supabase
          .from('organizaciones')
          .select('id, nombre')
          .is('eliminada_en', null)
          .order('nombre')
      ).data
    : null
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
          <label className="mb-1 block text-sm font-medium text-gray-700">Correo</label>
          <input
            name="correo"
            type="email"
            defaultValue={correoActual}
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
      {esPropietario && organizaciones && organizaciones.length > 0 && (
        <div className="mt-8 border-t border-gray-200 pt-6">
          <h2 className="mb-3 text-sm font-semibold text-[#2C3E50]">Reasignar organización</h2>
          <form action={reasignarOrganizacionAgente} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="agente_id" value={agente.id} />
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Organización</label>
              <select
                name="organization_id"
                defaultValue={agente.organization_id}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                {organizaciones.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.nombre}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF]"
            >
              Reasignar
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
