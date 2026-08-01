'use client'
import { useState, useTransition } from 'react'
import { enviarSolicitudArrendamiento } from './acciones'
import type { DatosSolicitante, DatosFiador } from '@/app/dashboard/leads/[id]/arrendamiento'

const VACIO_SOLICITANTE: DatosSolicitante = {
  primerNombre: '',
  segundoNombre: '',
  primerApellido: '',
  segundoApellido: '',
  documentoIdentificacion: '',
  documentoExtendidoEn: '',
  nacionalidad: '',
  profesion: '',
  edad: '',
  telefono: '',
  lugarTrabajo: '',
  telefonoTrabajo: '',
  cargo: '',
  ingresoMensual: '',
  direccionTrabajo: '',
  cantidadMascotas: '',
  personasConviven: '',
  fechaTraslado: '',
  referencia1Nombre: '',
  referencia1Telefono: '',
  referencia2Nombre: '',
  referencia2Telefono: '',
  actualArrendadorNombre: '',
  actualArrendadorTelefono: '',
  montoReserva: '',
  transferenciaNumero: '',
  numeroCuenta: '',
  banco: '',
}

const VACIO_FIADOR: DatosFiador = {
  primerNombre: '',
  segundoNombre: '',
  primerApellido: '',
  segundoApellido: '',
  documentoIdentificacion: '',
  documentoExtendidoEn: '',
  nacionalidad: '',
  profesion: '',
  edad: '',
  telefono: '',
  direccionResidencia: '',
  lugarTrabajo: '',
  telefonoTrabajo: '',
  cargo: '',
  ingresoMensual: '',
  direccionTrabajo: '',
}

function Campo({
  label,
  value,
  onChange,
  required,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
      />
    </div>
  )
}

