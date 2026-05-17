import { useRef, useState, useCallback } from 'react';
import { Clip, MediaFile, MIN_CLIP_DURATION } from '../types';
import { useEditorStore } from '../store/editorStore';
import { calculateSnap, collectSnapCandidates, SnapCandidates } from './useSnapping';

/** Zone width in pixels on each edge for trim detection */
const TRIM_ZONE_PX = 6;

export type DragZone = 'move' | 'trim-start' | 'trim-end' | 'none';

export interface DragSnapshot {
  zone: DragZone;
  clipId: string;
  origStartAt: number;
  origDuration: number;
  origSourceStart: number;
  startPixel: number;
}

export function detectDragZone(
  mouseX: number,
  elementRect: DOMRect,
): 'trim-start' | 'trim-end' | 'move' {
  if (mouseX - elementRect.left <= TRIM_ZONE_PX) return 'trim-start';
  if (elementRect.right - mouseX <= TRIM_ZONE_PX) return 'trim-end';
  return 'move';
}

/**
 * Enforce that a trimmed clip can't exceed its source media duration.
 */
export function clampTrim(
  newStartAt: number,
  newDuration: number,
  newSourceStart: number,
  clip: Clip,
  media: MediaFile[],
): { startAt: number; duration: number; sourceStart: number } {
  let startAt = newStartAt;
  let duration = newDuration;
  let sourceStart = newSourceStart;

  if (startAt < 0) {
    const excess = -startAt;
    startAt = 0;
    duration = Math.max(MIN_CLIP_DURATION, duration - excess);
  }

  if (sourceStart < 0) {
    const excess = -sourceStart;
    sourceStart = 0;
    startAt += excess / (clip.speed || 1);
    duration -= excess / (clip.speed || 1);
  }

  const mf = clip.mediaId ? media.find((m) => m.id === clip.mediaId) : undefined;
  const sourceEnd = mf?.duration ?? Infinity;
  const maxPlayable = (sourceEnd - sourceStart) / (clip.speed || 1);
  if (duration > maxPlayable) {
    duration = Math.max(0.3, maxPlayable);
  }
  if (duration < MIN_CLIP_DURATION) {
    duration = MIN_CLIP_DURATION;
  }
  return { startAt, duration, sourceStart };
}

function buildCandidates(pxPerSec: number): { candidates: SnapCandidates; snapThreshold: number } {
  const store = useEditorStore.getState();
  const candidates = collectSnapCandidates(
    store.project.tracks,
    store.project.markers,
    store.currentTime,
  );
  const snapThreshold = 10 / pxPerSec;
  return { candidates, snapThreshold };
}

export function useDraggableClip(pxPerSec: number) {
  const snapRef = useRef<{ snapLinePixel: number | null }>({ snapLinePixel: null });
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const dragRef = useRef<DragSnapshot>({
    zone: 'none', clipId: '', origStartAt: 0, origDuration: 0, origSourceStart: 0, startPixel: 0,
  });

  const onDragStart = useCallback((clip: Clip, zone: DragZone, pixelX: number) => {
    dragRef.current = {
      zone, clipId: clip.id,
      origStartAt: clip.startAt, origDuration: clip.duration, origSourceStart: clip.sourceStart,
      startPixel: pixelX,
    };
    snapRef.current = { snapLinePixel: null };
    setSnapLine(null);
  }, []);

  const onDragMove = useCallback((pixelX: number) => {
    const s = dragRef.current;
    if (s.zone === 'none') return;

    const store = useEditorStore.getState();
    const clip = store.getClip(s.clipId);
    if (!clip) return;

    const { candidates, snapThreshold } = buildCandidates(pxPerSec);
    const deltaPixels = pixelX - s.startPixel;
    const deltaTime = deltaPixels / pxPerSec;
    const { zone, origStartAt, origDuration, origSourceStart } = s;

    const snapLinePx = (snapResult: { snapped: boolean; targetTime: number }) =>
      snapResult.snapped ? snapResult.targetTime * pxPerSec : null;

    if (zone === 'move') {
      let newStart = Math.max(0, origStartAt + deltaTime);
      const endTime = newStart + clip.duration;
      const snap = calculateSnap(newStart, endTime, 'both', candidates, snapThreshold);
      if (snap.snapped) newStart = snap.targetTime;
      const sl = snapLinePx(snap);
      snapRef.current = { snapLinePixel: sl };
      setSnapLine(sl);
      store.updateClip(s.clipId, { startAt: newStart });
    } else if (zone === 'trim-start') {
      const rawStart = origStartAt + deltaTime;
      const durationDelta = origStartAt - rawStart;
      let newDuration = origDuration + durationDelta;
      let newStart = rawStart;
      let newSourceStart = origSourceStart + durationDelta;

      const clamped = clampTrim(newStart, newDuration, newSourceStart, clip, store.project.media);
      newStart = clamped.startAt;
      newDuration = clamped.duration;
      newSourceStart = clamped.sourceStart;

      const end = newStart + newDuration;
      const snap = calculateSnap(newStart, end, 'start', candidates, snapThreshold);
      if (snap.snapped) {
        const snapDelta = snap.targetTime - newStart;
        newStart = snap.targetTime;
        newDuration = Math.max(MIN_CLIP_DURATION, newDuration - snapDelta);
        newSourceStart = Math.max(0, newSourceStart + snapDelta);
      }
      const sl = snapLinePx(snap);
      snapRef.current = { snapLinePixel: sl };
      setSnapLine(sl);
      store.updateClip(s.clipId, { startAt: newStart, duration: newDuration, sourceStart: newSourceStart });
    } else if (zone === 'trim-end') {
      let newDuration = Math.max(MIN_CLIP_DURATION, origDuration + deltaTime);
      // Clamp against source media duration
      const mf = clip.mediaId ? store.project.media.find((m) => m.id === clip.mediaId) : undefined;
      if (mf?.duration) {
        const maxDur = (mf.duration - clip.sourceStart) / (clip.speed || 1);
        newDuration = Math.min(newDuration, maxDur);
      }
      const end = origStartAt + newDuration;
      const snap = calculateSnap(origStartAt, end, 'end', candidates, snapThreshold);
      if (snap.snapped) {
        newDuration = Math.max(MIN_CLIP_DURATION, snap.targetTime - origStartAt);
      }
      const sl = snapLinePx(snap);
      snapRef.current = { snapLinePixel: sl };
      setSnapLine(sl);
      store.updateClip(s.clipId, { duration: newDuration });
    }
  }, [pxPerSec]);

  const onDragEnd = useCallback(() => {
    if (dragRef.current.zone !== 'none') {
      const store = useEditorStore.getState();
      store.commitDrag();
      dragRef.current.zone = 'none';
    }
    snapRef.current = { snapLinePixel: null };
    setSnapLine(null);
  }, []);

  return { snapLine, onDragStart, onDragMove, onDragEnd };
}
