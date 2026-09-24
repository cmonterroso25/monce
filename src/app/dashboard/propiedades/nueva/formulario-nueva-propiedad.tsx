'use client'

import { useEffect, useRef, useState } from 'react'
import { crearPropiedadDatos, duplicarPropiedadOperacionAlterna } from '../acciones'
import type { DatosOperacionAlterna } from '../acciones'
import SelectConNuevo from '@/components/select-con-nuevo'
import SelectorUbicacion from '@/components/selector-ubicacion'
import { TIPOS_PROPIEDAD } from '@/lib/tipos-propiedad'
import SelectorRequisitosRenta from '../selector-requisitos-renta'
import SelectorPublicable from '../selector-publicable'
import SelectorFotos from '@/components/selector-fotos'
import BotonGuardarPropiedad from '@/components/boton-guardar-propiedad'
import FormularioSinEnvioNativo from '@/components/formulario-sin-envio-nativo'
import ExtractorTexto from './extractor-texto'
import AvisosPropiedad from './avisos-propiedad'

type Municipio = { id: string; nombre: string }
type Colega = { id: string; nombre: string }
type Perfil = { id: string; nombre_completo: string }
type Ubicacion = { id: string; nombre: string; google_maps_url: string | null; waze_url: string | null }
type TipoOperacion = 'venta' | 'renta'

// Opciones del select "Comisión", separadas por tipo de negocio porque
// venta y renta suelen cobrar porcentajes distintos.
const OPCIONES_COMISION_VENTA = ['5%', '4%', '3%', '2.5%']
const OPCIONES_COMISION_RENTA = ['100%', '50%', '40%', '33%']

