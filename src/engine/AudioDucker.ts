/**
 * Audio Ducking — automatically lowers music volume when speech is detected.
 * Uses amplitude envelope from AudioAnalyzer to determine speech regions,
 * then generates volume automation keyframes.
 */

import { useEditorStore } from '../store/editorStore';

export interface DuckingConfig {
  duckAmount: number;    // 0-1, how much to reduce volume (0.3 = reduce to 30%)
  attackMs: number;      // fade down time in ms
  releaseMs: number;     // fade up time in ms
  threshold: number;     // speech detection threshold (0-1 amplitude)
  lookaheadMs: number;   // start ducking before speech
}

export const DEFAULT_DUCKING: DuckingConfig = {
  duckAmount: 0.25,
  attackMs: 100,
  releaseMs: 300,
  threshold: 0.05,
  lookaheadMs: 50,
};

export interface VolumeKeyframe {
  time: number;   // seconds
  volume: number; // 0-1
}

// ─── Internal: Identify contiguous speech regions ───────────────
interface SpeechRegion {
  start: number; // seconds
  end: number;   // seconds
}

function findSpeechRegions(
  speechEnvelope: { time: number; amplitude: number; isSpeech: boolean }[],
  threshold: number,
): SpeechRegion[] {
  const regions: SpeechRegion[] = [];
  let regionStart = -1;

  for (const point of speechEnvelope) {
    const aboveThreshold = point.isSpeech && point.amplitude >= threshold;

    if (aboveThreshold && regionStart < 0) {
      // Start of a new speech region
      regionStart = point.time;
    } else if (!aboveThreshold && regionStart >= 0) {
      // End of current speech region
      regions.push({ start: regionStart, end: point.time });
      regionStart = -1;
    }
  }

  // Handle trailing speech that extends to the end
  if (regionStart >= 0 && speechEnvelope.length > 0) {
    const last = speechEnvelope[speechEnvelope.length - 1];
    regions.push({ start: regionStart, end: last.time });
  }

  return regions;
}

