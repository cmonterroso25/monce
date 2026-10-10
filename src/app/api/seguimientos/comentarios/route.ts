import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const actividadId = request.nextUrl.searchParams.get('actividad_id')

  if (!actividadId) {
    return NextResponse.json({ error: 'actividad_id requerido' }, { status: 400 })
  }

  const { data: comentarios, error } = await supabase
    .from('comentarios_actividad')
    .select('id, contenido, creado_en, creado_por:perfiles(nombre_completo)')
    .eq('actividad_id', actividadId)
    .order('creado_en', { ascending: false })

  if (error) {
    console.error('Error al obtener comentarios:', error)
    return NextResponse.json({ error: 'Error al obtener comentarios' }, { status: 500 })
  }

  return NextResponse.json(comentarios ?? [])
}
