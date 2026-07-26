type PropiedadAreasYAmbientes = {
  niveles?: string | null
  parqueos?: number | null
  numero_casa?: string | null
  area_construccion_m2?: number | null
  area_terreno_m2?: number | null
  medidas_terreno?: string | null
  extras?: string | null
  mantenimiento?: number | null
  iusi?: number | null
  mascota?: string | null
  sala?: string | null
  comedor?: string | null
  cocina?: string | null
  estudio?: string | null
  sala_familiar?: string | null
  habitacion_servicio?: string | null
  lavanderia?: string | null
  jardin?: string | null
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  if (valor === null || valor === undefined || valor === '') return null
  return (
    <div>
      <p className="text-xs text-slate-400">{etiqueta}</p>
      <p className="text-sm text-slate-700">{valor}</p>
    </div>
  )
}

export default function SeccionAreasYAmbientes({
  propiedad,
  titulo = 'Información pública',
  className = '',
}: {
  propiedad: PropiedadAreasYAmbientes
  titulo?: string
  className?: string
}) {
  const amenidades = [
    ['Sala', propiedad.sala],
    ['Comedor', propiedad.comedor],
    ['Cocina', propiedad.cocina],
    ['Estudio', propiedad.estudio],
    ['Sala familiar', propiedad.sala_familiar],
    ['Habitación de servicio', propiedad.habitacion_servicio],
    ['Lavandería', propiedad.lavanderia],
    ['Jardín', propiedad.jardin],
  ].filter(([, valor]) => valor)

  return (
    <div className={className}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {titulo}
      </h2>

      <div className="mb-4">
        <h3 className="mb-2 font-semibold text-[#2C3E50]">Areas</h3>
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-3">
          <Dato etiqueta="Niveles" valor={propiedad.niveles} />
          <Dato etiqueta="Parqueos" valor={propiedad.parqueos} />
          <Dato etiqueta="Número de casa" valor={propiedad.numero_casa} />
          <Dato etiqueta="M² construcción" valor={propiedad.area_construccion_m2} />
          <Dato etiqueta="M² terreno" valor={propiedad.area_terreno_m2} />
          <Dato etiqueta="Medidas del terreno" valor={propiedad.medidas_terreno} />
          <Dato etiqueta="Extras" valor={propiedad.extras} />
          <Dato
            etiqueta="Mantenimiento"
            valor={propiedad.mantenimiento ? Number(propiedad.mantenimiento).toLocaleString() : null}
          />
          <Dato etiqueta="IUSI" valor={propiedad.iusi ? Number(propiedad.iusi).toLocaleString() : null} />
          <Dato etiqueta="Mascota" valor={propiedad.mascota} />
        </div>
      </div>

      {amenidades.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-[#2C3E50]">Ambientes</h3>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-3">
            {amenidades.map(([etiqueta, valor]) => (
              <Dato key={etiqueta as string} etiqueta={etiqueta as string} valor={valor as string} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
