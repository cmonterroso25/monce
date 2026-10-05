export const CANALES_DASHBOARD = [
  { codigo: 'facebook_marketplace', nombre: 'Facebook Marketplace', color: '#1877F2' },
  { codigo: 'facebook_page', nombre: 'Facebook Pages', color: '#1877F2' },
  { codigo: 'instagram', nombre: 'Instagram', color: '#E4405F' },
  { codigo: 'whatsapp', nombre: 'WhatsApp', color: '#25D366' },
  { codigo: 'tiktok', nombre: 'TikTok', color: '#111827' },
] as const

export function IconoCanal({ codigo, className }: { codigo: string; className?: string }) {
  const comun = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
  } as const

  switch (codigo) {
    case 'facebook_marketplace':
      return (
        <svg {...comun}>
          <path d="M4 9.5 5.5 4h13L20 9.5" />
          <path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" />
          <path d="M5.5 12v8h13v-8" />
          <path d="M10 20v-4h4v4" />
        </svg>
      )
    case 'facebook_page':
      return (
        <svg {...comun}>
          <path d="M6 21V4" />
          <path d="M6 5h12l-2.5 4 2.5 4H6" />
        </svg>
      )
    case 'instagram':
      return (
        <svg {...comun}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'whatsapp':
      return (
        <svg {...comun}>
          <path d="M3.5 20.5 5 16A8.5 8.5 0 1 1 8 19l-4.5 1.5Z" />
          <path d="M9 8.8c.2 3 2.6 5.5 5.7 6l1.1-1.4-1.9-1-.9.7a3.6 3.6 0 0 1-1.9-1.9l.7-.9-1-1.9L9 8.8Z" />
        </svg>
      )
    case 'tiktok':
      return (
        <svg {...comun}>
          <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
          <path d="M14 3c.4 2.6 2 4.2 5 4.4" />
        </svg>
      )
    default:
      return (
        <svg {...comun}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      )
  }
}
