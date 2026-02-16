import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initBackendPort } from '@/services/env'
import './index.css'

// Detect Tauri environment and add class for CSS targeting.
// In Tauri, html/body must be transparent so native rounded corners work.
if ((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) {
  document.documentElement.classList.add('tauri')
}

// In Tauri mode, fetch the real backend port from config.yaml before rendering.
// This ensures all API/WS URLs point to the correct port (not just default 6600).
initBackendPort().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
