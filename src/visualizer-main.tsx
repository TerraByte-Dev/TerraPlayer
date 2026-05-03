import React from 'react'
import ReactDOM from 'react-dom/client'
import FullscreenVisualizer from './components/FullscreenVisualizer'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FullscreenVisualizer source="ipc" />
  </React.StrictMode>
)
