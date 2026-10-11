import { reenviarUltimaCita } from '@/app/dashboard/leads/acciones'

export async function GET() {
  try {
    const resultado = await reenviarUltimaCita()
    return Response.json(resultado, { status: resultado.ok ? 200 : 400 })
  } catch (err: any) {
    console.error('Error reenviando última cita:', err)
    return Response.json({ ok: false, mensaje: err.message }, { status: 500 })
  }
}
