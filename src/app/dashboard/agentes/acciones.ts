'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function textoOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  return valor as string
}

export async function actualizarAgente(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const agenteId = formData.get('agente_id') as string

  const { error } = await supabase
    .from('perfiles')
    .update({
      nombre_completo: formData.get('nombre_completo') as string,
      telefono: textoOpcional(formData.get('telefono')),
      rol: formData.get('rol') as string,
      activo: formData.get('activo') === 'true',
    })
    .eq('id', agenteId)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR AGENTE ---', error)
    redirect(`/dashboard/agentes/${agenteId}/editar?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/agentes')
  revalidatePath(`/dashboard/agentes/${agenteId}`)
  redirect(`/dashboard/agentes/${agenteId}`)
}