function TituloSeccion({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 rounded bg-[#38B6FF]/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#2C3E50]">
      {children}
    </h2>
  )
}

export default function FormularioArrendamientoPublico({ token }: { token: string }) {
  const [solicitante, setSolicitante] = useState<DatosSolicitante>(VACIO_SOLICITANTE)
  const [fiador, setFiador] = useState<DatosFiador>(VACIO_FIADOR)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function s(campo: keyof DatosSolicitante, valor: string) {
    setSolicitante((prev) => ({ ...prev, [campo]: valor }))
  }
  function f(campo: keyof DatosFiador, valor: string) {
    setFiador((prev) => ({ ...prev, [campo]: valor }))
  }

  function alEnviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const resultado = await enviarSolicitudArrendamiento(token, solicitante, fiador)
      if (!resultado.ok) {
        setError(resultado.mensaje ?? 'No se pudo enviar el formulario.')
        return
      }
      setEnviado(true)
    })
  }

  if (enviado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm text-center">
          <p className="text-lg font-semibold text-[#2C3E50]">¡Listo!</p>
          <p className="mt-2 text-sm text-slate-500">
            Tu información fue enviada correctamente. Tu agente se pondrá en contacto contigo.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="bg-[#2C3E50] px-6 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-monce.png" alt="Monce Inmobiliaria" className="mb-2 h-10 w-10 rounded" />
        <h1 className="text-lg font-bold text-white">Formulario de solicitud de arrendamiento</h1>
        <p className="text-xs text-slate-300">Completa tus datos y los de tu fiador.</p>
      </header>

      <form onSubmit={alEnviar} className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <TituloSeccion>Datos del solicitante</TituloSeccion>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Primer nombre" value={solicitante.primerNombre ?? ''} onChange={(v) => s('primerNombre', v)} required />
            <Campo label="Segundo nombre" value={solicitante.segundoNombre ?? ''} onChange={(v) => s('segundoNombre', v)} />
            <Campo label="Primer apellido" value={solicitante.primerApellido ?? ''} onChange={(v) => s('primerApellido', v)} required />
            <Campo label="Segundo apellido" value={solicitante.segundoApellido ?? ''} onChange={(v) => s('segundoApellido', v)} />
            <Campo label="No. documento de identificación" value={solicitante.documentoIdentificacion ?? ''} onChange={(v) => s('documentoIdentificacion', v)} required />
            <Campo label="Extendido en" value={solicitante.documentoExtendidoEn ?? ''} onChange={(v) => s('documentoExtendidoEn', v)} />
            <Campo label="Nacionalidad" value={solicitante.nacionalidad ?? ''} onChange={(v) => s('nacionalidad', v)} />
            <Campo label="Profesión" value={solicitante.profesion ?? ''} onChange={(v) => s('profesion', v)} />
            <Campo label="Edad" value={solicitante.edad ?? ''} onChange={(v) => s('edad', v)} />
            <Campo label="Teléfono" value={solicitante.telefono ?? ''} onChange={(v) => s('telefono', v)} required />
            <Campo label="Lugar de trabajo" value={solicitante.lugarTrabajo ?? ''} onChange={(v) => s('lugarTrabajo', v)} />
            <Campo label="Teléfono de la empresa" value={solicitante.telefonoTrabajo ?? ''} onChange={(v) => s('telefonoTrabajo', v)} />
            <Campo label="Cargo" value={solicitante.cargo ?? ''} onChange={(v) => s('cargo', v)} />
            <Campo label="Ingreso mensual promedio" value={solicitante.ingresoMensual ?? ''} onChange={(v) => s('ingresoMensual', v)} />
            <div className="sm:col-span-2">
              <Campo label="Dirección de trabajo" value={solicitante.direccionTrabajo ?? ''} onChange={(v) => s('direccionTrabajo', v)} />
            </div>
            <Campo label="¿Cuántas mascotas tiene?" value={solicitante.cantidadMascotas ?? ''} onChange={(v) => s('cantidadMascotas', v)} />
            <Campo label="¿Cuántas personas vivirán en la propiedad?" value={solicitante.personasConviven ?? ''} onChange={(v) => s('personasConviven', v)} />
            <div className="sm:col-span-2">
              <Campo label="¿Cuándo desea trasladarse?" value={solicitante.fechaTraslado ?? ''} onChange={(v) => s('fechaTraslado', v)} />
            </div>
            <Campo label="Referencia personal 1 - Nombre" value={solicitante.referencia1Nombre ?? ''} onChange={(v) => s('referencia1Nombre', v)} />
            <Campo label="Teléfono referencia 1" value={solicitante.referencia1Telefono ?? ''} onChange={(v) => s('referencia1Telefono', v)} />
            <Campo label="Referencia personal 2 - Nombre" value={solicitante.referencia2Nombre ?? ''} onChange={(v) => s('referencia2Nombre', v)} />
            <Campo label="Teléfono referencia 2" value={solicitante.referencia2Telefono ?? ''} onChange={(v) => s('referencia2Telefono', v)} />
            <Campo label="Nombre del actual arrendador" value={solicitante.actualArrendadorNombre ?? ''} onChange={(v) => s('actualArrendadorNombre', v)} />
            <Campo label="Teléfono del actual arrendador" value={solicitante.actualArrendadorTelefono ?? ''} onChange={(v) => s('actualArrendadorTelefono', v)} />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <TituloSeccion>Datos generales del fiador</TituloSeccion>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Primer nombre" value={fiador.primerNombre ?? ''} onChange={(v) => f('primerNombre', v)} required />
            <Campo label="Segundo nombre" value={fiador.segundoNombre ?? ''} onChange={(v) => f('segundoNombre', v)} />
            <Campo label="Primer apellido" value={fiador.primerApellido ?? ''} onChange={(v) => f('primerApellido', v)} required />
            <Campo label="Segundo apellido" value={fiador.segundoApellido ?? ''} onChange={(v) => f('segundoApellido', v)} />
            <Campo label="No. documento de identificación" value={fiador.documentoIdentificacion ?? ''} onChange={(v) => f('documentoIdentificacion', v)} required />
            <Campo label="Extendido en" value={fiador.documentoExtendidoEn ?? ''} onChange={(v) => f('documentoExtendidoEn', v)} />
            <Campo label="Nacionalidad" value={fiador.nacionalidad ?? ''} onChange={(v) => f('nacionalidad', v)} />
            <Campo label="Profesión" value={fiador.profesion ?? ''} onChange={(v) => f('profesion', v)} />
            <Campo label="Edad" value={fiador.edad ?? ''} onChange={(v) => f('edad', v)} />
            <Campo label="Teléfono" value={fiador.telefono ?? ''} onChange={(v) => f('telefono', v)} required />
            <div className="sm:col-span-2">
              <Campo label="Dirección residencia actual" value={fiador.direccionResidencia ?? ''} onChange={(v) => f('direccionResidencia', v)} />
            </div>
            <Campo label="Lugar de trabajo" value={fiador.lugarTrabajo ?? ''} onChange={(v) => f('lugarTrabajo', v)} />
            <Campo label="Teléfono de la empresa" value={fiador.telefonoTrabajo ?? ''} onChange={(v) => f('telefonoTrabajo', v)} />
            <Campo label="Cargo" value={fiador.cargo ?? ''} onChange={(v) => f('cargo', v)} />
            <Campo label="Ingreso mensual" value={fiador.ingresoMensual ?? ''} onChange={(v) => f('ingresoMensual', v)} />
            <div className="sm:col-span-2">
              <Campo label="Dirección de trabajo" value={fiador.direccionTrabajo ?? ''} onChange={(v) => f('direccionTrabajo', v)} />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <TituloSeccion>Datos de reserva</TituloSeccion>
          <p className="mb-3 text-xs text-slate-500">
            Si ya realizaste la transferencia de la reserva, completa estos datos. Si no, puedes dejarlos en blanco por ahora.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Monto de la reserva (Q)" value={solicitante.montoReserva ?? ''} onChange={(v) => s('montoReserva', v)} />
            <Campo label="No. de transferencia" value={solicitante.transferenciaNumero ?? ''} onChange={(v) => s('transferenciaNumero', v)} />
            <Campo label="Número de cuenta" value={solicitante.numeroCuenta ?? ''} onChange={(v) => s('numeroCuenta', v)} />
            <Campo label="Banco" value={solicitante.banco ?? ''} onChange={(v) => s('banco', v)} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            En caso de superar los 10 días o desistir del proceso de renta, la casa volverá a estar libre para promover y se
            devolverá el 50% de la reserva. Si el interesado no califica, se devolverá el 100% de la reserva.
          </p>
        </section>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded bg-[#2C3E50] px-4 py-3 text-sm font-medium text-white hover:bg-[#38B6FF] disabled:opacity-50"
        >
          {isPending ? 'Enviando...' : 'Enviar formulario'}
        </button>
      </form>
    </div>
  )
}
