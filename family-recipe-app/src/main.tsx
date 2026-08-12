import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// How often an already-open app checks for a new deploy. The browser only
// checks on navigation otherwise, so a phone left sitting on the counter would
// never notice one.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

// Under registerType: 'autoUpdate' this helper reloads the page as soon as a
// newly deployed worker takes control, so a deploy lands on the next open
// rather than the one after it.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    setInterval(() => {
      // Pointless while offline, and it would only log a failed fetch.
      if (navigator.onLine) registration.update()
    }, UPDATE_CHECK_INTERVAL_MS)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
