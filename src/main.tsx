import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { bootDisplayPreferences, getTheme, getThemeId } from './lib/theme'

// Apply the saved theme + display toggles to <html> before React mounts, so the app boots straight into
// the user's chosen look with no flash of the default green.
bootDisplayPreferences()
// Recolor the native window-control glyphs (min/max/close) to the saved theme's accent — before paint so
// they don't flash the default green. App.tsx keeps them in sync on later theme changes.
window.hub.setTitleBarOverlay(getTheme(getThemeId()).swatch.accent)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
