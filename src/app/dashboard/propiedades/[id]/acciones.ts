'use server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { notificarWhatsapp, obtenerChatIdGrupo } from '@/lib/whatsapp/notificar'
import { grupoParaOperacion, urlPropiedadParaWhatsapp, obtenerUrlPortada, notificarFichaPropiedad, aPropiedadMarketplace, SELECT_PROPIEDAD_CON_MUNICIPIO } from '@/lib/whatsapp/notificar-propiedad'
import { generarTextoMarketplace } from '@/lib/whatsapp/mensaje-marketplace'
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


// ============================================================
// Motor de Publicación Multicanal (canales_publicacion / trabajos_publicacion)
//
// Estas funciones son el puente entre la ficha de propiedad y la Edge
// Function `crear-solicitud-publicacion`, que es la que de verdad valida
// campos requeridos, genera el contenido y abre los subjobs por canal.
// Aquí NO se duplica esa lógica — solo se cargan los catálogos para la
// UI y se llama a la Edge Function con el JWT de la sesión actual.
// ============================================================

export type CanalPublicacionActivo = {
  id: string
  codigo: string
  nombre: string
  plataforma: string
  requiere_cuenta_social: boolean
}

export type CuentaSocialLista = {
  id: string
  plataforma: string
  etiqueta: string | null
  tipo_cuenta: string
  estado: string
}

export async function obtenerCanalesActivos(): Promise<CanalPublicacionActivo[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('canales_publicacion')
    .select('id, codigo, nombre, plataforma, requiere_cuenta_social')
    .eq('activo', true)
    .order('nombre')

  if (error) {
    console.error('No se pudieron leer canales_publicacion:', error)
    return []
  }
  return data ?? []
}

export async function obtenerCuentasSocialesListas(
  organizationId: string,
  plataforma: string
): Promise<CuentaSocialLista[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  // Solo las cuentas del propio asesor, aunque sea administrador:
  // cada asesor publica únicamente con sus cuentas.
  const { data, error } = await supabase
    .from('cuentas_sociales')
    .select('id, plataforma, etiqueta, tipo_cuenta, estado')
    .eq('organization_id', organizationId)
    .eq('asesor_id', user.id)
    .eq('plataforma', plataforma)
    .in('estado', ['READY', 'BUSY'])
    .order('etiqueta')

  if (error) {
    console.error('No se pudieron leer cuentas_sociales:', error)
    return []
  }
  return data ?? []
}

export type SubjobPublicacionResultado = {
  canal_codigo: string
  trabajo_id: string
  estado: string
  mensaje_error?: string
}

export type ResultadoSolicitudPublicacion =
  | { ok: true; solicitudId: string; traceId: string; subjobs: SubjobPublicacionResultado[] }
  | { ok: false; mensaje: string }

