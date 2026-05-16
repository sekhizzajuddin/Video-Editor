import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { MediaFile, Clip, Track, Project, TrackType, TextStyle } from '../types';
import { SNAP_THRESHOLD, MIN_CLIP_DURATION, CLIP_GRID } from '../types';

interface EditorState {
  project: Project;
  selectedClipId: string | null;
  currentTime: number;
  isPlaying: boolean;
  zoom: number;
  history: Project[];
  historyIndex: number;
  setProjectName: (name: string) => void;
  addMedia: (file: MediaFile) => void;
  removeMedia: (id: string) => void;
  addClip: (trackType: TrackType, mediaId?: string, sticker?: string) => void;
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
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  getClipsInRange: (trackId: string, start: number, end: number, excludeClipId?: string) => Clip[];
  findSnapTime: (time: number, trackId?: string, excludeClipId?: string) => number;
  moveClip: (clipId: string, newStartTime: number, newTrackType?: TrackType) => void;
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

function roundToGrid(t: number): number {
  return Math.round(t / CLIP_GRID) * CLIP_GRID;
}

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
  history: [],
  historyIndex: -1,

  pushHistory: () => {
    const { project, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(project)));
    if (newHistory.length > 50) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      set({ project: JSON.parse(JSON.stringify(history[newIndex])), historyIndex: newIndex });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      set({ project: JSON.parse(JSON.stringify(history[newIndex])), historyIndex: newIndex });
    }
  },

  getClipsInRange: (trackId, start, end, excludeClipId?) => {
    return get().project.tracks
      .find(t => t.id === trackId)
      ?.clips.filter(c =>
        c.id !== excludeClipId &&
        c.startTime < end &&
        c.startTime + c.duration > start
      ) || [];
  },

  findSnapTime: (time, trackId?, excludeClipId?) => {
    const state = get();
    let snapTime = time;

    const candidates: number[] = [];
    candidates.push(0);

    for (const track of state.project.tracks) {
      if (trackId && track.id !== trackId) continue;
      for (const clip of track.clips) {
        if (excludeClipId && clip.id === excludeClipId) continue;
        candidates.push(clip.startTime);
        candidates.push(clip.startTime + clip.duration);
      }
    }

    let minDist = SNAP_THRESHOLD;
    for (const c of candidates) {
      const dist = Math.abs(time - c);
      if (dist < minDist) {
        minDist = dist;
        snapTime = c;
      }
    }

    return roundToGrid(snapTime);
  },

  moveClip: (clipId, newStartTime, newTrackType?) => {
    const { pushHistory } = get();
    pushHistory();
    const state = get();

    const oldTrack = state.project.tracks.find(t =>
      t.clips.some(c => c.id === clipId)
    );
    if (!oldTrack) return;

    const clip = oldTrack.clips.find(c => c.id === clipId);
    if (!clip) return;

    const targetTrack = newTrackType
      ? state.project.tracks.find(t => t.type === newTrackType)
      : oldTrack;

    if (!targetTrack || targetTrack.locked) return;

    const snapped = state.findSnapTime(newStartTime, targetTrack.id, clipId);
    const newDur = clip.duration;
    const overlap = state.getClipsInRange(targetTrack.id, snapped, snapped + newDur, clipId);

    if (overlap.length > 0) return;

    let updatedTracks = state.project.tracks.map(t => ({
      ...t,
      clips: t.id === oldTrack.id
        ? t.clips.filter(c => c.id !== clipId)
        : t.clips,
    }));

    updatedTracks = updatedTracks.map(t =>
      t.id === targetTrack.id
        ? {
            ...t,
            clips: [...t.clips, { ...clip, startTime: snapped, trackId: targetTrack.id, trackType: targetTrack.type }],
          }
        : t
    );

    set({
      project: { ...state.project, tracks: updatedTracks, updatedAt: Date.now() },
    });
  },

  setProjectName: (name) => set((state) => ({
    project: { ...state.project, name, updatedAt: Date.now() },
  })),

  addMedia: (file) => {
    const state = get();
    state.pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        media: [...s.project.media, file],
        updatedAt: Date.now(),
      },
    }));
  },

  removeMedia: (id) => {
    const state = get();
    state.pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        media: s.project.media.filter((m) => m.id !== id),
        updatedAt: Date.now(),
      },
    }));
  },

  addClip: (trackType, mediaId, sticker) => {
    const state = get();
    state.pushHistory();

    const track = state.project.tracks.find((t) => t.type === trackType);
    if (!track) return;

    let duration = 5;
    let startTime = state.currentTime;

    if (mediaId) {
      const media = state.project.media.find((m) => m.id === mediaId);
      if (media) {
        duration = media.duration || 5;
      }
    }

    const existingClips = track.clips;
    const overlapping = existingClips.some(c =>
      startTime < c.startTime + c.duration && startTime + duration > c.startTime
    );

    if (overlapping) {
      const sorted = [...existingClips].sort((a, b) => a.startTime - b.startTime);
      let candidate = 0;
      for (let i = 0; i <= sorted.length; i++) {
        const prevEnd = i === 0 ? 0 : sorted[i - 1].startTime + sorted[i - 1].duration;
        const nextStart = i < sorted.length ? sorted[i].startTime : Infinity;
        if (nextStart - prevEnd >= duration) {
          candidate = prevEnd;
          break;
        }
        if (i < sorted.length) {
          candidate = sorted[i].startTime + sorted[i].duration;
        }
      }
      startTime = candidate;
    }

    const clip: Clip = {
      id: uuid(),
      mediaId,
      trackType,
      trackId: track.id,
      startTime,
      duration,
      trimStart: 0,
      trimEnd: duration,
      volume: 100,
      speed: 1,
      muted: false,
      ...(trackType === 'text' && { text: 'New Text', textStyle: { ...defaultTextStyle } }),
      ...(trackType === 'sticker' && { sticker, x: 50, y: 50 }),
      filters: { brightness: 0, contrast: 0, saturation: 0, preset: 'none' },
    };

    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) =>
          t.id === track.id ? { ...t, clips: [...t.clips, clip].sort((a, b) => a.startTime - b.startTime) } : t
        ),
        updatedAt: Date.now(),
      },
      selectedClipId: clip.id,
      currentTime: startTime,
    }));
  },

  updateClip: (clipId, updates) => {
    const state = get();
    state.pushHistory();
    const track = state.project.tracks.find(t => t.clips.some(c => c.id === clipId));
    if (!track) return;

    let updated = { ...updates };

    if ('startTime' in updates || 'duration' in updates) {
      const clip = track.clips.find(c => c.id === clipId)!;
      const newStart = updates.startTime ?? clip.startTime;
      const newDur = updates.duration ?? clip.duration;

      if (newDur < MIN_CLIP_DURATION) return;

      const others = track.clips.filter(c => c.id !== clipId);
      const overlapping = others.some(c =>
        newStart < c.startTime + c.duration && newStart + newDur > c.startTime
      );

      if (overlapping) return;

      const snapped = state.findSnapTime(newStart, track.id, clipId);
      if (snapped !== newStart) {
        updated.startTime = snapped;
      }
    }

    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, ...updated } : c
          ),
        })),
        updatedAt: Date.now(),
      },
    }));
  },

  removeClip: (clipId) => {
    const state = get();
    state.pushHistory();
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((track) => ({
          ...track,
          clips: track.clips.filter((c) => c.id !== clipId),
        })),
        updatedAt: Date.now(),
      },
      selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
    }));
  },

  splitClip: (clipId, time) => {
    const state = get();
    state.pushHistory();

    const track = state.project.tracks.find((t) =>
      t.clips.some((c) => c.id === clipId)
    );
    if (!track) return;

    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip) return;

    const relativeTime = time - clip.startTime;
    if (relativeTime <= 0 || relativeTime >= clip.duration) return;

    const newClip: Clip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: uuid(),
      startTime: time,
      duration: clip.duration - relativeTime,
      trimStart: clip.trimStart + relativeTime,
    };

    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) =>
          t.id === track.id
            ? {
                ...t,
                clips: [
                  ...t.clips.map((c) =>
                    c.id === clipId
                      ? { ...c, duration: relativeTime, trimEnd: clip.trimStart + relativeTime }
                      : c
                  ),
                  newClip,
                ].sort((a, b) => a.startTime - b.startTime),
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
    const s = get();
    if (!s.selectedClipId) return null;
    for (const track of s.project.tracks) {
      const clip = track.clips.find((c) => c.id === s.selectedClipId);
      if (clip) return clip;
    }
    return null;
  },

  getTrack: (trackType) => {
    return get().project.tracks.find((t) => t.type === trackType);
  },
}));
