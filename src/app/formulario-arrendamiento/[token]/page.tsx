import { createClient } from '@/lib/supabase/server'
import FormularioArrendamientoPublico from './formulario'

type SolicitudArrendamientoPublica = {
  estado: string
  vencido: boolean
}

export default async function PaginaFormularioArrendamiento({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()
  const { data: solicitudRaw, error } = await supabase
    .rpc('obtener_solicitud_arrendamiento_publica', { token })
    .maybeSingle()
  const solicitud = solicitudRaw as SolicitudArrendamientoPublica | null
  if (error || !solicitud) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p className="max-w-sm text-center text-sm text-slate-500">
          Este link no es válido. Solicita uno nuevo a tu agente.
        </p>
      </div>
    )
  }
  if (solicitud.estado === 'completado') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p className="max-w-sm text-center text-sm text-slate-500">
          Esta solicitud ya fue enviada. Si necesitas corregir algo, contacta a tu agente.
        </p>
      </div>
    )
  }
  if (solicitud.vencido) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p className="max-w-sm text-center text-sm text-slate-500">
          Este link venció. Solicita uno nuevo a tu agente.
        </p>
      </div>
    )
  }
  return <FormularioArrendamientoPublico token={token} />
}
