'use server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function numeroOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  const n = Number(valor)
  return Number.isNaN(n) ? null : n
}

function textoOpcional(valor: FormDataEntryValue | null) {
  if (!valor || valor === '') return null
  return valor as string
}

// Deja solo dígitos y, si el número quedó con el código de país de
// Guatemala pegado (+502 u 502 antepuesto a un número de 8 dígitos),
// lo quita. Así "+502 3227-5260", "3227-5260" y "32275260" se
// consideran el mismo teléfono al comparar duplicados.
function normalizarTelefono(telefono: string): string {
  const soloDigitos = telefono.replace(/\D/g, '')
  if (soloDigitos.startsWith('502') && soloDigitos.length > 8) {
    return soloDigitos.slice(3)
  }
  return soloDigitos
}

// Busca si el teléfono (normalizado) ya pertenece a otro contacto de la
// misma organización, sin importar el agente asignado. Usa supabaseAdmin
// a propósito: la política RLS de `contactos` solo deja ver los contactos
// del propio agente (o todos si es admin), así que con el cliente normal
// nunca se detectaría un duplicado que pertenece a otro agente.
async function buscarDuplicadoTelefono(
  telefono: string,
  organizationId: string,
  contactoIdExcluir?: string
): Promise<{ mensaje: string } | null> {
  const telefonoNormalizado = normalizarTelefono(telefono)
  if (!telefonoNormalizado) return null

  const { data: candidatos, error } = await supabaseAdmin
    .from('contactos')
    .select('id, nombre_completo, telefono, agente_asignado')
    .eq('organization_id', organizationId)
    .not('telefono', 'is', null)

  if (error) {
    // No bloqueamos el guardado por un fallo de la validación en sí
    // (podría ser un problema de GRANTs de service_role, ver comentario
    // en src/lib/supabase/admin.ts), pero nunca en silencio.
    console.error('--- ERROR AL BUSCAR DUPLICADOS DE TELEFONO (supabaseAdmin) ---', error)
    return null
  }

  const encontrado = (candidatos ?? []).find(
    (c) =>
      c.id !== contactoIdExcluir &&
      c.telefono &&
      normalizarTelefono(c.telefono) === telefonoNormalizado
  )

  if (!encontrado) return null

  let nombreAgente = 'otro agente'
  if (encontrado.agente_asignado) {
    const { data: perfilAgente, error: errorPerfil } = await supabaseAdmin
      .from('perfiles')
      .select('nombre_completo')
      .eq('id', encontrado.agente_asignado)
      .maybeSingle()

    if (errorPerfil) {
      console.error('--- ERROR AL BUSCAR NOMBRE DEL AGENTE (supabaseAdmin) ---', errorPerfil)
    } else if (perfilAgente?.nombre_completo) {
      nombreAgente = perfilAgente.nombre_completo
    }
  }

  return {
    mensaje: `Ese teléfono ya pertenece a un contacto de ${nombreAgente} (${encontrado.nombre_completo}). Verifica antes de continuar.`,
  }
}

export async function crearContacto(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const organizationId = perfil?.organization_id

  const telefono = textoOpcional(formData.get('telefono'))
  if (!telefono) {
    redirect(`/dashboard/contactos/nuevo?error=${encodeURIComponent('El teléfono es obligatorio.')}`)
  }

  const duplicado = await buscarDuplicadoTelefono(telefono!, organizationId)
  if (duplicado) {
    redirect(`/dashboard/contactos/nuevo?error=${encodeURIComponent(duplicado.mensaje)}`)
  }

  const zonasTexto = textoOpcional(formData.get('zonas_interes'))
  const zonasInteres = zonasTexto
    ? zonasTexto.split(',').map((z) => z.trim()).filter(Boolean)
    : null

  const { data: contacto, error } = await supabase
    .from('contactos')
    .insert({
      nombre_completo: formData.get('nombre_completo') as string,
      correo: textoOpcional(formData.get('correo')),
      telefono,
      tipo_contacto: textoOpcional(formData.get('tipo_contacto')),
      origen: textoOpcional(formData.get('origen')),
      estado: (formData.get('estado') as string) || 'nuevo',
      presupuesto_min: numeroOpcional(formData.get('presupuesto_min')),
      presupuesto_max: numeroOpcional(formData.get('presupuesto_max')),
      zonas_interes: zonasInteres,
      tipo_propiedad_interes: textoOpcional(formData.get('tipo_propiedad_interes')),
      agente_asignado: textoOpcional(formData.get('agente_asignado')) || user.id,
      organization_id: organizationId,
    })
    .select()
    .single()

  if (error) {
    console.error('--- ERROR AL CREAR CONTACTO ---', error)
    redirect(`/dashboard/contactos/nuevo?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/contactos')
  redirect(`/dashboard/contactos/${contacto.id}`)
}

export async function actualizarContacto(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const contactoId = formData.get('contacto_id') as string

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const telefono = textoOpcional(formData.get('telefono'))
  if (!telefono) {
    redirect(`/dashboard/contactos/${contactoId}/editar?error=${encodeURIComponent('El teléfono es obligatorio.')}`)
  }

  const duplicado = await buscarDuplicadoTelefono(telefono!, perfil?.organization_id, contactoId)
  if (duplicado) {
    redirect(`/dashboard/contactos/${contactoId}/editar?error=${encodeURIComponent(duplicado.mensaje)}`)
  }

  const zonasTexto = textoOpcional(formData.get('zonas_interes'))
  const zonasInteres = zonasTexto
    ? zonasTexto.split(',').map((z) => z.trim()).filter(Boolean)
    : null

  const { error } = await supabase
    .from('contactos')
    .update({
      nombre_completo: formData.get('nombre_completo') as string,
      correo: textoOpcional(formData.get('correo')),
      telefono,
      tipo_contacto: textoOpcional(formData.get('tipo_contacto')),
      origen: textoOpcional(formData.get('origen')),
      estado: (formData.get('estado') as string) || 'nuevo',
      presupuesto_min: numeroOpcional(formData.get('presupuesto_min')),
      presupuesto_max: numeroOpcional(formData.get('presupuesto_max')),
      zonas_interes: zonasInteres,
      tipo_propiedad_interes: textoOpcional(formData.get('tipo_propiedad_interes')),
      agente_asignado: textoOpcional(formData.get('agente_asignado')),
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', contactoId)

  if (error) {
    console.error('--- ERROR AL ACTUALIZAR CONTACTO ---', error)
    redirect(`/dashboard/contactos/${contactoId}/editar?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard/contactos')
  revalidatePath(`/dashboard/contactos/${contactoId}`)
  redirect(`/dashboard/contactos/${contactoId}`)
}

export async function actualizarEstadoContacto(contactoId: string, nuevoEstado: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('contactos')
    .update({ estado: nuevoEstado, actualizado_en: new Date().toISOString() })
    .eq('id', contactoId)

  revalidatePath('/dashboard/contactos')
  revalidatePath(`/dashboard/contactos/${contactoId}`)

  if (error) return { ok: false, mensaje: error.message }
  return { ok: true, mensaje: null }
}
