import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { establecerContrasena } from './acciones'

export default async function EstablecerContrasena({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8">
      <h1 className="mb-2 text-2xl font-bold text-[#2C3E50]">Bienvenido a Monce Inmobiliaria</h1>
      <p className="mb-6 text-sm text-slate-500">
        Antes de continuar, define tu contraseña para poder iniciar sesión en el futuro.
      </p>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form action={establecerContrasena} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Contraseña</label>
          <input
            type="password"
            name="contrasena"
            required
            minLength={6}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Confirmar contraseña</label>
          <input
            type="password"
            name="confirmar_contrasena"
            required
            minLength={6}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF]"
        >
          Guardar y continuar
        </button>
      </form>
    </div>
  )
}
