import { useRef, useState, useCallback } from 'react';
import { Clip, MediaFile, MIN_CLIP_DURATION } from '../types';
import { useEditorStore } from '../store/editorStore';
import { calculateSnap, collectSnapCandidates } from './useSnapping';

const TRIM_ZONE_PX = 6;

export type DragZone = 'move' | 'trim-start' | 'trim-end' | 'none';

export interface DragSnapshot {
  zone: DragZone;
  clipId: string;
  origStartAt: number;
  origDuration: number;
  origSourceStart: number;
  origTrackId: string;
  startPixel: number;
  startClientY: number;
}

export function detectDragZone(mouseX: number, elementRect: DOMRect): 'trim-start' | 'trim-end' | 'move' {
  if (mouseX - elementRect.left <= TRIM_ZONE_PX) return 'trim-start';
  if (elementRect.right - mouseX <= TRIM_ZONE_PX) return 'trim-end';
  return 'move';
}

export function clampTrim(
  newStartAt: number, newDuration: number, newSourceStart: number,
  clip: Clip, media: MediaFile[],
): { startAt: number; duration: number; sourceStart: number } {
  let startAt = newStartAt, duration = newDuration, sourceStart = newSourceStart;
  if (startAt < 0) { const excess = -startAt; startAt = 0; duration = Math.max(MIN_CLIP_DURATION, duration - excess); }
  if (sourceStart < 0) { const excess = -sourceStart; sourceStart = 0; startAt += excess / (clip.speed || 1); duration -= excess / (clip.speed || 1); }
  const mf = clip.mediaId ? media.find(m => m.id === clip.mediaId) : undefined;
  const sourceEnd = mf?.duration ?? Infinity;
  const maxPlayable = (sourceEnd - sourceStart) / (clip.speed || 1);
  if (duration > maxPlayable) duration = Math.max(0.3, maxPlayable);
  if (duration < MIN_CLIP_DURATION) duration = MIN_CLIP_DURATION;
  return { startAt, duration, sourceStart };
}

function buildCandidates(pxPerSec: number) {
  const store = useEditorStore.getState();
  const candidates = collectSnapCandidates(store.project.tracks, store.project.markers, store.currentTime);
  return { candidates, snapThreshold: 10 / pxPerSec };
}

export function useDraggableClip(pxPerSec: number, trackHeight: number) {
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const dragRef = useRef<DragSnapshot>({
    zone: 'none', clipId: '', origStartAt: 0, origDuration: 0,
    origSourceStart: 0, origTrackId: '', startPixel: 0, startClientY: 0,
  });

  const onDragStart = useCallback((clip: Clip, zone: DragZone, pixelX: number, clientY: number) => {
    dragRef.current = {
      zone, clipId: clip.id,
      origStartAt: clip.startAt, origDuration: clip.duration,
      origSourceStart: clip.sourceStart, origTrackId: clip.trackId,
      startPixel: pixelX, startClientY: clientY,
    };
    setSnapLine(null);
  }, []);

  const onDragMove = useCallback((pixelX: number, clientY: number, tracksAreaTop: number) => {
    const s = dragRef.current;
    if (s.zone === 'none') return;

    const store = useEditorStore.getState();
    const clip = store.getClip(s.clipId);
    if (!clip) return;

    const { candidates, snapThreshold } = buildCandidates(pxPerSec);
    const deltaPixels = pixelX - s.startPixel;
    const deltaTime = deltaPixels / pxPerSec;
    const { zone, origStartAt, origDuration, origSourceStart } = s;

    const snapLinePx = (r: { snapped: boolean; targetTime: number }) =>
      r.snapped ? r.targetTime * pxPerSec : null;

    if (zone === 'move') {
      let newStart = Math.max(0, origStartAt + deltaTime);
      const endTime = newStart + clip.duration;
      const snap = calculateSnap(newStart, endTime, 'both', candidates, snapThreshold);
      if (snap.snapped) newStart = snap.targetTime;

      // Cross-track detection with TYPE SAFETY
      const relY = clientY - tracksAreaTop;
      const trackIndex = Math.max(0, Math.floor(relY / trackHeight));
      const tracks = store.project.tracks;
      const targetTrack = tracks[trackIndex];

      if (targetTrack && targetTrack.id !== clip.trackId) {
        // Only allow compatible track types
        const compatible = targetTrack.type === clip.trackType;
        if (compatible) {
          store.moveClipDrag(s.clipId, targetTrack.id, newStart);
          dragRef.current.origTrackId = targetTrack.id;
        }
        // If incompatible, just update position on same track
        else store.updateClip(s.clipId, { startAt: newStart });
      } else {
        store.updateClip(s.clipId, { startAt: newStart });
      }
      setSnapLine(snapLinePx(snap));

    } else if (zone === 'trim-start') {
      const rawStart = origStartAt + deltaTime;
      const durationDelta = origStartAt - rawStart;
      let newDuration = origDuration + durationDelta;
      let newStart = rawStart;
      let newSourceStart = origSourceStart + durationDelta;
      const clamped = clampTrim(newStart, newDuration, newSourceStart, clip, store.project.media);
      newStart = clamped.startAt; newDuration = clamped.duration; newSourceStart = clamped.sourceStart;
      const snap = calculateSnap(newStart, newStart + newDuration, 'start', candidates, snapThreshold);
      if (snap.snapped) {
        const sd = snap.targetTime - newStart;
        newStart = snap.targetTime;
        newDuration = Math.max(MIN_CLIP_DURATION, newDuration - sd);
        newSourceStart = Math.max(0, newSourceStart + sd);
      }
      setSnapLine(snapLinePx(snap));
      store.updateClip(s.clipId, { startAt: newStart, duration: newDuration, sourceStart: newSourceStart });
    } else if (zone === 'trim-end') {
      let newDuration = Math.max(MIN_CLIP_DURATION, origDuration + deltaTime);
      const mf = clip.mediaId ? store.project.media.find(m => m.id === clip.mediaId) : undefined;
      if (mf?.duration) newDuration = Math.min(newDuration, (mf.duration - clip.sourceStart) / (clip.speed || 1));
      const snap = calculateSnap(origStartAt, origStartAt + newDuration, 'end', candidates, snapThreshold);
      if (snap.snapped) newDuration = Math.max(MIN_CLIP_DURATION, snap.targetTime - origStartAt);
      setSnapLine(snapLinePx(snap));
      store.updateClip(s.clipId, { duration: newDuration });
    }
  }, [pxPerSec, trackHeight]);

  const onDragEnd = useCallback(() => {
    if (dragRef.current.zone !== 'none') {
      useEditorStore.getState().commitDrag();
      dragRef.current.zone = 'none';
    }
    setSnapLine(null);
  }, []);

  return { snapLine, onDragStart, onDragMove, onDragEnd };
}
