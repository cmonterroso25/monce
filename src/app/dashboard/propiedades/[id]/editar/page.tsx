import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import GestorFotos from './gestor-fotos'
import FormularioEditarPropiedad from './formulario-editar-propiedad'

export default async function EditarPropiedad({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [
    { data: propiedadData },
    { data: municipios },
    { data: colegas },
    { data: perfiles },
    { data: imagenes },
    { data: miPerfil },
    { data: ubicaciones },
  ] = await Promise.all([
    supabase.from('propiedades').select('*').eq('id', id).single(),
    supabase.from('municipios').select('id, nombre').order('nombre'),
    supabase.from('colegas').select('id, nombre').order('nombre'),
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
    supabase
      .from('imagenes_propiedad')
      .select('id, ruta_almacenamiento, es_portada, orden')
      .eq('propiedad_id', id)
      .order('orden', { ascending: true }),
    supabase.from('perfiles').select('rol').eq('id', user.id).single(),
    supabase.from('ubicaciones').select('id, nombre, google_maps_url, waze_url').order('nombre'),
  ])

  if (!propiedadData) {
    notFound()
  }

  const propiedad: any = propiedadData
  const esAdmin = miPerfil?.rol === 'administrador'
  const puedeEditar = esAdmin || propiedad.captado_por === user.id

  if (!puedeEditar) {
    const nombreCaptador = (perfiles ?? []).find((p) => p.id === propiedad.captado_por)
      ?.nombre_completo

    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <h1 className="mb-2 text-lg font-semibold text-amber-800">
            No tienes permiso para editar esta propiedad
          </h1>
          <p className="text-sm text-amber-700">
            {nombreCaptador
              ? `Esta propiedad fue capturada por ${nombreCaptador}. Solo esa persona o un administrador puede editarla.`
              : 'Solo quien capturo esta propiedad o un administrador puede editarla.'}
          </p>
          <Link
            href={`/dashboard/propiedades/${propiedad.id}`}
            className="mt-4 inline-block rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#38B6FF]"
          >
            Volver al detalle
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <h1 className="mb-6 text-xl font-bold sm:text-2xl">
        Editar propiedad {propiedad.codigo ? `- ${propiedad.codigo}` : ''}
      </h1>

      {sp.error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{sp.error}</p>
      )}

      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-700">Fotos actuales</label>
        <GestorFotos propiedadId={propiedad.id} imagenesIniciales={imagenes ?? []} />
      </div>

      <FormularioEditarPropiedad
        propiedad={propiedad}
        municipios={municipios ?? []}
        colegas={colegas ?? []}
        perfiles={perfiles ?? []}
        ubicaciones={ubicaciones ?? []}
        esAdmin={esAdmin}
        conteoFotosExistentes={(imagenes ?? []).length}
      />
    </div>
  )
}
