import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { bootDisplayPreferences } from './lib/theme'

// Apply the saved theme + display toggles to <html> before React mounts, so the app boots straight into
// the user's chosen look with no flash of the default green.
bootDisplayPreferences()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
