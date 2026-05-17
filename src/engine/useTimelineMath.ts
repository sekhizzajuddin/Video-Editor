import { useCallback, useMemo } from 'react';
import { Clip, Track, SNAP_THRESHOLD, MIN_CLIP_DURATION, CLIP_GRID } from '../types';

export interface TimelineScale {
  /** Pixels per second */
  pxPerSec: number;
  /** Ruler tick interval in seconds */
  majorTick: number;
  minorTick: number;
}

export function calcScale(zoom: number): TimelineScale {
  const pxPerSec = 30 + zoom * 270;
  const majorTick = zoom < 0.15 ? 10 : zoom < 0.35 ? 5 : zoom < 0.6 ? 2 : 1;
  const minorTick = majorTick / 5;
  return { pxPerSec, majorTick, minorTick };
}

export function timeToPixels(time: number, pxPerSec: number): number {
  return time * pxPerSec;
}

export function pixelsToTime(pixels: number, pxPerSec: number): number {
  return pixels / pxPerSec;
}

export function snapTime(
  time: number,
  clipEdges: number[],
  markers: number[],
  playheadTime: number,
  threshold = SNAP_THRESHOLD
): number {
  const candidates = [...clipEdges, ...markers, playheadTime];
  let bestSnap = -1;
  let bestDist = threshold;
  for (const c of candidates) {
    const dist = Math.abs(time - c);
    if (dist < bestDist) {
      bestDist = dist;
      bestSnap = c;
    }
  }
  const grid = Math.round(time / CLIP_GRID) * CLIP_GRID;
  if (Math.abs(time - grid) < 0.015) return grid;
  return bestSnap >= 0 ? bestSnap : -1;
}

export function collectSnapEdges(tracks: Track[]): number[] {
  const edges = new Set<number>();
  for (const t of tracks) {
    for (const c of t.clips) {
      edges.add(c.startAt);
      edges.add(c.startAt + c.duration);
    }
  }
  return [...edges].sort((a, b) => a - b);
}

export function getClipAtTime(tracks: Track[], time: number): Clip | undefined {
  for (const t of tracks) {
    if (!t.visible) continue;
    for (const c of t.clips) {
      if (time >= c.startAt && time < c.startAt + c.duration) return c;
    }
  }
  return undefined;
}

export function getClipsAtTimeOnTrack(tracks: Track[], trackId: string, time: number): Clip[] {
  const t = tracks.find((x) => x.id === trackId);
  if (!t) return [];
  return t.clips.filter((c) => time >= c.startAt && time < c.startAt + c.duration);
}

export function isOverlapping(a: Clip, b: Clip): boolean {
  return a.id !== b.id && a.startAt < b.startAt + b.duration && a.startAt + a.duration > b.startAt;
}

export function overlapSeconds(a: Clip, b: Clip): number {
  if (!isOverlapping(a, b)) return 0;
  return Math.min(a.startAt + a.duration, b.startAt + b.duration) - Math.max(a.startAt, b.startAt);
}

export interface SplitResult {
  left: Clip;
  right: Clip;
}

export function computeSplit(clip: Clip, splitAt: number, clipIdGen: () => string): SplitResult | null {
  const splitPoint = splitAt - clip.startAt;
  if (splitPoint <= MIN_CLIP_DURATION || clip.duration - splitPoint <= MIN_CLIP_DURATION) return null;

  const left: Clip = {
    ...clip,
    duration: splitPoint,
  };

  const right: Clip = {
    ...clip,
    id: clipIdGen(),
    startAt: splitAt,
    duration: clip.duration - splitPoint,
    sourceStart: clip.sourceStart + splitPoint * clip.speed,
  };

  return { left, right };
}

export function useTimelineMath(tracks: Track[], zoom: number, _duration: number) {
  const scale = useMemo(() => calcScale(zoom), [zoom]);
  const snapEdges = useMemo(() => collectSnapEdges(tracks), [tracks]);

  const t2p = useCallback((time: number) => timeToPixels(time, scale.pxPerSec), [scale]);
  const p2t = useCallback((pix: number) => pixelsToTime(pix, scale.pxPerSec), [scale]);
  const snap = useCallback(
    (time: number, playheadTime: number, markerTimes: number[], threshold?: number) =>
      snapTime(time, snapEdges, markerTimes, playheadTime, threshold),
    [snapEdges]
  );
  const getAtTime = useCallback((t: number) => getClipAtTime(tracks, t), [tracks]);
  const getOverlapping = useCallback((clip: Clip) => {
    const t = tracks.find((x) => x.id === clip.trackId);
    if (!t) return [];
    return t.clips.filter((c) => c.id !== clip.id && isOverlapping(c, clip));
  }, [tracks]);

  return { scale, snapEdges, timeToPixels: t2p, pixelsToTime: p2t, snap, getClipAtTime: getAtTime, getOverlapping };
}
