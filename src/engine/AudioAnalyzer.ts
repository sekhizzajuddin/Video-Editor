/**
 * AudioAnalyzer — Core analysis engine for AI audio editing features.
 * Runs entirely in-browser using Web Audio API — no cloud upload.
 *
 * Features:
 * - Silence detection (for auto-cut)
 * - Beat/onset detection (for rhythm alignment)
 * - Speech amplitude envelope (for lip sync)
 * - Frequency analysis (for voice stabilization)
 */

export interface SilenceRegion {
  start: number;  // seconds
  end: number;
  duration: number;
}

export interface BeatMarker {
  time: number;   // seconds
  strength: number; // 0-1 normalized
}

export interface AmplitudePoint {
  time: number;
  amplitude: number;  // 0-1 RMS
  peak: number;        // 0-1 peak
  isSpeech: boolean;
}

export interface AudioAnalysis {
  sampleRate: number;
  duration: number;
  channelCount: number;
  silenceRegions: SilenceRegion[];
  beats: BeatMarker[];
  amplitudeEnvelope: AmplitudePoint[];
  averageRMS: number;
  peakAmplitude: number;
  speechRatio: number;  // 0-1 percentage of audio that is speech
}

// ─── Decode audio from Blob ──────────────────────────────────────
async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const arrayBuf = await blob.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuf);
}

// ─── Get PCM data from AudioBuffer ──────────────────────────────
function getPCM(buffer: AudioBuffer): Float32Array {
  // Downmix to mono
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.getChannelData(1);
  const mono = new Float32Array(ch0.length);
  for (let i = 0; i < ch0.length; i++) {
    mono[i] = (ch0[i] + ch1[i]) * 0.5;
  }
  return mono;
}

// ─── RMS calculation for a window ────────────────────────────────
function rms(data: Float32Array, start: number, end: number): number {
  let sum = 0;
  const n = end - start;
  if (n <= 0) return 0;
  for (let i = start; i < end; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / n);
}

// ─── Peak calculation for a window ───────────────────────────────
function peak(data: Float32Array, start: number, end: number): number {
  let max = 0;
  for (let i = start; i < end; i++) {
    const abs = Math.abs(data[i]);
    if (abs > max) max = abs;
  }
  return max;
}

// ─── Silence detection ──────────────────────────────────────────
export function detectSilence(
  pcm: Float32Array,
  sampleRate: number,
  thresholdDb: number = -35,
  minDurationSec: number = 0.3,
): SilenceRegion[] {
  const threshold = Math.pow(10, thresholdDb / 20);
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms windows
  const hopSize = Math.floor(windowSize / 2);
  const minSamples = Math.floor(minDurationSec * sampleRate / hopSize);

  const regions: SilenceRegion[] = [];
  let silenceStart = -1;
  let silenceCount = 0;

  for (let i = 0; i < pcm.length - windowSize; i += hopSize) {
    const r = rms(pcm, i, i + windowSize);
    if (r < threshold) {
      if (silenceStart === -1) silenceStart = i;
      silenceCount++;
    } else {
      if (silenceStart !== -1 && silenceCount >= minSamples) {
        const start = silenceStart / sampleRate;
        const end = i / sampleRate;
        regions.push({ start, end, duration: end - start });
      }
      silenceStart = -1;
      silenceCount = 0;
    }
  }

  // Handle trailing silence
  if (silenceStart !== -1 && silenceCount >= minSamples) {
    const start = silenceStart / sampleRate;
    const end = pcm.length / sampleRate;
    regions.push({ start, end, duration: end - start });
  }

  return regions;
}

