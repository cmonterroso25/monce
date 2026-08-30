'use client'
import { useEffect } from 'react'
// Mitigación para un bug conocido de WebKit en iOS (Safari, Brave, Chrome-iOS
// —todos usan WKWebView por debajo—): después de que el teclado virtual se
// oculta (por ejemplo, tras copiar y pegar texto en un campo), el mapeo de
// coordenadas de toque puede quedar desincronizado del layout visual. El
// botón se ve en su lugar pero no responde al toque, como si no existiera,
// hasta recargar la página. Este componente escucha el evento `resize` de
// `visualViewport` (que se dispara cuando el teclado aparece/desaparece) y
// fuerza un reflow para resincronizar el hit-testing, sin efecto visible.
//
// IMPORTANTE: NO escuchar el evento `scroll` de visualViewport aquí. Ese
// evento también se dispara continuamente durante el scroll normal (no solo
// con el teclado), y forzar `scrollTo` + reflow síncrono en cada tick pelea
// contra el scroll por inercia de iOS, causando que la pantalla se trabe o
// se congele al deslizar rápido.
export default function ArreglarToquesIOS() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let frame: number | null = null
    function resincronizarToques() {
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        window.scrollTo(window.scrollX, window.scrollY)
        void document.body.offsetHeight
      })
    }
    vv.addEventListener('resize', resincronizarToques)
    return () => {
      vv.removeEventListener('resize', resincronizarToques)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])
  return null
}
