'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function textoOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  return valor as string
}

export async function crearTarea(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const { error } = await supabase.from('tareas').insert({
    titulo: formData.get('titulo') as string,
    fecha_limite: textoOpcional(formData.get('fecha_limite')),
    prioridad: (formData.get('prioridad') as string) || 'media',
    estado: 'pendiente',
    asignado_a: textoOpcional(formData.get('asignado_a')) || user.id,
    contacto_id: textoOpcional(formData.get('contacto_id')),
    lead_id: textoOpcional(formData.get('lead_id')),
    organization_id: perfil?.organization_id,
  })

  if (error) {
    console.error('--- ERROR AL CREAR TAREA ---', error)
    redirect(`/dashboard/tareas/nuevo?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/tareas')
  redirect('/dashboard/tareas')
}

export async function actualizarTarea(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const tareaId = formData.get('tarea_id') as string

  const { error } = await supabase
    .from('tareas')
    .update({
      titulo: formData.get('titulo') as string,
      fecha_limite: textoOpcional(formData.get('fecha_limite')),
      prioridad: (formData.get('prioridad') as string) || 'media',
      estado: (formData.get('estado') as string) || 'pendiente',
      asignado_a: textoOpcional(formData.get('asignado_a')),
      contacto_id: textoOpcional(formData.get('contacto_id')),
      lead_id: textoOpcional(formData.get('lead_id')),
    })
    .eq('id', tareaId)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR TAREA ---', error)
    redirect(`/dashboard/tareas/${tareaId}/editar?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/tareas')
  redirect('/dashboard/tareas')
}

export async function cambiarEstadoTarea(tareaId: string, nuevoEstado: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tareas')
    .update({ estado: nuevoEstado })
    .eq('id', tareaId)

  revalidatePath('/dashboard/tareas')

  if (error) return { ok: false, mensaje: error.message }
  return { ok: true, mensaje: null }
}

export async function eliminarTarea(tareaId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'No autenticado' }

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle()
  const esAdmin = miPerfil?.rol === 'administrador'

  const { data: tarea } = await supabase
    .from('tareas')
    .select('asignado_a')
    .eq('id', tareaId)
    .maybeSingle()

  if (!tarea) return { ok: false, mensaje: 'Tarea no encontrada.' }

  // Verificación explícita en código, no depender solo de RLS.
  if (!esAdmin && tarea.asignado_a !== user.id) {
    return { ok: false, mensaje: 'No tienes permiso para eliminar esta tarea.' }
  }

  const { error } = await supabase.from('tareas').delete().eq('id', tareaId)

  revalidatePath('/dashboard/tareas')

  if (error) return { ok: false, mensaje: error.message }
  return { ok: true, mensaje: null }
}
