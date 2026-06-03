import { useEffect, useState } from 'react'
import { getThemeId, getCrtOff, getReduceMotion, THEME_EVENT, DISPLAY_EVENT } from './theme'

// Live theme + display-toggle state. applyTheme()/setCrtOff()/setReduceMotion() broadcast THEME_EVENT /
// DISPLAY_EVENT CustomEvents; this hook keeps a component (the Appearance tab) in sync with them and with
// any other surface that changes them, without hand-rolling the same listener block.
export function useDisplayState(): { themeId: string; crtOff: boolean; reduceMotion: boolean } {
  const [themeId, setThemeId] = useState(getThemeId)
  const [crtOff, setCrtOff] = useState(getCrtOff)
  const [reduceMotion, setReduceMotion] = useState(getReduceMotion)
  useEffect(() => {
    const sync = () => {
      setThemeId(getThemeId())
      setCrtOff(getCrtOff())
      setReduceMotion(getReduceMotion())
    }
    window.addEventListener(THEME_EVENT, sync)
    window.addEventListener(DISPLAY_EVENT, sync)
    return () => {
      window.removeEventListener(THEME_EVENT, sync)
      window.removeEventListener(DISPLAY_EVENT, sync)
    }
  }, [])
  return { themeId, crtOff, reduceMotion }
}
