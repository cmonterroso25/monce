'use client'
import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react'

// Se usa además de canShare() para decidir si se ofrece la hoja de
// compartir nativa. canShare() por sí solo ya no es suficiente: navegadores
// de escritorio (ej. Safari/macOS reciente) también devuelven true ahí,
// lo que hacía aparecer el share sheet nativo de macOS (AirDrop/Mail/
// Mensajes) en vez de descargar el .zip a la carpeta Descargas como se
// espera en escritorio. Se detecta por capacidad de puntero (touch) en vez
// de por user-agent/SO, que es frágil (ej. Brave altera esos datos por
// protección de fingerprinting).
function esDispositivoTactil(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches
}

export default function Galeria({
  imagenes,
  titulo,
}: {
  imagenes: { id: string; url: string }[]
  titulo: string
}) {
  const [activa, setActiva] = useState(0)
  const [abierta, setAbierta] = useState(false)
  const [descargando, setDescargando] = useState(false)

  async function descargarZip(nombreBase: string) {
    const respuesta = await fetch('/api/descargar-fotos-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: imagenes.map((img) => img.url),
        nombreBase,
      }),
    })

    if (!respuesta.ok) {
      const detalle = await respuesta.json().catch(() => null)
      throw new Error(detalle?.error ?? 'No se pudo generar el zip')
    }

    const blob = await respuesta.blob()
    const urlBlob = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = urlBlob
    enlace.download = `${nombreBase}.zip`
    document.body.appendChild(enlace)
    enlace.click()
    document.body.removeChild(enlace)
    URL.revokeObjectURL(urlBlob)
  }

  async function descargarTodas() {
    setDescargando(true)
    const nombreBase = titulo.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    try {
      if (imagenes.length === 1) {
        // El proxy /api/descargar-imagen convierte el WebP almacenado a
        // JPG (Messenger y apps similares no aceptan WebP como adjunto de
        // foto), así que el nombre de archivo debe ser .jpg para que
        // coincida con el contenido real del blob.
        const rutaProxy = `/api/descargar-imagen?url=${encodeURIComponent(imagenes[0].url)}&nombre=${encodeURIComponent(`${nombreBase}.jpg`)}`
        const respuesta = await fetch(rutaProxy)
        const blob = await respuesta.blob()
        const urlBlob = URL.createObjectURL(blob)
        const enlace = document.createElement('a')
        enlace.href = urlBlob
        enlace.download = `${nombreBase}.jpg`
        document.body.appendChild(enlace)
        enlace.click()
        document.body.removeChild(enlace)
        URL.revokeObjectURL(urlBlob)
        return
      }

      const archivos = await Promise.all(
        imagenes.map(async (img, i) => {
          const rutaProxy = `/api/descargar-imagen?url=${encodeURIComponent(img.url)}&nombre=${encodeURIComponent(`${nombreBase}-${i + 1}.jpg`)}`
          const respuesta = await fetch(rutaProxy)
          const blob = await respuesta.blob()
          return new File([blob], `${nombreBase}-${i + 1}.jpg`, { type: blob.type || 'image/jpeg' })
        })
      )

      // Deteccion por capacidad tactil + canShare (no por navegador/UA, que
      // es fragil y puede venir alterado por proteccion de fingerprinting
      // de Brave). Se exige ademas ser un dispositivo tactil para evitar
      // que escritorio (Mac/Windows con canShare=true) abra el share sheet
      // nativo del SO en vez de descargar el .zip a la carpeta Descargas.
      // Donde funciona (tipicamente iOS/Android), un solo toque en la hoja
      // de compartir nativa guarda todas las fotos juntas en la galeria.
      const puedeCompartirArchivos =
        esDispositivoTactil() &&
        typeof navigator !== 'undefined' &&
        'canShare' in navigator &&
        navigator.canShare({ files: archivos })

      if (puedeCompartirArchivos) {
        try {
          await navigator.share({ files: archivos, title: titulo })
          return
        } catch (errShare) {
          if (errShare instanceof Error && errShare.name === 'AbortError') {
            // El usuario cerro la hoja de compartir sin elegir nada:
            // respetamos esa decision, no forzamos una descarga.
            return
          }
          // Cualquier otro error (ej. canShare dijo que si pero share()
          // fallo por "user activation" expirada, visto en Chrome Android):
          // cae al zip como plan B, sin mostrar error todavia.
        }
      }

      // Sin soporte de compartir archivos (o no es dispositivo tactil, o
      // share() fallo arriba): se baja un solo .zip generado en el servidor.
      await descargarZip(nombreBase)
    } catch (err) {
      console.error('--- ERROR AL DESCARGAR FOTOS ---', err)
      window.alert('Ocurrió un error al descargar las fotos. Intenta de nuevo.')
    } finally {
      setDescargando(false)
    }
  }

  useEffect(() => {
    if (!abierta) return
    function alPresionarTecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierta(false)
      if (e.key === 'ArrowRight') setActiva((i) => (i + 1) % imagenes.length)
      if (e.key === 'ArrowLeft') setActiva((i) => (i - 1 + imagenes.length) % imagenes.length)
    }
    window.addEventListener('keydown', alPresionarTecla)
    return () => window.removeEventListener('keydown', alPresionarTecla)
  }, [abierta, imagenes.length])

  if (imagenes.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400">
        Sin imágenes
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="block h-80 w-full cursor-zoom-in overflow-hidden rounded-lg bg-slate-100"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagenes[activa].url}
          alt={titulo}
          className="h-full w-full object-cover"
        />
      </button>

      {imagenes.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {imagenes.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setActiva(i)}
              className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded border-2 ${
                i === activa ? 'border-[#38B6FF]' : 'border-transparent'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={descargarTodas}
        disabled={descargando}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-[#2C3E50] py-2 text-sm font-medium text-white transition-colors hover:bg-[#1c2833] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Download size={16} />
        {descargando ? 'Descargando...' : `Descargar ${imagenes.length > 1 ? 'todas las fotos' : 'foto'}`}
      </button>

      {abierta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setAbierta(false)}
        >
          <button
            type="button"
            onClick={() => setAbierta(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Cerrar"
          >
            <X size={24} />
          </button>

          {imagenes.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setActiva((i) => (i - 1 + imagenes.length) % imagenes.length)
              }}
              className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Anterior"
            >
              <ChevronLeft size={28} />
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagenes[activa].url}
            alt={titulo}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {imagenes.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setActiva((i) => (i + 1) % imagenes.length)
              }}
              className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Siguiente"
            >
              <ChevronRight size={28} />
            </button>
          )}

          {imagenes.length > 1 && (
            <span className="absolute bottom-4 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
              {activa + 1} / {imagenes.length}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
