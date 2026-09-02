'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notificarWhatsapp, obtenerChatIdGrupo } from '@/lib/whatsapp/notificar'
import { grupoParaOperacion, urlPropiedadParaWhatsapp, obtenerUrlPortada, notificarFichaPropiedad } from '@/lib/whatsapp/notificar-propiedad'
const ESTADOS_NO_DISPONIBLE = ['vendida', 'rentada', 'inactiva']
export async function actualizarEstadoPropiedad(propiedadId: string, nuevoEstado: string) {
  const supabase = await createClient()
  const { data: propiedad } = await supabase
    .from('propiedades')
    .select(`
      id,
      titulo,
      codigo,
      tipo_operacion,
      estado,
      organization_id,
      captado_por,
      ingresado_por:perfiles!propiedades_captado_por_fkey (nombre_completo),
      colega:colegas (nombre)
    `)
    .eq('id', propiedadId)
    .single()
  const estadoAnterior = propiedad?.estado ?? null
  const { error } = await supabase
    .from('propiedades')
    .update({ estado: nuevoEstado })
    .eq('id', propiedadId)
  if (error) {
    return { ok: false, mensaje: error.message }
  }
  const grupo = propiedad ? grupoParaOperacion(propiedad.tipo_operacion) : null
  if (propiedad && grupo && ESTADOS_NO_DISPONIBLE.includes(nuevoEstado)) {
    const chatId = await obtenerChatIdGrupo(supabase, propiedad.organization_id, grupo)
    if (chatId) {
      // Los 3 estados (vendida, rentada, inactiva) comparten el mismo texto
      // genérico "Propiedad no disponible" — decisión explícita del usuario,
      // no se distinguen entre sí en el mensaje. Se agregan "Ingresado por"
      // y "Colega" para saber a quién pertenecía la propiedad que se está
      // dando de baja.
      const enlace = urlPropiedadParaWhatsapp(propiedadId)
      const ingresadoPorNombre = (propiedad as any).ingresado_por?.nombre_completo ?? null
      const colegaNombre = (propiedad as any).colega?.nombre ?? null
      const mensaje = [
        '🚫 Propiedad no disponible',
        propiedad.codigo ?? propiedadId,
        propiedad.titulo,
        ingresadoPorNombre ? `Ingresado por: ${ingresadoPorNombre}` : null,
        colegaNombre ? `Colega: ${colegaNombre}` : null,
        enlace,
      ].filter(Boolean).join('\n')
      const imagenUrl = await obtenerUrlPortada(supabase, propiedadId)
      await notificarWhatsapp({
        chatId,
        mensaje,
        organizationId: propiedad.organization_id,
        tipoNotificacion: 'propiedad_no_disponible',
        imagenUrl,
      })
    }
  }
  // Reactivación: la propiedad vuelve a "disponible" desde cualquier otro
  // estado (vendida, rentada, inactiva, reservada, etc.). Se envía la
  // ficha completa igual que en "propiedad nueva" y en las ediciones
  // (mismos bloques, foto de portada, precio), cambiando solo encabezado
  // e ícono para distinguirla de las demás notificaciones ("✅ Nuevamente
  // disponible" en vez de "🆕 Nueva propiedad publicada"). `agenteId` usa
  // captado_por para que "Ingresado por" siga mostrando al agente dueño
  // de la propiedad, no a quien hizo el cambio de estado.
  if (propiedad && grupo && nuevoEstado === 'disponible' && estadoAnterior !== 'disponible' && propiedad.captado_por) {
    await notificarFichaPropiedad(
      supabase,
      propiedadId,
      propiedad.organization_id,
      propiedad.captado_por,
      '✅ Nuevamente disponible',
      'propiedad_nuevamente_disponible'
    )
  }
  revalidatePath(`/dashboard/propiedades/${propiedadId}`)
  revalidatePath('/dashboard/propiedades')
  return { ok: true }
}


// ============================================================
// Analítica de visitas públicas (eventos_analitica, tipo 'vista_publica')
// ============================================================

export type FilaAgenteVistas = { agenteId: string | null; nombre: string; cantidad: number }
export type AnaliticaVistas = { total: number; porAgente: FilaAgenteVistas[] }

// Lee eventos_analitica con el cliente normal (no admin): la RLS
// "agente_ve_analitica_de_sus_propiedades" ya restringe el SELECT solo al
// agente que captó la propiedad (captado_por = auth.uid()) o a un admin.
// Si quien llama no cumple esa condición, Supabase simplemente devuelve 0
// filas (no error) — por eso el llamador (page.tsx) debe decidir si
// renderiza este bloque, en vez de confiar en que "0 visitas" signifique
// que no las hay.
export async function obtenerAnaliticaVistas(
  propiedadId: string,
  desde: string,
  hasta: string
): Promise<AnaliticaVistas> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('eventos_analitica')
    .select('raw')
    .eq('propiedad_id', propiedadId)
    .eq('tipo_evento', 'vista_publica')
    .gte('ocurrido_en', desde)
    .lte('ocurrido_en', hasta)

  if (error || !data) {
    console.error(`No se pudo leer analítica de vistas de propiedad ${propiedadId}:`, error)
    return { total: 0, porAgente: [] }
  }

  // agente_id vive dentro de raw (jsonb), no en columna propia — ver
  // registrarVistaPublica en src/lib/analitica/registrar-vista.ts.
  const conteoPorClave = new Map<string, number>()
  for (const evento of data) {
    const agenteId = (evento.raw as { agente_id?: string } | null)?.agente_id ?? null
    const clave = agenteId ?? '__sin_atribuir__'
    conteoPorClave.set(clave, (conteoPorClave.get(clave) ?? 0) + 1)
  }

  const idsAgentes = [...conteoPorClave.keys()].filter((clave) => clave !== '__sin_atribuir__')
  let nombresPorId = new Map<string, string>()
  if (idsAgentes.length > 0) {
    const { data: perfiles } = await supabase
      .from('perfiles')
      .select('id, nombre_completo')
      .in('id', idsAgentes)
    nombresPorId = new Map((perfiles ?? []).map((p) => [p.id, p.nombre_completo]))
  }

  const porAgente = [...conteoPorClave.entries()]
    .map(([clave, cantidad]) => ({
      agenteId: clave === '__sin_atribuir__' ? null : clave,
      nombre:
        clave === '__sin_atribuir__'
          ? 'Sin agente (visita directa)'
          : nombresPorId.get(clave) ?? 'Agente ya no disponible',
      cantidad,
    }))
    .sort((a, b) => b.cantidad - a.cantidad)

  return { total: data.length, porAgente }
}
