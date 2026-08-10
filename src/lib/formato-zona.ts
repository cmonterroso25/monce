// Formatea el campo "zona" para mostrarlo en textos: si el agente solo
// guardó el número ("15"), antepone la palabra "Zona" ("Zona 15"). Si el
// valor ya incluye "zona" (en cualquier capitalización), se respeta tal
// cual para no duplicarla.
export function formatearZona(zona: string | null | undefined): string | null {
  if (!zona) return null
  const valor = zona.trim()
  if (valor === '') return null
  if (/zona/i.test(valor)) return valor
  return `Zona ${valor}`
}