export async function crearSolicitudPublicacion(
  propiedadId: string,
  canales: { canal_codigo: string; cuenta_social_id?: string | null }[]
): Promise<ResultadoSolicitudPublicacion> {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { ok: false, mensaje: 'Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo.' }
  }

  // Texto para el campo Descripción del formulario móvil de Marketplace.
  // El título va en su propio campo, por eso se omite aquí (incluirTitulo: false).
  const { data: filaPropiedad, error: errorPropiedad } = await supabase
    .from('propiedades')
    .select(SELECT_PROPIEDAD_CON_MUNICIPIO)
    .eq('id', propiedadId)
    .single()

  if (errorPropiedad || !filaPropiedad) {
    return { ok: false, mensaje: 'No se pudo leer la propiedad para armar el texto de la publicación.' }
  }

  const descripcionMarketplace = generarTextoMarketplace(aPropiedadMarketplace(filaPropiedad), {
    incluirTitulo: false,
  })

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/crear-solicitud-publicacion`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ propiedad_id: propiedadId, canales, descripcion_marketplace: descripcionMarketplace }),
    })

    const data = await res.json()

    if (!res.ok) {
      return { ok: false, mensaje: data?.error ?? 'No se pudo crear la solicitud de publicación' }
    }

    revalidatePath(`/dashboard/propiedades/${propiedadId}`)

    return {
      ok: true,
      solicitudId: data.solicitud_id,
      traceId: data.trace_id,
      subjobs: data.subjobs,
    }
  } catch (err) {
    console.error('Error llamando a crear-solicitud-publicacion:', err)
    return { ok: false, mensaje: 'Error de red al contactar el motor de publicación.' }
  }
}


// ============================================================
// Aprobación humana de una publicación (WAITING_APPROVAL)
// La RLS de trabajos_publicacion decide quién puede actualizar; si no hay
// permiso, el update afecta 0 filas y se informa al usuario.
// ============================================================

export type ResultadoDecision = { ok: true } | { ok: false; mensaje: string }

export async function aprobarPublicacion(trabajoId: string, propiedadId: string): Promise<ResultadoDecision> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { data, error } = await supabase
    .from('trabajos_publicacion')
    .update({ estado: 'APPROVED', aprobado_en: new Date().toISOString() })
    .eq('id', trabajoId)
    .eq('estado', 'WAITING_APPROVAL')
    .gt('expira_en', new Date().toISOString())
    .select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data || data.length === 0) {
    return {
      ok: false,
      mensaje: 'Esta publicación ya no está esperando aprobación (venció, fue cancelada o no tienes permiso).',
    }
  }
  revalidatePath(`/dashboard/propiedades/${propiedadId}`)
  return { ok: true }
}

export async function rechazarPublicacion(trabajoId: string, propiedadId: string): Promise<ResultadoDecision> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { data, error } = await supabase
    .from('trabajos_publicacion')
    .update({
      estado: 'CANCELLED',
      codigo_error: 'REJECTED_BY_USER',
      mensaje_error: 'Rechazada por el asesor antes de publicar.',
      completado_en: new Date().toISOString(),
    })
    .eq('id', trabajoId)
    .eq('estado', 'WAITING_APPROVAL')
    .select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data || data.length === 0) {
    return { ok: false, mensaje: 'Esta publicación ya no está esperando aprobación o no tienes permiso.' }
  }
  revalidatePath(`/dashboard/propiedades/${propiedadId}`)
  return { ok: true }
}


// ============================================================
// Liberar una propiedad bloqueada por un envío PUBLICADO o NEEDS_REVIEW
// Solo administradores. El administrador confirma, por su cuenta, que el
// anuncio ya no existe en Facebook; el CRM no lo comprueba.
// ============================================================

export type ResultadoLiberacion = { ok: true; aviso?: string } | { ok: false; mensaje: string }

export async function liberarEnvioPublicacion(trabajoId: string, propiedadId: string): Promise<ResultadoLiberacion> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  if (perfil?.rol !== 'administrador') {
    return { ok: false, mensaje: 'Solo un administrador puede liberar una propiedad.' }
  }

  const { data: trabajo, error: errorLeer } = await supabase
    .from('trabajos_publicacion')
    .select('id, estado, propiedad_id')
    .eq('id', trabajoId)
    .maybeSingle()
  if (errorLeer) return { ok: false, mensaje: errorLeer.message }
  if (!trabajo || trabajo.propiedad_id !== propiedadId) {
    return { ok: false, mensaje: 'No se encontró ese envío para esta propiedad.' }
  }
  if (!['PUBLICADO', 'NEEDS_REVIEW'].includes(trabajo.estado)) {
    return { ok: false, mensaje: `Este envío está en ${trabajo.estado} y no se puede liberar.` }
  }

  const estadoPrevio = trabajo.estado

  // Borrado real: el envío desaparece del historial junto con su contenido, fotos, intentos y
  // logs (todas esas tablas borran en cascada). trabajos_publicacion no tiene política DELETE
  // para usuarios, por eso se borra con service role, tras comprobar arriba que es administrador.
  const { data, error } = await supabaseAdmin
    .from('trabajos_publicacion')
    .delete()
    .eq('id', trabajoId)
    .eq('propiedad_id', propiedadId)
    .eq('estado', estadoPrevio)
    .select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data || data.length === 0) {
    return { ok: false, mensaje: 'El envío cambió de estado mientras tanto. Recarga la página.' }
  }

  revalidatePath(`/dashboard/propiedades/${propiedadId}`)
  return { ok: true }
}
