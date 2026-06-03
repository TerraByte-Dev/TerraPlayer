import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useContextMenuStore } from '@/store/contextMenu'

export default function ContextMenu() {
  const { open, x, y, items, closeMenu } = useContextMenuStore()
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 0 })

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) closeMenu()
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeMenu() }
    function onScroll() { closeMenu() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open, closeMenu])

  const menuW = 200
  const viewportPad = 6

  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const maxHeight = Math.max(80, window.innerHeight - viewportPad * 2)
    const renderedHeight = Math.min(rect.height, maxHeight)
    const left = Math.max(viewportPad, Math.min(x, window.innerWidth - menuW - viewportPad))
    const top = Math.max(viewportPad, Math.min(y, window.innerHeight - renderedHeight - viewportPad))
    setPosition({ left, top, maxHeight })
  }, [open, x, y, items])

  if (!open) return null

  return (
    <div
      ref={ref}
      className="fixed z-[100] py-1 overflow-y-auto"
      style={{
        left: position.left,
        top: position.top,
        width: menuW,
        maxHeight: position.maxHeight || window.innerHeight - viewportPad * 2,
        background: '#000',
        border: '1px solid var(--accent)',
        borderRadius: 0,
        boxShadow: '0 0 12px rgb(var(--accent-rgb) / 0.30)',
        visibility: position.maxHeight ? 'visible' : 'hidden',
      }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return (
            <div
              key={i}
              className="my-1 h-px mx-2"
              style={{ background: 'rgb(var(--accent-rgb) / 0.08)', borderTop: '1px dashed rgb(var(--accent-rgb) / 0.08)' }}
            />
          )
        }
        return (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) { item.onClick?.(); closeMenu() }
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 font-term text-[13px] text-left transition-colors"
            style={{
              color: item.disabled
                ? 'rgb(var(--ink-rgb) / 0.25)'
                : item.danger
                ? '#FF3030'
                : 'var(--ink)',
              cursor: item.disabled ? 'default' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (item.disabled) return
              e.currentTarget.style.background = 'rgb(var(--accent-rgb) / 0.10)'
              e.currentTarget.style.color = item.danger ? '#ff6060' : 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = ''
              e.currentTarget.style.color = item.disabled ? 'rgb(var(--ink-rgb) / 0.25)' : item.danger ? '#FF3030' : 'var(--ink)'
            }}
          >
            {item.icon && (
              <span style={{ opacity: item.disabled ? 0.3 : 0.5, flexShrink: 0 }}>
                {item.icon}
              </span>
            )}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
