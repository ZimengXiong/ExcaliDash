import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const w = window as any
if (typeof w.EXCALIDRAW_ASSET_PATH !== 'string' || w.EXCALIDRAW_ASSET_PATH.length === 0) {
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  w.EXCALIDRAW_ASSET_PATH = new URL(normalizedBase, window.location.origin).toString()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
