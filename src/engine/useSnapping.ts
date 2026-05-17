import { useMemo, useCallback } from 'react';
import { Track, Marker } from '../types';

export interface SnapCandidates {
  edges: number[];
  playhead: number;
  markers: number[];
  zero: number;
}

export interface SnapResult {
  snapped: boolean;
  targetTime: number;
}

export function collectSnapCandidates(
  tracks: Track[],
  markers: Marker[],
  playheadTime: number,
): SnapCandidates {
  const edges = new Set<number>();
  for (const t of tracks) {
    for (const c of t.clips) {
      edges.add(c.startAt);
      edges.add(c.startAt + c.duration);
    }
  }
  return {
    edges: [...edges].sort((a, b) => a - b),
    playhead: playheadTime,
    markers: markers.map((m) => m.time),
    zero: 0,
  };
}

/**
 * Pure function: compute snap for a dragged clip edge.
 * Returns the snapped time (or -1 if no snap).
 */
export function calculateSnap(
  draggedStart: number,
  draggedEnd: number,
  dragEdge: 'start' | 'end' | 'both',
  candidates: SnapCandidates,
  snapThreshold: number,
): SnapResult {
  let bestSnap = -1;
  let bestDist = snapThreshold;

  const check = (draggedVal: number, candidate: number) => {
    const dist = Math.abs(draggedVal - candidate);
    if (dist < bestDist) {
      bestDist = dist;
      bestSnap = candidate;
    }
  };

  const allHotPoints = [
    candidates.zero,
    ...candidates.edges,
    ...candidates.markers,
    candidates.playhead,
  ];

  if (dragEdge === 'start' || dragEdge === 'both') {
    for (const hp of allHotPoints) check(draggedStart, hp);
  }
  if (dragEdge === 'end' || dragEdge === 'both') {
    for (const hp of allHotPoints) check(draggedEnd, hp);
  }

  if (bestSnap < 0) return { snapped: false, targetTime: -1 };
  return { snapped: true, targetTime: bestSnap };
}

export function useSnapping(
  tracks: Track[],
  markers: Marker[],
  playheadTime: number,
) {
  const candidates = useMemo(
    () => collectSnapCandidates(tracks, markers, playheadTime),
    [tracks, markers, playheadTime],
  );

  const calcSnap = useCallback(
    (
      draggedStart: number,
      draggedEnd: number,
      dragEdge: 'start' | 'end' | 'both',
      snapThreshold: number,
    ): SnapResult =>
      calculateSnap(draggedStart, draggedEnd, dragEdge, candidates, snapThreshold),
    [candidates],
  );

  return { candidates, calculateSnap: calcSnap };
}
