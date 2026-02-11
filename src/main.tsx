import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Detect Tauri environment and add class for CSS targeting.
// In Tauri, html/body must be transparent so native rounded corners work.
if ((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) {
  document.documentElement.classList.add('tauri')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
