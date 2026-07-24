import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const codigo = searchParams.get('code')

  if (codigo) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(codigo)
    if (!error) {
      return NextResponse.redirect(`${origin}/auth/establecer-contrasena`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=No se pudo procesar la invitación`)
}
