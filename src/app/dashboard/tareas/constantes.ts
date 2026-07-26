export const ESTADOS_TAREA = ['pendiente', 'completada', 'vencida']
export const ETIQUETAS_ESTADO_TAREA: Record<string, string> = {
  pendiente: 'Pendiente',
  completada: 'Completada',
  vencida: 'Vencida',
}
export const COLORES_ESTADO_TAREA: Record<string, string> = {
  pendiente: 'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700',
  vencida: 'bg-red-100 text-red-700',
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
