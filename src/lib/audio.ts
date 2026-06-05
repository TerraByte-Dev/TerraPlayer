import { dbToGain, clampEqBand, EQ_FREQUENCIES, EQ_Q } from './audio-math'
import { createFrameThrottle } from './perf'

// The popout visualizer reads frames on its own rAF and smooths them (analyser
// smoothingTimeConstant 0.8 + per-bar peak decay), so publishing at ~30fps looks
// identical while halving the cross-process structured-clone IPC traffic.
const PUBLISH_FPS = 30

let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let sourceNode: MediaElementAudioSourceNode | null = null
let preampGain: GainNode | null = null
let eqBands: BiquadFilterNode[] | null = null
let monoGain: GainNode | null = null
let fadeGain: GainNode | null = null
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
//   source → preamp → b0(31Hz) … b9(16kHz) → mono(downmix) → fade → analyser → destination
// The analyser is the single edge into `destination` (set in getAnalyser); fade sits just before it so
// the visualizer fades together with the audible output.
function getEqChain(): { input: GainNode } {
  const context = getAudioContext()
  if (!preampGain || !eqBands || !monoGain || !fadeGain) {
    preampGain = context.createGain()
    preampGain.gain.value = 1 // 0 dB

    // 10 peaking biquads at ISO octave centers — a flat-by-default graphic EQ. All native, so the EQ
    // costs nothing per frame on the JS side regardless of how many bands are nudged.
    eqBands = EQ_FREQUENCIES.map((freq) => {
      const f = context.createBiquadFilter()
      f.type = 'peaking'
      f.frequency.value = freq
      f.Q.value = EQ_Q
      f.gain.value = 0
      return f
    })

    // Mono node: channelCount=1 + 'explicit' sums L+R to a single channel (true mono downmix); the
    // destination upmixes it back to both speakers. 'max' leaves stereo untouched.
    monoGain = context.createGain()
    monoGain.gain.value = 1
    monoGain.channelCountMode = 'max'

    // Fade node: 1 = full volume by default (so builds without fades are unaffected). rampFade automates it.
    fadeGain = context.createGain()
    fadeGain.gain.value = 1

    preampGain.connect(eqBands[0])
    for (let i = 0; i < eqBands.length - 1; i++) eqBands[i].connect(eqBands[i + 1])
    eqBands[eqBands.length - 1].connect(monoGain)
    monoGain.connect(fadeGain)
    fadeGain.connect(getAnalyser())
  }
  return { input: preampGain }
}

export function connectAudioElement(el: HTMLAudioElement): void {
  const context = getAudioContext()
  if (sourceNode && sourceNode.mediaElement === el) return
  // Keep pitch constant when playbackRate changes (so 1.25× doesn't chipmunk the audio).
  ;(el as HTMLMediaElement & { preservesPitch?: boolean }).preservesPitch = true
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

/** Apply the 10 band gains (dB) to the graphic EQ. Smoothed (setTargetAtTime) so dragging is click-free. */
export function setEqBands(gains: number[]): void {
  const context = getAudioContext()
  getEqChain()
  const t = context.currentTime
  for (let i = 0; i < eqBands!.length; i++) {
    eqBands![i].gain.setTargetAtTime(clampEqBand(gains[i] ?? 0), t, 0.015)
  }
}

/**
 * Ramp the fade gain to `target` (0–1) over `seconds`. Click-free and robust to rapid play/pause:
 * cancels any in-flight ramp, pins the LIVE value (so it never jumps), then schedules a definite-endpoint
 * linear ramp — NOT setTargetAtTime, whose asymptote never actually reaches 0. seconds≈0 hard-sets.
 */
export function rampFade(target: number, seconds: number): void {
  getEqChain()
  const t = getAudioContext().currentTime
  const g = fadeGain!.gain
  g.cancelScheduledValues(t)
  g.setValueAtTime(g.value, t)
  if (seconds <= 0.005) g.setValueAtTime(target, t)
  else g.linearRampToValueAtTime(target, t + seconds)
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
