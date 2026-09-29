import { useEffect, useState } from 'react'
import { getThemeId, getCrtOff, getReduceMotion, getUiScaleId, THEME_EVENT, DISPLAY_EVENT } from './theme'

// Live theme + display-toggle state. applyTheme()/setCrtOff()/setReduceMotion()/setUiScale() broadcast THEME_EVENT /
// DISPLAY_EVENT CustomEvents; this hook keeps a component (the Appearance tab) in sync with them and with
// any other surface that changes them, without hand-rolling the same listener block.
export function useDisplayState(): { themeId: string; crtOff: boolean; reduceMotion: boolean; uiScaleId: string } {
  const [themeId, setThemeId] = useState(getThemeId)
  const [crtOff, setCrtOff] = useState(getCrtOff)
  const [reduceMotion, setReduceMotion] = useState(getReduceMotion)
  const [uiScaleId, setUiScaleId] = useState(getUiScaleId)
  useEffect(() => {
    const sync = () => {
      setThemeId(getThemeId())
      setCrtOff(getCrtOff())
      setReduceMotion(getReduceMotion())
      setUiScaleId(getUiScaleId())
    }
    window.addEventListener(THEME_EVENT, sync)
    window.addEventListener(DISPLAY_EVENT, sync)
    return () => {
      window.removeEventListener(THEME_EVENT, sync)
      window.removeEventListener(DISPLAY_EVENT, sync)
    }
  }, [])
  return { themeId, crtOff, reduceMotion, uiScaleId }
}
