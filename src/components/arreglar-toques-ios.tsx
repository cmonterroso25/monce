'use client'

import { useEffect } from 'react'

// Mitigación para un bug conocido de WebKit en iOS (Safari, Brave, Chrome-iOS
// —todos usan WKWebView por debajo—): después de que el teclado virtual se
// oculta (por ejemplo, tras copiar y pegar texto en un campo), el mapeo de
// coordenadas de toque puede quedar desincronizado del layout visual. El
// botón se ve en su lugar pero no responde al toque, como si no existiera,
// hasta recargar la página. Este componente escucha los eventos de
// `visualViewport` (que se disparan cuando el teclado aparece/desaparece) y
// fuerza un reflow para resincronizar el hit-testing, sin efecto visible.
export default function ArreglarToquesIOS() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    function resincronizarToques() {
      window.scrollTo(window.scrollX, window.scrollY)
      void document.body.offsetHeight
    }

    vv.addEventListener('resize', resincronizarToques)
    vv.addEventListener('scroll', resincronizarToques)
    return () => {
      vv.removeEventListener('resize', resincronizarToques)
      vv.removeEventListener('scroll', resincronizarToques)
    }
  }, [])

  return null
}
