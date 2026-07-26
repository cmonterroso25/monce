'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type ResultadoAccion = { ok: boolean; mensaje?: string; propiedadId?: string }

export default function BotonGuardarPropiedad({
  accion,
  conteoFotosExistentes = 0,
  redirectTo,
  className,
  children,
}: {
  accion: (formData: FormData) => Promise<ResultadoAccion>
  conteoFotosExistentes?: number
  redirectTo: string
  className?: string
  children: React.ReactNode
}) {
  const botonRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()
  const [fase, setFase] = useState<'idle' | 'guardando' | 'subiendo' | 'error'>('idle')
  const [progreso, setProgreso] = useState({ actual: 0, total: 0 })
  const [mensajeError, setMensajeError] = useState<string | null>(null)

  async function alHacerClick() {
    const form = botonRef.current?.closest('form')
    if (!form) return
    if (!form.reportValidity()) return

    const inputFotos = form.querySelector('input[name="imagenes"]') as HTMLInputElement | null
    if (inputFotos?.disabled) {
      window.alert('Espera a que terminen de optimizarse las fotos antes de guardar.')
      return
    }

    setMensajeError(null)
    setFase('guardando')

    const formData = new FormData(form)
    const archivos = (formData.getAll('imagenes') as File[]).filter((a) => a.size > 0)
    formData.delete('imagenes')

    const resultado = await accion(formData)

    if (!resultado.ok || !resultado.propiedadId) {
      setFase('error')
      setMensajeError(resultado.mensaje ?? 'Ocurrió un error al guardar.')
      return
    }

    const propiedadId = resultado.propiedadId

    if (archivos.length > 0) {
      setFase('subiendo')
      setProgreso({ actual: 0, total: archivos.length })
      let completadas = 0

      await Promise.all(
        archivos.map(async (archivo, i) => {
          const fd = new FormData()
          fd.set('propiedad_id', propiedadId)
          fd.set('archivo', archivo)
          fd.set('orden', String(conteoFotosExistentes + i))
          fd.set('es_portada', String(conteoFotosExistentes === 0 && i === 0))
          try {
            await fetch('/api/propiedades/subir-foto', { method: 'POST', body: fd })
          } catch (err) {
            console.error('Error al subir foto', i, err)
          } finally {
            completadas++
            setProgreso({ actual: completadas, total: archivos.length })
          }
        })
      )
    }

    router.push(redirectTo)
    router.refresh()
  }

  const deshabilitado = fase === 'guardando' || fase === 'subiendo'

  let texto: React.ReactNode = children
  if (fase === 'guardando') texto = 'Guardando...'
  if (fase === 'subiendo') texto = `Subiendo foto ${progreso.actual} de ${progreso.total}...`

  return (
    <div>
      {fase === 'subiendo' && (
        <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full bg-[#38B6FF] transition-all"
            style={{ width: `${(progreso.actual / Math.max(progreso.total, 1)) * 100}%` }}
          />
        </div>
      )}
      {mensajeError && (
        <p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-600">{mensajeError}</p>
      )}
      <button
        ref={botonRef}
        type="button"
        onClick={alHacerClick}
        disabled={deshabilitado}
        className={`${className ?? ''} ${deshabilitado ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        {texto}
      </button>
    </div>
  )
}
