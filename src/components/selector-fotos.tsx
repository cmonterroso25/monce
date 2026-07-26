'use client'

import { useRef, useState, useEffect } from 'react'

const MAX_ANCHO = 1600
const MAX_ALTO = 1600
const CALIDAD = 0.8

async function comprimirImagen(archivo: File): Promise<File> {
  if (!archivo.type.startsWith('image/')) return archivo

  const bitmap = await createImageBitmap(archivo).catch(() => null)
  if (!bitmap) return archivo

  let { width, height } = bitmap
  if (width > MAX_ANCHO || height > MAX_ALTO) {
    const escala = Math.min(MAX_ANCHO / width, MAX_ALTO / height)
    width = Math.round(width * escala)
    height = Math.round(height * escala)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return archivo
  ctx.drawImage(bitmap, 0, 0, width, height)

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', CALIDAD)
  )
  if (!blob) return archivo

  const nombreBase = archivo.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${nombreBase}.jpg`, { type: 'image/jpeg' })
}

export default function SelectorFotos({ label }: { label: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [optimizando, setOptimizando] = useState(false)
  const [cantidad, setCantidad] = useState(0)

  useEffect(() => {
    const input = inputRef.current
    const form = input?.closest('form')
    if (!form) return
    function alEnviar(e: Event) {
      if (optimizando) {
        e.preventDefault()
        window.alert('Espera a que terminen de optimizarse las fotos antes de guardar.')
      }
    }
    form.addEventListener('submit', alEnviar)
    return () => form.removeEventListener('submit', alEnviar)
  }, [optimizando])

  async function alCambiarArchivos(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? [])
    if (archivos.length === 0) {
      setCantidad(0)
      return
    }

    setOptimizando(true)
    try {
      const comprimidos = await Promise.all(archivos.map(comprimirImagen))
      const dt = new DataTransfer()
      comprimidos.forEach((archivo) => dt.items.add(archivo))
      if (inputRef.current) {
        inputRef.current.files = dt.files
      }
      setCantidad(comprimidos.length)
    } finally {
      setOptimizando(false)
    }
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input
        ref={inputRef}
        type="file"
        name="imagenes"
        accept="image/*"
        multiple
        onChange={alCambiarArchivos}
        disabled={optimizando}
        className="w-full text-sm text-slate-500 file:mr-4 file:rounded file:border-0 file:bg-[#2C3E50] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white file:transition-colors hover:file:bg-[#38B6FF] disabled:opacity-60"
      />
      {optimizando && <p className="mt-2 text-xs text-[#38B6FF]">Optimizando fotos...</p>}
      {!optimizando && cantidad > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {cantidad} foto{cantidad > 1 ? 's' : ''} lista{cantidad > 1 ? 's' : ''} para subir
        </p>
      )}
    </div>
  )
}
