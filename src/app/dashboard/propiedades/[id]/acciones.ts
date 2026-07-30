'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notificarWhatsapp, obtenerChatIdGrupo } from '@/lib/whatsapp/notificar'
import { grupoParaOperacion, urlPropiedadParaWhatsapp, obtenerUrlPortada } from '@/lib/whatsapp/notificar-propiedad'
const ESTADOS_NO_DISPONIBLE = ['vendida', 'rentada', 'inactiva']
export async function actualizarEstadoPropiedad(propiedadId: string, nuevoEstado: string) {
  const supabase = await createClient()
  const { data: propiedad } = await supabase
    .from('propiedades')
    .select('id, titulo, codigo, tipo_operacion, organization_id')
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
      // Los 3 estados (vendida, rentada, inactiva) comparten el mismo texto
      // genérico "Propiedad no disponible" — decisión explícita del usuario,
      // no se distinguen entre sí en el mensaje.
      const enlace = urlPropiedadParaWhatsapp(propiedadId)
      const mensaje = [
        '🚫 Propiedad no disponible',
        propiedad.codigo ?? propiedadId,
        propiedad.titulo,
        enlace,
      ].filter(Boolean).join('\n')
      const imagenUrl = await obtenerUrlPortada(supabase, propiedadId)
      await notificarWhatsapp({
        chatId,
        mensaje,
        organizationId: propiedad.organization_id,
        tipoNotificacion: 'propiedad_no_disponible',
        imagenUrl,
      })
    }
  }
  revalidatePath(`/dashboard/propiedades/${propiedadId}`)
  revalidatePath('/dashboard/propiedades')
  return { ok: true }
}
