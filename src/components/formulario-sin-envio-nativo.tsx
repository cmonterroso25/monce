'use client'

import { forwardRef } from 'react'

const FormularioSinEnvioNativo = forwardRef<
  HTMLFormElement,
  { children: React.ReactNode; className?: string }
>(function FormularioSinEnvioNativo({ children, className }, ref) {
  return (
    <form ref={ref} className={className} onSubmit={(e) => e.preventDefault()}>
      {children}
    </form>
  )
})

export default FormularioSinEnvioNativo