// ─── Beat detection (spectral flux onset detection) ─────────────
export function detectBeats(
  pcm: Float32Array,
  sampleRate: number,
  sensitivity: number = 1.4,
): BeatMarker[] {
  const fftSize = 1024;
  const hopSize = 512;
  const beats: BeatMarker[] = [];

  // Simple energy-based onset detection
  const energies: number[] = [];
  for (let i = 0; i < pcm.length - fftSize; i += hopSize) {
    let energy = 0;
    for (let j = 0; j < fftSize; j++) {
      energy += pcm[i + j] * pcm[i + j];
    }
    energies.push(energy / fftSize);
  }

  // Adaptive threshold using local average
  const windowFrames = Math.floor(sampleRate / hopSize * 0.3); // ~300ms window
  for (let i = windowFrames; i < energies.length - windowFrames; i++) {
    let localAvg = 0;
    for (let j = i - windowFrames; j <= i + windowFrames; j++) {
      localAvg += energies[j];
    }
    localAvg /= (2 * windowFrames + 1);

    if (energies[i] > localAvg * sensitivity && energies[i] > energies[i - 1]) {
      const time = (i * hopSize) / sampleRate;
      const strength = Math.min(1, energies[i] / (localAvg * sensitivity * 2));

      // Debounce: skip if too close to previous beat
      if (beats.length === 0 || time - beats[beats.length - 1].time > 0.15) {
        beats.push({ time, strength });
      }
    }
  }

  return beats;
}

// ─── Amplitude envelope (for lip sync) ──────────────────────────
export function computeAmplitudeEnvelope(
  pcm: Float32Array,
  sampleRate: number,
  resolution: number = 0.02, // 20ms = 50fps for lip sync accuracy
): AmplitudePoint[] {
  const windowSize = Math.floor(sampleRate * resolution);
  const speechThreshold = 0.02;
  const points: AmplitudePoint[] = [];

  for (let i = 0; i < pcm.length; i += windowSize) {
    const end = Math.min(i + windowSize, pcm.length);
    const r = rms(pcm, i, end);
    const p = peak(pcm, i, end);
    const time = i / sampleRate;
    points.push({
      time,
      amplitude: r,
      peak: p,
      isSpeech: r > speechThreshold && p < 0.95, // Not clipped
    });
  }

  return points;
}

// ─── Voice frequency analysis (for stabilizer) ──────────────────
export interface FrequencyBand {
  label: string;
  low: number;
  high: number;
  avgEnergy: number;
}

export function analyzeFrequencyBands(
  pcm: Float32Array,
  sampleRate: number,
): FrequencyBand[] {
  const bands = [
    { label: 'Sub-bass', low: 20, high: 80, avgEnergy: 0 },
    { label: 'Bass', low: 80, high: 250, avgEnergy: 0 },
    { label: 'Low-mid', low: 250, high: 500, avgEnergy: 0 },
    { label: 'Mid', low: 500, high: 2000, avgEnergy: 0 },
    { label: 'High-mid', low: 2000, high: 4000, avgEnergy: 0 },
    { label: 'Presence', low: 4000, high: 6000, avgEnergy: 0 },
    { label: 'Brilliance', low: 6000, high: 20000, avgEnergy: 0 },
  ];

  // Simple DFT energy estimation for each band
  const fftSize = 4096;
  const numFrames = Math.floor(pcm.length / fftSize);
  if (numFrames === 0) return bands;

  const binWidth = sampleRate / fftSize;
  const bandEnergies = bands.map(() => 0);

  for (let frame = 0; frame < Math.min(numFrames, 50); frame++) {
    const offset = frame * fftSize;

    // Simple DFT magnitude estimation per band
    for (let b = 0; b < bands.length; b++) {
      const lowBin = Math.floor(bands[b].low / binWidth);
      const highBin = Math.min(Math.ceil(bands[b].high / binWidth), fftSize / 2);
      let energy = 0;
      for (let bin = lowBin; bin < highBin; bin++) {
        // Approximate: use raw sample energy in the frequency range
        const idx = offset + bin;
        if (idx < pcm.length) {
          energy += pcm[idx] * pcm[idx];
        }
      }
      bandEnergies[b] += energy / (highBin - lowBin + 1);
    }
  }

  const maxEnergy = Math.max(...bandEnergies, 0.0001);
  return bands.map((band, i) => ({
    ...band,
    avgEnergy: bandEnergies[i] / (numFrames * maxEnergy),
  }));
}

// ─── EQ presets for voice stabilization ─────────────────────────
export interface EQPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  bands: { frequency: number; gain: number; q: number }[];
}

