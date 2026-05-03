import React from 'react'

export default function TitleBar() {
  const isWindows = window.hub.isWindows

  return (
    <div
      className="drag-region relative z-[1] h-8 flex-shrink-0 flex items-center px-4 select-none"
      style={{ background: '#061224' }}
    >
      <span className="text-[10px] font-mono text-white/15 tracking-[0.18em] uppercase">
        Media Player
      </span>
      {!isWindows && (
        <div className="ml-auto flex items-center gap-1.5 no-drag">
          <button
            onClick={() => window.hub.minimizeWindow()}
            className="w-3 h-3 rounded-full bg-yellow-500/60 hover:bg-yellow-400 transition-colors"
            title="Minimize"
          />
          <button
            onClick={() => window.hub.maximizeWindow()}
            className="w-3 h-3 rounded-full bg-green-500/60 hover:bg-green-400 transition-colors"
            title="Maximize"
          />
          <button
            onClick={() => window.hub.closeWindow()}
            className="w-3 h-3 rounded-full bg-red-500/60 hover:bg-red-400 transition-colors"
            title="Close"
          />
        </div>
      )}
    </div>
  )
}
