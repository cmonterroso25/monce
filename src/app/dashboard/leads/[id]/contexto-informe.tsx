'use client'
import { createContext, useContext, useState, ReactNode } from 'react'
import type { DetalleCriterios } from '@/lib/informes/etiquetas-criterios'

export type InformeData = {
  id: string
  estado: string
  ruta_pdf: string | null
  resultado_recomendacion: string | null
  resultado_resumen: string | null
  error_mensaje: string | null
  detalle_criterios: DetalleCriterios | null
}

type ContextoInformeTipo = {
  informe: InformeData | null
  setInforme: (informe: InformeData | null) => void
}

const ContextoInforme = createContext<ContextoInformeTipo | null>(null)

export function ProveedorInforme({
  informeInicial,
  children,
}: {
  informeInicial: InformeData | null
  children: ReactNode
}) {
  const [informe, setInforme] = useState<InformeData | null>(informeInicial)
  return (
    <ContextoInforme.Provider value={{ informe, setInforme }}>
      {children}
    </ContextoInforme.Provider>
  )
}

export function useInforme() {
  const ctx = useContext(ContextoInforme)
  if (!ctx) throw new Error('useInforme debe usarse dentro de ProveedorInforme')
  return ctx
}
