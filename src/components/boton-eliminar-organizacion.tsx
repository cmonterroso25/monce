'use client'

import { eliminarOrganizacion } from '@/app/dashboard/configuracion/acciones'

export default function BotonEliminarOrganizacion({
  organizacionId,
  organizacionNombre,
}: {
  organizacionId: string
  organizacionNombre: string
}) {
  function confirmarEnvio(e: React.FormEvent<HTMLFormElement>) {
    const ok = confirm(
      `¿Eliminar la organización "${organizacionNombre}"? Sus agentes quedarán desactivados (no se borran sus cuentas). Esta acción se revierte solo manualmente desde la base de datos.`
    )
    if (!ok) e.preventDefault()
  }

  return (
    <form action={eliminarOrganizacion} onSubmit={confirmarEnvio}>
      <input type="hidden" name="organization_id" value={organizacionId} />
      <button type="submit" className="text-xs font-medium text-red-600 hover:text-red-800">
        Eliminar
      </button>
    </form>
  )
}
