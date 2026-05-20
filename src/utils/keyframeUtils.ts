import type { KeyframeTrack } from '../types';
import type { Keyframe } from '../types';

/** Returns the interpolated keyframe value for the given property at the given time.
 *  When no keyframe track exists, returns a neutral default per property:
 *    opacity → 100, scale → 1, everything else → 0.
 */
export function interpolateKeyframes(tracks: KeyframeTrack[] | undefined, time: number, property: string): number {
  const neutralDefault = property === 'opacity' ? 100 : property === 'scale' ? 1 : 0;
  if (!tracks) return neutralDefault;
  const track = tracks.find(t => t.property === property);
  if (!track || track.keyframes.length === 0) return neutralDefault;

  const sorted = [...track.keyframes].sort((a, b) => a.time - b.time);

  if (time <= sorted[0].time) return sorted[0].value;
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;

  let prev = sorted[0];
  let next = sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length - 1; i++) {
    if (time >= sorted[i].time && time <= sorted[i + 1].time) {
      prev = sorted[i];
      next = sorted[i + 1];
      break;
    }
  }

  const duration = next.time - prev.time;
  if (duration === 0) return prev.value;

  let t = (time - prev.time) / duration;
  t = applyEasing(t, next.easing || 'linear');

  return prev.value + (next.value - prev.value) * t;
}

function applyEasing(t: number, easing: string): number {
  switch (easing) {
    case 'ease-in':
      return t * t * t;
    case 'ease-out':
      return 1 - Math.pow(1 - t, 3);
    case 'ease-in-out':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    default:
      return t;
  }
}

export function addKeyframe(tracks: KeyframeTrack[], property: string, time: number, value: number, easing: Keyframe['easing'] = 'linear'): KeyframeTrack[] {
  const existing = tracks.find(t => t.property === property);
  const newKeyframe: Keyframe = { id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, time, value, easing };

  if (existing) {
    return tracks.map(t => {
      if (t.property !== property) return t;
      const existingKf = t.keyframes.find(k => Math.abs(k.time - time) < 0.05);
      if (existingKf) {
        return { ...t, keyframes: t.keyframes.map(k => k.id === existingKf.id ? { ...k, value, easing } : k) };
      }
      return { ...t, keyframes: [...t.keyframes, newKeyframe].sort((a, b) => a.time - b.time) };
    });
  }

  return [...tracks, { property, keyframes: [newKeyframe] }];
}

export function removeKeyframe(tracks: KeyframeTrack[], keyframeId: string): KeyframeTrack[] {
  return tracks
    .map(t => ({ ...t, keyframes: t.keyframes.filter(k => k.id !== keyframeId) }))
    .filter(t => t.keyframes.length > 0);
}
