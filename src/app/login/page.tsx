import { iniciarSesion } from './acciones'

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Iniciar sesión</h1>

        {params.error && (
          <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">
            {params.error}
          </p>
        )}

        <form action={iniciarSesion} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Correo
            </label>
            <input
              type="email"
              name="correo"
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <input
              type="password"
              name="contrasena"
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Entrar
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          ¿No tienes cuenta?{' '}
          <a href="/registro" className="font-medium text-gray-900 underline">
            Regístrate
          </a>
        </p>
      </div>
    </div>
  )
}
