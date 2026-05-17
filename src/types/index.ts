export type TrackType = 'video' | 'audio' | 'text' | 'sticker';

export interface MediaFile {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  mimeType: string;
  blob: Blob;
  duration?: number;
  thumbnail?: string;
  thumbnails?: string[];   // filmstrip frames for video
  width?: number;
  height?: number;
  waveform?: number[];     // normalised 0-1 amplitude buckets
}

export interface TextOverlay {
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight: number;
  textAlign: 'left' | 'center' | 'right';
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface ClipFilters {
  brightness: number;
  contrast: number;
  saturation: number;
  preset: 'none' | 'bw' | 'sepia' | 'invert' | 'warm' | 'cool' | 'contrast';
}

export type TransitionType =
  | 'none' | 'fade' | 'dissolve'
  | 'wipe-left' | 'wipe-right'
  | 'slide-left' | 'slide-right'
  | 'zoom' | 'spin' | 'blur' | 'flash';

export interface ClipTransition {
  type: TransitionType;
  duration: number;
}

export interface Clip {
  id: string;
  mediaId?: string;
  trackType: TrackType;
  trackId: string;
  /** Timeline position in seconds */
  startAt: number;
  /** Duration in seconds */
  duration: number;
  /** Source media trim start in seconds */
  sourceStart: number;
  /** Source media trim end offset in seconds */
  sourceEnd: number;
  volume: number;
  speed: number;
  muted: boolean;
  opacity: number;
  blendMode: string;
  transform: Transform;
  textOverlay?: TextOverlay;
  sticker?: string;
  thumbnailFrame?: string;
  filters?: ClipFilters;
  transition?: ClipTransition;
}

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  locked: boolean;
  visible: boolean;
  clips: Clip[];
}

export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  duration: number;
  fps: number;
  resolution: { w: number; h: number };
  tracks: Track[];
  media: MediaFile[];
  markers: Marker[];
}

export type ExportFormat = 'webm' | 'mp4' | 'mp3' | 'wav';
export type ExportResolution = '720p' | '1080p' | '4k';

export interface ExportSettings {
  format: ExportFormat;
  resolution: ExportResolution;
  quality: 'low' | 'medium' | 'high';
}

export const SNAP_THRESHOLD = 0.3;
export const MIN_CLIP_DURATION = 0.3;
export const CLIP_GRID = 0.1;
export const DEFAULT_FPS = 30;
export const DEFAULT_RESOLUTION = { w: 1920, h: 1080 };
