'use client'
import dynamic from 'next/dynamic'

const MapaUbicacionInterno = dynamic(() => import('./mapa-ubicacion-interno'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-slate-100" />,
})

export default function MapaUbicacion({
  latitud,
  longitud,
  googleMapsUrl,
  wazeUrl,
}: {
  latitud: number
  longitud: number
  googleMapsUrl?: string | null
  wazeUrl?: string | null
}) {
  return (
    <div className="mt-4">
      <div className="overflow-hidden rounded-lg border border-slate-200" style={{ height: 220 }}>
        <MapaUbicacionInterno latitud={latitud} longitud={longitud} />
      </div>
      <div className="mt-2 flex gap-2">
        {googleMapsUrl ? (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded bg-[#2C3E50] px-3 py-2 text-center text-xs font-medium text-white hover:bg-[#38B6FF]"
          >
            Buscar en Google Maps
          </a>
        ) : null}
        {wazeUrl ? (
          <a
            href={wazeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded bg-[#33CCFF] px-3 py-2 text-center text-xs font-medium text-white hover:opacity-90"
          >
            Buscar en Waze
          </a>
        ) : null}
      </div>
    </div>
  )
}
