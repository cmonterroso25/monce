export const ETAPAS = ['nuevo', 'contactado', 'interesado', 'visita', 'negociacion', 'cerrado', 'perdido']

export const ETIQUETAS_ETAPA: Record<string, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  interesado: 'Interesado',
  visita: 'Visita',
  negociacion: 'Negociación',
  cerrado: 'Cerrado',
  perdido: 'Perdido',
}

export const COLORES_ETAPA: Record<string, string> = {
  nuevo: 'bg-blue-100 text-blue-700',
  contactado: 'bg-indigo-100 text-indigo-700',
  interesado: 'bg-purple-100 text-purple-700',
  visita: 'bg-yellow-100 text-yellow-700',
  negociacion: 'bg-orange-100 text-orange-700',
  cerrado: 'bg-green-100 text-green-700',
  perdido: 'bg-red-100 text-red-700',
}

export const TIPOS_ACTIVIDAD = ['llamada', 'whatsapp', 'correo', 'visita', 'nota']

export const ETIQUETAS_ACTIVIDAD: Record<string, string> = {
  llamada: 'Llamada',
  whatsapp: 'WhatsApp',
  correo: 'Correo',
  visita: 'Visita',
  nota: 'Nota',
}
