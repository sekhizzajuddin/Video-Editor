import type { Project, Track } from "@openreel/core";

/**
 * Finds the last end time of clips in a track (0 if track is empty)
 */
export function getTrackEndTime(track: Track): number {
  if (!track.clips || track.clips.length === 0) {
    return 0;
  }
  return Math.max(...track.clips.map((clip) => clip.startTime + clip.duration));
}

/**
 * Checks if a clip at the given start time with the given duration
 * would overlap with any existing clips on the track.
 */
export function wouldClipOverlap(
  track: Track,
  startTime: number,
  duration: number,
): boolean {
  const clipStart = startTime;
  const clipEnd = startTime + duration;

  return track.clips.some((clip) => {
    const existingStart = clip.startTime;
    const existingEnd = clip.startTime + clip.duration;
    // Overlap occurs if the intervals intersect
    return clipStart < existingEnd && clipEnd > existingStart;
  });
}

/**
 * Finds a non-overlapping start time for a clip on a track.
 * If the desired start time would overlap, returns the earliest
 * position that does not overlap (appending after the last clip).
 */
export function findNonOverlappingStartTime(
  track: Track,
  desiredStartTime: number,
  clipDuration: number,
): number {
  if (!wouldClipOverlap(track, desiredStartTime, clipDuration)) {
    return Math.max(0, desiredStartTime);
  }

  // Find the earliest end time after desiredStartTime that doesn't overlap
  // We need to place after the last existing clip that ends after desiredStartTime
  const sortedClips = [...track.clips].sort(
    (a, b) => a.startTime - b.startTime,
  );

  let candidateStart = desiredStartTime;

  for (const clip of sortedClips) {
    const clipEnd = clip.startTime + clip.duration;
    // If this clip overlaps with our candidate position
    if (candidateStart < clipEnd && candidateStart + clipDuration > clip.startTime) {
      // Move candidate to end of this clip
      candidateStart = clipEnd;
    }
  }

  return Math.max(0, candidateStart);
}

/**
 * Calculates the total duration of the timeline across all tracks.
 */
export function calculateTimelineDuration(project: Project): number {
  let maxEnd = 0;
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      const clipEnd = clip.startTime + clip.duration;
      if (clipEnd > maxEnd) {
        maxEnd = clipEnd;
      }
    }
  }
  return maxEnd;
}

/**
 * Gets the end time of a specific track.
 */
export function getTrackClipEndTime(track: Track): number {
  return getTrackEndTime(track);
}
