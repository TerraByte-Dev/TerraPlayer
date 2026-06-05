import React from 'react'
import ReactDOM from 'react-dom/client'
import FullscreenVisualizer from './components/FullscreenVisualizer'
import { bootDisplayPreferences } from './lib/theme'
import './styles/index.css'

// The popout is its own window — apply the persisted theme (shared-origin localStorage) before mounting so it
// boots straight into the user's theme with no flash; live theme changes then arrive over the viz:theme IPC.
bootDisplayPreferences()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FullscreenVisualizer source="ipc" />
  </React.StrictMode>
)
