export const ESTADOS_TAREA = ['pendiente', 'en_progreso', 'completada', 'cancelada']

export const ETIQUETAS_ESTADO_TAREA: Record<string, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

export const COLORES_ESTADO_TAREA: Record<string, string> = {
  pendiente: 'bg-blue-100 text-blue-700',
  en_progreso: 'bg-yellow-100 text-yellow-700',
  completada: 'bg-green-100 text-green-700',
  cancelada: 'bg-slate-200 text-slate-600',
}

export const PRIORIDADES = ['baja', 'media', 'alta']

export const ETIQUETAS_PRIORIDAD: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
}

export const COLORES_PRIORIDAD: Record<string, string> = {
  baja: 'bg-slate-100 text-slate-600',
  media: 'bg-orange-100 text-orange-700',
  alta: 'bg-red-100 text-red-700',
}