export default function FormularioNuevaPropiedad({
  municipios,
  colegas,
  perfiles,
  ubicaciones,
  esAdmin,
  userId,
}: {
  municipios: Municipio[]
  colegas: Colega[]
  perfiles: Perfil[]
  ubicaciones: Ubicacion[]
  esAdmin: boolean
  userId?: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [municipioIdDetectado, setMunicipioIdDetectado] = useState<string | undefined>(undefined)
  const [otraOperacionAlterna, setOtraOperacionAlterna] = useState<DatosOperacionAlterna | null>(null)
  // Texto de la última extracción; `version` cambia en cada aplicación, aunque el texto sea el mismo.
  const [extraccion, setExtraccion] = useState<{ texto: string; version: number } | null>(null)

  // "venta" es el valor por defecto del <select name="tipo_operacion">
  // (primer <option>, sin defaultValue explícito), así que arranca igual aquí.
  // El select se mantiene sin controlar (lo llena directo el DOM tanto el
  // agente como ExtractorTexto, que asigna `.value` por código sin disparar
  // eventos "change" reales), por eso esto se relee con un pequeño retraso
  // cada vez que cambia `extraccion.version`, igual que hace AvisosPropiedad.
  // ExtractorTexto también avisa el tipo de operación directamente al llamar
  // a onExtraccionAplicada, así el cambio de pestaña no depende del retraso.
  const [operacionActiva, setOperacionActiva] = useState<TipoOperacion>('venta')

  // Comisión elegida para cada tipo de negocio: ESTADO controlado (no ref,
  // no DOM), para que nunca se pierda al cambiar de pestaña o de "Negocio".
  // El <select name="comision"> de abajo es 100% controlado por este estado
  // (value + onChange): no hay sincronización manual con el DOM ni efectos
  // que lean/escriban su valor, así que no hay ventana en la que el navegador
  // pueda "filtrar" un valor incorrecto al cambiar la lista de <option>.
  const [comisionesPorOperacion, setComisionesPorOperacion] = useState<Record<TipoOperacion, string>>({
    venta: '',
    renta: '',
  })

  // Mismo criterio para "Requisitos de renta": estado controlado en vez de
  // depender de que SelectorRequisitosRenta recuerde su propia selección al
  // desmontarse/remontarse ({esRenta && ...}). Solo aplica a renta, por eso
  // es un único valor (no un mapa por operación).
  const [requisitosRenta, setRequisitosRenta] = useState<string>('')

  function actualizarComisionCache(operacion: TipoOperacion, valor: string) {
    setComisionesPorOperacion((prev) => ({ ...prev, [operacion]: valor }))
  }

  function obtenerComisionOperacion(operacion: TipoOperacion): string {
    return comisionesPorOperacion[operacion] ?? ''
  }

  function obtenerRequisitosRentaGuardados(): string {
    return requisitosRenta
  }

  function cambiarOperacionActiva(nueva: TipoOperacion) {
    setOperacionActiva((anterior) => (anterior === nueva ? anterior : nueva))
  }

  useEffect(() => {
    const form = formRef.current
    if (!form) return
    const leerOperacion = () => {
      const el = form.elements.namedItem('tipo_operacion') as HTMLSelectElement | null
      if (el) cambiarOperacionActiva(el.value === 'renta' ? 'renta' : 'venta')
    }
    form.addEventListener('input', leerOperacion)
    form.addEventListener('change', leerOperacion)
    const temporizador = window.setTimeout(leerOperacion, 60)
    return () => {
      form.removeEventListener('input', leerOperacion)
      form.removeEventListener('change', leerOperacion)
      window.clearTimeout(temporizador)
    }
  }, [extraccion?.version])

  const esRenta = operacionActiva === 'renta'
  const esVenta = operacionActiva === 'venta'

  return (
    <>
      <ExtractorTexto
        formRef={formRef}
        municipios={municipios}
        onMunicipioDetectado={setMunicipioIdDetectado}
        onOtraOperacionDetectada={setOtraOperacionAlterna}
        onComisionCambiada={actualizarComisionCache}
        obtenerComisionOperacion={obtenerComisionOperacion}
        obtenerRequisitosRentaGuardados={obtenerRequisitosRentaGuardados}
        onExtraccionAplicada={(texto, operacion) => {
          setExtraccion((prev) => ({ texto, version: (prev?.version ?? 0) + 1 }))
          if (operacion) cambiarOperacionActiva(operacion)
        }}
      />

      <FormularioSinEnvioNativo ref={formRef} className="space-y-4">
        <div className="mb-2 border-b border-gray-200 pb-2">
          <h2 className="text-base font-semibold text-[#2C3E50]">Información pública</h2>
          <p className="text-xs text-gray-500">Estos datos se muestran en el portal público de la propiedad.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Inmueble</label>
            <select
              name="tipo_propiedad"
              required
              defaultValue="casa"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {TIPOS_PROPIEDAD.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Negocio</label>
            <select
              name="tipo_operacion"
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="venta">Venta</option>
              <option value="renta">Renta</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Título</label>
          <input
            type="text"
            name="titulo"
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Casa moderna en zona 10"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectConNuevo
            name="municipio_id"
            label="Municipio"
            opciones={municipios}
            placeholder="Selecciona municipio"
            valorExterno={municipioIdDetectado}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Sector</label>
            <input
              type="text"
              name="sector"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Condominio</label>
          <input
            type="text"
            name="condominio"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Amenidades</label>
          <input
            type="text"
            name="amenidades"
            placeholder="Piscina, gimnasio, salón de eventos, seguridad 24h..."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <SelectorUbicacion opciones={ubicaciones} puedeEditar={esAdmin} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Zona</label>
          <input
            type="text"
            name="zona"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <input type="hidden" name="ciudad" value="Guatemala" />

        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Niveles</label>
            <input
              type="text"
              name="niveles"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Habitaciones</label>
            <input
              type="text"
              name="dormitorios"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Baños</label>
            <input
              type="text"
              name="banos"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            ['sala', 'Sala'],
            ['comedor', 'Comedor'],
            ['cocina', 'Cocina'],
            ['estudio', 'Estudio'],
            ['sala_familiar', 'Sala Familiar'],
            ['habitacion_servicio', 'Habitación de servicio'],
            ['lavanderia', 'Lavandería'],
            ['jardin', 'Jardín'],
          ].map(([campo, etiqueta]) => (
            <div key={campo}>
              <label className="mb-1 block text-sm font-medium text-gray-700">{etiqueta}</label>
              <input
                type="text"
                name={campo}
                placeholder="Detalle (opcional)"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Bodega</label>
            <select name="bodega" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="">Selecciona</option>
              <option value="Si">Sí</option>
              <option value="No">No</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Balcón</label>
            <select name="balcon" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="">Selecciona</option>
              <option value="Si">Sí</option>
              <option value="No">No</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Parqueos</label>
            <input type="number" name="parqueos" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Extras</label>
            <input type="text" name="extras" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">M² construcción</label>
            <input type="number" name="area_construccion_m2" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">M² terreno</label>
            <input type="number" name="area_terreno_m2" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Medidas del terreno</label>
          <input
            type="text"
            name="medidas_terreno"
            placeholder='Ej. 10m x 20m'
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Precio</label>
            <input type="number" name="precio" required step="0.01" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Moneda</label>
            <select name="moneda" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="GTQ">GTQ</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Mantenimiento</label>
          <input type="number" name="mantenimiento" step="0.01" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        {esVenta && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">IUSI</label>
            <input type="number" name="iusi" step="0.01" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        )}

        {esRenta && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Mascota</label>
            <input type="text" name="mascota" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        )}

        {esRenta && (
          <SelectorRequisitosRenta
            value={requisitosRenta as '' | 'A' | 'B' | 'C'}
            onChange={setRequisitosRenta}
          />
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Descripción</label>
          <textarea
            name="descripcion"
            rows={5}
            placeholder="Descripción de la propiedad, visible en el portal público"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="mb-2 mt-8 border-b border-gray-200 pb-2">
          <h2 className="text-base font-semibold text-[#2C3E50]">Información interna (No publicar)</h2>
          <p className="text-xs text-gray-500">Solo visible dentro del CRM, nunca en el portal público.</p>
        </div>

        <SelectorPublicable />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Modalidad de captación</label>
          <select name="modalidad_captacion" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="Directo">Directo</option>
            <option value="Compartida">Compartida</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Comisión</label>
          <select
            name="comision"
            value={comisionesPorOperacion[operacionActiva]}
            onChange={(e) =>
              setComisionesPorOperacion((prev) => ({ ...prev, [operacionActiva]: e.target.value }))
            }
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Selecciona</option>
            {(esRenta ? OPCIONES_COMISION_RENTA : OPCIONES_COMISION_VENTA).map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
        </div>

        {esVenta && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Hipoteca</label>
              <select name="hipoteca" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="">Selecciona</option>
                <option value="Si">Sí</option>
                <option value="No">No</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Valor hipoteca</label>
              <input type="number" name="valor_hipoteca" step="0.01" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Acceso coordinar con:</label>
          <select name="acceso" className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="">Selecciona</option>
            <option value="Carlos Monterroso">Carlos Monterroso</option>
            <option value="Laura Ceballos">Laura Ceballos</option>
            <option value="Lucy Aguilar">Lucy Aguilar</option>
            <option value="Vivi Gonzalez">Vivi Gonzalez</option>
            <option value="Adan Suret">Adan Suret</option>
            <option value="Yenni Ceballos">Yenni Ceballos</option>
            <option value="Pamela Aguilar">Pamela Aguilar</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Propietario</label>
          <input
            type="text"
            name="propietario_nombre"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Nombre del propietario"
          />
        </div>

        <SelectConNuevo name="colega_id" label="Colega" opciones={colegas} placeholder="Selecciona colega (opcional)" />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Captado por</label>
          <select
            name="captado_por"
            defaultValue={userId ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Selecciona agente</option>
            {perfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre_completo}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Otra información</label>
          <textarea
            name="comentarios"
            rows={4}
            placeholder="Notas internas adicionales sobre la propiedad"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-8">
          <SelectorFotos label="Fotos (la primera será la portada)" />
        </div>

        <AvisosPropiedad
          formRef={formRef}
          versionExtraccion={extraccion?.version ?? 0}
          operacionAlterna={otraOperacionAlterna?.tipo_operacion ?? null}
          requisitosRentaGuardados={requisitosRenta}
        />

        <BotonGuardarPropiedad
          accion={crearPropiedadDatos}
          duplicarAccion={duplicarPropiedadOperacionAlterna}
          datosOperacionAlterna={otraOperacionAlterna}
          redirectTo="/dashboard/propiedades"
          className="w-full rounded bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Guardar propiedad
        </BotonGuardarPropiedad>
      </FormularioSinEnvioNativo>
    </>
  )
}
