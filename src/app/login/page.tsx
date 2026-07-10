import Image from 'next/image'
import { iniciarSesion } from './acciones'

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-lg">
        <div className="mb-6 flex justify-center">
          <Image
            src="/logo-monce.png"
            alt="Monce Inmobiliaria"
            width={160}
            height={160}
            priority
          />
        </div>

        <h1 className="mb-6 text-center text-2xl font-bold text-[#2C3E50]">
          Iniciar sesión
        </h1>

        {params.error && (
          <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">
            {params.error}
          </p>
        )}

        <form action={iniciarSesion} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#2C3E50]">
              Correo
            </label>
            <input
              type="email"
              name="correo"
              required
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-[#2C3E50] focus:border-[#38B6FF] focus:outline-none focus:ring-1 focus:ring-[#38B6FF]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#2C3E50]">
              Contraseña
            </label>
            <input
              type="password"
              name="contrasena"
              required
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-[#2C3E50] focus:border-[#38B6FF] focus:outline-none focus:ring-1 focus:ring-[#38B6FF]"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded bg-[#2C3E50] py-2 text-sm font-medium text-white transition-colors hover:bg-[#38B6FF]"
          >
            Entrar
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600">
          ¿No tienes cuenta?{' '}
          <a href="/registro" className="font-medium text-[#38B6FF] hover:underline">
            Regístrate
          </a>
        </p>
      </div>
    </div>
  )
}