export const VOICE_EQ_PRESETS: EQPreset[] = [
  {
    id: 'natural',
    name: 'Natural Voice',
    description: 'Remove AI artifacts, restore natural warmth',
    icon: '🎙️',
    bands: [
      { frequency: 80, gain: -3, q: 0.7 },   // Cut rumble
      { frequency: 200, gain: 2, q: 1.0 },    // Add warmth
      { frequency: 3000, gain: 1.5, q: 1.2 }, // Presence
      { frequency: 5000, gain: -1, q: 1.0 },  // Reduce harshness
      { frequency: 8000, gain: -2, q: 0.8 },  // Reduce sibilance
    ],
  },
  {
    id: 'podcast',
    name: 'Podcast Clean',
    description: 'Broadcast-ready voice clarity',
    icon: '🎧',
    bands: [
      { frequency: 80, gain: -6, q: 0.5 },   // High-pass effect
      { frequency: 150, gain: -2, q: 1.0 },   // Reduce boominess
      { frequency: 2500, gain: 3, q: 1.0 },   // Speech clarity
      { frequency: 5000, gain: 2, q: 0.8 },   // Air
      { frequency: 10000, gain: 1, q: 0.7 },  // Sparkle
    ],
  },
  {
    id: 'warm',
    name: 'Warm & Rich',
    description: 'Deep, warm voice tone for narration',
    icon: '🔥',
    bands: [
      { frequency: 100, gain: 1, q: 0.7 },
      { frequency: 250, gain: 3, q: 0.8 },   // Warmth boost
      { frequency: 1000, gain: 0, q: 1.0 },
      { frequency: 4000, gain: -1, q: 1.0 },  // Soften highs
      { frequency: 8000, gain: -3, q: 0.7 },
    ],
  },
  {
    id: 'bright',
    name: 'Bright & Clear',
    description: 'Crisp, energetic voice for tutorials',
    icon: '✨',
    bands: [
      { frequency: 80, gain: -4, q: 0.5 },
      { frequency: 400, gain: -1, q: 1.0 },
      { frequency: 2000, gain: 2, q: 1.2 },   // Clarity
      { frequency: 5000, gain: 3, q: 0.8 },   // Presence
      { frequency: 10000, gain: 2, q: 0.7 },  // Air
    ],
  },
  {
    id: 'deesser',
    name: 'De-Esser',
    description: 'Remove harsh sibilance (s/sh sounds)',
    icon: '🔇',
    bands: [
      { frequency: 4000, gain: -1, q: 1.0 },
      { frequency: 5500, gain: -4, q: 2.0 },  // Target sibilance
      { frequency: 7000, gain: -3, q: 1.5 },
      { frequency: 8500, gain: -2, q: 1.0 },
      { frequency: 12000, gain: 0, q: 0.7 },
    ],
  },
  {
    id: 'ai-cleanup',
    name: 'AI Voice Cleanup',
    description: 'Fix TTS metallic tone and unnatural resonances',
    icon: '🤖',
    bands: [
      { frequency: 120, gain: 2, q: 0.8 },    // Add body
      { frequency: 500, gain: -2, q: 2.0 },    // Remove nasal/metallic
      { frequency: 1200, gain: 1, q: 1.0 },    // Natural mid
      { frequency: 3500, gain: -3, q: 1.5 },   // Remove tinny peaks
      { frequency: 7000, gain: -4, q: 1.2 },   // Remove digital artifacts
      { frequency: 12000, gain: -6, q: 0.5 },  // Kill aliasing artifacts
    ],
  },
];

// ─── Apply voice stabilizer (EQ) using Web Audio API ────────────
export async function applyVoiceStabilizer(
  blob: Blob,
  presetId: string,
): Promise<Blob> {
  const preset = VOICE_EQ_PRESETS.find(p => p.id === presetId);
  if (!preset) return blob;

  const arrayBuf = await blob.arrayBuffer();
  const offCtx = new OfflineAudioContext(2, 1, 44100);
  const audioBuffer = await offCtx.decodeAudioData(arrayBuf.slice(0));

  // Create new context with correct length
  const ctx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate,
  );

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;

  // Chain EQ bands
  let lastNode: AudioNode = source;
  for (const band of preset.bands) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = band.frequency;
    filter.gain.value = band.gain;
    filter.Q.value = band.q;
    lastNode.connect(filter);
    lastNode = filter;
  }

  // Soft compression for consistency
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  lastNode.connect(compressor);
  compressor.connect(ctx.destination);

  source.start(0);
  const rendered = await ctx.startRendering();

  // Encode back to WAV
  return audioBufferToWav(rendered);
}

