import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { ToolProps } from './types'
import { focusInput, blurInput } from './shared'
import { textStats } from '@/lib/tools/notes'

const STORAGE_KEY = 'terraplayer.scratchpad.v1'
const AUTOSAVE_MS = 400

const PLACEHOLDER = [
  '> scratchpad ready.',
  '> type anything — it autosaves to this terminal.',
  '> setlists, lyric fragments, idle thoughts, BPMs...',
  '_',
].join('\n')

type SaveState = 'idle' | 'saving' | 'saved'

function loadInitial(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function Notes({ fullscreen }: ToolProps) {
  const [text, setText] = useState<string>(loadInitial)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [confirmClear, setConfirmClear] = useState(false)
  const saveTimer = useRef<number | null>(null)
  const clearTimer = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const latestText = useRef(text) // mirrors the newest text so unmount can flush it synchronously

  const stats = useMemo(() => textStats(text), [text])

  // Debounced autosave. Each keystroke flags "saving", then commits to localStorage after a quiet period.
  function scheduleSave(next: string) {
    setSaveState('saving')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* storage full / unavailable — keep the text in memory regardless */
      }
      saveTimer.current = null
      setSaveState('saved')
    }, AUTOSAVE_MS)
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value
    setText(next)
    latestText.current = next
    if (confirmClear) setConfirmClear(false)
    scheduleSave(next)
  }

  function clearNow() {
    setText('')
    latestText.current = ''
    setConfirmClear(false)
    if (clearTimer.current) { window.clearTimeout(clearTimer.current); clearTimer.current = null }
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    try {
      localStorage.setItem(STORAGE_KEY, '')
    } catch {
      /* ignore */
    }
    saveTimer.current = null
    setSaveState('saved')
    textareaRef.current?.focus()
  }

  function requestClear() {
    setConfirmClear(true)
    // Auto-revert the confirm prompt if the user walks away from it.
    if (clearTimer.current) window.clearTimeout(clearTimer.current)
    clearTimer.current = window.setTimeout(() => {
      clearTimer.current = null
      setConfirmClear(false)
    }, 4000)
  }

  // Tear down EVERY pending timer on unmount (memory discipline) and flush the latest text so the final
  // <400ms of typing isn't lost when the tool closes mid-debounce.
  useEffect(() => () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      try { localStorage.setItem(STORAGE_KEY, latestText.current) } catch { /* ignore */ }
    }
    if (clearTimer.current) window.clearTimeout(clearTimer.current)
  }, [])

  const savedLabel = saveState === 'saving' ? 'saving…' : saveState === 'saved' ? 'saved' : 'ready'
  const savedColor = saveState === 'saving' ? 'rgb(var(--accent2-rgb) / 0.7)' : 'var(--accent2)'

  const padText = fullscreen ? 'text-[18px]' : 'text-[14px]'
  const padLineHeight = fullscreen ? '1.7' : '1.6'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The terminal log surface. */}
      <div className={`min-h-0 flex-1 ${fullscreen ? 'p-5' : 'p-3'}`}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onFocus={focusInput}
          onBlur={blurInput}
          spellCheck={false}
          placeholder={PLACEHOLDER}
          aria-label="Scratchpad"
          className={`block h-full w-full resize-none px-3 py-3 font-mono ${padText} leading-relaxed`}
          style={{
            background: 'var(--bg-0)',
            color: 'var(--ink)',
            border: '1px solid rgb(var(--accent-rgb) / 0.25)',
            borderRadius: 0,
            outline: 'none',
            caretColor: 'var(--accent)',
            lineHeight: padLineHeight,
            tabSize: 4,
          }}
        />
      </div>

      {/* Slim footer: live counts + save indicator + clear. */}
      <div
        className="flex flex-shrink-0 items-center gap-3 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em]"
        style={{
          borderTop: '1px solid rgb(var(--accent-rgb) / 0.12)',
          color: 'rgb(var(--ink-rgb) / 0.5)',
        }}
      >
        <span><span style={{ color: 'var(--accent)' }}>{stats.chars}</span> ch</span>
        <span style={{ color: 'rgb(var(--accent-rgb) / 0.25)' }}>·</span>
        <span><span style={{ color: 'var(--accent)' }}>{stats.words}</span> wd</span>
        <span style={{ color: 'rgb(var(--accent-rgb) / 0.25)' }}>·</span>
        <span><span style={{ color: 'var(--accent)' }}>{stats.lines}</span> ln</span>

        <span className="flex items-center gap-1.5" style={{ color: savedColor }} title="Autosaves to local storage">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: 'currentColor',
              boxShadow: saveState === 'saving' ? 'none' : '0 0 5px currentColor',
              opacity: saveState === 'saving' ? 0.5 : 1,
              transition: 'opacity 120ms',
            }}
          />
          {savedLabel}
        </span>

        <div className="flex-1" />

        {confirmClear ? (
          <button
            onClick={clearNow}
            className="metal-key gap-1.5 px-2.5 py-0.5 font-term text-[12px] normal-case tracking-normal"
            style={{ color: '#FF3030', borderColor: 'rgba(255,48,48,0.40)' }}
            title="Erase the whole scratchpad"
          >
            Clear now
          </button>
        ) : (
          <button
            onClick={requestClear}
            disabled={text.length === 0}
            className="metal-key gap-1.5 px-2.5 py-0.5 font-term text-[12px] normal-case tracking-normal"
            style={{ opacity: text.length === 0 ? 0.4 : 1 }}
            title="Clear scratchpad"
          >
            <Trash2 size={12} />
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
