import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GREEN_API_ID_INSTANCE = Deno.env.get('GREEN_API_ID_INSTANCE')!
const GREEN_API_TOKEN_INSTANCE = Deno.env.get('GREEN_API_TOKEN_INSTANCE')!
const GREEN_API_URL = Deno.env.get('GREEN_API_URL') ?? 'https://api.green-api.com'
const FUNCTION_SECRET = Deno.env.get('WHATSAPP_FUNCTION_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ⚠️ ASUNCIÓN A VERIFICAR CONMIGO: asumo que perfiles.telefono / contactos.telefono
// se guardan como 8 dígitos locales de Guatemala (sin "502"). Si ya incluyen
// el código de país, hay que quitar este condicional.
function normalizarChatId(telefono: string): string {
  const soloDigitos = telefono.replace(/\D/g, '')
  const conCodigoPais = soloDigitos.length === 8 ? `502${soloDigitos}` : soloDigitos
  return `${conCodigoPais}@c.us`
}

async function enviarGreenApi(chatId: string, mensaje: string) {
  const url = `${GREEN_API_URL}/waInstance${GREEN_API_ID_INSTANCE}/sendMessage/${GREEN_API_TOKEN_INSTANCE}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message: mensaje }),
  })
  if (!res.ok) {
    const texto = await res.text()
    throw new Error(`Green API error ${res.status}: ${texto}`)
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-notificacion-secret') !== FUNCTION_SECRET) {
    return new Response('No autorizado', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: pendientes, error } = await supabase
    .from('notificaciones_whatsapp')
    .select('id, telefono, chat_id, mensaje')
    .eq('enviado', false)
    .lte('programado_para', new Date().toISOString())
    .limit(50)

  if (error) {
    console.error('Error consultando pendientes:', error)
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
  }

  let enviados = 0
  let fallidos = 0

  for (const fila of pendientes ?? []) {
    const destino = fila.chat_id ?? (fila.telefono ? normalizarChatId(fila.telefono) : null)
    if (!destino) {
      console.error(`Notificación ${fila.id} sin chat_id ni telefono, se omite.`)
      fallidos++
      continue
    }
    try {
      await enviarGreenApi(destino, fila.mensaje)
      await supabase
        .from('notificaciones_whatsapp')
        .update({ enviado: true, enviado_en: new Date().toISOString() })
        .eq('id', fila.id)
      enviados++
    } catch (err) {
      console.error(`Error enviando notificación ${fila.id}:`, err)
      fallidos++
    }
  }

  return new Response(
    JSON.stringify({ ok: true, enviados, fallidos, total: (pendientes ?? []).length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
