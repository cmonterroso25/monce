import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { crearMiCuentaSocial, eliminarMiCuentaSocial } from './acciones'

const ETIQUETAS_ESTADO: Record<string, { texto: string; clase: string }> = {
  PENDING_SETUP: { texto: 'Falta conectar la sesión', clase: 'bg-amber-100 text-amber-700' },
  AUTH_REQUIRED: { texto: 'Requiere iniciar sesión de nuevo', clase: 'bg-amber-100 text-amber-700' },
  READY: { texto: 'Lista', clase: 'bg-green-100 text-green-700' },
  BUSY: { texto: 'Publicando ahora', clase: 'bg-blue-100 text-blue-700' },
  LOCKED: { texto: 'Bloqueada', clase: 'bg-red-100 text-red-700' },
  DISABLED: { texto: 'Desactivada', clase: 'bg-slate-100 text-slate-600' },
  ERROR: { texto: 'Con error', clase: 'bg-red-100 text-red-700' },
}

export default async function MisCuentas({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; exito?: string }>
}) {
  const { error, exito } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Solo las cuentas propias, aunque el usuario sea administrador.
  const { data: cuentas } = await supabase
    .from('cuentas_sociales')
    .select('id, plataforma, etiqueta, estado, autenticada_en')
    .eq('asesor_id', user.id)
    .order('creado_en')

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-2xl font-bold text-[#2C3E50]">Mis cuentas</h1>
      <p className="mb-6 text-sm text-slate-500">
        Cuentas de Facebook con las que publicas en Marketplace. Solo tú puedes publicar con ellas.
      </p>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}
      {exito === 'creada' && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          Cuenta agregada. Falta conectar su sesión de Facebook en el Worker.
        </div>
      )}
      {exito === 'eliminada' && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          Cuenta eliminada.
        </div>
      )}

      <div className="mb-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {(cuentas ?? []).length === 0 ? (
          <p className="mb-4 text-sm text-slate-500">Todavía no tienes cuentas registradas.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {(cuentas ?? []).map((cuenta) => {
              const estado = ETIQUETAS_ESTADO[cuenta.estado] ?? {
                texto: cuenta.estado,
                clase: 'bg-slate-100 text-slate-700',
              }
              return (
                <li key={cuenta.id} className="flex items-center justify-between border-b border-gray-100 py-2 text-sm">
                  <span>
                    <span className="font-medium text-[#2C3E50]">{cuenta.etiqueta ?? cuenta.plataforma}</span>
                    <span className="text-slate-500">
                      {' '}· {cuenta.plataforma}
                      {cuenta.autenticada_en
                        ? ` · sesión conectada el ${new Date(cuenta.autenticada_en).toLocaleDateString('es-GT', { timeZone: 'America/Guatemala' })}`
                        : ''}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${estado.clase}`}>{estado.texto}</span>
                    <form action={eliminarMiCuentaSocial}>
                      <input type="hidden" name="cuenta_id" value={cuenta.id} />
                      <button type="submit" className="text-xs text-red-600 hover:underline">
                        Eliminar
                      </button>
                    </form>
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <form action={crearMiCuentaSocial} className="space-y-4 border-t border-slate-100 pt-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nombre de la cuenta</label>
            <input
              name="etiqueta"
              required
              maxLength={60}
              placeholder="Ej. Facebook de Ana"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-slate-400">
            Plataforma: Facebook. La cuenta queda pendiente hasta que se conecte su sesión en el Worker
            (por ahora lo hace el administrador con <code>npm run login</code>). Hasta entonces no aparece
            al publicar.
          </p>
          <button
            type="submit"
            className="rounded bg-[#2C3E50] px-4 py-2 text-sm font-medium text-white hover:bg-[#38B6FF]"
          >
            Agregar cuenta
          </button>
        </form>
      </div>
    </div>
  )
}
