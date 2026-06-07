import { Film, Volume2, Image, Type, Shapes, Layers } from "lucide-react";
import type { Track } from "@openreel/core";
import type {
  SnapPoint,
  SnapResult,
  SnapSettings,
  ClipStyle,
  TrackInfo,
} from "./types";

export const calculateSnap = (
  rawTime: number,
  clipId: string,
  tracks: Track[],
  playheadPosition: number,
  snapSettings: SnapSettings,
  pixelsPerSecond: number,
  clipDuration?: number,
): SnapResult => {
  if (!snapSettings.enabled) {
    return { time: rawTime, snapped: false };
  }

  const thresholdSeconds = snapSettings.snapThreshold / pixelsPerSecond;
  const snapPoints: SnapPoint[] = [];

  if (snapSettings.snapToClips) {
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.id === clipId) continue;
        snapPoints.push({ time: clip.startTime, type: "clip-start" });
        snapPoints.push({
          time: clip.startTime + clip.duration,
          type: "clip-end",
        });
      }
    }
  }

  if (snapSettings.snapToPlayhead) {
    snapPoints.push({ time: playheadPosition, type: "playhead" });
  }

  if (snapSettings.snapToGrid) {
    const nearestGrid =
      Math.round(rawTime / snapSettings.gridSize) * snapSettings.gridSize;
    snapPoints.push({ time: nearestGrid, type: "grid" });
    if (clipDuration) {
      const endTime = rawTime + clipDuration;
      const nearestEndGrid =
        Math.round(endTime / snapSettings.gridSize) * snapSettings.gridSize;
      snapPoints.push({ time: nearestEndGrid, type: "grid" });
    }
  }

  const priorityOrder: Record<string, number> = {
    "clip-start": 0,
    "clip-end": 0,
    "playhead": 1,
    "grid": 2,
  };

  let closestPoint: SnapPoint | undefined;
  let closestDistance = Infinity;
  let closestPriority = Infinity;
  let snapFromEnd = false;

  for (const point of snapPoints) {
    const pointPriority = priorityOrder[point.type] ?? 2;

    const startDistance = Math.abs(point.time - rawTime);
    if (startDistance < thresholdSeconds) {
      const isBetter =
        pointPriority < closestPriority ||
        (pointPriority === closestPriority && startDistance < closestDistance);
      if (isBetter) {
        closestDistance = startDistance;
        closestPriority = pointPriority;
        closestPoint = point;
        snapFromEnd = false;
      }
    }

    if (clipDuration) {
      const clipEndTime = rawTime + clipDuration;
      const endDistance = Math.abs(point.time - clipEndTime);
      if (endDistance < thresholdSeconds) {
        const isBetter =
          pointPriority < closestPriority ||
          (pointPriority === closestPriority && endDistance < closestDistance);
        if (isBetter) {
          closestDistance = endDistance;
          closestPriority = pointPriority;
          closestPoint = point;
          snapFromEnd = true;
        }
      }
    }
  }

  if (closestPoint) {
    const snappedTime = snapFromEnd
      ? closestPoint.time - (clipDuration ?? 0)
      : closestPoint.time;
    return {
      time: Math.max(0, snappedTime),
      snapped: true,
      snapPoint: { ...closestPoint, time: closestPoint.time },
    };
  }

  return { time: rawTime, snapped: false };
};

export const generateWaveformPath = (
  waveformData: Float32Array | number[] | null | undefined,
  width: number,
): string => {
  if (!waveformData || waveformData.length === 0) {
    return "";
  }

  const samples = Array.from(waveformData);
  const barCount = Math.min(width, samples.length);
  const step = samples.length / barCount;
  const midY = 20;
  const maxAmplitude = 17;
  const points: string[] = [];

  for (let i = 0; i < barCount; i++) {
    // Average a window of samples for each bar to get RMS-like amplitude
    const startIdx = Math.floor(i * step);
    const endIdx = Math.min(Math.floor((i + 1) * step), samples.length);
    let sum = 0;
    let count = 0;
    for (let j = startIdx; j < endIdx; j++) {
      sum += Math.abs(samples[j] || 0);
      count++;
    }
    const value = count > 0 ? sum / count : 0;
    const halfHeight = Math.max(1.5, value * maxAmplitude);
    const x = (i / barCount) * width;
    const y1 = midY - halfHeight;
    const y2 = midY + halfHeight;
    points.push(`M${x.toFixed(1)},${y1.toFixed(1)} L${x.toFixed(1)},${y2.toFixed(1)}`);
  }

  return points.join(" ");
};

