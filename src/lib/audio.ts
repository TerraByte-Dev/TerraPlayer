import { dbToGain, clampEqBand, EQ_FREQUENCIES, EQ_Q } from './audio-math'
import { createFrameThrottle } from './perf'

// The popout visualizer reads frames on its own rAF and smooths them (analyser
// smoothingTimeConstant 0.8 + per-bar peak decay), so publishing at ~30fps looks
// identical while halving the cross-process structured-clone IPC traffic.
const PUBLISH_FPS = 30

export type Deck = 'a' | 'b'

let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let preampGain: GainNode | null = null
let eqBands: BiquadFilterNode[] | null = null
let monoGain: GainNode | null = null
// Two playback "decks" so songs can overlap during a crossfade. Each <audio> element gets its own source +
// gain; both gains sum into the shared preamp → EQ → mono → analyser → destination chain. Crossfading is
// just ramping one deck's gain up while the other's goes down — the EQ/preamp/mono/visualizer are shared.
let deckSourceA: MediaElementAudioSourceNode | null = null
let deckSourceB: MediaElementAudioSourceNode | null = null
let deckGainA: GainNode | null = null
let deckGainB: GainNode | null = null
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

// Builds (once) the shared processing chain. Signal path (deck gains feed the preamp):
//   deckA ┐
//         ├→ preamp → b0(31Hz)…b9(16kHz) → mono(downmix) → analyser → destination
//   deckB ┘
// analyser is the single edge into destination (set in getAnalyser); it sees the summed decks, so the
// visualizer reflects whatever you hear — including both tracks mid-crossfade.
function getEqChain(): GainNode {
  const context = getAudioContext()
  if (!preampGain || !eqBands || !monoGain) {
    preampGain = context.createGain()
    preampGain.gain.value = 1 // 0 dB

    // 10 peaking biquads at ISO octave centers — a flat-by-default graphic EQ. All native, so the EQ costs
    // nothing per frame on the JS side regardless of how many bands are nudged.
    eqBands = EQ_FREQUENCIES.map((freq) => {
      const f = context.createBiquadFilter()
      f.type = 'peaking'
      f.frequency.value = freq
      f.Q.value = EQ_Q
      f.gain.value = 0
      return f
    })

    // Mono node: channelCount=1 + 'explicit' down-mixes stereo to mono (≈0.5·(L+R), per Web Audio); the
    // destination upmixes it back to both speakers. 'max' leaves stereo untouched.
    monoGain = context.createGain()
    monoGain.gain.value = 1
    monoGain.channelCountMode = 'max'

    preampGain.connect(eqBands[0])
    for (let i = 0; i < eqBands.length - 1; i++) eqBands[i].connect(eqBands[i + 1])
    eqBands[eqBands.length - 1].connect(monoGain)
    monoGain.connect(getAnalyser())
  }
  return preampGain
}

// Lazily create the two deck gains and wire them into the shared chain. Deck A starts audible, B silent.
function ensureDecks(): void {
  const context = getAudioContext()
  const input = getEqChain()
  if (!deckGainA) {
    deckGainA = context.createGain()
    deckGainA.gain.value = 1
    deckGainA.connect(input)
  }
  if (!deckGainB) {
    deckGainB = context.createGain()
    deckGainB.gain.value = 0
    deckGainB.connect(input)
  }
}

function deckGainNode(deck: Deck): GainNode {
  ensureDecks()
  return deck === 'a' ? deckGainA! : deckGainB!
}

/** Route an <audio> element through the given deck (once per element). Pitch is preserved on rate change. */
export function connectDeck(el: HTMLAudioElement, deck: Deck): void {
  const context = getAudioContext()
  ensureDecks()
  ;(el as HTMLMediaElement & { preservesPitch?: boolean }).preservesPitch = true
  if (deck === 'a') {
    if (deckSourceA && deckSourceA.mediaElement === el) return
    if (deckSourceA) deckSourceA.disconnect() // stale element from an HMR remount — drop the orphan node
    deckSourceA = context.createMediaElementSource(el)
    deckSourceA.connect(deckGainA!)
  } else {
    if (deckSourceB && deckSourceB.mediaElement === el) return
    if (deckSourceB) deckSourceB.disconnect()
    deckSourceB = context.createMediaElementSource(el)
    deckSourceB.connect(deckGainB!)
  }
}

/**
 * Ramp a deck's gain to `target` (0–1) over `seconds`. Click-free and robust to rapid transitions: cancels
 * any in-flight ramp, pins the LIVE value, then schedules a definite-endpoint linear ramp (NOT
 * setTargetAtTime, whose asymptote never reaches 0). seconds≈0 hard-sets. This is the crossfade primitive.
 */
export function rampDeck(deck: Deck, target: number, seconds: number): void {
  const context = getAudioContext()
  const g = deckGainNode(deck).gain
  const t = context.currentTime
  g.cancelScheduledValues(t)
  g.setValueAtTime(g.value, t)
  // A ramp while the context is suspended is meaningless (currentTime is frozen) — hard-set instead.
  if (seconds <= 0.005 || context.state === 'suspended') g.setValueAtTime(target, t)
  else g.linearRampToValueAtTime(target, t + seconds)
}

/** Set the pre-amp level in dB (clamped + converted in audio-math). Smoothed to avoid zipper noise. */
export function setPreampDb(db: number): void {
  const context = getAudioContext()
  getEqChain()
  const t = context.currentTime
  // Match rampDeck: a ramp while the context is suspended is meaningless (currentTime is frozen) — hard-set so
  // a persisted non-zero preamp is correct from sample zero rather than gliding in at the first instant of play.
  if (context.state === 'suspended') preampGain!.gain.setValueAtTime(dbToGain(db), t)
  else preampGain!.gain.setTargetAtTime(dbToGain(db), t, 0.02)
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
  const suspended = context.state === 'suspended'
  for (let i = 0; i < eqBands!.length; i++) {
    const g = clampEqBand(gains[i] ?? 0)
    // See setPreampDb: hard-set on a suspended (frozen) clock, smooth otherwise.
    if (suspended) eqBands![i].gain.setValueAtTime(g, t)
    else eqBands![i].gain.setTargetAtTime(g, t, 0.015)
  }
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
