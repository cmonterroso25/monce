'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const WHATSAPP_FUNCTION_SECRET = process.env.WHATSAPP_FUNCTION_SECRET!
const PROBAR_URL = `${SUPABASE_URL}/functions/v1/seguimiento-ia-probar`

async function requerirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  if (perfil?.rol !== 'administrador') throw new Error('Solo administradores pueden usar el simulador')
}

export async function obtenerPreguntaInicialIA(agenteNombre: string, tipoActividad: string, contactoNombre: string) {
  await requerirAdmin()
  const res = await fetch(PROBAR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-notificacion-secret': WHATSAPP_FUNCTION_SECRET },
    body: JSON.stringify({ modo: 'pregunta_inicial', agente_nombre: agenteNombre, tipo_actividad: tipoActividad, contacto_nombre: contactoNombre }),
  })
  return res.json()
}

export type ResultadoPruebaIA = {
  ok: boolean
  error?: string
  prompt_enviado_a_gemini?: string
  clasificacion?: Record<string, unknown>
  accion_descrita?: string
  siguiente_fase?: string | null
  siguiente_pregunta?: string | null
  es_reintento_aclaracion_siguiente?: boolean
  terminal?: boolean
}

export async function probarSeguimientoIA(
  fase: string,
  mensajeAsesor: string,
  esReintentoAclaracion: boolean
): Promise<ResultadoPruebaIA> {
  await requerirAdmin()
  const res = await fetch(PROBAR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-notificacion-secret': WHATSAPP_FUNCTION_SECRET },
    body: JSON.stringify({ fase, mensaje_asesor: mensajeAsesor, es_reintento_aclaracion: esReintentoAclaracion }),
  })
  return res.json()
}

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
