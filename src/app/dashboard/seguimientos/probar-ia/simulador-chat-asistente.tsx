'use client'

import { useEffect, useState } from 'react'
import { Loader2, RotateCcw, Bot, User, Info } from 'lucide-react'
import {
  listarPerfilesParaPrueba,
  probarAsistenteGeneral,
  probarAsistenteGeneralAclaracion,
} from '../acciones'

type Mensaje =
  | { rol: 'ia'; texto: string }
  | { rol: 'asesor'; texto: string }
  | { rol: 'sistema'; texto: string }

type Perfil = { id: string; nombre_completo: string; rol: string }
type ContextoAclaracion = { titulo_tarea: string; nombre_contacto: string | null; prioridad_tarea: string }

export default function SimuladorChatAsistente() {
  const [perfiles, setPerfiles] = useState<Perfil[]>([])
  const [perfilId, setPerfilId] = useState('')
  const [cargandoPerfiles, setCargandoPerfiles] = useState(true)

  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [esperandoAclaracion, setEsperandoAclaracion] = useState<ContextoAclaracion | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState('')

  useEffect(() => {
    listarPerfilesParaPrueba()
      .then((data) => {
        setPerfiles(data)
        if (data.length > 0) setPerfilId(data[0].id)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar los perfiles'))
      .finally(() => setCargandoPerfiles(false))
  }, [])

  async function enviar() {
    if (!texto.trim() || !perfilId) return
    setError(null)
    setCargando(true)
    const textoEnviado = texto
    setMensajes((prev) => [...prev, { rol: 'asesor', texto: textoEnviado }])
    setTexto('')
    try {
      const r = esperandoAclaracion
        ? await probarAsistenteGeneralAclaracion(perfilId, textoEnviado, esperandoAclaracion)
        : await probarAsistenteGeneral(perfilId, textoEnviado)
      if (!r.ok) throw new Error(r.error ?? 'Error desconocido')

      setMensajes((prev) => [
        ...prev,
        { rol: 'sistema', texto: `🔍 Ben clasificó: ${JSON.stringify(r.clasificacion)}` },
      ])
      if (r.accion_descrita) {
        setMensajes((prev) => [...prev, { rol: 'sistema', texto: `➡️ ${r.accion_descrita}` }])
      }
      if (r.mensaje_respuesta) {
        setMensajes((prev) => [...prev, { rol: 'ia', texto: r.mensaje_respuesta! }])
      }
      if (r.requiere_aclaracion && r.siguiente_pregunta) {
        setMensajes((prev) => [...prev, { rol: 'ia', texto: r.siguiente_pregunta! }])
        setEsperandoAclaracion(r.contexto_para_siguiente_turno ?? null)
      } else {
        setEsperandoAclaracion(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar el mensaje')
    } finally {
      setCargando(false)
    }
  }

  function reiniciar() {
    setMensajes([])
    setEsperandoAclaracion(null)
    setError(null)
    setTexto('')
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="mb-1 block text-xs font-medium text-slate-600">Probar como</label>
        {cargandoPerfiles ? (
          <p className="text-sm text-slate-500">Cargando asesores…</p>
        ) : (
          <select
            value={perfilId}
            onChange={(e) => { setPerfilId(e.target.value); reiniciar() }}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm sm:w-auto"
          >
            {perfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre_completo} ({p.rol})
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-3">
        {mensajes.length > 0 && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            {mensajes.map((m, i) => (
              <div key={i} className={`flex ${m.rol === 'asesor' ? 'justify-end' : 'justify-start'}`}>
                {m.rol === 'sistema' ? (
                  <div className="flex items-start gap-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <Info size={14} className="mt-0.5 flex-shrink-0" />
                    <span className="whitespace-pre-wrap break-words">{m.texto}</span>
                  </div>
                ) : (
                  <div
                    className={`flex max-w-[85%] items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                      m.rol === 'ia' ? 'bg-blue-50 text-[#2C3E50]' : 'bg-slate-100 text-[#2C3E50]'
                    }`}
                  >
                    {m.rol === 'ia' ? <Bot size={15} className="mt-0.5 flex-shrink-0 text-[#38B6FF]" /> : <User size={15} className="mt-0.5 flex-shrink-0 text-slate-500" />}
                    <span className="whitespace-pre-wrap break-words">{m.texto}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={esperandoAclaracion ? 'Responde la fecha/hora…' : 'Escribe lo que le preguntaría el asesor a Ben…'}
            rows={2}
            className="flex-1 resize-none rounded border border-slate-300 px-3 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                enviar()
              }
            }}
          />
          <button
            type="button"
            onClick={enviar}
            disabled={cargando || !texto.trim() || !perfilId}
            className="flex items-center gap-2 rounded bg-[#38B6FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#2A9FE8] disabled:opacity-50"
          >
            {cargando ? <Loader2 size={15} className="animate-spin" /> : null}
            Enviar
          </button>
        </div>

        {mensajes.length > 0 && (
          <button
            type="button"
            onClick={reiniciar}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
          >
            <RotateCcw size={12} /> Reiniciar conversación
          </button>
        )}
      </div>
    </div>
  )
}
