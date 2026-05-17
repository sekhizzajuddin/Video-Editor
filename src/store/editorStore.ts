import { create } from 'zustand';
import {
  Clip, Track, Project, ExportSettings, MediaFile, Marker,
  TrackType, Transform,
  SNAP_THRESHOLD, MIN_CLIP_DURATION, CLIP_GRID,
  DEFAULT_FPS, DEFAULT_RESOLUTION,
} from '../types';
import { saveProject } from '../utils/fileUtils';

let clipCounter = 0;
function genId(): string { clipCounter += 1; return `clip_${Date.now()}_${clipCounter}`; }

function clone<T>(o: T): T { return JSON.parse(JSON.stringify(o)); }

function emptyProject(): Project {
  return {
    id: '', name: 'Untitled Project', createdAt: Date.now(), updatedAt: Date.now(),
    duration: 10, fps: DEFAULT_FPS, resolution: { ...DEFAULT_RESOLUTION },
    tracks: [
      { id: 'track_video_1', type: 'video', name: 'Video 1', locked: false, visible: true, clips: [] },
      { id: 'track_audio_1', type: 'audio', name: 'Audio 1', locked: false, visible: true, clips: [] },
      { id: 'track_text_1', type: 'text', name: 'Text 1', locked: false, visible: true, clips: [] },
      { id: 'track_sticker_1', type: 'sticker', name: 'Sticker 1', locked: false, visible: true, clips: [] },
    ],
    media: [], markers: [],
  };
}

const defaultExport: ExportSettings = { format: 'mp4', resolution: '1080p', quality: 'medium' };
const defaultTransform: Transform = { x: 0, y: 0, scale: 1, rotation: 0 };

export interface EditorState {
  project: Project;
  aspectRatio: { w: number; h: number };
  /** Incremented on every visual property change to trigger re-render in PreviewCanvas */
  renderTick: number;

  currentTime: number;
  isPlaying: boolean;
  speed: number;
  volume: number;
  selectedClipIds: string[];
  activeClipId: string | null;
  undoStack: Project[];
  redoStack: Project[];
  copiedClip: Clip | null;
  exportSettings: ExportSettings;
  showExport: boolean;
  exportProgress: number;
  exportStage: string;
  exportError: string | null;
  zoom: number;
  showShorcuts: boolean;
  rippleDelete: boolean;
  showOpenProject: boolean;
  saveToast: boolean;
  isDirty: boolean;

  // top-level actions (consumed directly by components)
  setProjectId: (id: string) => void;
  setProjectName: (n: string) => void;
  setCurrentTime: (t: number) => void;
  setIsPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  setVolume: (v: number) => void;
  setZoom: (z: number) => void;
  setShowExport: (s: boolean) => void;
  setExportProgress: (p: number) => void;
  setExportStage: (s: string) => void;
  setExportError: (e: string | null) => void;
  setShowShorcuts: (s: boolean) => void;
  setRippleDelete: (r: boolean) => void;
  setShowOpenProject: (s: boolean) => void;
  setSaveToast: (s: boolean) => void;
  setCopiedClip: (c: Clip | null) => void;
  setExportSettings: (s: ExportSettings) => void;
  setActiveClipId: (id: string | null) => void;
  setSelectedClipIds: (ids: string[]) => void;
  setDirty: (d: boolean) => void;

  /** Push a snapshot for undo — called only on drag-end / split / delete, not on every pixel */
  pushHistory: () => void;
  /** Convenience: pushHistory then clear redo */
  commitDrag: () => void;
  undo: () => void;
  redo: () => void;

  addClip: (trackType: TrackType, mediaId?: string, sticker?: string) => Clip | null;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  removeClip: (id: string, ripple?: boolean) => void;
  moveClip: (id: string, toTrackId: string, toStartAt: number) => boolean;
  splitClip: (id: string, splitAt: number) => void;
  removeSelectedClips: () => void;

  addTrack: (type: TrackType) => void;
  removeTrack: (id: string) => void;
  moveTrack: (from: number, to: number) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;

  addMedia: (m: MediaFile) => void;
  removeMedia: (id: string) => void;

  addMarker: (m: Marker) => void;
  removeMarker: (id: string) => void;
  toggleMarker: (time: number) => void;

