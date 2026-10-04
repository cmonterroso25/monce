'use server'
import { createClient } from '@/lib/supabase/server'
import { CANALES_ENVIO, obtenerPropiedadesEnviadas } from '@/lib/propiedades-enviadas'

export async function registrarEnvioPropiedad(contactoId: string, propiedadId: string, canal: string) {
  if (!(CANALES_ENVIO as readonly string[]).includes(canal)) {
    return { ok: false, mensaje: 'Canal no válido' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'No autenticado' }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const { error } = await supabase.from('envios_propiedad_contacto').insert({
    contacto_id: contactoId,
    propiedad_id: propiedadId,
    canal,
    enviado_por: user.id,
    organization_id: perfil?.organization_id,
  })

  if (error) {
    console.error('--- ERROR AL REGISTRAR ENVÍO DE PROPIEDAD ---', error)
    return { ok: false, mensaje: error.message }
  }
  return { ok: true, mensaje: null }
}

// Lo usa el formulario de nuevo lead cuando el contacto se elige dentro del propio formulario.
export async function listarPropiedadesEnviadas(contactoId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const enviadas = await obtenerPropiedadesEnviadas(supabase, contactoId)
  return enviadas.filter((p) => p.estado === 'disponible')
}
