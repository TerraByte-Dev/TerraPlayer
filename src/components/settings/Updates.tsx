import React, { useEffect, useState } from 'react'

type UpdateStatus =
  | 'idle' | 'checking' | 'up-to-date' | 'available'
  | 'downloading' | 'downloaded' | 'error' | 'dev-mode'

export default function Updates() {
  const [version, setVersion] = useState('')
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [availableVer, setAvailableVer] = useState('')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    window.hub.getAppVersion().then(setVersion)
    const unsubs = [
      window.hub.onUpdateAvailable(({ version: v }) => { setAvailableVer(v); setStatus('available') }),
      window.hub.onUpdateNotAvailable(() => setStatus('up-to-date')),
      window.hub.onUpdateProgress(({ percent }) => { setProgress(percent); setStatus('downloading') }),
      window.hub.onUpdateDownloaded(() => setStatus('downloaded')),
      window.hub.onUpdateError(({ message }) => { setErrorMsg(message); setStatus('error') }),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  async function handleCheck() {
    setStatus('checking')
    const result = await window.hub.checkForUpdate()
    if (result.devMode) setStatus('dev-mode')
  }

  const [confirmUninstall, setConfirmUninstall] = useState(false)
  const [uninstallErr, setUninstallErr] = useState('')

  async function handleUninstall() {
    const r = await window.hub.uninstallApp()
    if (!r.ok) setUninstallErr(
      r.reason === 'dev-mode' ? 'uninstall only works in packaged builds' : (r.reason || 'failed to launch uninstaller')
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="font-term text-[10px] tracking-[2px] mb-1" style={{ color: 'rgb(var(--accent-rgb) / 0.35)' }}>
          INSTALLED VERSION
        </div>
        <div className="font-lcd text-[26px] tracking-[2px] phosphor-glow" style={{ color: 'var(--accent)' }}>
          v{version || '—'}
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgb(var(--accent-rgb) / 0.10)' }} className="pt-4 flex flex-col gap-3">
        <StatusLine status={status} availableVer={availableVer} progress={progress} errorMsg={errorMsg} />

        <div className="flex gap-2 mt-1">
          {(status === 'idle' || status === 'up-to-date' || status === 'dev-mode' || status === 'checking') && (
            <button className="metal-key px-4 h-8 font-term text-[10px] tracking-[1px]" onClick={handleCheck} disabled={status === 'checking'}>
              {status === 'checking' ? 'CHECKING…' : 'CHECK FOR UPDATES'}
            </button>
          )}
          {status === 'available' && (
            <button className="metal-key px-4 h-8 font-term text-[10px] tracking-[1px]" onClick={() => { setStatus('downloading'); window.hub.downloadUpdate() }}>
              DOWNLOAD UPDATE
            </button>
          )}
          {status === 'downloaded' && (
            <button className="metal-key px-4 h-8 font-term text-[10px] tracking-[1px]" onClick={() => window.hub.installUpdate()}>
              INSTALL &amp; RESTART
            </button>
          )}
          {status === 'error' && (
            <button className="metal-key px-4 h-8 font-term text-[10px] tracking-[1px]" onClick={() => { setStatus('idle'); setErrorMsg('') }}>
              TRY AGAIN
            </button>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div style={{ borderTop: '1px solid rgba(255,85,85,0.15)' }} className="pt-4 mt-2 flex flex-col gap-2">
        <div className="font-term text-[10px] tracking-[2px]" style={{ color: 'rgba(255,85,85,0.55)' }}>DANGER ZONE</div>
        {!confirmUninstall ? (
          <button
            className="px-4 h-8 font-term text-[10px] tracking-[1px] self-start"
            onClick={() => { setUninstallErr(''); setConfirmUninstall(true) }}
            style={{ color: '#ff6b6b', background: 'rgba(255,85,85,0.06)', border: '1px solid rgba(255,85,85,0.35)' }}
          >
            UNINSTALL TERRAPLAYER
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-term text-[11px]" style={{ color: '#ff6b6b' }}>this will remove TerraPlayer. continue?</span>
            <button className="px-3 h-7 font-term text-[10px] tracking-[1px]" onClick={handleUninstall}
              style={{ color: '#000', background: '#ff5555', border: '1px solid #ff5555' }}>YES, UNINSTALL</button>
            <button className="metal-key px-3 h-7 font-term text-[10px] tracking-[1px]" onClick={() => setConfirmUninstall(false)}>CANCEL</button>
          </div>
        )}
        {uninstallErr && <p className="font-term text-[11px]" style={{ color: '#ff5555' }}>{uninstallErr}</p>}
      </div>
    </div>
  )
}

function StatusLine({ status, availableVer, progress, errorMsg }: {
  status: UpdateStatus; availableVer: string; progress: number; errorMsg: string
}) {
  const accent = 'var(--accent)'
  const accent2 = 'var(--accent2)'
  const dim = 'rgb(var(--accent-rgb) / 0.35)'
  const red = '#ff5555'

  if (status === 'idle') return null
  if (status === 'checking') return <p className="font-term text-[11px]" style={{ color: accent2 }}>scanning for updates…</p>
  if (status === 'up-to-date') return <p className="font-term text-[11px]" style={{ color: accent }}>you&apos;re on the latest version</p>
  if (status === 'available') return <p className="font-term text-[11px]" style={{ color: accent2 }}>v{availableVer} is available</p>
  if (status === 'downloading')
    return (
      <div className="flex flex-col gap-1.5">
        <p className="font-term text-[11px]" style={{ color: accent2 }}>downloading… {progress}%</p>
        <div style={{ height: 2, background: 'rgb(var(--accent-rgb) / 0.15)', borderRadius: 1 }}>
          <div style={{ height: 2, width: `${progress}%`, background: accent, borderRadius: 1, transition: 'width 0.3s ease' }} />
        </div>
      </div>
    )
  if (status === 'downloaded') return <p className="font-term text-[11px]" style={{ color: accent }}>update ready — restart to apply</p>
  if (status === 'error') return <p className="font-term text-[11px]" style={{ color: red }}>{errorMsg || 'update check failed'}</p>
  if (status === 'dev-mode') return <p className="font-term text-[11px]" style={{ color: dim }}>updates only available in packaged builds</p>
  return null
}
