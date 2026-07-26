'use client'

export default function FormularioSinEnvioNativo({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <form className={className} onSubmit={(e) => e.preventDefault()}>
      {children}
    </form>
  )
}
