'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notificarWhatsapp, obtenerChatIdGrupo } from '@/lib/whatsapp/notificar'
import { grupoParaOperacion, urlPropiedadParaWhatsapp } from '@/lib/whatsapp/notificar-propiedad'

const ESTADOS_NO_DISPONIBLE = ['vendida', 'rentada', 'inactiva']

export async function actualizarEstadoPropiedad(propiedadId: string, nuevoEstado: string) {
  const supabase = await createClient()

  const { data: propiedad } = await supabase
    .from('propiedades')
    .select('titulo, codigo, slug, tipo_operacion, organization_id')
    .eq('id', propiedadId)
    .single()

  const { error } = await supabase
    .from('propiedades')
    .update({ estado: nuevoEstado })
    .eq('id', propiedadId)

  if (error) {
    return { ok: false, mensaje: error.message }
  }

  const grupo = propiedad ? grupoParaOperacion(propiedad.tipo_operacion) : null
  if (propiedad && grupo && ESTADOS_NO_DISPONIBLE.includes(nuevoEstado)) {
    const chatId = await obtenerChatIdGrupo(supabase, propiedad.organization_id, grupo)
    if (chatId) {
      const etiquetas: Record<string, string> = {
        vendida: '✅ Vendida',
        rentada: '✅ Rentada',
        inactiva: '⛔ Ya no disponible',
      }
      const enlace = urlPropiedadParaWhatsapp(propiedad.slug)
      const mensaje = [
        etiquetas[nuevoEstado],
        `*${propiedad.titulo}* (${propiedad.codigo ?? propiedadId})`,
        enlace,
      ].filter(Boolean).join('\n\n')
      await notificarWhatsapp({
        chatId,
        mensaje,
        organizationId: propiedad.organization_id,
        tipoNotificacion: 'propiedad_no_disponible',
      })
    }
  }

  revalidatePath(`/dashboard/propiedades/${propiedadId}`)
  revalidatePath('/dashboard/propiedades')

  return { ok: true }
}
