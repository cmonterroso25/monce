export function urlSitio(ruta: string): string {
  let base = process.env.NEXT_PUBLIC_SITE_URL || ''
  if (base && !/^https?:\/\//.test(base)) {
    base = `https://${base}`
  }
  return `${base}${ruta}`
}
