import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import FormularioNuevaPropiedad from './formulario-nueva-propiedad'

export default async function NuevaPropiedad({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [
    { data: municipios },
    { data: colegas },
    { data: perfiles },
    { data: ubicaciones },
    { data: miPerfil },
  ] = await Promise.all([
    supabase.from('municipios').select('id, nombre').order('nombre'),
    supabase.from('colegas').select('id, nombre').order('nombre'),
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
    supabase.from('ubicaciones').select('id, nombre, google_maps_url, waze_url').order('nombre'),
    user
      ? supabase.from('perfiles').select('rol').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
  ])

  const esAdmin = miPerfil?.rol === 'administrador'

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <Link
        href="/dashboard/propiedades"
        className="mb-4 inline-block text-sm text-slate-500 hover:text-[#38B6FF]"
      >
        ← Volver a propiedades
      </Link>

      <h1 className="mb-6 text-xl font-bold sm:text-2xl">Nueva propiedad</h1>

      {params.error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{params.error}</p>
      )}

      <FormularioNuevaPropiedad
        municipios={municipios ?? []}
        colegas={colegas ?? []}
        perfiles={perfiles ?? []}
        ubicaciones={ubicaciones ?? []}
        esAdmin={esAdmin}
        userId={user?.id}
      />
    </div>
  )
}
