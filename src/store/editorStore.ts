import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { MediaFile, Clip, Track, Project, TrackType, TextStyle } from '../types';

interface EditorState {
  project: Project;
  selectedClipId: string | null;
  currentTime: number;
  isPlaying: boolean;
  zoom: number;
  setProjectName: (name: string) => void;
  addMedia: (file: MediaFile) => void;
  removeMedia: (id: string) => void;
  addClip: (trackType: TrackType, mediaId?: string) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  removeClip: (clipId: string) => void;
  splitClip: (clipId: string, time: number) => void;
  setSelectedClip: (clipId: string | null) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  toggleTrackLocked: (trackId: string) => void;
  toggleTrackVisible: (trackId: string) => void;
  getSelectedClip: () => Clip | null;
  getTrack: (trackType: TrackType) => Track | undefined;
}

const defaultTextStyle: TextStyle = {
  fontFamily: 'Plus Jakarta Sans',
  fontSize: 48,
  color: '#FFFFFF',
  fontWeight: 600,
  textAlign: 'center',
};

const createDefaultTracks = (): Track[] => [
  { id: 'video-1', type: 'video', name: 'Video', locked: false, visible: true, clips: [] },
  { id: 'audio-1', type: 'audio', name: 'Audio', locked: false, visible: true, clips: [] },
  { id: 'text-1', type: 'text', name: 'Text', locked: false, visible: true, clips: [] },
  { id: 'sticker-1', type: 'sticker', name: 'Stickers', locked: false, visible: true, clips: [] },
];

export const useEditorStore = create<EditorState>((set, get) => ({
  project: {
    id: uuid(),
    name: 'Untitled Project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    duration: 60,
    tracks: createDefaultTracks(),
    media: [],
  },
  selectedClipId: null,
  currentTime: 0,
  isPlaying: false,
  zoom: 1,

  setProjectName: (name) => set((state) => ({
    project: { ...state.project, name, updatedAt: Date.now() },
  })),

  addMedia: (file) => set((state) => ({
    project: {
      ...state.project,
      media: [...state.project.media, file],
      updatedAt: Date.now(),
    },
  })),

  removeMedia: (id) => set((state) => ({
    project: {
      ...state.project,
      media: state.project.media.filter((m) => m.id !== id),
      updatedAt: Date.now(),
    },
  })),

  addClip: (trackType, mediaId) => {
    const state = get();
    const track = state.project.tracks.find((t) => t.type === trackType);
    if (!track) return;

    let duration = 5;

    if (mediaId) {
      const media = state.project.media.find((m) => m.id === mediaId);
      if (media) {
        duration = media.duration || 5;
      }
    } else if (trackType === 'text') {
      duration = 5;
    } else if (trackType === 'sticker') {
      duration = 3;
    }

    const clip: Clip = {
      id: uuid(),
      mediaId,
      trackType,
      trackId: track.id,
      startTime: state.currentTime,
      duration,
      trimStart: 0,
      trimEnd: duration,
      volume: 100,
      speed: 1,
      muted: false,
      ...(trackType === 'text' && { text: 'New Text', textStyle: { ...defaultTextStyle } }),
      filters: { brightness: 0, contrast: 0, saturation: 0, preset: 'none' },
    };

    set((state) => ({
      project: {
        ...state.project,
        tracks: state.project.tracks.map((t) =>
          t.id === track.id ? { ...t, clips: [...t.clips, clip] } : t
        ),
        updatedAt: Date.now(),
      },
      selectedClipId: clip.id,
    }));
  },

  updateClip: (clipId, updates) => set((state) => ({
    project: {
      ...state.project,
      tracks: state.project.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.id === clipId ? { ...clip, ...updates } : clip
        ),
      })),
      updatedAt: Date.now(),
    },
  })),

  removeClip: (clipId) => set((state) => ({
    project: {
      ...state.project,
      tracks: state.project.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((c) => c.id !== clipId),
      })),
      updatedAt: Date.now(),
    },
    selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
  })),

  splitClip: (clipId, time) => {
    const state = get();
    const track = state.project.tracks.find((t) =>
      t.clips.some((c) => c.id === clipId)
    );
    if (!track) return;

    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip) return;

    const relativeTime = time - clip.startTime;
    if (relativeTime <= 0 || relativeTime >= clip.duration) return;

    const newClip: Clip = {
      ...clip,
      id: uuid(),
      startTime: time,
      duration: clip.duration - relativeTime,
      trimStart: clip.trimStart + relativeTime,
    };

    set((state) => ({
      project: {
        ...state.project,
        tracks: state.project.tracks.map((t) =>
          t.id === track.id
            ? {
                ...t,
                clips: [
                  ...t.clips.map((c) =>
                    c.id === clipId ? { ...c, duration: relativeTime, trimEnd: clip.trimStart + relativeTime } : c
                  ),
                  newClip,
                ],
              }
            : t
        ),
        updatedAt: Date.now(),
      },
    }));
  },

  setSelectedClip: (clipId) => set({ selectedClipId: clipId }),
  setCurrentTime: (time) => set({ currentTime: Math.max(0, time) }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(10, zoom)) }),

  toggleTrackLocked: (trackId) => set((state) => ({
    project: {
      ...state.project,
      tracks: state.project.tracks.map((t) =>
        t.id === trackId ? { ...t, locked: !t.locked } : t
      ),
    },
  })),

  toggleTrackVisible: (trackId) => set((state) => ({
    project: {
      ...state.project,
      tracks: state.project.tracks.map((t) =>
        t.id === trackId ? { ...t, visible: !t.visible } : t
      ),
    },
  })),

  getSelectedClip: () => {
    const state = get();
    if (!state.selectedClipId) return null;
    for (const track of state.project.tracks) {
      const clip = track.clips.find((c) => c.id === state.selectedClipId);
      if (clip) return clip;
    }
    return null;
  },

  getTrack: (trackType) => {
    return get().project.tracks.find((t) => t.type === trackType);
  },
}));