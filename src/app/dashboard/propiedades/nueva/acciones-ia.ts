'use server'

import { createClient } from '@/lib/supabase/server'
import { extraerPropiedadesDeTexto, type PropiedadExtraida } from '@/lib/ia/extraer-propiedad'

const MAX_CARACTERES = 10_000

export async function extraerPropiedadAccion(texto: string): Promise<{
  ok: boolean
  propiedades: PropiedadExtraida[]
  mensaje?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, propiedades: [], mensaje: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  if (typeof texto !== 'string' || texto.length > MAX_CARACTERES) {
    return {
      ok: false,
      propiedades: [],
      mensaje: `El texto es demasiado largo (máximo ${MAX_CARACTERES.toLocaleString('es-GT')} caracteres).`,
    }
  }

  return extraerPropiedadesDeTexto(texto)
}
