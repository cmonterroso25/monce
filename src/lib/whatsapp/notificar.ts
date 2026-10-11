export type GrupoWhatsapp = 'ventas' | 'rentas' | 'citas'

interface ClienteConsulta {
  from: (tabla: string) => any
}

const FUNCTIONS_URL = 'https://ymvrddvckmwiajcqaled.supabase.co/functions/v1/whatsapp-enviar'
const WHATSAPP_FUNCTION_SECRET = process.env.WHATSAPP_FUNCTION_SECRET!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function obtenerChatIdGrupo(
  supabase: ClienteConsulta,
  organizationId: string,
  grupo: GrupoWhatsapp
): Promise<string | null> {
  const columna =
    grupo === 'ventas' ? 'whatsapp_grupo_ventas' :
    grupo === 'rentas' ? 'whatsapp_grupo_rentas' :
    'whatsapp_grupo_citas'
  const { data, error } = await supabase
    .from('organizaciones')
    .select(columna)
    .eq('id', organizationId)
    .single()
  if (error || !data) {
    console.error(`No se pudo obtener el grupo de WhatsApp "${grupo}":`, error)
    return null
  }
  return (data as Record<string, string | null>)[columna]
}

export async function notificarWhatsapp(params: {
  chatId: string
  mensaje: string
  organizationId: string
  tipoNotificacion: string
  agenteId?: string | null
  contactoId?: string | null
  actividadId?: string | null
  imagenUrl?: string | null
}) {
  // No esperamos la respuesta para no bloquear. Se envía de forma asíncrona con timeout.
  console.log('notificarWhatsapp: iniciando fetch a', FUNCTIONS_URL)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 segundos timeout

  fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'x-notificacion-secret': WHATSAPP_FUNCTION_SECRET,
    },
    body: JSON.stringify({
      chatId: params.chatId,
      mensaje: params.mensaje,
      imagenUrl: params.imagenUrl ?? null,
      registrar: {
        organization_id: params.organizationId,
        tipo_notificacion: params.tipoNotificacion,
        agente_id: params.agenteId ?? null,
        contacto_id: params.contactoId ?? null,
        actividad_id: params.actividadId ?? null,
      },
    }),
    signal: controller.signal,
  })
    .then((res) => {
      clearTimeout(timeoutId)
      console.log('notificarWhatsapp: fetch respondió con status', res.status)
      if (!res.ok) {
        console.error('notificarWhatsapp: error HTTP', res.status)
      }
    })
    .catch((err) => {
      clearTimeout(timeoutId)
      console.error('notificarWhatsapp: error:', err.message)
    })
}
