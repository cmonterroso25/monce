import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { subirImagen } from '@/lib/r2/subir-imagen'
import { revalidatePath } from 'next/cache'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const formData = await request.formData()
  const propiedadId = formData.get('propiedad_id') as string
  const archivo = formData.get('archivo') as File | null
  const orden = Number(formData.get('orden') ?? 0)
  const esPortada = formData.get('es_portada') === 'true'

  if (!propiedadId || !archivo || archivo.size === 0) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const { data: propiedad, error: errorPropiedad } = await supabase
    .from('propiedades')
    .select('captado_por')
    .eq('id', propiedadId)
    .single()

  if (errorPropiedad || !propiedad) {
    return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 })
  }

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  const esAdmin = miPerfil?.rol === 'administrador'
  const puedeSubir = esAdmin || propiedad.captado_por === user.id
  if (!puedeSubir) {
    return NextResponse.json({ error: 'No tienes permiso para agregar fotos a esta propiedad' }, { status: 403 })
  }

  try {
    const url = await subirImagen(archivo, `propiedades/${propiedadId}`)
    const { error: errorInsert } = await supabase.from('imagenes_propiedad').insert({
      propiedad_id: propiedadId,
      ruta_almacenamiento: url,
      es_portada: esPortada,
      orden,
    })
    if (errorInsert) {
      console.error('--- ERROR AL INSERTAR IMAGEN ---', errorInsert)
      return NextResponse.json({ error: errorInsert.message }, { status: 500 })
    }
  } catch (err) {
    console.error('--- ERROR AL SUBIR IMAGEN ---', err)
    return NextResponse.json({ error: 'No se pudo subir la imagen' }, { status: 500 })
  }

  revalidatePath('/dashboard/propiedades')
  revalidatePath(`/dashboard/propiedades/${propiedadId}`)
  revalidatePath(`/dashboard/propiedades/${propiedadId}/editar`)

  return NextResponse.json({ ok: true })
}
