'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function actualizarEstadoPropiedad(propiedadId: string, nuevoEstado: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('propiedades')
    .update({ estado: nuevoEstado })
    .eq('id', propiedadId)

  if (error) {
    return { ok: false, mensaje: error.message }
  }

  revalidatePath(`/dashboard/propiedades/${propiedadId}`)
  revalidatePath('/dashboard/propiedades')

  return { ok: true }
}
