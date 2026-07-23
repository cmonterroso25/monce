const PALETA_AGENTES = [
  { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  { bg: 'bg-pink-100', text: 'text-pink-700', dot: 'bg-pink-500' },
  { bg: 'bg-teal-100', text: 'text-teal-700', dot: 'bg-teal-500' },
  { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
]

export function colorParaAgente(agenteId: string | null | undefined) {
  if (!agenteId) return PALETA_AGENTES[0]
  let hash = 0
  for (let i = 0; i < agenteId.length; i++) {
    hash = (hash * 31 + agenteId.charCodeAt(i)) % PALETA_AGENTES.length
  }
  return PALETA_AGENTES[hash]
}
