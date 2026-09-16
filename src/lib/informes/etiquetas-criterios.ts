// Mapeo de claves de criterios (tal como los devuelve el modelo de análisis
// vía la Edge Function generar-informe) a etiquetas legibles en español.
// Compartido entre el generador de PDF (route.ts) y la UI del CRM
// (estado-informe.tsx) para que ambos muestren exactamente el mismo texto.
// Si se agrega un nuevo criterio en el prompt, agregarlo aquí también.
export const ETIQUETAS_CRITERIOS: Record<string, string> = {
  consistencia_datos: 'Consistencia de datos',
  capacidad_pago: 'Capacidad de pago',
  // Agregados 14/09/2026 junto con las nuevas categorías de documento
  // (antecedentes, RENAS, RTU, patente de comercio). Son condicionales:
  // solo aparecen en la respuesta del modelo si se cargó al menos un
  // documento relevante para ese criterio.
  antecedentes_legales: 'Antecedentes legales',
  formalidad_negocio: 'Formalidad del negocio',
}

export function etiquetaCriterio(clave: string): string {
  return ETIQUETAS_CRITERIOS[clave] ?? clave.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export type DetalleCriterio = {
  cumple: boolean
  detalle: string
}

export type DetalleCriterios = Record<string, DetalleCriterio>
