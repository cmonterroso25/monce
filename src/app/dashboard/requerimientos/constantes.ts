export const ESTADOS_REQUERIMIENTO = ['abierto', 'cerrado']
export const ETIQUETAS_ESTADO_REQUERIMIENTO: Record<string, string> = {
  abierto: 'Abierto',
  cerrado: 'Cerrado',
}
export const COLORES_ESTADO_REQUERIMIENTO: Record<string, string> = {
  abierto: 'bg-blue-100 text-blue-700',
  cerrado: 'bg-slate-100 text-slate-600',
}

export const TIPOS_OPERACION = ['venta', 'renta']
export const ETIQUETAS_TIPO_OPERACION: Record<string, string> = {
  venta: 'Venta',
  renta: 'Renta',
}

// Catálogo de checkboxes para "características deseadas". Lo que no esté
// aquí se captura en el campo libre "Otras características".
export const CARACTERISTICAS_DESEADAS: { value: string; label: string }[] = [
  { value: 'mascotas', label: 'Acepta mascotas' },
  { value: 'closets', label: 'Closets' },
  { value: 'pergola', label: 'Pérgola' },
  { value: 'parqueo_techado', label: 'Parqueo techado' },
  { value: 'piscina', label: 'Piscina' },
  { value: 'gimnasio', label: 'Gimnasio' },
  { value: 'salon_eventos', label: 'Salón de eventos' },
  { value: 'seguridad_24h', label: 'Seguridad 24h' },
  { value: 'cancha_deportiva', label: 'Cancha deportiva' },
  { value: 'area_de_juegos', label: 'Área de juegos' },
  { value: 'amueblado', label: 'Amueblado' },
  { value: 'jardin', label: 'Jardín' },
  { value: 'terraza', label: 'Terraza' },
  { value: 'bodega', label: 'Bodega' },
]
export const ETIQUETAS_CARACTERISTICA: Record<string, string> = Object.fromEntries(
  CARACTERISTICAS_DESEADAS.map((c) => [c.value, c.label])
)
