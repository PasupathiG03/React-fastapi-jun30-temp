import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installApiFetch } from './lib/api.ts'
import { installLinkPrefetch, preloadRoute } from './lib/lazyPages.ts'

installApiFetch()
installLinkPrefetch()
// Fetch the layout and the opened page's code together, instead of one waiting for the other.
preloadRoute(window.location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