  loadProject: (p: Project) => void;
  newProject: () => void;
  cropToMarkers: () => void;
  recalcDuration: () => void;
  saveToDB: () => Promise<void>;

  getClip: (id: string) => Clip | undefined;
  getTrack: (id: string) => Track | undefined;
  getTrackClips: (trackId: string) => Clip[];
  getClipsInRange: (trackId: string, from: number, to: number) => Clip[];
  findSnapTime: (trackId: string, t: number) => number;
}

export const useEditorStore = create<EditorState>((set, get) => {
  const ep = emptyProject();

  return {
    project: clone(ep),
    aspectRatio: { w: 16, h: 9 },
    renderTick: 0,
    currentTime: 0,
    isPlaying: false,
    speed: 1,
    volume: 1,
    selectedClipIds: [],
    activeClipId: null,
    undoStack: [],
    redoStack: [],
    copiedClip: null,
    exportSettings: defaultExport,
    showExport: false,
    exportProgress: 0,
    exportStage: '',
    exportError: null,
    zoom: 1,
    showShorcuts: false,
    rippleDelete: false,
    showOpenProject: false,
    saveToast: false,
    isDirty: false,

    // --- top-level actions ---
    setProjectId: (id) => set((s) => ({ project: { ...s.project, id }, isDirty: true })),
    setProjectName: (n) => set((s) => ({ project: { ...s.project, name: n }, isDirty: true })),
    setCurrentTime: (t) => set({ currentTime: t }),
    setIsPlaying: (p) => set({ isPlaying: p }),
    setSpeed: (s) => set({ speed: s }),
    setVolume: (v) => set({ volume: v }),
    setZoom: (z) => set({ zoom: z }),
    setShowExport: (s) => set({ showExport: s }),
    setExportProgress: (p) => set({ exportProgress: p }),
    setExportStage: (s) => set({ exportStage: s }),
    setExportError: (e) => set({ exportError: e }),
    setShowShorcuts: (s) => set({ showShorcuts: s }),
    setRippleDelete: (r) => set({ rippleDelete: r }),
    setShowOpenProject: (s) => set({ showOpenProject: s }),
    setSaveToast: (s) => set({ saveToast: s }),
    setCopiedClip: (c) => set({ copiedClip: c }),
    setExportSettings: (s) => set({ exportSettings: s }),
    setActiveClipId: (id) => set({ activeClipId: id, selectedClipIds: id ? [id] : [] }),
    setSelectedClipIds: (ids) => set({ selectedClipIds: ids }),
    setDirty: (d) => set({ isDirty: d }),

    commitDrag: () => {
      const s = get();
      const snapshot = clone(s.project);
      snapshot.id = s.project.id || '';
      set((st) => ({ undoStack: [...st.undoStack.slice(-49), snapshot], redoStack: [] }));
    },

    pushHistory: () => {
      const s = get();
      const snapshot = clone(s.project);
      snapshot.id = s.project.id || '';
      set((st) => ({ undoStack: [...st.undoStack.slice(-49), snapshot], redoStack: [] }));
    },

    undo: () => {
      const { undoStack } = get();
      if (undoStack.length === 0) return;
      const prev = undoStack[undoStack.length - 1];
      const s = get();
      const currentSnapshot = clone(s.project);
      set({ project: clone(prev), undoStack: undoStack.slice(0, -1), redoStack: [...s.redoStack, currentSnapshot], isDirty: true, currentTime: s.currentTime });
    },

    redo: () => {
      const { redoStack } = get();
      if (redoStack.length === 0) return;
      const next = redoStack[redoStack.length - 1];
      const s = get();
      const currentSnapshot = clone(s.project);
      set({ project: clone(next), redoStack: redoStack.slice(0, -1), undoStack: [...s.undoStack, currentSnapshot], isDirty: true, currentTime: s.currentTime });
    },

    addClip: (trackType, mediaId, sticker) => {
      const state = get();
      const track = state.project.tracks.find((t) => t.type === trackType && !t.locked);
      if (!track) return null;

      const id = genId();
      const newClip: Clip = {
        id, mediaId, trackType, trackId: track.id,
        startAt: 0, duration: 2, sourceStart: 0, sourceEnd: 0,
        volume: 1, speed: 1, muted: false, opacity: 100, blendMode: 'normal',
        transform: { ...defaultTransform },
        sticker,
        textOverlay: trackType === 'text' ? {
          text: 'Text', fontFamily: 'Arial', fontSize: 48, color: '#ffffff', fontWeight: 400, textAlign: 'center' as const,
        } : undefined,
        filters: { brightness: 0, contrast: 0, saturation: 0, preset: 'none' },
        transition: { type: 'none', duration: 0.3 },
      };

      if (mediaId) {
        const mf = state.project.media.find((m) => m.id === mediaId);
        if (mf?.duration) newClip.duration = mf.duration;
        if (mf?.type === 'image') newClip.duration = 3;
      }

      const existing = track.clips;
      let placeTime = 0;
      if (existing.length > 0) placeTime = Math.max(...existing.map((c) => c.startAt + c.duration));
      const snap = get().findSnapTime(track.id, placeTime);
      newClip.startAt = Math.max(0, snap >= 0 ? snap : placeTime);

      get().pushHistory();
      set((st) => ({
        project: {
          ...st.project,
          tracks: st.project.tracks.map((t) =>
            t.id === track.id ? { ...t, clips: [...t.clips, newClip] } : t
          ),
        },
        activeClipId: id, selectedClipIds: [id], isDirty: true,
      }));
      get().recalcDuration();
      return newClip;
    },

    updateClip: (id, patch) => {
      set((st) => {
        const visualProps = ['transform', 'opacity', 'blendMode', 'filters', 'textOverlay', 'volume', 'speed', 'muted'];
        const affectsVisual = Object.keys(patch).some((k) => visualProps.includes(k));

        return {
          project: {
            ...st.project,
            tracks: st.project.tracks.map((t) => ({
              ...t,
              clips: t.clips.map((c) => {
                if (c.id !== id) return c;
                const updated = { ...c, ...patch };
                if (patch.startAt !== undefined || patch.duration !== undefined) {
                  const overlap = get().getClipsInRange(t.id, updated.startAt, updated.startAt + updated.duration)
                    .filter((o) => o.id !== id);
                  if (overlap.length > 0) {
                    updated.startAt = overlap[0].startAt + overlap[0].duration;
                  }
                }
                return updated;
              }),
            })),
          },
          isDirty: true,
          renderTick: st.renderTick + (affectsVisual ? 1 : 0),
        };
      });
      get().recalcDuration();
    },

    removeClip: (id, ripple) => {
      get().pushHistory();
      let removedStart = 0;
      let removedDuration = 0;
      set((st) => {
        const newTracks = st.project.tracks.map((t) => {
          const idx = t.clips.findIndex((c) => c.id === id);
          if (idx === -1) return t;
          const clip = t.clips[idx];
          removedStart = clip.startAt;
          removedDuration = clip.duration;
          return { ...t, clips: t.clips.filter((c) => c.id !== id) };
        });
        const doRipple = ripple !== false && (st.rippleDelete || ripple);
        return {
          project: {
            ...st.project,
            tracks: doRipple ? newTracks.map((t) => ({
              ...t,
              clips: t.clips.map((c) => c.startAt >= removedStart ? { ...c, startAt: Math.max(0, c.startAt - removedDuration) } : c),
            })) : newTracks,
          },
          selectedClipIds: st.selectedClipIds.filter((cid) => cid !== id),
          activeClipId: st.activeClipId === id ? null : st.activeClipId,
          isDirty: true,
        };
      });
      get().recalcDuration();
    },

    moveClip: (id, toTrackId, toStartAt) => {
      const state = get();
      const sourceTrack = state.project.tracks.find((t) => t.clips.some((c) => c.id === id));
      if (!sourceTrack) return false;
      const clip = sourceTrack.clips.find((c) => c.id === id);
      if (!clip) return false;
      const destTrack = state.project.tracks.find((t) => t.id === toTrackId);
      if (!destTrack || destTrack.locked) return false;

      const snap = get().findSnapTime(toTrackId, toStartAt);
      const finalTime = snap >= 0 ? snap : Math.max(0, toStartAt);
      const overlap = get().getClipsInRange(toTrackId, finalTime, finalTime + clip.duration).filter((o) => o.id !== id);
      if (overlap.length > 0) return false;

      get().pushHistory();
      set((st) => ({
        project: {
          ...st.project,
          tracks: st.project.tracks.map((t) => ({
            ...t,
            clips: t.id === sourceTrack.id
              ? t.clips.filter((c) => c.id !== id)
              : t.id === toTrackId
                ? [...t.clips, { ...clip, trackId: toTrackId, startAt: finalTime }]
                : t.clips,
          })),
        },
        isDirty: true,
      }));
      get().recalcDuration();
      return true;
    },

    splitClip: (id, splitAt) => {
      const state = get();
      for (const track of state.project.tracks) {
        const clip = track.clips.find((c) => c.id === id);
        if (!clip) continue;
        if (splitAt <= clip.startAt || splitAt >= clip.startAt + clip.duration) return;
        const splitPoint = splitAt - clip.startAt;
        if (splitPoint < MIN_CLIP_DURATION || clip.duration - splitPoint < MIN_CLIP_DURATION) return;

        get().pushHistory();
        const newId = genId();
        const newClip: Clip = {
          ...clone(clip), id: newId, startAt: splitAt,
          duration: clip.duration - splitPoint,
          sourceStart: clip.sourceStart + splitPoint * clip.speed,
        };
        const updatedClip = { ...clip, duration: splitPoint };

        set((st) => ({
          project: {
            ...st.project,
            tracks: st.project.tracks.map((t) =>
              t.id === track.id
                ? { ...t, clips: [...t.clips.filter((c) => c.id !== id), updatedClip, newClip].sort((a, b) => a.startAt - b.startAt) }
                : t
            ),
          },
          isDirty: true,
        }));
        get().recalcDuration();
        return;
      }
    },

    removeSelectedClips: () => {
      const { selectedClipIds, rippleDelete } = get();
      if (selectedClipIds.length === 0) return;
      get().pushHistory();
      set((st) => {
        let removedLen = 0;
        let removedStart = Infinity;
        let newTracks = st.project.tracks.map((t) => {
          const filtered = t.clips.filter((c) => !selectedClipIds.includes(c.id));
          for (const c of t.clips) {
            if (selectedClipIds.includes(c.id)) {
              removedStart = Math.min(removedStart, c.startAt);
              removedLen = Math.max(removedLen, c.startAt + c.duration - removedStart);
            }
          }
          return { ...t, clips: filtered };
        });
        if (rippleDelete) {
          newTracks = newTracks.map((t) => ({
            ...t,
            clips: t.clips.map((c) => c.startAt >= removedStart ? { ...c, startAt: Math.max(0, c.startAt - removedLen) } : c),
          }));
        }
        return { project: { ...st.project, tracks: newTracks }, selectedClipIds: [], activeClipId: null, isDirty: true };
      });
    },

    addTrack: (type) => {
      get().pushHistory();
      const existing = get().project.tracks.filter((t) => t.type === type);
      const num = existing.length + 1;
      const nameMap: Record<string, string> = { video: 'Video', audio: 'Audio', text: 'Text', sticker: 'Sticker' };
      const newTrack: Track = { id: `track_${type}_${num}`, type, name: `${nameMap[type] || type} ${num}`, locked: false, visible: true, clips: [] };
      set((st) => ({ project: { ...st.project, tracks: [...st.project.tracks, newTrack] }, isDirty: true }));
    },

    removeTrack: (id) => {
      const state = get();
      const track = state.project.tracks.find((t) => t.id === id);
      if (!track) return;
      if (state.project.tracks.filter((t) => t.type === track.type).length <= 1) return;
      get().pushHistory();
      set((st) => ({ project: { ...st.project, tracks: st.project.tracks.filter((t) => t.id !== id) }, isDirty: true }));
    },

    moveTrack: (from, to) => {
      get().pushHistory();
      set((st) => {
        const arr = [...st.project.tracks];
        const [removed] = arr.splice(from, 1);
        arr.splice(to, 0, removed);
        return { project: { ...st.project, tracks: arr }, isDirty: true };
      });
    },

    updateTrack: (id, patch) => set((st) => ({
      project: { ...st.project, tracks: st.project.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) },
      isDirty: true,
    })),

    addMedia: (m) => set((st) => ({ project: { ...st.project, media: [...st.project.media, m] }, isDirty: true })),
    removeMedia: (id) => set((st) => ({
      project: {
        ...st.project,
        media: st.project.media.filter((m) => m.id !== id),
        tracks: st.project.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.mediaId !== id) })),
      },
      isDirty: true,
    })),

    addMarker: (m) => set((st) => ({ project: { ...st.project, markers: [...st.project.markers, m] }, isDirty: true })),
    removeMarker: (id) => set((st) => ({
      project: { ...st.project, markers: st.project.markers.filter((m) => m.id !== id) },
      isDirty: true,
    })),

    toggleMarker: (time) => {
      const { project: { markers } } = get();
      const existing = markers.find((m) => Math.abs(m.time - time) < 0.1);
      if (existing) get().removeMarker(existing.id);
      else {
        const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899'];
        get().addMarker({ id: genId(), time, label: `Marker ${markers.length + 1}`, color: colors[markers.length % colors.length] });
      }
    },

    loadProject: (p) => {
      set({
        project: clone(p),
        currentTime: 0, isPlaying: false,
        selectedClipIds: [], activeClipId: null,
        undoStack: [], redoStack: [], isDirty: false,
      });
    },

    newProject: () => {
      set({
        project: clone(emptyProject()),
        currentTime: 0, isPlaying: false,
        selectedClipIds: [], activeClipId: null,
        undoStack: [], redoStack: [], isDirty: false, showOpenProject: false,
      });
    },

    cropToMarkers: () => {
      const { project: { markers } } = get();
      if (markers.length < 2) return;
      const sorted = [...markers].sort((a, b) => a.time - b.time);
      const start = sorted[0].time;
      const end = sorted[sorted.length - 1].time;
      get().pushHistory();
      set((st) => ({
        project: {
          ...st.project,
          tracks: st.project.tracks.map((t) => ({
            ...t,
            clips: t.clips.map((c) => {
              const clipEnd = c.startAt + c.duration;
              if (clipEnd <= start || c.startAt >= end) return null;
              const newStart = Math.max(c.startAt, start);
              const newEnd = Math.min(clipEnd, end);
              return { ...c, startAt: newStart - start, duration: newEnd - newStart, sourceStart: c.sourceStart + (newStart - c.startAt) * c.speed };
            }).filter(Boolean) as Clip[],
          })),
          markers: [],
          duration: end - start,
        },
      }));
    },

    recalcDuration: () => {
      const { project: { tracks } } = get();
      let maxEnd = 0;
      for (const t of tracks) {
        for (const c of t.clips) maxEnd = Math.max(maxEnd, c.startAt + c.duration);
      }
      set((s) => ({ project: { ...s.project, duration: Math.max(maxEnd + 5, 10) } }));
    },

    saveToDB: async () => {
      const s = get();
      const proj: Project = clone(s.project);
      proj.id = proj.id || `proj_${Date.now()}`;
      proj.updatedAt = Date.now();
      if (!s.project.id) set((st) => ({ project: { ...st.project, id: proj.id } }));
      await saveProject(proj);
      set({ isDirty: false, saveToast: true });
      setTimeout(() => set({ saveToast: false }), 2000);
    },

    getClip: (id) => {
      for (const t of get().project.tracks) {
        const c = t.clips.find((x) => x.id === id);
        if (c) return c;
      }
      return undefined;
    },

    getTrack: (id) => get().project.tracks.find((t) => t.id === id),
    getTrackClips: (trackId) => get().project.tracks.find((x) => x.id === trackId)?.clips || [],
    getClipsInRange: (trackId, from, to) => {
      const t = get().project.tracks.find((x) => x.id === trackId);
      if (!t) return [];
      return t.clips.filter((c) => c.startAt < to && c.startAt + c.duration > from);
    },

    findSnapTime: (trackId, t) => {
      const clips = get().getTrackClips(trackId);
      for (const c of clips) {
        if (Math.abs(t - c.startAt) < SNAP_THRESHOLD) return c.startAt;
        if (Math.abs(t - (c.startAt + c.duration)) < SNAP_THRESHOLD) return c.startAt + c.duration;
      }
      if (Math.abs(t) < SNAP_THRESHOLD) return 0;
      const grid = Math.round(t / CLIP_GRID) * CLIP_GRID;
      if (Math.abs(t - grid) < 0.02) return grid;
      return -1;
    },
  };
});
