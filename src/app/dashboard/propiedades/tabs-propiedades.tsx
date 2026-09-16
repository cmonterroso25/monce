'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { nombre: 'Propiedades', href: '/dashboard/propiedades' },
  { nombre: 'Propiedades externas', href: '/dashboard/propiedades/externas' },
]

export default function TabsPropiedades() {
  const pathname = usePathname()

  return (
    <div className="mb-4 flex gap-1 border-b border-slate-200">
      {TABS.map((tab) => {
        // "Propiedades" solo se marca activo en la ruta exacta, para no
        // competir con "Propiedades externas" (que también empieza con
        // /dashboard/propiedades).
        const activo =
          tab.href === '/dashboard/propiedades'
            ? pathname === '/dashboard/propiedades'
            : pathname.startsWith(tab.href)

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activo
                ? 'border-[#38B6FF] text-[#2C3E50]'
                : 'border-transparent text-slate-500 hover:text-[#2C3E50]'
            }`}
          >
            {tab.nombre}
          </Link>
        )
      })}
    </div>
  )
}
