import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { invitarUsuario, crearOrganizacion } from './acciones'

export default async function Configuracion({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; exito?: string }>
}) {
  const { error, exito } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol, organization_id, es_propietario_plataforma')
    .eq('id', user.id)
    .single()

  const esPropietario = miPerfil?.es_propietario_plataforma === true
  const esAdmin = miPerfil?.rol === 'administrador'

  if (!esAdmin && !esPropietario) {
    return (
      <div className="p-8">
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No tienes permiso para acceder a Configuración.
        </p>
      </div>
    )
  }

  const { data: organizaciones } = esPropietario
    ? await supabase.from('organizaciones').select('id, nombre').order('nombre')
    : { data: null }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-[#2C3E50]">Configuración</h1>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {exito === '1' && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          Invitación enviada correctamente.
        </div>
      )}
      {exito === 'org' && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          Organización creada correctamente.
        </div>
      )}

      <div className="mb-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-[#2C3E50]">Invitar usuario</h2>
        <form action={invitarUsuario} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nombre completo</label>
            <input
              name="nombre_completo"
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Correo</label>
            <input
              type="email"
              name="correo"
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          {esPropietario && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Organización</label>
              <select
                name="organization_id"
                required
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                {(organizaciones ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="text-xs text-slate-400">
            El usuario se crea con rol &quot;agente&quot;. Para hacerlo administrador, edítalo
            después desde Agentes.
          </p>
          <button
            type="submit"
            className="rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF]"
          >
            Enviar invitación
          </button>
        </form>
      </div>

      {esPropietario && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-[#2C3E50]">Crear nueva organización</h2>
          <form action={crearOrganizacion} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Nombre de la inmobiliaria
              </label>
              <input
                name="nombre"
                required
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF]"
            >
              Crear organización
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
