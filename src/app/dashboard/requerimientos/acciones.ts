'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { notificarWhatsapp, obtenerChatIdGrupo } from '@/lib/whatsapp/notificar'
import { ETIQUETAS_TIPO_OPERACION, ETIQUETAS_CARACTERISTICA } from './constantes'
import { TIPOS_PROPIEDAD } from '@/lib/tipos-propiedad'

const ETIQUETA_TIPO_PROPIEDAD: Record<string, string> = Object.fromEntries(
  TIPOS_PROPIEDAD.map((t) => [t.value, t.label])
)

function textoOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  return valor as string
}

function numeroOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  const n = Number(valor)
  return Number.isNaN(n) ? null : n
}

function datosDesdeFormulario(formData: FormData) {
  return {
    contacto_id: formData.get('contacto_id') as string,
    tipo_operacion: textoOpcional(formData.get('tipo_operacion')),
    tipo_propiedad: textoOpcional(formData.get('tipo_propiedad')),
    precio_min: numeroOpcional(formData.get('precio_min')),
    precio_max: numeroOpcional(formData.get('precio_max')),
    moneda: (formData.get('moneda') as string) || 'GTQ',
    zona: textoOpcional(formData.get('zona')),
    sector: textoOpcional(formData.get('sector')),
    municipio_id: textoOpcional(formData.get('municipio_id')),
    dormitorios_min: numeroOpcional(formData.get('dormitorios_min')),
    banos_min: numeroOpcional(formData.get('banos_min')),
    niveles_min: numeroOpcional(formData.get('niveles_min')),
    parqueos_min: numeroOpcional(formData.get('parqueos_min')),
    area_min: numeroOpcional(formData.get('area_min')),
    caracteristicas_deseadas: formData.getAll('caracteristicas_deseadas') as string[],
    otras_caracteristicas: textoOpcional(formData.get('otras_caracteristicas')),
    notas: textoOpcional(formData.get('notas')),
  }
}

export async function crearRequerimiento(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id, nombre_completo')
    .eq('id', user.id)
    .single()

  const datos = datosDesdeFormulario(formData)

  const { error } = await supabase.from('requerimientos').insert({
    ...datos,
    organization_id: perfil?.organization_id,
    creado_por: user.id,
  })

  if (error) {
    console.error('--- ERROR AL CREAR REQUERIMIENTO ---', error)
    redirect(`/dashboard/requerimientos/nuevo?contacto_id=${datos.contacto_id}&error=${encodeURIComponent(error.message)}`)
  }

  if (perfil?.organization_id) {
    const [{ data: contacto }, { data: municipio }] = await Promise.all([
      supabase.from('contactos').select('nombre_completo').eq('id', datos.contacto_id).maybeSingle(),
      datos.municipio_id
        ? supabase.from('municipios').select('nombre').eq('id', datos.municipio_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const chatIdCitas = await obtenerChatIdGrupo(supabase, perfil.organization_id, 'citas')
    if (chatIdCitas) {
      const ubicacion = [datos.zona ? `Zona ${datos.zona}` : null, datos.sector, municipio?.nombre].filter(Boolean).join(' · ')
      const presupuesto =
        datos.precio_min || datos.precio_max
          ? `${datos.moneda} ${datos.precio_min ? Number(datos.precio_min).toLocaleString() : '0'}${datos.precio_max ? ` - ${Number(datos.precio_max).toLocaleString()}` : '+'}`
          : null
      const distribucion = [
        datos.dormitorios_min ? `${datos.dormitorios_min}+ hab` : null,
        datos.banos_min ? `${datos.banos_min}+ baños` : null,
        datos.niveles_min ? `${datos.niveles_min}+ niveles` : null,
        datos.parqueos_min ? `${datos.parqueos_min}+ parqueos` : null,
        datos.area_min ? `${datos.area_min}+ m²` : null,
      ].filter(Boolean).join(' · ')
      const caracteristicas = datos.caracteristicas_deseadas.map((c) => ETIQUETAS_CARACTERISTICA[c] ?? c)
      if (datos.otras_caracteristicas) caracteristicas.push(datos.otras_caracteristicas)

      const mensaje = [
        `📋 *Nuevo requerimiento registrado*`,
        `👤 Cliente: ${contacto?.nombre_completo ?? 'Contacto sin nombre'}`,
        `🧑‍💼 Agente: ${perfil.nombre_completo ?? 'Sin asignar'}`,
        `🏠 Busca: ${[datos.tipo_operacion ? ETIQUETAS_TIPO_OPERACION[datos.tipo_operacion] : null, datos.tipo_propiedad ? ETIQUETA_TIPO_PROPIEDAD[datos.tipo_propiedad] : null].filter(Boolean).join(' · ') || 'Cualquier tipo'}`,
        presupuesto ? `💰 Presupuesto: ${presupuesto}` : null,
        ubicacion ? `📍 Ubicación: ${ubicacion}` : null,
        distribucion ? `📐 ${distribucion}` : null,
        caracteristicas.length > 0 ? `✅ Características: ${caracteristicas.join(', ')}` : null,
        datos.notas ? `📝 ${datos.notas}` : null,
      ].filter(Boolean).join('\n')

      await notificarWhatsapp({
        chatId: chatIdCitas,
        mensaje,
        organizationId: perfil.organization_id,
        tipoNotificacion: 'nuevo_requerimiento',
        agenteId: user.id,
        contactoId: datos.contacto_id,
      })
    }
  }

  revalidatePath('/dashboard/requerimientos')
  revalidatePath(`/dashboard/contactos/${datos.contacto_id}`)
  redirect(`/dashboard/contactos/${datos.contacto_id}`)
}

export async function actualizarRequerimiento(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requerimientoId = formData.get('requerimiento_id') as string
  const datos = datosDesdeFormulario(formData)

  const { error } = await supabase
    .from('requerimientos')
    .update({ ...datos, actualizado_en: new Date().toISOString() })
    .eq('id', requerimientoId)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR REQUERIMIENTO ---', error)
    redirect(`/dashboard/requerimientos/${requerimientoId}/editar?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/requerimientos')
  revalidatePath(`/dashboard/contactos/${datos.contacto_id}`)
  redirect(`/dashboard/contactos/${datos.contacto_id}`)
}

export async function eliminarRequerimiento(requerimientoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'No autenticado' }

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle()
  const esAdmin = miPerfil?.rol === 'administrador'

  if (!esAdmin) {
    return { ok: false, mensaje: 'Solo un administrador puede eliminar requerimientos.' }
  }

  const { data: requerimiento } = await supabase
    .from('requerimientos')
    .select('contacto_id')
    .eq('id', requerimientoId)
    .maybeSingle()

  if (!requerimiento) return { ok: false, mensaje: 'Requerimiento no encontrado.' }

  const { error } = await supabase.from('requerimientos').delete().eq('id', requerimientoId)

  revalidatePath('/dashboard/requerimientos')
  revalidatePath(`/dashboard/contactos/${requerimiento.contacto_id}`)

  if (error) return { ok: false, mensaje: error.message }
  return { ok: true, mensaje: null }
}
