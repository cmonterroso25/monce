export const ETAPAS = ['contacto_inicial', 'visita_agendada', 'visita_realizada', 'reservada', 'ganada', 'perdida']

export const ETIQUETAS_ETAPA: Record<string, string> = {
  contacto_inicial: 'Contacto inicial',
  visita_agendada: 'Visita agendada',
  visita_realizada: 'Visita realizada',
  reservada: 'Reservada',
  ganada: 'Ganada',
  perdida: 'Perdida',
}

export const COLORES_ETAPA: Record<string, string> = {
  contacto_inicial: 'bg-blue-100 text-blue-700',
  visita_agendada: 'bg-yellow-100 text-yellow-700',
  visita_realizada: 'bg-indigo-100 text-indigo-700',
  reservada: 'bg-purple-100 text-purple-700',
  ganada: 'bg-green-100 text-green-700',
  perdida: 'bg-red-100 text-red-700',
}

export const TIPOS_ACTIVIDAD = ['llamada', 'cita', 'video_llamada', 'reunion']

export const ETIQUETAS_ACTIVIDAD: Record<string, string> = {
  llamada: 'Llamada',
  cita: 'Cita',
  video_llamada: 'Video llamada',
  reunion: 'Reunión',
}
