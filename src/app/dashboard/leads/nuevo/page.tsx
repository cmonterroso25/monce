import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { crearLead } from '../acciones'

export default async function NuevoLead({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; contacto_id?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: contactos }, { data: propiedades }, { data: perfiles }] = await Promise.all([
    supabase.from('contactos').select('id, nombre_completo, telefono').order('nombre_completo'),
    supabase.from('propiedades').select('id, titulo, codigo').order('titulo'),
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
  ])

  const contactoPreseleccionado = params.contacto_id
    ? contactos?.find((c) => c.id === params.contacto_id)
    : null

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-[#2C3E50]">Nuevo lead</h1>

      {params.error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {params.error}
        </div>
      )}

      <form action={crearLead} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Contacto</label>
          {contactoPreseleccionado ? (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {contactoPreseleccionado.nombre_completo}
              <input type="hidden" name="contacto_id" value={contactoPreseleccionado.id} />
            </div>
          ) : (
            <>
              <select name="contacto_id" required className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="">Selecciona un contacto...</option>
                {(contactos ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre_completo} {c.telefono ? `— ${c.telefono}` : ''}
                  </option>
                ))}
              </select>
              <Link href="/dashboard/contactos/nuevo" className="mt-1 inline-block text-xs text-[#38B6FF] hover:underline">
                ¿No está en la lista? Crear contacto nuevo
              </Link>
            </>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Propiedad de interés (opcional)</label>
          <select name="propiedad_id" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="">Sin propiedad específica</option>
            {(propiedades ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo ? `[${p.codigo}] ` : ''}{p.titulo}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Agente responsable</label>
          <select name="agente_id" defaultValue={user?.id} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            {(perfiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.nombre_completo}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF]">
          Crear lead
        </button>
      </form>
    </div>
  )
}
