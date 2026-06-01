import type { Clip, Marker, SnapGuide } from '../types';

export function computeSnapGuides(
  clips: Clip[],
  currentTime: number,
  markers: Marker[],
): SnapGuide[] {
  const guides: SnapGuide[] = [];

  for (const clip of clips) {
    guides.push({
      orientation: 'vertical',
      position: clip.startAt,
      sourceId: clip.id,
    });
    guides.push({
      orientation: 'vertical',
      position: clip.startAt + clip.duration,
      sourceId: clip.id,
    });
  }

  guides.push({
    orientation: 'vertical',
    position: currentTime,
    sourceId: 'playhead',
  });

  for (const marker of markers) {
    guides.push({
      orientation: 'vertical',
      position: marker.time,
      sourceId: marker.id,
    });
  }

  return guides;
}

export function snapToGuides(
  value: number,
  guides: SnapGuide[],
  threshold: number = 0.3
): number {
  for (const guide of guides) {
    if (Math.abs(value - guide.position) <= threshold) {
      return guide.position;
    }
  }
  return value;
}
