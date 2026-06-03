import React, { useEffect, useRef, useState } from 'react'
import { Brush, Eraser, PaintBucket, Redo2, Save, Trash2, Undo2 } from 'lucide-react'
import type { ToolProps } from './types'
import { SegmentedButton } from './shared'

type BoardTool = 'brush' | 'eraser' | 'fill'

// Board *content* colors are intentionally literal (a dry-erase palette on a cream surface) — they are
// drawing content, not themeable chrome.
const BOARD_SURFACE = '#f1efe7'
const BOARD_COLORS = [
  '#111827', '#dc2626', '#ea580c', '#ca8a04',
  '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777',
]
const MAX_HISTORY = 25

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

// Returns true only if it actually changed pixels (so the caller can skip a no-op undo snapshot).
function floodFill(canvas: HTMLCanvasElement, x: number, y: number, fillHex: string): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  const { width, height } = canvas
  const imgData = ctx.getImageData(0, 0, width, height)
  const d = imgData.data
  const px = Math.round(x), py = Math.round(y)
  if (px < 0 || py < 0 || px >= width || py >= height) return false
  const idx = (py * width + px) * 4
  const tr = d[idx], tg = d[idx + 1], tb = d[idx + 2], ta = d[idx + 3]
  const [fr, fg, fb] = hexToRgb(fillHex)
  if (tr === fr && tg === fg && tb === fb && ta === 255) return false
  const TOL = 12
  const matches = (i: number) =>
    Math.abs(d[i] - tr) <= TOL && Math.abs(d[i + 1] - tg) <= TOL &&
    Math.abs(d[i + 2] - tb) <= TOL && Math.abs(d[i + 3] - ta) <= TOL
  const visited = new Uint8Array(width * height)
  const stack: number[] = [py * width + px]
  visited[py * width + px] = 1
  while (stack.length > 0) {
    const pos = stack.pop()!
    const cx = pos % width, cy = Math.floor(pos / width), ci = pos * 4
    d[ci] = fr; d[ci + 1] = fg; d[ci + 2] = fb; d[ci + 3] = 255
    const neighbors = [cx > 0 ? pos - 1 : -1, cx < width - 1 ? pos + 1 : -1, cy > 0 ? pos - width : -1, cy < height - 1 ? pos + width : -1]
    for (const n of neighbors) if (n >= 0 && !visited[n] && matches(n * 4)) { visited[n] = 1; stack.push(n) }
  }
  ctx.putImageData(imgData, 0, 0)
  return true
}

