import { supabaseAdmin } from '@/lib/supabase/admin'
import FormularioArrendamientoPublico from './formulario'

export default async function PaginaFormularioArrendamiento({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const { data: solicitud, error: errorConsulta } = await supabaseAdmin
    .from('solicitudes_arrendamiento')
    .select('id, estado')
    .eq('id', token)
    .maybeSingle()


  if (!solicitud) {
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

  return <FormularioArrendamientoPublico token={token} />
}
