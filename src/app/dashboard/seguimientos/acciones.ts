'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function agregarComentario(actividadId: string, contenido: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('No autorizado')

  const { error } = await supabase
    .from('comentarios_actividad')
    .insert({
      actividad_id: actividadId,
      contenido,
      creado_por: user.id,
      creado_en: new Date().toISOString(),
    })

  if (error) {
    console.error('Error al agregar comentario:', error)
    throw new Error('No se pudo agregar el comentario')
  }

  revalidatePath('/dashboard/seguimientos')
}
