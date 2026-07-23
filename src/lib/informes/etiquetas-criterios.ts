// Mapeo de claves de criterios (tal como los devuelve el modelo de análisis
// vía n8n) a etiquetas legibles en español. Compartido entre el generador
// de PDF (route.ts) y la UI del CRM (estado-informe.tsx) para que ambos
// muestren exactamente el mismo texto. Si se agrega un nuevo criterio en
// el prompt de n8n, agregarlo aquí también.
export const ETIQUETAS_CRITERIOS: Record<string, string> = {
  consistencia_datos: 'Consistencia de datos',
  capacidad_pago: 'Capacidad de pago',
}

export function etiquetaCriterio(clave: string): string {
  return ETIQUETAS_CRITERIOS[clave] ?? clave.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export type DetalleCriterio = {
  cumple: boolean
  detalle: string
}

export type DetalleCriterios = Record<string, DetalleCriterio>
