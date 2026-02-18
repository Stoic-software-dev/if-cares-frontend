'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import useAuth from '@/hooks/useAuth'
import { ROLES } from '@/constants'

const WIDGET_SCRIPT_ID = 'feedback-widget-script'

function removeWidget() {
  // Remover el script
  const script = document.getElementById(WIDGET_SCRIPT_ID)
  script?.remove()

  // Remover el botón del widget (clase fw-trigger)
  document.querySelectorAll('.fw-trigger').forEach(el => el.remove())

  // Remover cualquier otro elemento con prefijo fw- (feedback widget)
  document.querySelectorAll('[class^="fw-"]').forEach(el => el.remove())
  document.querySelectorAll('[class*=" fw-"]').forEach(el => el.remove())
}

function loadWidget() {
  // Si ya existe el script, no lo cargamos de nuevo
  if (document.getElementById(WIDGET_SCRIPT_ID)) {
    return
  }

  const script = document.createElement('script')
  script.id = WIDGET_SCRIPT_ID
  script.src = 'https://clients-button-widget-production.up.railway.app/widget/feedback-widget.js'
  script.setAttribute('data-api-url', 'https://clients-button-widget-production.up.railway.app')
  script.setAttribute('data-project', 'STOIC')
  script.setAttribute('data-epic', 'STOIC-8')
  script.setAttribute('data-client-email', 'kenya@ifcares.org')
  script.async = true
  document.body.appendChild(script)
}

export default function FeedbackWidget() {
  const { auth } = useAuth()
  const pathname = usePathname()

  useEffect(() => {
    const isAdmin = auth && auth.role === ROLES.Admin
    const isLoginPage = pathname?.includes('login')
    const shouldShow = isAdmin && !isLoginPage

    if (shouldShow) {
      loadWidget()
    } else {
      removeWidget()
    }

    return () => {
      removeWidget()
    }
  }, [auth, pathname])

  // No renderizamos nada - el script se maneja directamente en el DOM
  return null
}
