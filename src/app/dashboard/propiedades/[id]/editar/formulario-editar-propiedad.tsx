'use client'

import { useRef, useState } from 'react'
import SelectConNuevo from '@/components/select-con-nuevo'
import SelectorUbicacion from '@/components/selector-ubicacion'
import { TIPOS_PROPIEDAD } from '@/lib/tipos-propiedad'
import SelectorRequisitosRenta from '../../selector-requisitos-renta'
import SelectorPublicable from '../../selector-publicable'
import SelectorFotos from '@/components/selector-fotos'
import BotonGuardarPropiedad from '@/components/boton-guardar-propiedad'
import FormularioSinEnvioNativo from '@/components/formulario-sin-envio-nativo'
import { actualizarPropiedadDatos } from '../../acciones'

type Municipio = { id: string; nombre: string }
type Colega = { id: string; nombre: string }
type Perfil = { id: string; nombre_completo: string }
type Ubicacion = { id: string; nombre: string; google_maps_url: string | null; waze_url: string | null }
type TipoOperacion = 'venta' | 'renta'

// Mismas opciones que en formulario-nueva-propiedad.tsx, separadas por tipo
// de negocio porque venta y renta suelen cobrar porcentajes distintos.
const OPCIONES_COMISION_VENTA = ['5%', '4%', '3%', '2.5%']
const OPCIONES_COMISION_RENTA = ['100%', '50%', '40%', '33%']

