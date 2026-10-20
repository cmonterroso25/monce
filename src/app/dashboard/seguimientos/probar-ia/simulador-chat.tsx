'use client'

import { useState } from 'react'
import { Loader2, RotateCcw, Bot, User, Info } from 'lucide-react'
import { obtenerPreguntaInicialIA, probarSeguimientoIA } from '../acciones'

type Mensaje =
  | { rol: 'ia'; texto: string }
  | { rol: 'asesor'; texto: string }
  | { rol: 'sistema'; texto: string }

const TIPOS_ACTIVIDAD_PRUEBA = ['cita', 'reunion', 'video_llamada', 'llamada']

const FASES_INICIALES = [
  { valor: 'resultado_visita', etiqueta: 'Resultado de visita (flujo normal)' },
  { valor: 'reprogramar', etiqueta: 'Reprogramar (cliente no asistió)' },
  { valor: 'ofrecer_siguiente_paso', etiqueta: 'Ofrecer siguiente paso (indeciso)' },
  { valor: 'confirmar_reintento_24h', etiqueta: 'Confirmar reintento 24h' },
  { valor: 'confirmar_envio_propiedades', etiqueta: 'Confirmar envío de propiedades' },
  { valor: 'seguimiento_recurrente', etiqueta: 'Seguimiento recurrente (firma/ganada/perdida)' },
  { valor: 'resultado_firma', etiqueta: 'Resultado de firma de contrato' },
]

export default function SimuladorChat() {
  const [agenteNombre, setAgenteNombre] = useState('Laura')
  const [contactoNombre, setContactoNombre] = useState('Juan Pérez')
  const [tipoActividad, setTipoActividad] = useState('cita')
  const [faseInicial, setFaseInicial] = useState('resultado_visita')

  const [iniciado, setIniciado] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [faseActual, setFaseActual] = useState('resultado_visita')
  const [esReintentoAclaracion, setEsReintentoAclaracion] = useState(false)
  const [terminal, setTerminal] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [respuestaAsesor, setRespuestaAsesor] = useState('')

  async function iniciar() {
    setError(null)
    setCargando(true)
    try {
      if (faseInicial === 'resultado_visita') {
        const r = await obtenerPreguntaInicialIA(agenteNombre, tipoActividad, contactoNombre)
        if (!r.ok) throw new Error(r.error ?? 'Error desconocido')
        setMensajes([{ rol: 'ia', texto: r.pregunta }])
      } else {
        // Las demás fases no tienen una pregunta fija de arranque en el
        // simulador (en el sistema real llegan desde otra fase) — se
        // empieza directo escribiendo la respuesta del asesor para esa fase.
        setMensajes([{ rol: 'sistema', texto: `Simulando desde la fase: ${faseInicial}` }])
      }
      setIniciado(true)
      setFaseActual(faseInicial)
      setEsReintentoAclaracion(false)
      setTerminal(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al iniciar la simulación')
    } finally {
      setCargando(false)
    }
  }

  async function enviarRespuesta() {
    if (!respuestaAsesor.trim()) return
    setError(null)
    setCargando(true)
    const textoEnviado = respuestaAsesor
    setMensajes((prev) => [...prev, { rol: 'asesor', texto: textoEnviado }])
    setRespuestaAsesor('')
    try {
      const r = await probarSeguimientoIA(faseActual, textoEnviado, esReintentoAclaracion)
      if (!r.ok) throw new Error(r.error ?? 'Error desconocido')

      setMensajes((prev) => [
        ...prev,
        { rol: 'sistema', texto: `🔍 Gemini clasificó: ${JSON.stringify(r.clasificacion)}` },
        { rol: 'sistema', texto: `➡️ ${r.accion_descrita ?? ''}` },
      ])

      if (r.siguiente_pregunta) {
        setMensajes((prev) => [...prev, { rol: 'ia', texto: r.siguiente_pregunta! }])
        setFaseActual(r.siguiente_fase ?? faseActual)
        setEsReintentoAclaracion(!!r.es_reintento_aclaracion_siguiente)
      }
      if (r.terminal) setTerminal(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al clasificar la respuesta')
    } finally {
      setCargando(false)
    }
  }

  function reiniciar() {
    setIniciado(false)
    setMensajes([])
    setFaseActual('resultado_visita')
    setEsReintentoAclaracion(false)
    setTerminal(false)
    setError(null)
    setRespuestaAsesor('')
  }

  const mostrarSelectorTipo = faseInicial === 'resultado_visita'

  return (
    <div className="max-w-2xl">
      {!iniciado && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Nombre del asesor</label>
              <input
                value={agenteNombre}
                onChange={(e) => setAgenteNombre(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Nombre del cliente</label>
              <input
                value={contactoNombre}
                onChange={(e) => setContactoNombre(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            {mostrarSelectorTipo && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Tipo de actividad</label>
                <select
                  value={tipoActividad}
                  onChange={(e) => setTipoActividad(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {TIPOS_ACTIVIDAD_PRUEBA.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Fase inicial</label>
            <select
              value={faseInicial}
              onChange={(e) => setFaseInicial(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm sm:w-auto"
            >
              {FASES_INICIALES.map((f) => (
                <option key={f.valor} value={f.valor}>{f.etiqueta}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={iniciar}
            disabled={cargando}
            className="flex items-center gap-2 rounded bg-[#38B6FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#2A9FE8] disabled:opacity-50"
          >
            {cargando ? <Loader2 size={15} className="animate-spin" /> : null}
            Iniciar simulación
          </button>
        </div>
      )}

      {iniciado && (
        <div className="space-y-3">
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          {!terminal ? (
            <div className="flex gap-2">
              <textarea
                value={respuestaAsesor}
                onChange={(e) => setRespuestaAsesor(e.target.value)}
                placeholder="Escribe lo que respondería el asesor…"
                rows={2}
                className="flex-1 resize-none rounded border border-slate-300 px-3 py-2 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    enviarRespuesta()
                  }
                }}
              />
              <button
                type="button"
                onClick={enviarRespuesta}
                disabled={cargando || !respuestaAsesor.trim()}
                className="flex items-center gap-2 rounded bg-[#38B6FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#2A9FE8] disabled:opacity-50"
              >
                {cargando ? <Loader2 size={15} className="animate-spin" /> : null}
                Enviar
              </button>
            </div>
          ) : (
            <p className="text-sm font-medium text-slate-500">Fin de la simulación.</p>
          )}

          <button
            type="button"
            onClick={reiniciar}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
          >
            <RotateCcw size={12} /> Reiniciar simulación
          </button>
        </div>
      )}
    </div>
  )
}
