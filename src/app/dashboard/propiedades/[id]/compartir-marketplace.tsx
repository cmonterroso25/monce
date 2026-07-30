'use client'

import { useState } from 'react'
import { Store, X, Copy, Check } from 'lucide-react'
import { generarTextoMarketplace, type PropiedadMarketplace } from '@/lib/whatsapp/mensaje-marketplace'

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