// ─── Internal: Merge overlapping/touching speech regions ────────
function mergeRegions(regions: SpeechRegion[], gapMs: number): SpeechRegion[] {
  if (regions.length === 0) return [];

  const gapSec = gapMs / 1000;
  const sorted = [...regions].sort((a, b) => a.start - b.start);
  const merged: SpeechRegion[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const prev = merged[merged.length - 1];

    if (current.start <= prev.end + gapSec) {
      // Overlapping or touching — extend the previous region
      prev.end = Math.max(prev.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

// ─── Generate ducking volume keyframes ──────────────────────────
/**
 * Takes speech amplitude points and generates volume keyframes for the music track.
 *
 * For each speech region the algorithm generates:
 * 1. A fade-down keyframe at (start - lookahead - attack) → volume 1.0
 * 2. A steady low-volume keyframe at (start - lookahead)   → volume = duckAmount
 * 3. A steady low-volume keyframe at (end)                  → volume = duckAmount
 * 4. A fade-up keyframe at (end + release)                  → volume 1.0
 *
 * Overlapping regions are merged before keyframe generation so the music
 * stays ducked across consecutive speech phrases.
 */
export function generateDuckingKeyframes(
  speechEnvelope: { time: number; amplitude: number; isSpeech: boolean }[],
  musicDuration: number,
  config: DuckingConfig = DEFAULT_DUCKING,
): VolumeKeyframe[] {
  if (speechEnvelope.length === 0) return [];

  const {
    duckAmount,
    attackMs,
    releaseMs,
    threshold,
    lookaheadMs,
  } = config;

  const attackSec = attackMs / 1000;
  const releaseSec = releaseMs / 1000;
  const lookaheadSec = lookaheadMs / 1000;

  // 1. Find raw speech regions above the threshold
  const rawRegions = findSpeechRegions(speechEnvelope, threshold);
  if (rawRegions.length === 0) return [];

  // 2. Expand each region by lookahead+attack on the left and release on the right,
  //    then merge overlapping ones so we don't get conflicting keyframes
  const expandedRegions = rawRegions.map(r => ({
    start: r.start,
    end: r.end,
  }));
  const merged = mergeRegions(expandedRegions, releaseMs + attackMs);

  // 3. Build keyframes
  const keyframes: VolumeKeyframe[] = [];

  // Start at full volume
  keyframes.push({ time: 0, volume: 1.0 });

  for (const region of merged) {
    const fadeDownStart = Math.max(0, region.start - lookaheadSec - attackSec);
    const duckStart = Math.max(0, region.start - lookaheadSec);
    const duckEnd = region.end;
    const fadeUpEnd = Math.min(musicDuration, region.end + releaseSec);

    // Avoid duplicate or backwards keyframes
    const lastTime = keyframes.length > 0
      ? keyframes[keyframes.length - 1].time
      : -1;

    // Only emit the fade-down-start if it's after the last keyframe
    if (fadeDownStart > lastTime + 0.001) {
      keyframes.push({ time: fadeDownStart, volume: 1.0 });
    }

    // Duck-start: volume drops to duckAmount
    if (duckStart > lastTime + 0.001) {
      keyframes.push({ time: duckStart, volume: duckAmount });
    } else if (keyframes.length > 0) {
      // If overlapping, just ensure the last keyframe is at duck level
      keyframes[keyframes.length - 1].volume = duckAmount;
    }

    // Duck-end: still at duckAmount
    if (duckEnd > (keyframes[keyframes.length - 1]?.time ?? -1) + 0.001) {
      keyframes.push({ time: duckEnd, volume: duckAmount });
    }

    // Fade-up: back to full volume
    if (fadeUpEnd > (keyframes[keyframes.length - 1]?.time ?? -1) + 0.001) {
      keyframes.push({ time: fadeUpEnd, volume: 1.0 });
    }
  }

  // Ensure we end at full volume if the last keyframe isn't at musicDuration
  const last = keyframes[keyframes.length - 1];
  if (last && last.time < musicDuration - 0.001 && last.volume !== 1.0) {
    keyframes.push({ time: musicDuration, volume: 1.0 });
  }

  // Deduplicate keyframes at the same time (keep the last one)
  const deduped: VolumeKeyframe[] = [];
  for (let i = 0; i < keyframes.length; i++) {
    const next = keyframes[i + 1];
    if (next && Math.abs(keyframes[i].time - next.time) < 0.001) {
      continue; // skip, the next keyframe at the same time wins
    }
    deduped.push(keyframes[i]);
  }

  return deduped;
}

// ─── Apply ducking keyframes to a clip in the store ─────────────
/**
 * Writes the generated volume keyframes into the clip's `keyframeTracks`
 * under the property name "volume". If a volume track already exists it
 * is replaced; otherwise a new one is created.
 */
export function applyDuckingToClip(
  musicClipId: string,
  keyframes: VolumeKeyframe[],
): void {
  const store = useEditorStore.getState();
  const clip = store.getClip(musicClipId);
  if (!clip) return;

  // Build Keyframe[] compatible with the store's KeyframeTrack type
  const volumeKeyframes = keyframes.map((kf, idx) => ({
    id: `duck_${musicClipId}_${idx}`,
    time: kf.time,
    value: kf.volume,
    easing: 'linear' as const,
  }));

  // Merge into existing keyframe tracks
  const existingTracks = clip.keyframeTracks ?? [];
  const otherTracks = existingTracks.filter(t => t.property !== 'volume');

  const newTracks = [
    ...otherTracks,
    { property: 'volume', keyframes: volumeKeyframes },
  ];

  // Push history before making the change
  store.pushHistory();
  store.updateClip(musicClipId, { keyframeTracks: newTracks });
}
