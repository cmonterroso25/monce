import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const secreto = req.headers.get('x-cma-secret')
  if (!process.env.CMA_CALLBACK_SECRET || secreto !== process.env.CMA_CALLBACK_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const {
    informe_id,
    error,
    modelo,
    precio_m2,
    precio_m2_promedio_zona,
    precio_m2_mediana_zona,
    posicionamiento,
    comparables,
    narrativa,
    fuentes,
    costo_usd,
  } = body

  if (!informe_id) {
    return NextResponse.json({ error: 'Falta informe_id' }, { status: 400 })
  }

  if (error) {
    await supabaseAdmin.rpc('cma_marcar_error', {
      p_informe_id: informe_id,
      p_mensaje: typeof error === 'string' ? error : 'El motor de análisis de mercado reportó un error.',
    })
    return NextResponse.json({ ok: true })
  }

  const { error: errorRpc } = await supabaseAdmin.rpc('cma_marcar_completado', {
    p_informe_id: informe_id,
    p_precio_m2: precio_m2 ?? null,
    p_precio_m2_promedio_zona: precio_m2_promedio_zona ?? null,
    p_precio_m2_mediana_zona: precio_m2_mediana_zona ?? null,
    p_posicionamiento: posicionamiento ?? null,
    p_comparables: comparables ?? [],
    p_narrativa: narrativa ?? null,
    p_fuentes: fuentes ?? [],
    p_costo_usd: costo_usd ?? null,
    p_modelo: modelo ?? null,
  })

  if (errorRpc) {
    console.error('--- ERROR ESCRIBIENDO RESULTADO DE CMA ---', informe_id, errorRpc)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
