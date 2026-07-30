import { urlSitio } from '@/lib/url'
const FUNCTIONS_URL = 'https://ymvrddvckmwiajcqaled.supabase.co/functions/v1/whatsapp-enviar'
const WHATSAPP_FUNCTION_SECRET = process.env.WHATSAPP_FUNCTION_SECRET!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export type GrupoWhatsapp = 'ventas' | 'rentas' | 'citas'
interface ClienteConsulta {
  from: (tabla: string) => any
}
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
  try {
    const res = await fetch(FUNCTIONS_URL, {
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
    })
    if (!res.ok) {
      console.error('Error notificando WhatsApp:', await res.text())
    }
  } catch (err) {
    console.error('Error de red notificando WhatsApp:', err)
  }
}
export function mensajePropiedad(p: {
  titulo: string
  precio: number | null
  moneda: string | null
  zona: string | null
  ciudad: string | null
  dormitorios: string | null
  banos: string | null
  slug: string | null
  codigo: string | null
  encabezado: string
}): string {
  const ubicacion = [p.zona, p.ciudad].filter(Boolean).join(', ')
  const enlace = p.slug ? urlSitio(`/propiedades/${p.slug}`) : null
  const bloques = [
    p.encabezado,
    `*${p.titulo}*` + (p.codigo ? ` (${p.codigo})` : ''),
    p.precio != null && `${p.moneda ?? 'GTQ'} ${Number(p.precio).toLocaleString()}`,
    ubicacion && `📍 ${ubicacion}`,
    (p.dormitorios || p.banos) && `🛏️ ${p.dormitorios ?? '—'} hab  🛁 ${p.banos ?? '—'} baños`,
  ].filter(Boolean)
  let mensaje = bloques.join('\n\n')
  if (enlace) mensaje += `\n\n${enlace}`
  return mensaje
}
