import React from 'react'

interface Props {
  src?: string | null
  label?: string
  size?: number
}

// Single shared pattern ID — all instances define the same pattern so Chromium
// resolves url(#vcg-pat) from whichever <defs> is first in the document.
const PAT_ID = 'vcg-pat'

export default function VectorGridCover({ src, label = 'A:000', size = 68 }: Props) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        position: 'relative',
        background: 'var(--bg-0)',
        border: '1px solid var(--accent)',
        borderRadius: 3,
        boxShadow: '0 0 14px rgb(var(--accent-rgb) / 0.20), inset 0 0 14px rgb(var(--accent-rgb) / 0.13)',
        overflow: 'hidden',
      }}
    >
      {/* Cover art behind SVG overlay */}
      {src && (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}

      {/* Vector grid + decorations */}
      <svg
        width={size}
        height={size}
        style={{ position: 'absolute', inset: 0, color: 'var(--accent)' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id={PAT_ID} width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 8 0 L 0 0 0 8" fill="none" stroke="currentColor" strokeWidth="0.4" opacity="0.4" />
          </pattern>
        </defs>
        {!src && <rect width={size} height={size} fill={`url(#${PAT_ID})`} />}
        <circle cx={size / 2} cy={size / 2} r={size * 0.29} fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.75" />
        <circle cx={size / 2} cy={size / 2} r={size * 0.18} fill="none" style={{ stroke: 'var(--accent2)' }} strokeWidth="0.6" opacity="0.6" />
        <line x1="0" y1={size / 2} x2={size} y2={size / 2} stroke="currentColor" strokeWidth="0.4" opacity="0.5" />
        <line x1={size / 2} y1="0" x2={size / 2} y2={size} stroke="currentColor" strokeWidth="0.4" opacity="0.5" />
        {!src && (
          <text
            x={size / 2}
            y={size / 2 + 4}
            textAnchor="middle"
            fontSize={size < 32 ? 5 : 8}
            fill="currentColor"
            fontFamily='"VT323", monospace'
          >
            {label}
          </text>
        )}
      </svg>

      {/* Corner markers */}
      {[
        { left: 2, top: 2 },
        { right: 2, top: 2 },
        { left: 2, bottom: 2 },
        { right: 2, bottom: 2 },
      ].map((pos, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            width: 4,
            height: 4,
            border: '1px solid var(--accent)',
            ...pos,
          }}
        />
      ))}
    </div>
  )
}
