export type TrackType = 'video' | 'audio' | 'text' | 'sticker' | 'vfx' | 'drawing' | 'element' | 'tts' | 'record';

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

export type VFXType =
  | 'lens-flare' | 'film-grain' | 'light-leak' | 'particles'
  | 'glitch' | 'vhs' | 'chromatic' | 'bloom' | 'sparkle' | 'smoke';

export interface VFXOverlay {
  type: VFXType;
  intensity: number;
  position: { x: number; y: number };
  scale: number;
  rotation: number;
  opacity: number;
}

export interface DrawingOverlay {
  paths: DrawingPath[];
  strokeWidth: number;
  strokeColor: string;
  tool: 'pen' | 'highlighter' | 'eraser';
}

export interface DrawingPath {
  points: { x: number; y: number }[];
  color: string;
  width: number;
  tool: 'pen' | 'highlighter' | 'eraser';
}

export interface ElementOverlay {
  svgContent: string;
  label: string;
  category: string;
}

export interface TTSOverlay {
  text: string;
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
  audioBlob?: Blob;
}

export interface RecordOverlay {
  streamId: string;
  deviceLabel: string;
  audioEnabled: boolean;
}

export interface TextOverlay {
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight: number;
  textAlign: 'left' | 'center' | 'right';
  outlineColor?: string;
  outlineWidth?: number;
  backgroundColor?: string;
  backgroundOpacity?: number;
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface Keyframe {
  id: string;
  time: number;
  value: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface KeyframeTrack {
  property: string;
  keyframes: Keyframe[];
}

export interface SpeedRampPoint {
  time: number;
  speed: number;
}

export interface ClipFilters {
  brightness: number;
  contrast: number;
  saturation: number;
  preset: 'none' | 'bw' | 'sepia' | 'invert' | 'warm' | 'cool' | 'contrast';
  chromaKey?: { enabled: boolean; color: string; similarity: number; smoothness: number };
  vignette?: { enabled: boolean; intensity: number };
  blur?: number;
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
  preservePitch: boolean;
  voiceStabilizer: boolean;
  opacity: number;
  blendMode: string;
  transform: Transform;
  textOverlay?: TextOverlay;
  sticker?: string;
  vfxOverlay?: VFXOverlay;
  drawingOverlay?: DrawingOverlay;
  elementOverlay?: ElementOverlay;
  ttsOverlay?: TTSOverlay;
  recordOverlay?: RecordOverlay;
  thumbnailFrame?: string;
  filters?: ClipFilters;
  transition?: ClipTransition;
  keyframeTracks?: KeyframeTrack[];
  speedRampPoints?: SpeedRampPoint[];
  audioFadeIn?: number;
  audioFadeOut?: number;
  crop?: { x: number; y: number; width: number; height: number };
  textAnimation?: 'none' | 'fadeIn' | 'typewriter' | 'slideUp' | 'slideDown' | 'scalePop' | 'bounce' | 'glitch' | 'wave';
  zIndex?: number;
}

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  locked: boolean;
  visible: boolean;
  solo?: boolean;
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

export type BackgroundFill = { type: 'solid'; color: string } | { type: 'gradient'; colors: string[]; angle: number };

export interface SnapGuide {
  orientation: 'horizontal' | 'vertical';
  position: number;
  sourceId: string;
}

export interface ElementDefinition {
  id: string;
  label: string;
  category: 'shape' | 'sticker' | 'emoji';
  svgContent?: string;
  emoji?: string;
}

export interface CanvasOptions {
  background: BackgroundFill;
}

export const SNAP_THRESHOLD = 0.3;
export const MIN_CLIP_DURATION = 0.3;
export const CLIP_GRID = 0.1;
export const DEFAULT_FPS = 30;
export const DEFAULT_RESOLUTION = { w: 1920, h: 1080 };

export const ASPECT_RATIO_PRESETS = [
  { label: '16:9 (Landscape)', w: 16, h: 9 },
  { label: '9:16 (Vertical)', w: 9, h: 16 },
  { label: '1:1 (Square)', w: 1, h: 1 },
  { label: '4:3 (Standard)', w: 4, h: 3 },
  { label: '4:5 (Instagram)', w: 4, h: 5 },
  { label: '21:9 (Ultrawide)', w: 21, h: 9 },
];
