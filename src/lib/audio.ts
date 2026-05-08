let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let sourceNode: MediaElementAudioSourceNode | null = null
let lowFilter: BiquadFilterNode | null = null
let midFilter: BiquadFilterNode | null = null
let highFilter: BiquadFilterNode | null = null
let publishRaf: number | null = null

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

export function getAnalyser(): AnalyserNode {
  if (!analyser) {
    analyser = getAudioContext().createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.8
    analyser.connect(getAudioContext().destination)
  }
  return analyser
}

function getEqChain(): { input: BiquadFilterNode; output: BiquadFilterNode } {
  const context = getAudioContext()
  if (!lowFilter || !midFilter || !highFilter) {
    lowFilter = context.createBiquadFilter()
    lowFilter.type = 'lowshelf'
    lowFilter.frequency.value = 120
    lowFilter.gain.value = 0

    midFilter = context.createBiquadFilter()
    midFilter.type = 'peaking'
    midFilter.frequency.value = 1200
    midFilter.Q.value = 0.9
    midFilter.gain.value = 0

    highFilter = context.createBiquadFilter()
    highFilter.type = 'highshelf'
    highFilter.frequency.value = 7200
    highFilter.gain.value = 0

    lowFilter.connect(midFilter)
    midFilter.connect(highFilter)
    highFilter.connect(getAnalyser())
  }
  return { input: lowFilter, output: highFilter }
}

export function connectAudioElement(el: HTMLAudioElement): void {
  const context = getAudioContext()
  if (sourceNode && sourceNode.mediaElement === el) return
  sourceNode = context.createMediaElementSource(el)
  sourceNode.connect(getEqChain().input)
}

export function setEqGains(low: number, mid: number, high: number): void {
  const context = getAudioContext()
  getEqChain()
  const t = context.currentTime
  lowFilter!.gain.setTargetAtTime(low, t, 0.015)
  midFilter!.gain.setTargetAtTime(mid, t, 0.015)
  highFilter!.gain.setTargetAtTime(high, t, 0.015)
}

export function resumeContext(): void {
  const c = getAudioContext()
  if (c.state === 'suspended') c.resume()
}

export function startPublishing(isPlayingFn?: () => boolean): void {
  if (publishRaf !== null) return
  const a = getAnalyser()
  const buf = new Uint8Array(a.frequencyBinCount)
  function loop() {
    publishRaf = requestAnimationFrame(loop)
    if (!isPlayingFn || isPlayingFn()) {
      a.getByteFrequencyData(buf)
      window.hub.publishAudioFrame(buf)
    }
  }
  loop()
}

export function stopPublishing(): void {
  if (publishRaf !== null) {
    cancelAnimationFrame(publishRaf)
    publishRaf = null
  }
}
