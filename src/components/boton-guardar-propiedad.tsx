'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DatosOperacionAlterna } from '@/app/dashboard/propiedades/acciones'

type ResultadoAccion = { ok: boolean; mensaje?: string; propiedadId?: string }

export default function BotonGuardarPropiedad({
  accion,
  conteoFotosExistentes = 0,
  redirectTo,
  className,
  children,
  duplicarAccion,
  datosOperacionAlterna = null,
}: {
  accion: (formData: FormData) => Promise<ResultadoAccion>
  conteoFotosExistentes?: number
  redirectTo: string
  className?: string
  children: React.ReactNode
  duplicarAccion?: (propiedadIdOrigen: string, datos: DatosOperacionAlterna) => Promise<ResultadoAccion>
  datosOperacionAlterna?: DatosOperacionAlterna | null
}) {
  const botonRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()
  const [fase, setFase] = useState<'idle' | 'guardando' | 'subiendo' | 'duplicando' | 'error'>('idle')
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

    // Si el extractor de IA detectó venta y renta en el mismo texto, se
    // crea automáticamente la propiedad de la otra operación, copiando
    // las mismas fotos en R2 (sin volver a subirlas desde el navegador).
    // Un fallo aquí no revierte ni bloquea el guardado de la propiedad
    // original, que ya quedó guardada correctamente: solo se registra en
    // consola para que se pueda duplicar a mano si algo salió mal.
    if (duplicarAccion && datosOperacionAlterna) {
      setFase('duplicando')
      try {
        const resultadoDup = await duplicarAccion(propiedadId, datosOperacionAlterna)
        if (!resultadoDup.ok) {
          console.error('No se pudo crear la propiedad duplicada (venta/renta):', resultadoDup.mensaje)
        }
      } catch (err) {
        console.error('Error al duplicar la propiedad para la otra operación:', err)
      }
    }

    router.push(redirectTo)
    router.refresh()
  }

  const deshabilitado = fase === 'guardando' || fase === 'subiendo' || fase === 'duplicando'

  let texto: React.ReactNode = children
  if (fase === 'guardando') texto = 'Guardando...'
  if (fase === 'subiendo') texto = `Subiendo foto ${progreso.actual} de ${progreso.total}...`
  if (fase === 'duplicando') {
    texto = `Creando versión de ${datosOperacionAlterna?.tipo_operacion ?? 'la otra operación'}...`
  }

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