export default function FormularioEditarPropiedad({
  propiedad,
  municipios,
  colegas,
  perfiles,
  ubicaciones,
  esAdmin,
  conteoFotosExistentes,
}: {
  propiedad: any
  municipios: Municipio[]
  colegas: Colega[]
  perfiles: Perfil[]
  ubicaciones: Ubicacion[]
  esAdmin: boolean
  conteoFotosExistentes: number
}) {
  const formRef = useRef<HTMLFormElement>(null)

  const operacionInicial: TipoOperacion = propiedad.tipo_operacion === 'renta' ? 'renta' : 'venta'
  const [operacionActiva, setOperacionActiva] = useState<TipoOperacion>(operacionInicial)

  // Comisión elegida para cada tipo de negocio: ESTADO controlado (no ref,
  // no DOM). Solo la operación original de la propiedad arranca con valor;
  // la otra queda en blanco porque en la BD solo hay una comisión guardada.
  // El <select name="comision"> de abajo es 100% controlado por este estado.
  const [comisionesPorOperacion, setComisionesPorOperacion] = useState<Record<TipoOperacion, string>>({
    venta: operacionInicial === 'venta' ? propiedad.comision ?? '' : '',
    renta: operacionInicial === 'renta' ? propiedad.comision ?? '' : '',
  })

  // Mismo criterio para "Requisitos de renta": estado controlado, arrancando
  // con lo que ya traía la propiedad, en vez de depender de que
  // SelectorRequisitosRenta recuerde su propia selección al
  // desmontarse/remontarse ({esRenta && ...}).
  const [requisitosRenta, setRequisitosRenta] = useState<string>(propiedad.requisitos_renta ?? '')

  function cambiarOperacionActiva(nueva: TipoOperacion) {
    setOperacionActiva(nueva)
  }

  // Opciones para la operación dada, agregando al inicio el valor guardado
  // si es uno legado que no está en la lista fija (el campo es texto libre
  // en la BD), para no perderlo silenciosamente al abrir el formulario.
  function opcionesComisionPara(operacion: TipoOperacion): string[] {
    const base = operacion === 'renta' ? OPCIONES_COMISION_RENTA : OPCIONES_COMISION_VENTA
    const guardado = comisionesPorOperacion[operacion]
    if (guardado && !base.includes(guardado)) return [guardado, ...base]
    return base
  }

  const esRenta = operacionActiva === 'renta'
  const esVenta = operacionActiva === 'venta'

  return (
    <FormularioSinEnvioNativo ref={formRef} className="space-y-4">
      <input type="hidden" name="propiedad_id" value={propiedad.id} />

      <div className="mb-2 border-b border-gray-200 pb-2">
        <h2 className="text-base font-semibold text-[#2C3E50]">Informacion publica</h2>
        <p className="text-xs text-gray-500">Estos datos se muestran en el portal publico de la propiedad.</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Titulo</label>
        <input
          type="text"
          name="titulo"
          required
          defaultValue={propiedad.titulo ?? ''}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectConNuevo
          name="municipio_id"
          label="Municipio"
          opciones={municipios ?? []}
          placeholder="Selecciona municipio"
          defaultValue={propiedad.municipio_id ?? ''}
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Sector</label>
          <input
            type="text"
            name="sector"
            defaultValue={propiedad.sector ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Condominio</label>
        <input
          type="text"
          name="condominio"
          defaultValue={propiedad.condominio ?? ''}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Amenidades</label>
        <input
          type="text"
          name="amenidades"
          defaultValue={propiedad.amenidades ?? ''}
          placeholder="Piscina, gimnasio, salón de eventos, seguridad 24h..."
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <SelectorUbicacion
        opciones={ubicaciones ?? []}
        defaultValue={propiedad.ubicacion_id ?? ''}
        puedeEditar={esAdmin}
      />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Zona</label>
        <input
          type="text"
          name="zona"
          defaultValue={propiedad.zona ?? ''}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <input type="hidden" name="ciudad" value={propiedad.ciudad ?? 'Guatemala'} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Inmueble</label>
          <select
            name="tipo_propiedad"
            required
            defaultValue={propiedad.tipo_propiedad ?? 'casa'}
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
            defaultValue={operacionInicial}
            onChange={(e) => cambiarOperacionActiva(e.target.value === 'renta' ? 'renta' : 'venta')}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="venta">Venta</option>
            <option value="renta">Renta</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Niveles</label>
          <input
            type="text"
            name="niveles"
            defaultValue={propiedad.niveles ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Habitaciones</label>
          <input
            type="text"
            name="dormitorios"
            defaultValue={propiedad.dormitorios ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Banos</label>
          <input
            type="text"
            name="banos"
            defaultValue={propiedad.banos ?? ''}
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
          ['habitacion_servicio', 'Habitacion de servicio'],
          ['lavanderia', 'Lavanderia'],
          ['jardin', 'Jardin'],
        ].map(([campo, etiqueta]) => (
          <div key={campo}>
            <label className="mb-1 block text-sm font-medium text-gray-700">{etiqueta}</label>
            <input
              type="text"
              name={campo}
              defaultValue={propiedad[campo] ?? ''}
              placeholder="Detalle (opcional)"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Bodega</label>
          <select
            name="bodega"
            defaultValue={propiedad.bodega ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Selecciona</option>
            <option value="Si">Sí</option>
            <option value="No">No</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Balcón</label>
          <select
            name="balcon"
            defaultValue={propiedad.balcon ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Selecciona</option>
            <option value="Si">Sí</option>
            <option value="No">No</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Parqueos</label>
          <input
            type="number"
            name="parqueos"
            defaultValue={propiedad.parqueos ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Extras</label>
          <input
            type="text"
            name="extras"
            defaultValue={propiedad.extras ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">M2 construccion</label>
          <input
            type="number"
            name="area_construccion_m2"
            defaultValue={propiedad.area_construccion_m2 ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">M2 terreno</label>
          <input
            type="number"
            name="area_terreno_m2"
            defaultValue={propiedad.area_terreno_m2 ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Medidas del terreno</label>
        <input
          type="text"
          name="medidas_terreno"
          defaultValue={propiedad.medidas_terreno ?? ''}
          placeholder='Ej. 10m x 20m'
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Precio</label>
          <input
            type="number"
            name="precio"
            required
            step="0.01"
            defaultValue={propiedad.precio ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Moneda</label>
          <select
            name="moneda"
            defaultValue={propiedad.moneda ?? 'GTQ'}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="GTQ">GTQ</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Mantenimiento</label>
        <input
          type="number"
          name="mantenimiento"
          step="0.01"
          defaultValue={propiedad.mantenimiento ?? ''}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {esVenta && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">IUSI</label>
          <input
            type="number"
            name="iusi"
            step="0.01"
            defaultValue={propiedad.iusi ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      )}

      {esRenta && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Mascota</label>
          <input
            type="text"
            name="mascota"
            defaultValue={propiedad.mascota ?? ''}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
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
          defaultValue={propiedad.descripcion ?? ''}
          placeholder="Descripción de la propiedad, visible en el portal público"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="mb-2 mt-8 border-b border-gray-200 pb-2">
        <h2 className="text-base font-semibold text-[#2C3E50]">Informacion interna (No publicar)</h2>
        <p className="text-xs text-gray-500">Solo visible dentro del CRM, nunca en el portal publico.</p>
      </div>

      <SelectorPublicable defaultValue={propiedad.publicable ?? true} />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Modalidad de captacion</label>
        <select
          name="modalidad_captacion"
          defaultValue={propiedad.modalidad_captacion ?? 'Directo'}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
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
          {opcionesComisionPara(operacionActiva).map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>
      </div>

      {esVenta && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Hipoteca</label>
            <select
              name="hipoteca"
              defaultValue={propiedad.hipoteca ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Selecciona</option>
              <option value="Si">Si</option>
              <option value="No">No</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Valor hipoteca</label>
            <input
              type="number"
              name="valor_hipoteca"
              step="0.01"
              defaultValue={propiedad.valor_hipoteca ?? ''}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Acceso coordinar con:</label>
        <select
          name="acceso"
          defaultValue={propiedad.acceso ?? ''}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
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
          defaultValue={propiedad.propietario_nombre ?? ''}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Nombre del propietario"
        />
      </div>

      <SelectConNuevo
        name="colega_id"
        label="Colega"
        opciones={colegas ?? []}
        placeholder="Selecciona colega (opcional)"
        defaultValue={propiedad.colega_id ?? ''}
      />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Captado por</label>
        <select
          name="captado_por"
          defaultValue={propiedad.captado_por ?? ''}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Selecciona agente</option>
          {(perfiles ?? []).map((p) => (
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
          defaultValue={propiedad.comentarios ?? ''}
          placeholder="Notas internas adicionales sobre la propiedad"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-8">
        <SelectorFotos label="Agregar mas fotos (se anaden al final)" />
      </div>

      <BotonGuardarPropiedad
        accion={actualizarPropiedadDatos}
        conteoFotosExistentes={conteoFotosExistentes}
        redirectTo={`/dashboard/propiedades/${propiedad.id}`}
        className="w-full rounded bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Guardar cambios
      </BotonGuardarPropiedad>
    </FormularioSinEnvioNativo>
  )
}