export const getOrGenerateMockWaveformData = (mediaId: string): number[] => {
  // Deterministic per-media random waveform using a seeded PRNG
  let seed = 0;
  for (let i = 0; i < mediaId.length; i++) {
    seed = (seed * 31 + mediaId.charCodeAt(i)) & 0xffffffff;
  }

  // Simple LCG pseudo-random
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0xffffffff;
  };

  const SAMPLES = 200;
  const mockData: number[] = [];

  // Generate natural-looking audio waveform with varying energy segments
  let envelope = 0.5;
  for (let i = 0; i < SAMPLES; i++) {
    // Slowly drift the envelope (simulates speech/music dynamics)
    envelope = Math.max(0.1, Math.min(1.0, envelope + (rand() - 0.5) * 0.12));
    // Add high-frequency noise on top of envelope
    const noise = rand();
    // Occasionally drop to near-silence (pauses in speech/music)
    const isSilent = rand() < 0.06;
    const val = isSilent ? rand() * 0.08 : envelope * (0.5 + noise * 0.5);
    mockData.push(Math.max(0.04, Math.min(1.0, val)));
  }
  return mockData;
};

export const mediaHasAudio = (item: any): boolean => {
  if (!item) return false;
  // Audio type files always have audio
  if (item.type === "audio") return true;
  // For video: check if the background waveform extraction set channels > 0.
  // channels is set to 0 when extractWaveformPeaks returns null (no audio track).
  // channels is set to >= 1 when peaks were successfully extracted.
  // If channels is still 0 and waveformData is null → truly no audio.
  // If waveformData exists (real peaks), always show waveform.
  if (item.type === "video") {
    if (item.waveformData && item.waveformData.length > 0) return true;
    const ch = item.metadata?.channels ?? 0;
    return ch > 0;
  }
  return false;
};

export const formatTimecode = (
  timeInSeconds: number,
  frameRate: number = 30,
): string => {
  if (!isFinite(timeInSeconds) || isNaN(timeInSeconds) || timeInSeconds < 0) {
    return "00:00:00:00";
  }
  const hours = Math.floor(timeInSeconds / 3600);
  const minutes = Math.floor((timeInSeconds % 3600) / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  const frames = Math.floor((timeInSeconds % 1) * frameRate);
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}:${frames
    .toString()
    .padStart(2, "0")}`;
};

export const getTrackInfo = (track: Track, index: number): TrackInfo => {
  switch (track.type) {
    case "video":
      return {
        label: `V${index + 1}`,
        icon: Film,
        color: "bg-primary",
        textColor: "text-primary",
        bgLight: "bg-primary/20",
      };
    case "audio":
      return {
        label: `A${index + 1}`,
        icon: Volume2,
        color: "bg-blue-500",
        textColor: "text-blue-400",
        bgLight: "bg-blue-500/20",
      };
    case "image":
      return {
        label: `I${index + 1}`,
        icon: Image,
        color: "bg-purple-500",
        textColor: "text-purple-400",
        bgLight: "bg-purple-500/20",
      };
    case "text":
      return {
        label: `T${index + 1}`,
        icon: Type,
        color: "bg-amber-500",
        textColor: "text-amber-400",
        bgLight: "bg-amber-500/20",
      };
    case "graphics":
      return {
        label: `G${index + 1}`,
        icon: Shapes,
        color: "bg-green-500",
        textColor: "text-green-400",
        bgLight: "bg-green-500/20",
      };
    default:
      return {
        label: `?${index + 1}`,
        icon: Layers,
        color: "bg-gray-500",
        textColor: "text-gray-400",
        bgLight: "bg-gray-500/20",
      };
  }
};

export const getClipStyle = (trackType: string): ClipStyle => {
  // Clip palette matches the v2 mockup: video=cyan, audio=emerald,
  // image=purple/music, text=amber.
  switch (trackType) {
    case "video":
      return {
        bg: "bg-cyan-600/25",
        border: "border-cyan-500/60",
        text: "text-white/90",
        selectedText: "text-white",
      };
    case "audio":
      return {
        bg: "bg-emerald-600/25",
        border: "border-emerald-500/60",
        text: "text-white/85",
        selectedText: "text-white",
      };
    case "image":
      return {
        bg: "bg-violet-600/25",
        border: "border-violet-500/60",
        text: "text-white/85",
        selectedText: "text-white",
      };
    default:
      return {
        bg: "bg-bg-2",
        border: "border-border-strong",
        text: "text-fg-2",
        selectedText: "text-fg",
      };
  }
};
