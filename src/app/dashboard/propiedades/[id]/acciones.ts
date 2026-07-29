'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notificarWhatsapp, obtenerChatIdGrupo, type GrupoWhatsapp } from '@/lib/whatsapp/notificar'
import { urlSitio } from '@/lib/url'

const ESTADOS_NO_DISPONIBLE = ['vendida', 'rentada', 'inactiva']

function grupoParaOperacion(tipoOperacion: string | null): GrupoWhatsapp | null {
  if (tipoOperacion === 'venta') return 'ventas'
  if (tipoOperacion === 'renta') return 'rentas'
  return null
}

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
      const enlace = propiedad.slug ? `\n\n${urlSitio(`/propiedades/${propiedad.slug}`)}` : ''
      const mensaje = `${etiquetas[nuevoEstado]}\n\n*${propiedad.titulo}* (${propiedad.codigo ?? propiedadId})${enlace}`
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
