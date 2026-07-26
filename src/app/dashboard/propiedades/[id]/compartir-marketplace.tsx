'use client'

import { useState } from 'react'
import { Store, X, Copy, Check } from 'lucide-react'
import { REQUISITOS_RENTA, type CodigoRequisitosRenta } from '../requisitos-renta'

const EMOJI_TIPO: Record<string, string> = {
  casa: '🛏️',
  apartamento: '🏢',
  terreno: '🌳',
  bodega: '📦',
  oficina: '💼',
  ofibodega: '🏭',
  finca: '🌾',
  granja: '🐄',
}

type PropiedadMarketplace = {
  titulo: string
  tipo_operacion: string | null
  tipo_propiedad: string | null
  condominio: string | null
  sector: string | null
  zona: string | null
  ciudad: string | null
  municipioNombre: string | null
  area_construccion_m2: number | null
  area_terreno_m2: number | null
  dormitorios: number | null
  banos: number | null
  sala_familiar: string | null
  habitacion_servicio: string | null
  lavanderia: string | null
  jardin: string | null
  parqueos: number | null
  extras: string | null
  precio: number | null
  moneda: string | null
  iusi: number | null
  mantenimiento: number | null
  mascota: string | null
  requisitos_renta: string | null
}

function generarTextoMarketplace(p: PropiedadMarketplace) {
  const emojiTipo = EMOJI_TIPO[p.tipo_propiedad ?? ''] ?? '🏠'
  const negocio = p.tipo_operacion === 'renta' ? 'RENTA' : 'VENTA'
  const tipoLabel = (p.tipo_propiedad ?? 'PROPIEDAD').toUpperCase()

  const ubicacion = [p.condominio, p.sector, p.zona, p.municipioNombre, p.ciudad]
    .filter(Boolean)
    .join(', ')

  const lineasDetalle = [
    p.area_construccion_m2 && `▪️ Construcción: ${p.area_construccion_m2} m²`,
    p.area_terreno_m2 && `▪️ Terreno: ${p.area_terreno_m2} m²`,
  ].filter(Boolean)

  const lineasDistribucion = [
    p.dormitorios && `• ${p.dormitorios} Dormitorios`,
    p.banos && `• ${p.banos} Baños`,
    '• Sala | Comedor | Cocina',
    p.sala_familiar && '• Sala familiar',
    p.habitacion_servicio && '• Cuarto de servicio',
    p.lavanderia && '• Área de lavandería',
    p.jardin && '• Jardín',
    p.parqueos && `• Parqueo para ${p.parqueos} vehículo${p.parqueos > 1 ? 's' : ''} 🚗`,
  ].filter(Boolean)

  const textoMantenimiento =
    !p.mantenimiento || Number(p.mantenimiento) === 0
      ? '🛠️ Mantenimiento incluido'
      : `🛠️ Mantenimiento: ${p.moneda ?? 'Q'} ${Number(p.mantenimiento).toLocaleString()}`

  const textoMascota = p.mascota === 'Si' ? '🐾 Se aceptan mascotas' : null

  const requisitos =
    p.tipo_operacion === 'renta' && p.requisitos_renta
      ? REQUISITOS_RENTA[p.requisitos_renta as CodigoRequisitosRenta]
      : null

  const lineasRequisitos = requisitos
    ? [
        '📋 Requisitos para aplicar:',
        ...requisitos.titular.map((r) => `• ${r}`),
        `• Contrato mínimo: ${requisitos.contratoMinimo}`,
        `• Depósito: ${requisitos.deposito}`,
      ]
    : []

  const bloques = [
    `${negocio} DE ${tipoLabel}${ubicacion ? ` - ${ubicacion}` : ''}`,
    lineasDetalle.length > 0 && `📐 Detalles de la propiedad:\n${lineasDetalle.join('\n')}`,
    lineasDistribucion.length > 0 && `${emojiTipo} Distribución:\n${lineasDistribucion.join('\n')}`,
    p.extras && `✨ Extras:\n${p.extras}`,
    textoMascota,
    lineasRequisitos.length > 0 && lineasRequisitos.join('\n'),
    p.precio && `💰 PRECIO DE ${negocio}: ${p.moneda ?? 'Q'} ${Number(p.precio).toLocaleString()}`,
    p.iusi && `📑 IUSI: ${p.moneda ?? 'Q'} ${Number(p.iusi).toLocaleString()}`,
    textoMantenimiento,
  ].filter(Boolean)

  return bloques.join('\n\n')
}

export default function CompartirMarketplace(propiedad: PropiedadMarketplace) {
  const [abierto, setAbierto] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const texto = generarTextoMarketplace(propiedad)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 3000)
    } catch {
      // silencioso: el usuario puede seleccionar y copiar manualmente desde el textarea
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-2 rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
      >
        <Store size={16} />
        Copiar para Marketplace
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setAbierto(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#2C3E50]">Texto para Marketplace</h2>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <textarea
              readOnly
              value={texto}
              rows={16}
              className="w-full rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />

            <button
              type="button"
              onClick={copiar}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              {copiado ? <Check size={16} /> : <Copy size={16} />}
              {copiado ? 'Copiado' : 'Copiar texto'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
