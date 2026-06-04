import { dbToGain } from './audio-math'
import { createFrameThrottle } from './perf'

// The popout visualizer reads frames on its own rAF and smooths them (analyser
// smoothingTimeConstant 0.8 + per-bar peak decay), so publishing at ~30fps looks
// identical while halving the cross-process structured-clone IPC traffic.
const PUBLISH_FPS = 30

let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let sourceNode: MediaElementAudioSourceNode | null = null
let preampGain: GainNode | null = null
let lowFilter: BiquadFilterNode | null = null
let midFilter: BiquadFilterNode | null = null
let highFilter: BiquadFilterNode | null = null
let monoGain: GainNode | null = null
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

// Builds (once) the processing graph and returns its entry node. Signal path:
//   source → preamp(gain) → low → mid → high → mono(downmix) → analyser → destination
function getEqChain(): { input: GainNode } {
  const context = getAudioContext()
  if (!preampGain || !lowFilter || !midFilter || !highFilter || !monoGain) {
    preampGain = context.createGain()
    preampGain.gain.value = 1 // 0 dB

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

    // Mono node: when channelCount=1 + 'explicit', it sums L+R to a single channel (true mono downmix);
    // the destination then upmixes it back to both speakers. 'max'/2 leaves stereo untouched.
    monoGain = context.createGain()
    monoGain.gain.value = 1
    monoGain.channelCountMode = 'max'

    preampGain.connect(lowFilter)
    lowFilter.connect(midFilter)
    midFilter.connect(highFilter)
    highFilter.connect(monoGain)
    monoGain.connect(getAnalyser())
  }
  return { input: preampGain }
}

export function connectAudioElement(el: HTMLAudioElement): void {
  const context = getAudioContext()
  if (sourceNode && sourceNode.mediaElement === el) return
  sourceNode = context.createMediaElementSource(el)
  sourceNode.connect(getEqChain().input)
}

/** Set the pre-amp level in dB (clamped + converted in audio-math). Smoothed to avoid zipper noise. */
export function setPreampDb(db: number): void {
  const context = getAudioContext()
  getEqChain()
  preampGain!.gain.setTargetAtTime(dbToGain(db), context.currentTime, 0.02)
}

/** Toggle a true mono downmix (L+R summed to both speakers) vs. untouched stereo. */
export function setMono(mono: boolean): void {
  getEqChain()
  monoGain!.channelCount = mono ? 1 : 2
  monoGain!.channelCountMode = mono ? 'explicit' : 'max'
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
  const shouldPublish = createFrameThrottle(1000 / PUBLISH_FPS)
  function loop(ts: number) {
    publishRaf = requestAnimationFrame(loop)
    if ((!isPlayingFn || isPlayingFn()) && shouldPublish(ts)) {
      a.getByteFrequencyData(buf)
      window.hub.publishAudioFrame(buf)
    }
  }
  // Seed via rAF so the first loop() gets a real frame timestamp.
  publishRaf = requestAnimationFrame(loop)
}

export function stopPublishing(): void {
  if (publishRaf !== null) {
    cancelAnimationFrame(publishRaf)
    publishRaf = null
  }
}
