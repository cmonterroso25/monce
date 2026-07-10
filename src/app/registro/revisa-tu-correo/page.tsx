import Image from 'next/image'
import Link from 'next/link'

export default function RevisaTuCorreo() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="max-w-sm rounded-lg bg-white p-8 text-center shadow-lg">
        <div className="mb-6 flex justify-center">
          <Image
            src="/logo-monce.png"
            alt="Monce Inmobiliaria"
            width={140}
            height={140}
          />
        </div>
        <h1 className="mb-2 text-xl font-bold text-[#2C3E50]">
          Revisa tu correo
        </h1>
        <p className="text-sm text-slate-600">
          Te enviamos un enlace de confirmación a tu correo. Ábrelo para
          activar tu cuenta.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm font-medium text-[#38B6FF] hover:underline"
        >
          Volver a iniciar sesión
        </Link>
      </div>
    </div>
  )
}