// ─── Full analysis pipeline ─────────────────────────────────────
export async function analyzeAudio(
  blob: Blob,
  onProgress?: (percent: number) => void,
): Promise<AudioAnalysis> {
  onProgress?.(5);
  const buffer = await decodeAudio(blob);
  const pcm = getPCM(buffer);
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;

  onProgress?.(20);
  const silenceRegions = detectSilence(pcm, sampleRate);

  onProgress?.(40);
  const beats = detectBeats(pcm, sampleRate);

  onProgress?.(60);
  const amplitudeEnvelope = computeAmplitudeEnvelope(pcm, sampleRate);

  onProgress?.(80);

  // Compute global stats
  const totalRMS = rms(pcm, 0, pcm.length);
  const totalPeak = peak(pcm, 0, pcm.length);
  const speechPoints = amplitudeEnvelope.filter(p => p.isSpeech).length;
  const speechRatio = amplitudeEnvelope.length > 0 ? speechPoints / amplitudeEnvelope.length : 0;

  onProgress?.(100);

  return {
    sampleRate,
    duration,
    channelCount: buffer.numberOfChannels,
    silenceRegions,
    beats,
    amplitudeEnvelope,
    averageRMS: totalRMS,
    peakAmplitude: totalPeak,
    speechRatio,
  };
}

// ─── WAV encoder ────────────────────────────────────────────────
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const length = buffer.length * numChannels * (bitDepth / 8) + 44;
  const output = new ArrayBuffer(length);
  const view = new DataView(output);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, length - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, length - 44, true);

  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) channels.push(buffer.getChannelData(i));

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([output], { type: 'audio/wav' });
}

// ─── Auto-cut: generate split points from silence ───────────────
export function generateAutoCutPoints(
  silenceRegions: SilenceRegion[],
  paddingSec: number = 0.05,
): { cutStart: number; cutEnd: number }[] {
  return silenceRegions.map(s => ({
    cutStart: s.start + paddingSec,
    cutEnd: s.end - paddingSec,
  })).filter(c => c.cutEnd > c.cutStart);
}

// ─── Lip sync: compute speed ramp for amplitude alignment ───────
export interface LipsyncAlignment {
  timeOffset: number;
  speedAdjustment: number;
  confidence: number;
}

export function computeLipsyncAlignment(
  videoAmplitude: AmplitudePoint[],
  audioAmplitude: AmplitudePoint[],
  searchWindowSec: number = 2.0,
): LipsyncAlignment {
  if (!videoAmplitude.length || !audioAmplitude.length) {
    return { timeOffset: 0, speedAdjustment: 1, confidence: 0 };
  }

  const resolution = videoAmplitude.length > 1 ? videoAmplitude[1].time - videoAmplitude[0].time : 0.02;
  const searchFrames = Math.floor(searchWindowSec / resolution);

  // Cross-correlate speech-only regions
  let bestOffset = 0;
  let bestCorr = -Infinity;

  for (let offset = -searchFrames; offset <= searchFrames; offset++) {
    let corr = 0;
    let count = 0;
    for (let i = 0; i < videoAmplitude.length; i++) {
      const j = i + offset;
      if (j >= 0 && j < audioAmplitude.length) {
        corr += videoAmplitude[i].amplitude * audioAmplitude[j].amplitude;
        count++;
      }
    }
    if (count > 0) {
      corr /= count;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestOffset = offset;
      }
    }
  }

  const timeOffset = bestOffset * resolution;

  // Compute speed adjustment based on speech density ratio
  const videoSpeechDensity = videoAmplitude.filter(p => p.isSpeech).length / videoAmplitude.length;
  const audioSpeechDensity = audioAmplitude.filter(p => p.isSpeech).length / audioAmplitude.length;
  const speedAdjustment = audioSpeechDensity > 0 ? videoSpeechDensity / audioSpeechDensity : 1;

  // Confidence based on correlation strength
  const confidence = Math.min(1, Math.max(0, bestCorr * 10));

  return {
    timeOffset,
    speedAdjustment: Math.max(0.5, Math.min(2.0, speedAdjustment)),
    confidence,
  };
}
