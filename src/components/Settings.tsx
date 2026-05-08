import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'dev-mode'

type Section = 'updates' | 'audio' | 'library' | 'about'

const NAV: { id: Section; label: string; enabled: boolean }[] = [
  { id: 'updates',  label: 'UPDATES',  enabled: true  },
  { id: 'audio',   label: 'AUDIO',    enabled: false },
  { id: 'library', label: 'LIBRARY',  enabled: false },
  { id: 'about',   label: 'ABOUT',    enabled: false },
]

export default function Settings({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>('updates')
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
    return () => unsubs.forEach(fn => fn())
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleCheck() {
    setStatus('checking')
    const result = await window.hub.checkForUpdate()
    if (result.devMode) setStatus('dev-mode')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center no-drag"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col"
        style={{
          width: 'min(720px, calc(100vw - 32px))',
          height: 'min(460px, calc(100vh - 48px))',
          background: '#020503',
          border: '1px solid rgba(0,255,136,0.25)',
          boxShadow: '0 0 40px rgba(0,255,136,0.08)',
        }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 h-10 flex items-center justify-between px-4"
          style={{ borderBottom: '1px solid rgba(0,255,136,0.15)', background: '#000' }}
        >
          <div className="flex items-center gap-2">
            <span style={{
              display: 'inline-block', width: 5, height: 5,
              background: '#00E5FF', transform: 'rotate(45deg)', boxShadow: '0 0 6px #00E5FF',
            }} />
            <span className="font-term text-[11px] tracking-[2.5px]" style={{ color: '#00E5FF' }}>
              SETTINGS
            </span>
          </div>
          <button className="metal-key w-7 h-7" onClick={onClose}>
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left nav rail */}
          <div
            className="flex-shrink-0 w-32 flex flex-col pt-3"
            style={{ borderRight: '1px solid rgba(0,255,136,0.12)' }}
          >
            {NAV.map(({ id, label, enabled }) => (
              <button
                key={id}
                onClick={() => enabled && setSection(id)}
                disabled={!enabled}
                className="text-left px-4 py-2 font-term text-[10px] tracking-[1.5px] transition-colors"
                style={{
                  color: !enabled ? 'rgba(0,255,136,0.18)' : section === id ? '#00FF88' : 'rgba(0,255,136,0.45)',
                  background: section === id ? 'rgba(0,255,136,0.06)' : 'transparent',
                  borderLeft: section === id ? '2px solid #00FF88' : '2px solid transparent',
                  cursor: enabled ? 'pointer' : 'default',
                }}
              >
                {label}
                {!enabled && (
                  <span className="block font-term" style={{ fontSize: 8, color: 'rgba(0,255,136,0.18)', letterSpacing: 1 }}>
                    SOON
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content pane */}
          <div className="flex-1 overflow-y-auto p-6">
            {section === 'updates' && (
              <UpdatesPane
                version={version}
                status={status}
                availableVer={availableVer}
                progress={progress}
                errorMsg={errorMsg}
                onCheck={handleCheck}
                onDownload={() => { setStatus('downloading'); window.hub.downloadUpdate() }}
                onInstall={() => window.hub.installUpdate()}
                onRetry={() => { setStatus('idle'); setErrorMsg('') }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function UpdatesPane({
  version, status, availableVer, progress, errorMsg,
  onCheck, onDownload, onInstall, onRetry,
}: {
  version: string
  status: UpdateStatus
  availableVer: string
  progress: number
  errorMsg: string
  onCheck: () => void
  onDownload: () => void
  onInstall: () => void
  onRetry: () => void
}) {
  const [confirmUninstall, setConfirmUninstall] = React.useState(false)
  const [uninstallErr, setUninstallErr] = React.useState('')

  async function handleUninstall() {
    const r = await window.hub.uninstallApp()
    if (!r.ok) setUninstallErr(
      r.reason === 'dev-mode' ? 'uninstall only works in packaged builds' : (r.reason || 'failed to launch uninstaller')
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="font-term text-[10px] tracking-[2px] mb-1" style={{ color: 'rgba(0,255,136,0.35)' }}>
          INSTALLED VERSION
        </div>
        <div className="font-lcd text-[26px] tracking-[2px] phosphor-glow" style={{ color: '#00FF88' }}>
          v{version || '—'}
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(0,255,136,0.10)' }} className="pt-4 flex flex-col gap-3">
        <StatusLine status={status} availableVer={availableVer} progress={progress} errorMsg={errorMsg} />

        <div className="flex gap-2 mt-1">
          {(status === 'idle' || status === 'up-to-date' || status === 'dev-mode' || status === 'checking') && (
            <button
              className="metal-key px-4 h-8 font-term text-[10px] tracking-[1px]"
              onClick={onCheck}
              disabled={status === 'checking'}
            >
              {status === 'checking' ? 'CHECKING…' : 'CHECK FOR UPDATES'}
            </button>
          )}
          {status === 'available' && (
            <button className="metal-key px-4 h-8 font-term text-[10px] tracking-[1px]" onClick={onDownload}>
              DOWNLOAD UPDATE
            </button>
          )}
          {status === 'downloaded' && (
            <button className="metal-key px-4 h-8 font-term text-[10px] tracking-[1px]" onClick={onInstall}>
              INSTALL &amp; RESTART
            </button>
          )}
          {status === 'error' && (
            <button className="metal-key px-4 h-8 font-term text-[10px] tracking-[1px]" onClick={onRetry}>
              TRY AGAIN
            </button>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div style={{ borderTop: '1px solid rgba(255,85,85,0.15)' }} className="pt-4 mt-2 flex flex-col gap-2">
        <div className="font-term text-[10px] tracking-[2px]" style={{ color: 'rgba(255,85,85,0.55)' }}>
          DANGER ZONE
        </div>
        {!confirmUninstall ? (
          <button
            className="px-4 h-8 font-term text-[10px] tracking-[1px] self-start"
            onClick={() => { setUninstallErr(''); setConfirmUninstall(true) }}
            style={{
              color: '#ff6b6b',
              background: 'rgba(255,85,85,0.06)',
              border: '1px solid rgba(255,85,85,0.35)',
            }}
          >
            UNINSTALL T-PLAY
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-term text-[11px]" style={{ color: '#ff6b6b' }}>
              this will remove T-Play. continue?
            </span>
            <button
              className="px-3 h-7 font-term text-[10px] tracking-[1px]"
              onClick={handleUninstall}
              style={{ color: '#000', background: '#ff5555', border: '1px solid #ff5555' }}
            >
              YES, UNINSTALL
            </button>
            <button
              className="metal-key px-3 h-7 font-term text-[10px] tracking-[1px]"
              onClick={() => setConfirmUninstall(false)}
            >
              CANCEL
            </button>
          </div>
        )}
        {uninstallErr && (
          <p className="font-term text-[11px]" style={{ color: '#ff5555' }}>{uninstallErr}</p>
        )}
      </div>
    </div>
  )
}

function StatusLine({ status, availableVer, progress, errorMsg }: {
  status: UpdateStatus
  availableVer: string
  progress: number
  errorMsg: string
}) {
  const cyan = '#00E5FF'
  const green = '#00FF88'
  const dim = 'rgba(0,255,136,0.35)'
  const red = '#ff5555'

  if (status === 'idle') return null

  if (status === 'checking')
    return <p className="font-term text-[11px]" style={{ color: cyan }}>scanning for updates…</p>

  if (status === 'up-to-date')
    return <p className="font-term text-[11px]" style={{ color: green }}>you&apos;re on the latest version</p>

  if (status === 'available')
    return <p className="font-term text-[11px]" style={{ color: cyan }}>v{availableVer} is available</p>

  if (status === 'downloading')
    return (
      <div className="flex flex-col gap-1.5">
        <p className="font-term text-[11px]" style={{ color: cyan }}>downloading… {progress}%</p>
        <div style={{ height: 2, background: 'rgba(0,255,136,0.15)', borderRadius: 1 }}>
          <div style={{ height: 2, width: `${progress}%`, background: green, borderRadius: 1, transition: 'width 0.3s ease' }} />
        </div>
      </div>
    )

  if (status === 'downloaded')
    return <p className="font-term text-[11px]" style={{ color: green }}>update ready — restart to apply</p>

  if (status === 'error')
    return <p className="font-term text-[11px]" style={{ color: red }}>{errorMsg || 'update check failed'}</p>

  if (status === 'dev-mode')
    return <p className="font-term text-[11px]" style={{ color: dim }}>updates only available in packaged builds</p>

  return null
}
