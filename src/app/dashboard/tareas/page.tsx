import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import CambiarEstadoTarea from './[id]/cambiar-estado'
import {
  ETIQUETAS_ESTADO_TAREA,
  COLORES_ESTADO_TAREA,
  ETIQUETAS_PRIORIDAD,
  COLORES_PRIORIDAD,
} from './constantes'

type Tarea = {
  id: string
  titulo: string
  fecha_limite: string | null
  estado: string
  prioridad: string
  contacto: { nombre_completo: string } | null
  lead: { id: string } | null
  agente: { nombre_completo: string } | null
}

const GRID_COLS = 'grid-cols-[110px_120px_90px_1.8fr_1fr_130px]'

export default async function ListadoTareas() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: miPerfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle()
  const esAdmin = miPerfil?.rol === 'administrador'

  const { data: tareasData } = await supabase
    .from('tareas')
    .select('*, contacto:contactos(nombre_completo), lead:leads(id), agente:perfiles!asignado_a(nombre_completo)')

  const tareas = (tareasData ?? []) as unknown as Tarea[]

  const ahora = new Date()
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  const finHoy = new Date(inicioHoy.getTime() + 24 * 60 * 60 * 1000)

  function estadoFecha(t: Tarea) {
    if (t.estado === 'completada' || t.estado === 'vencida') return 4
    if (!t.fecha_limite) return 3
    const f = new Date(t.fecha_limite)
    if (f < inicioHoy) return 0
    if (f < finHoy) return 1
    return 2
  }

  const ordenadas = [...tareas].sort((a, b) => {
    const diff = estadoFecha(a) - estadoFecha(b)
    if (diff !== 0) return diff
    const fa = a.fecha_limite ?? ''
    const fb = b.fecha_limite ?? ''
    return fa.localeCompare(fb)
  })

  const pendientes = tareas.filter((t) => t.estado !== 'completada' && t.estado !== 'vencida').length

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#2C3E50] sm:text-2xl">Tareas</h1>
          <p className="text-sm text-slate-500">
            {pendientes === 0 ? 'No tienes tareas pendientes.' : `${pendientes} tarea(s) pendiente(s).`}
          </p>
        </div>
        <Link
          href="/dashboard/tareas/nuevo"
          className="rounded bg-[#2C3E50] px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-[#38B6FF]"
        >
          + Nueva tarea
        </Link>
      </div>

      {ordenadas.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">Aún no hay tareas registradas.</p>
      )}

      {ordenadas.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[900px]">
            <div
              className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500`}
            >
              <div>Fecha límite</div>
              <div>Prioridad</div>
              <div></div>
              <div>Título</div>
              <div>{esAdmin ? 'Agente' : 'Relacionado'}</div>
              <div className="text-right">Estado</div>
            </div>

            {ordenadas.map((t) => (
              <div
                key={t.id}
                className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-100 px-3 py-2 transition hover:bg-slate-50 last:border-b-0`}
              >
                <div className="text-sm text-slate-600">
                  {t.fecha_limite
                    ? new Date(t.fecha_limite).toLocaleDateString('es-GT', { dateStyle: 'medium' })
                    : '—'}
                </div>
                <div>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${COLORES_PRIORIDAD[t.prioridad]}`}>
                    {ETIQUETAS_PRIORIDAD[t.prioridad] ?? t.prioridad}
                  </span>
                </div>
                <div />
                <div className="min-w-0">
                  <Link href={`/dashboard/tareas/${t.id}/editar`} className="truncate text-sm font-semibold text-[#2C3E50] hover:text-[#38B6FF]">
                    {t.titulo}
                  </Link>
                  {t.contacto?.nombre_completo && (
                    <p className="truncate text-xs text-slate-400">{t.contacto.nombre_completo}</p>
                  )}
                </div>
                <div className="truncate text-sm text-slate-600">
                  {esAdmin ? (t.agente?.nombre_completo ?? '—') : (t.lead ? 'Lead vinculado' : '—')}
                </div>
                <div className="flex justify-end">
                  <CambiarEstadoTarea tareaId={t.id} estadoActual={t.estado} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
