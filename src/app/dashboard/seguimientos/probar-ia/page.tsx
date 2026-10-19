import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SimuladorChat from './simulador-chat'

export default async function PaginaProbarIA() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: miPerfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  if (miPerfil?.rol !== 'administrador') redirect('/dashboard')

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Link href="/dashboard/seguimientos" className="mb-4 inline-block text-sm text-slate-500 hover:text-[#38B6FF]">
        ← Volver a Seguimientos
      </Link>
      <h1 className="mb-1 text-xl font-bold text-[#2C3E50] sm:text-2xl">Probar agente de seguimiento IA</h1>
      <p className="mb-6 text-sm text-slate-500">
        Simula la conversación escribiendo lo que respondería el asesor. No se mueve ningún lead real ni se envía
        ningún WhatsApp — solo se llama a Gemini para ver qué clasificaría y qué acción tomaría.
      </p>
      <SimuladorChat />
    </div>
  )
}
