'use client'

import { useFormStatus } from 'react-dom'

export default function BotonEnviar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className ?? ''} ${pending ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      {pending ? 'Guardando...' : children}
    </button>
  )
}
