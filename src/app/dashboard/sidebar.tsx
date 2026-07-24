'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Building2,
  Users,
  UserCircle,
  ClipboardList,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { cerrarSesion } from './acciones'

type Modulo = {
  nombre: string
  href: string
  icono: React.ElementType
  construido: boolean
}

const modulos: Modulo[] = [
  { nombre: 'Dashboard', href: '/dashboard', icono: LayoutDashboard, construido: true },
  { nombre: 'Propiedades', href: '/dashboard/propiedades', icono: Building2, construido: true },
  { nombre: 'Contactos', href: '/dashboard/contactos', icono: UserCircle, construido: true },
  { nombre: 'Leads', href: '/dashboard/leads', icono: ClipboardList, construido: true },
  { nombre: 'Calendario', href: '/dashboard/calendario', icono: CalendarDays, construido: true },
  { nombre: 'Actividades', href: '/dashboard/actividades', icono: CalendarClock, construido: true },
  { nombre: 'Agentes', href: '/dashboard/agentes', icono: Users, construido: true },
  { nombre: 'Tareas', href: '/dashboard/tareas', icono: CheckSquare, construido: true },
  { nombre: 'Configuración', href: '/dashboard/configuracion', icono: Settings, construido: true },
]

type SidebarProps = {
  nombreCompleto: string | null
  rol: string | null
  email: string | null
  citasHoy?: number
}

export default function Sidebar({ nombreCompleto, rol, email, citasHoy = 0 }: SidebarProps) {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)

  const esActivo = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="fixed left-4 top-4 z-40 rounded-md bg-[#2C3E50] p-2 text-white lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      {abierto && (
        <div onClick={() => setAbierto(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#2C3E50] text-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          abierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-5">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src="/logo-monce.png" alt="Monce Inmobiliaria" width={36} height={36} className="rounded" />
            <span className="text-sm font-semibold leading-tight">
              Monce
              <br />
              Inmobiliaria
            </span>
          </Link>
          <button onClick={() => setAbierto(false)} className="text-white/70 hover:text-white lg:hidden" aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {modulos.map((modulo) => {
            const Icono = modulo.icono
            const activo = esActivo(modulo.href)
            const mostrarBadgeCitas = modulo.href === '/dashboard/calendario' && citasHoy > 0

            if (!modulo.construido) {
              return (
                <div
                  key={modulo.href}
                  className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm text-white/35"
                  title="Próximamente"
                >
                  <span className="flex items-center gap-3">
                    <Icono size={18} />
                    {modulo.nombre}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">Próximo</span>
                </div>
              )
            }

            return (
              <Link
                key={modulo.href}
                href={modulo.href}
                onClick={() => setAbierto(false)}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                  activo ? 'bg-[#38B6FF] text-[#2C3E50] font-semibold' : 'text-white/85 hover:bg-white/10'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icono size={18} />
                  {modulo.nombre}
                </span>
                {mostrarBadgeCitas && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {citasHoy}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <p className="truncate text-sm font-medium">{nombreCompleto ?? 'Usuario'}</p>
          <p className="truncate text-xs text-white/50">{email}</p>
          {rol && (
            <span className="mt-1 inline-block rounded bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
              {rol}
            </span>
          )}
          <form action={cerrarSesion} className="mt-3">
            <button className="flex w-full items-center justify-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
