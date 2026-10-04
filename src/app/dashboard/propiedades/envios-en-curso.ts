'use server'

import { createClient } from '@/lib/supabase/server'

export type EnvioEnCurso = {
  id: string
  propiedadId: string
  codigo: string | null
  titulo: string | null
  estado: string
  canal: string | null
  cuenta: string | null
}

const ESTADOS_EN_CURSO = ['QUEUED', 'PUBLICANDO', 'WAITING_APPROVAL', 'APPROVED']

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

// Envíos del usuario actual que siguen en curso, para avisarle en el sidebar.
// Solo los propios (la RLS ya limita a propios o, si es admin, a todos; aquí se filtra siempre).
export async function listarEnviosEnCurso(): Promise<EnvioEnCurso[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('trabajos_publicacion')
    .select(
      'id, estado, expira_en, propiedad_id, propiedad:propiedades (codigo, titulo), canal:canales_publicacion (nombre), cuenta:cuentas_sociales (etiqueta)'
    )
    .eq('asesor_id', user.id)
    .in('estado', ESTADOS_EN_CURSO)
    .order('creado_en', { ascending: false })
    .limit(10)

  if (error) {
    console.error('No se pudieron leer los envíos en curso:', error.message)
    return []
  }

  const ahora = Date.now()
  return (data ?? [])
    .filter((t) => !(t.estado === 'WAITING_APPROVAL' && t.expira_en && new Date(t.expira_en).getTime() < ahora))
    .map((t) => ({
      id: t.id as string,
      propiedadId: t.propiedad_id as string,
      codigo: uno(t.propiedad as any)?.codigo ?? null,
      titulo: uno(t.propiedad as any)?.titulo ?? null,
      estado: t.estado as string,
      canal: uno(t.canal as any)?.nombre ?? null,
      cuenta: uno(t.cuenta as any)?.etiqueta ?? null,
    }))
}
