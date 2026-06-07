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
    return "M0,20 L100,20";
  }

  const samples = Array.from(waveformData);
  const step = Math.max(1, Math.floor(samples.length / width));
  const points: string[] = [];

  for (let i = 0; i < width; i++) {
    const sampleIndex = Math.min(i * step, samples.length - 1);
    const value = Math.abs(samples[sampleIndex] || 0);
    const height = Math.max(1, value * 18);
    const y1 = 20 - height;
    const y2 = 20 + height;
    points.push(`M${i},${y1} L${i},${y2}`);
  }

  return points.join(" ");
};

export const getOrGenerateMockWaveformData = (mediaId: string): number[] => {
  let seed = 0;
  for (let i = 0; i < mediaId.length; i++) {
    seed += mediaId.charCodeAt(i);
  }
  
  const mockData: number[] = [];
  for (let i = 0; i < 100; i++) {
    const angle1 = (i / 100) * Math.PI * 6;
    const angle2 = (i / 100) * Math.PI * 18;
    const noise = Math.sin(seed + i * 0.5) * 0.15;
    const val = Math.abs(Math.sin(angle1) * 0.6 + Math.sin(angle2) * 0.25 + noise);
    mockData.push(Math.max(0.05, Math.min(1.0, val)));
  }
  return mockData;
};

export const mediaHasAudio = (item: any): boolean => {
  if (!item) return false;
  if (item.type === "audio") return true;
  if (item.type === "video") {
    const meta = item.metadata;
    return !!(meta && ((meta.channels && meta.channels > 0) || (meta.audioTrackCount && meta.audioTrackCount > 0)));
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
