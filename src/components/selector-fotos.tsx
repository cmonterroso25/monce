'use client'

import { useRef, useState, useEffect } from 'react'
import { Star, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'

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

type FotoLocal = {
  id: string
  file: File
  previewUrl: string
}

export default function SelectorFotos({ label }: { label: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [optimizando, setOptimizando] = useState(false)
  const [fotos, setFotos] = useState<FotoLocal[]>([])

  // Bloquea el submit del formulario mientras se están optimizando fotos.
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

  // Cada vez que cambia el estado local (nuevas fotos, reorden, portada,
  // eliminación), reconstruye el input.files real para que quede en el
  // mismo orden que se ve en pantalla. BotonGuardarPropiedad lee el
  // FormData de este input y decide la portada según qué archivo quede
  // en la posición 0 del arreglo — por eso este sync es lo único que
  // hace falta para que "portada" y "orden" funcionen sin tocar el
  // backend.
  useEffect(() => {
    if (!inputRef.current) return
    const dt = new DataTransfer()
    fotos.forEach((f) => dt.items.add(f.file))
    inputRef.current.files = dt.files
  }, [fotos])

  // Libera las URLs de vista previa al desmontar el componente.
  useEffect(() => {
    return () => {
      fotos.forEach((f) => URL.revokeObjectURL(f.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function alCambiarArchivos(e: React.ChangeEvent<HTMLInputElement>) {
    const archivosNuevos = Array.from(e.target.files ?? [])
    if (archivosNuevos.length === 0) return
    setOptimizando(true)
    try {
      const comprimidos = await Promise.all(archivosNuevos.map(comprimirImagen))
      const nuevasFotos: FotoLocal[] = comprimidos.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }))
      // Se agregan a lo que ya había seleccionado (no se reemplaza),
      // para poder abrir el diálogo de archivos varias veces.
      setFotos((prev) => [...prev, ...nuevasFotos])
    } finally {
      setOptimizando(false)
      // Limpia el valor del input nativo para poder volver a elegir
      // archivos (incluso los mismos) sin que el navegador lo ignore.
      // Lo que realmente se envía al hacer submit lo controla el
      // useEffect de arriba, basado en el estado `fotos`.
      if (e.target) e.target.value = ''
    }
  }

  function manejarPortada(id: string) {
    setFotos((prev) => {
      const foto = prev.find((f) => f.id === id)
      if (!foto) return prev
      return [foto, ...prev.filter((f) => f.id !== id)]
    })
  }

  function manejarEliminar(id: string) {
    setFotos((prev) => {
      const foto = prev.find((f) => f.id === id)
      if (foto) URL.revokeObjectURL(foto.previewUrl)
      return prev.filter((f) => f.id !== id)
    })
  }

  function manejarMover(id: string, direccion: 'izquierda' | 'derecha') {
    setFotos((prev) => {
      const index = prev.findIndex((f) => f.id === id)
      const nuevoIndex = direccion === 'izquierda' ? index - 1 : index + 1
      if (index === -1 || nuevoIndex < 0 || nuevoIndex >= prev.length) return prev
      const copia = [...prev]
      ;[copia[index], copia[nuevoIndex]] = [copia[nuevoIndex], copia[index]]
      return copia
    })
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

      {!optimizando && fotos.length > 0 && (
        <>
          <p className="mb-2 mt-3 text-xs text-slate-500">
            {fotos.length} foto{fotos.length > 1 ? 's' : ''} lista{fotos.length > 1 ? 's' : ''} para subir.
            La marcada con la estrella será la portada.
          </p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {fotos.map((foto, index) => (
              <div
                key={foto.id}
                className={`group relative overflow-hidden rounded-lg border ${
                  index === 0 ? 'border-[#38B6FF] ring-2 ring-[#38B6FF]/30' : 'border-slate-200'
                }`}
              >
                <img src={foto.previewUrl} alt="" className="h-24 w-full object-cover" />

                {index === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-[#38B6FF] px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Portada
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-1 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => manejarMover(foto.id, 'izquierda')}
                    className="rounded p-1 text-white disabled:opacity-30"
                    title="Mover a la izquierda"
                  >
                    <ChevronLeft size={14} />
                  </button>

                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => manejarPortada(foto.id)}
                    className="rounded p-1 text-white disabled:opacity-30"
                    title="Hacer portada"
                  >
                    <Star size={14} fill={index === 0 ? 'currentColor' : 'none'} />
                  </button>

                  <button
                    type="button"
                    onClick={() => manejarEliminar(foto.id)}
                    className="rounded p-1 text-red-300 hover:text-red-200"
                    title="Quitar foto"
                  >
                    <Trash2 size={14} />
                  </button>

                  <button
                    type="button"
                    disabled={index === fotos.length - 1}
                    onClick={() => manejarMover(foto.id, 'derecha')}
                    className="rounded p-1 text-white disabled:opacity-30"
                    title="Mover a la derecha"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
