import { supabaseAdmin } from '@/lib/supabase/admin'

// Registra una vista de la ficha pública de una propiedad en
// `eventos_analitica`. Usa supabaseAdmin porque la tabla no tiene política
// RLS de INSERT para el rol "anon" (solo SELECT para agentes/admin de la
// organización), y un visitante público no autenticado no podría insertar
// con el cliente normal.
//
// `agenteId` viene del query param ?agente=<id> del enlace compartido
// (ver compartir-whatsapp.tsx) y se guarda dentro de `raw`, no en una
// columna propia: la tabla no tiene columna agente_id, y este dato es
// solo para atribuir de qué agente vino el tráfico, no para autorización
// ni para mostrar contacto (eso ya no aplica en la ficha pública).
//
// Nunca debe bloquear ni romper el render de la página: cualquier error
// se registra en consola y se ignora.
export async function registrarVistaPublica(
  propiedadId: string,
  organizationId: string,
  agenteId: string | null
) {
  try {
    const { error } = await supabaseAdmin.from('eventos_analitica').insert({
      organization_id: organizationId,
      propiedad_id: propiedadId,
      tipo_evento: 'vista_publica',
      raw: agenteId ? { agente_id: agenteId } : null,
    })
    if (error) {
      console.error(
        `No se pudo registrar vista pública de propiedad ${propiedadId}: ` +
          `code=${error.code} message=${error.message} details=${error.details} hint=${error.hint}`
      )
    }
  } catch (err) {
    console.error(`Error de red registrando vista pública de propiedad ${propiedadId}:`, err)
  }
}