export default function Whiteboard({ fullscreen }: ToolProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const undoRef = useRef<string[]>([])
  const redoRef = useRef<string[]>([])
  const [tool, setTool] = useState<BoardTool>('brush')
  const [color, setColor] = useState(BOARD_COLORS[0])
  const [strokeSize, setStrokeSize] = useState(6)
  const [confirmClear, setConfirmClear] = useState(false)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const syncHistoryFlags = () => { setCanUndo(undoRef.current.length > 0); setCanRedo(redoRef.current.length > 0) }

  // Snapshot the canvas BEFORE a mutating action so one undo reverts the whole action.
  function snapshot() {
    const canvas = canvasRef.current
    if (!canvas) return
    undoRef.current.push(canvas.toDataURL('image/png'))
    if (undoRef.current.length > MAX_HISTORY) undoRef.current.shift()
    redoRef.current = []
    syncHistoryFlags()
  }

  function restore(dataUrl: string) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = BOARD_SURFACE
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    }
    img.src = dataUrl
  }

  function undo() {
    const canvas = canvasRef.current
    if (!canvas || undoRef.current.length === 0) return
    redoRef.current.push(canvas.toDataURL('image/png'))
    restore(undoRef.current.pop()!)
    setSavedPath(null)
    syncHistoryFlags()
  }

  function redo() {
    const canvas = canvasRef.current
    if (!canvas || redoRef.current.length === 0) return
    undoRef.current.push(canvas.toDataURL('image/png'))
    restore(redoRef.current.pop()!)
    setSavedPath(null)
    syncHistoryFlags()
  }

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    function resize() {
      const rect = wrap!.getBoundingClientRect()
      const prev = document.createElement('canvas')
      prev.width = canvas!.width; prev.height = canvas!.height
      const prevCtx = prev.getContext('2d')
      if (prevCtx && canvas!.width > 0 && canvas!.height > 0) prevCtx.drawImage(canvas!, 0, 0)
      canvas!.width = Math.max(1, Math.floor(rect.width * devicePixelRatio))
      canvas!.height = Math.max(1, Math.floor(rect.height * devicePixelRatio))
      canvas!.style.width = `${rect.width}px`
      canvas!.style.height = `${rect.height}px`
      const ctx = canvas!.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = BOARD_SURFACE
      ctx.fillRect(0, 0, canvas!.width, canvas!.height)
      if (prev.width > 0 && prev.height > 0) ctx.drawImage(prev, 0, 0, canvas!.width, canvas!.height)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  // Keyboard shortcuts: B/E/F tools, Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo, [ ] size.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (mod) return
      if (e.key === 'b') setTool('brush')
      else if (e.key === 'e') setTool('eraser')
      else if (e.key === 'f') setTool('fill')
      else if (e.key === '[') setStrokeSize((s) => Math.max(2, s - 2))
      else if (e.key === ']') setStrokeSize((s) => Math.min(40, s + 2))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: (e.clientX - rect.left) * devicePixelRatio, y: (e.clientY - rect.top) * devicePixelRatio }
  }

  function drawSeg(from: { x: number; y: number }, to: { x: number; y: number }) {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.lineWidth = (tool === 'eraser' ? strokeSize * 2 : strokeSize) * devicePixelRatio
    ctx.strokeStyle = tool === 'eraser' ? BOARD_SURFACE : color
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke()
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === 'fill') {
      const canvas = canvasRef.current!
      const p = pointFromEvent(e)
      const before = canvas.toDataURL('image/png')
      if (floodFill(canvas, p.x, p.y, color)) {
        undoRef.current.push(before)
        if (undoRef.current.length > MAX_HISTORY) undoRef.current.shift()
        redoRef.current = []
        syncHistoryFlags()
        setSavedPath(null)
      }
      return
    }
    snapshot()
    setSavedPath(null)
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = pointFromEvent(e)
    lastPointRef.current = p
    drawSeg(p, p)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!lastPointRef.current) return
    const p = pointFromEvent(e)
    drawSeg(lastPointRef.current, p)
    lastPointRef.current = p
  }

  const stop = () => { lastPointRef.current = null }

  function clearBoard() {
    snapshot()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = BOARD_SURFACE
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setConfirmClear(false)
    setSavedPath(null)
  }

  async function saveBoard() {
    const canvas = canvasRef.current
    if (!canvas) return
    setSavedPath(await window.hub.saveImage(canvas.toDataURL('image/png'), 'terraplayer-board.png'))
  }

  const iconBtn = 'metal-key w-8 h-7 justify-center'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.10)' }}>
        <SegmentedButton active={tool === 'brush'} onClick={() => setTool('brush')} title="Brush (B)"><Brush size={13} /></SegmentedButton>
        <SegmentedButton active={tool === 'eraser'} onClick={() => setTool('eraser')} title="Eraser (E)"><Eraser size={13} /></SegmentedButton>
        <SegmentedButton active={tool === 'fill'} onClick={() => setTool('fill')} title="Fill (F)"><PaintBucket size={13} /></SegmentedButton>

        <div className="mx-1 h-4 w-px" style={{ background: 'rgb(var(--accent-rgb) / 0.15)' }} />

        <div className="flex items-center gap-1.5">
          {BOARD_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { setColor(c); if (tool !== 'brush') setTool('brush') }}
              title={c}
              className="h-5 w-5 rounded-full border transition-transform"
              style={{
                backgroundColor: c,
                borderColor: color === c && tool === 'brush' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)',
                transform: color === c && tool === 'brush' ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        <label className="ml-1 flex min-w-36 items-center gap-2 font-term text-[11px] uppercase tracking-[0.08em]" style={{ color: 'rgb(var(--ink-rgb) / 0.45)' }}>
          <span>Size</span>
          <input type="range" min={2} max={40} step={1} value={strokeSize} onChange={(e) => setStrokeSize(Number(e.target.value))} className="w-24" />
          <span className="w-5 text-right font-term" style={{ color: 'var(--ink)' }}>{strokeSize}</span>
        </label>

        <div className="mx-1 h-4 w-px" style={{ background: 'rgb(var(--accent-rgb) / 0.15)' }} />
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" className={iconBtn} style={{ opacity: canUndo ? 1 : 0.35 }}><Undo2 size={13} /></button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" className={iconBtn} style={{ opacity: canRedo ? 1 : 0.35 }}><Redo2 size={13} /></button>

        <div className="flex-1" />

        {savedPath && <span className="max-w-[160px] truncate font-term text-[11px]" style={{ color: 'var(--accent2)' }} title={savedPath}>Saved</span>}
        {confirmClear ? (
          <button onClick={clearBoard} className="metal-key px-3 py-1 font-term text-[12px]" style={{ color: '#FF3030', borderColor: 'rgba(255,48,48,0.40)' }}>Clear now</button>
        ) : (
          <button onClick={() => setConfirmClear(true)} className="metal-key gap-1.5 px-2.5 py-1 font-term text-[12px]" title="Clear board"><Trash2 size={12} />Clear</button>
        )}
        <button onClick={saveBoard} className="metal-key gap-1.5 px-2.5 py-1 font-term text-[12px]" title="Save PNG"><Save size={12} />Save</button>
      </div>

      <div className={`min-h-0 flex-1 p-3 ${fullscreen ? 'p-5' : ''}`}>
        <div ref={wrapRef} className="h-full overflow-hidden" style={{ background: BOARD_SURFACE, border: '1px solid rgb(var(--accent-rgb) / 0.15)' }}>
          <canvas
            ref={canvasRef}
            className="block h-full w-full touch-none"
            style={{ cursor: tool === 'fill' ? 'cell' : 'crosshair' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stop}
            onPointerCancel={stop}
            onPointerLeave={stop}
          />
        </div>
      </div>
    </div>
  )
}
