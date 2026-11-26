import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/space-grotesk/wght.css'
import './app.css'
import App from './App'
import { OSProvider } from './state/osStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OSProvider><App /></OSProvider>
  </StrictMode>,
)
