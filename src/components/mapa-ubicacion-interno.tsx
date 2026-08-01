'use client'
import { useState } from 'react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const iconoPin = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

export default function MapaUbicacionInterno({
  latitud,
  longitud,
}: {
  latitud: number
  longitud: number
}) {
  const [activo, setActivo] = useState(false)

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer
        center={[latitud, longitud]}
        zoom={16}
        scrollWheelZoom={false}
        dragging={activo}
        touchZoom={activo}
        doubleClickZoom={activo}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latitud, longitud]} icon={iconoPin} />
      </MapContainer>

      {!activo && (
        <div
          onClick={() => setActivo(true)}
          onTouchStart={() => setActivo(true)}
          className="absolute inset-0 z-[1000] flex cursor-pointer items-center justify-center bg-black/5"
        >
          <span className="rounded bg-black/60 px-3 py-1.5 text-xs font-medium text-white">
            Toca para mover el mapa
          </span>
        </div>
      )}
    </div>
  )
}
