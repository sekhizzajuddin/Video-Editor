export type TrackType = 'video' | 'audio' | 'text' | 'sticker';

export interface MediaFile {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  mimeType: string;
  blob: Blob;
  duration?: number;
  thumbnail?: string;
  width?: number;
  height?: number;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight: number;
  textAlign: 'left' | 'center' | 'right';
}

export interface Clip {
  id: string;
  mediaId?: string;
  trackType: TrackType;
  trackId: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  speed: number;
  muted: boolean;
  text?: string;
  textStyle?: TextStyle;
  sticker?: string;
  thumbnailFrame?: string;
  filters?: {
    brightness: number;
    contrast: number;
    saturation: number;
    preset: string;
  };
  transition?: {
    type: 'none' | 'fadein' | 'fadeout' | 'dissolve' | 'crossfade';
    duration: number;
  };
  x?: number;
  y?: number;
}

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  locked: boolean;
  visible: boolean;
  clips: Clip[];
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  duration: number;
  tracks: Track[];
  media: MediaFile[];
}

export type ExportFormat = 'webm' | 'mp4';
export type ExportResolution = '720p' | '1080p' | '4k';

export interface ExportSettings {
  format: ExportFormat;
  resolution: ExportResolution;
  quality: 'low' | 'medium' | 'high';
}

export const SNAP_THRESHOLD = 0.3;
export const MIN_CLIP_DURATION = 0.3;
export const CLIP_GRID = 0.1;
