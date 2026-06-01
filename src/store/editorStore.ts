import { create } from 'zustand';
import {
  Clip, Track, Project, ExportSettings, MediaFile, Marker,
  TrackType, Transform,
  SNAP_THRESHOLD, MIN_CLIP_DURATION, CLIP_GRID,
  DEFAULT_FPS, DEFAULT_RESOLUTION,
} from '../types';
import { saveProject } from '../utils/fileUtils';
import { revokeMediaUrl } from '../engine/useMediaManager';
import { addKeyframe, removeKeyframe } from '../utils/keyframeUtils';
import type { Keyframe } from '../types';

function genId(): string { return crypto.randomUUID(); }

function clone<T>(o: T): T { return structuredClone(o); }

function emptyProject(): Project {
  return {
    id: '', name: 'Untitled Project', createdAt: Date.now(), updatedAt: Date.now(),
    duration: 10, fps: DEFAULT_FPS, resolution: { ...DEFAULT_RESOLUTION },
    tracks: [
      { id: 'track_video_1', type: 'video', name: 'Video 1', locked: false, visible: true, clips: [] },
      { id: 'track_audio_1', type: 'audio', name: 'Audio 1', locked: false, visible: true, clips: [] },
      { id: 'track_text_1', type: 'text', name: 'Text 1', locked: false, visible: true, clips: [] },
      { id: 'track_sticker_1', type: 'sticker', name: 'Sticker 1', locked: false, visible: true, clips: [] },
      { id: 'track_vfx_1', type: 'vfx', name: 'VFX 1', locked: false, visible: true, clips: [] },
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
  pendingDrag: { clip: Clip; sourceTrackId: string } | null;
  exportSettings: ExportSettings;
  showExport: boolean;
  exportProgress: number;
  exportStage: string;
  exportError: string | null;
  zoom: number;
  showShortcuts: boolean;
  rippleDelete: boolean;
  snapEnabled: boolean;
  dynamicSpeedMode: boolean;
  showCrop: boolean;
  cropRect: { x: number; y: number; width: number; height: number } | null;
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
  setShowShortcuts: (s: boolean) => void;
  setRippleDelete: (r: boolean) => void;
  setSnapEnabled: (s: boolean) => void;
  setDynamicSpeedMode: (d: boolean) => void;
  setShowCrop: (s: boolean) => void;
  setCropRect: (r: { x: number; y: number; width: number; height: number } | null) => void;
  setInPoint: (time: number) => void;
  setOutPoint: (time: number) => void;
  setShowOpenProject: (s: boolean) => void;
  setSaveToast: (s: boolean) => void;
  setCopiedClip: (c: Clip | null) => void;
  setPendingDrag: (d: { clip: Clip; sourceTrackId: string } | null) => void;
  commitPendingDrag: () => void;
  cancelPendingDrag: () => void;
  setExportSettings: (s: ExportSettings) => void;
  setAspectRatio: (w: number, h: number) => void;
  setActiveClipId: (id: string | null) => void;
  setSelectedClipIds: (ids: string[]) => void;
  setDirty: (d: boolean) => void;

  /** Push a snapshot for undo — called only on drag-end / split / delete, not on every pixel */
  pushHistory: () => void;
  /** Convenience: pushHistory then clear redo */
  commitDrag: (clipId?: string) => void;
  resolveTrackCollisions: (trackId: string) => void;
  undo: () => void;
  redo: () => void;

  addClip: (trackType: TrackType, mediaId?: string, sticker?: string) => Clip | null;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  removeClip: (id: string, ripple?: boolean) => void;
  moveClip: (id: string, toTrackId: string, toStartAt: number) => boolean;
  /** Like moveClip but skips pushHistory — for use during drag */
  moveClipDrag: (id: string, toTrackId: string, toStartAt: number) => boolean;
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
  /** Internal debounced version */
  _recalcDurationImmediate: () => void;
  saveToDB: () => Promise<void>;

  getClip: (id: string) => Clip | undefined;
  getTrack: (id: string) => Track | undefined;
  getTrackClips: (trackId: string) => Clip[];
  getClipsInRange: (trackId: string, from: number, to: number) => Clip[];
  findSnapTime: (trackId: string, t: number) => number;
  addKeyframe: (clipId: string, property: string, time: number, value: number, easing?: Keyframe['easing']) => void;
  removeKeyframe: (clipId: string, keyframeId: string) => void;
}

let _recalcTimer: ReturnType<typeof setTimeout> | null = null;

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
    pendingDrag: null,
    exportSettings: defaultExport,
    showExport: false,
    exportProgress: 0,
    exportStage: '',
    exportError: null,
    zoom: 1,
    showShortcuts: false,
    rippleDelete: false,
    snapEnabled: true,
    dynamicSpeedMode: false,
    showCrop: false,
    cropRect: null,
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
    setShowShortcuts: (s) => set({ showShortcuts: s }),
    setRippleDelete: (r) => set({ rippleDelete: r }),
    setSnapEnabled: (s) => set({ snapEnabled: s }),
    setDynamicSpeedMode: (d) => set({ dynamicSpeedMode: d }),
    setShowCrop: (s) => set({ showCrop: s }),
    setCropRect: (r) => set({ cropRect: r }),
    setShowOpenProject: (s) => set({ showOpenProject: s }),
    setSaveToast: (s) => set({ saveToast: s }),
    setCopiedClip: (c) => set({ copiedClip: c }),
    setPendingDrag: (d) => set({ pendingDrag: d }),
    commitPendingDrag: () => set({ pendingDrag: null }),
    cancelPendingDrag: () => {
      const { pendingDrag } = get();
      if (!pendingDrag) return;
      const { clip, sourceTrackId } = pendingDrag;
      set((st) => ({
        project: {
          ...st.project,
          tracks: st.project.tracks.map((t) => {
            if (t.id === sourceTrackId) {
              // Remove any stale version, then re-add the original clip
              const withoutClip = t.clips.filter(c => c.id !== clip.id);
              return { ...t, clips: [...withoutClip, clip] };
            }
            if (t.id !== sourceTrackId) {
              // Remove the clip from any track it was dragged to
              return { ...t, clips: t.clips.filter(c => c.id !== clip.id) };
            }
            return t;
          }),
        },
        pendingDrag: null,
      }));
    },
    setExportSettings: (s) => set({ exportSettings: s }),
    setAspectRatio: (w, h) => set({ aspectRatio: { w, h }, isDirty: true }),
    setActiveClipId: (id) => set({ activeClipId: id }),
    setSelectedClipIds: (ids) => set({ selectedClipIds: ids }),
    setDirty: (d) => set({ isDirty: d }),

    commitDrag: (clipId) => {
      get().pushHistory();
      if (clipId) {
        const clip = get().getClip(clipId);
        if (clip) {
          get().resolveTrackCollisions(clip.trackId);
        }
      }
    },

    resolveTrackCollisions: (trackId) => {
      const state = get();
      const track = state.project.tracks.find((t) => t.id === trackId);
      if (!track || track.locked) return;

      const clips = [...track.clips].sort((a, b) => a.startAt - b.startAt);
      let changed = false;

      for (let i = 0; i < clips.length; i++) {
        if (i === 0) continue;
        const prev = clips[i - 1];
        const curr = clips[i];
        if (prev.startAt + prev.duration > curr.startAt) {
          const overlap = (prev.startAt + prev.duration) - curr.startAt;
          for (let j = i; j < clips.length; j++) {
            clips[j] = { ...clips[j], startAt: clips[j].startAt + overlap };
          }
          changed = true;
        }
      }

      if (changed) {
        set((st) => ({
          project: {
            ...st.project,
            tracks: st.project.tracks.map((t) =>
              t.id === trackId ? { ...t, clips } : t
            ),
          },
          isDirty: true,
        }));
        get().recalcDuration();
      }
    },

    pushHistory: () => {
      const s = get();
      const snapshot = clone(s.project);
      snapshot.id = s.project.id || '';
      // Exclude media blobs from undo snapshots to avoid memory bloat
      snapshot.media = snapshot.media.map(m => {
        const { blob, ...rest } = m as MediaFile & { blob?: unknown };
        return rest as MediaFile;
      });
      set((st) => ({ undoStack: [...st.undoStack.slice(-49), snapshot], redoStack: [] }));
    },

    undo: () => {
      const { undoStack } = get();
      if (undoStack.length === 0) return;
      const prev = undoStack[undoStack.length - 1];
      const s = get();
      const currentSnapshot = clone(s.project);
      // Exclude blobs from redo snapshot
      currentSnapshot.media = currentSnapshot.media.map(m => {
        const { blob, ...rest } = m as MediaFile & { blob?: unknown };
        return rest as MediaFile;
      });
      // Restore media blobs from current state into the undo snapshot
      const restored = clone(prev);
      restored.media = restored.media.map(m => {
        const current = s.project.media.find(cm => cm.id === m.id);
        return current ? { ...m, ...current } : m;
      });
      set({ project: restored, undoStack: undoStack.slice(0, -1), redoStack: [...s.redoStack, currentSnapshot], isDirty: true, currentTime: s.currentTime });
    },

    redo: () => {
      const { redoStack } = get();
      if (redoStack.length === 0) return;
      const next = redoStack[redoStack.length - 1];
      const s = get();
      const currentSnapshot = clone(s.project);
      // Exclude blobs from undo snapshot
      currentSnapshot.media = currentSnapshot.media.map(m => {
        const { blob, ...rest } = m as MediaFile & { blob?: unknown };
        return rest as MediaFile;
      });
      // Restore media blobs from current state into the redo snapshot
      const restored = clone(next);
      restored.media = restored.media.map(m => {
        const current = s.project.media.find(cm => cm.id === m.id);
        return current ? { ...m, ...current } : m;
      });
      set({ project: restored, redoStack: redoStack.slice(0, -1), undoStack: [...s.undoStack, currentSnapshot], isDirty: true, currentTime: s.currentTime });
    },

    addClip: (trackType, mediaId, sticker) => {
      const state = get();
      const track = state.project.tracks.find((t) => t.type === trackType && !t.locked);
      if (!track) return null;

      const id = genId();
      const newClip: Clip = {
        id, mediaId, trackType, trackId: track.id,
        startAt: 0, duration: 2, sourceStart: 0, sourceEnd: 0,
        volume: 1, speed: 1, muted: false, preservePitch: false, voiceStabilizer: false, opacity: 100, blendMode: 'normal',
        transform: { ...defaultTransform },
        sticker,
        textOverlay: trackType === 'text' ? {
          text: 'Text', fontFamily: 'Arial', fontSize: 48, color: '#ffffff', fontWeight: 400, textAlign: 'center' as const,
        } : undefined,
        filters: { brightness: 0, contrast: 0, saturation: 0, preset: 'none', chromaKey: { enabled: false, color: '#00ff00', similarity: 0.4, smoothness: 0.5 }, vignette: { enabled: false, intensity: 0 }, blur: 0 },
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
        const visualProps = [
          'transform', 'opacity', 'blendMode', 'filters', 'textOverlay',
          'volume', 'speed', 'muted', 'sticker', 'vfxOverlay', 'crop',
          'transition', 'textAnimation', 'keyframeTracks'
        ];
        const affectsVisual = Object.keys(patch).some((k) => visualProps.includes(k));

        return {
          project: {
            ...st.project,
            tracks: st.project.tracks.map((t) => {
              const newClips = t.clips.map((c) => {
                if (c.id !== id) return c;
                let updated = { ...c, ...patch };
                return updated;
              });
              return { ...t, clips: newClips };
            }),
          },
          isDirty: true,
          renderTick: st.renderTick + (affectsVisual ? 1 : 0),
        };
      });
      get().recalcDuration();
    },

    removeClip: (id, ripple) => {
      get().pushHistory();
      set((st) => {
        const doRipple = ripple !== false && (st.rippleDelete || ripple);
        const newTracks = st.project.tracks.map((t) => {
          const idx = t.clips.findIndex((c) => c.id === id);
          if (idx === -1) {
            // Clip not on this track — no ripple shift here
            return t;
          }
          const clip = t.clips[idx];
          let filtered = t.clips.filter((c) => c.id !== id);
          if (doRipple) {
            // Only shift clips on the SAME track as the removed clip
            filtered = filtered.map((c) =>
              c.startAt >= clip.startAt ? { ...c, startAt: Math.max(0, c.startAt - clip.duration) } : c
            );
          }
          return { ...t, clips: filtered };
        });
        return {
          project: { ...st.project, tracks: newTracks },
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
      // Handle same-track vs cross-track move
      if (sourceTrack.id === toTrackId) {
        // Same track: just update startAt in place
        set((st) => ({
          project: {
            ...st.project,
            tracks: st.project.tracks.map((t) =>
              t.id === toTrackId
                ? { ...t, clips: t.clips.map((c) => c.id === id ? { ...c, startAt: finalTime } : c) }
                : t
            ),
          },
          isDirty: true,
        }));
      } else {
        // Cross-track: remove from source, add to destination
        set((st) => ({
          project: {
            ...st.project,
            tracks: st.project.tracks.map((t) => {
              if (t.id === sourceTrack.id) return { ...t, clips: t.clips.filter((c) => c.id !== id) };
              if (t.id === toTrackId) return { ...t, clips: [...t.clips, { ...clip, trackId: toTrackId, startAt: finalTime }] };
              return t;
            }),
          },
          isDirty: true,
        }));
      }
      get().recalcDuration();
      return true;
    },

    moveClipDrag: (id, toTrackId, toStartAt) => {
      const state = get();
      // Use original sourceTrackId from pendingDrag on subsequent calls
      const originalSourceTrackId = state.pendingDrag?.sourceTrackId;
      const sourceTrack = state.project.tracks.find((t) => t.clips.some((c) => c.id === id));
      if (!sourceTrack) return false;
      const clip = sourceTrack.clips.find((c) => c.id === id);
      if (!clip) return false;
      const destTrack = state.project.tracks.find((t) => t.id === toTrackId);
      if (!destTrack || destTrack.locked) return false;
      const finalTime = Math.max(0, toStartAt);

      if (!state.pendingDrag) {
        // Capture original source on first drag call
        get().setPendingDrag({ clip: { ...clip }, sourceTrackId: sourceTrack.id });
      }

      const effectiveSourceId = originalSourceTrackId ?? sourceTrack.id;

      if (effectiveSourceId === toTrackId && sourceTrack.id === toTrackId) {
        // Same track: just update startAt in place
        set((st) => ({
          project: {
            ...st.project,
            tracks: st.project.tracks.map((t) =>
              t.id === toTrackId
                ? { ...t, clips: t.clips.map((c) => c.id === id ? { ...c, startAt: finalTime } : c) }
                : t
            ),
          },
          isDirty: true,
        }));
      } else {
        // Cross-track: remove from current track, add to destination
        set((st) => ({
          project: {
            ...st.project,
            tracks: st.project.tracks.map((t) => {
              if (t.id === sourceTrack.id) return { ...t, clips: t.clips.filter((c) => c.id !== id) };
              if (t.id === toTrackId) return { ...t, clips: [...t.clips, { ...clip, trackId: toTrackId, startAt: finalTime }] };
              return t;
            }),
          },
          isDirty: true,
        }));
      }
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

        const mf = clip.mediaId ? state.project.media.find(m => m.id === clip.mediaId) : undefined;
        get().pushHistory();
        const newId = genId();
        const originalSourceEnd = (clip.sourceEnd !== undefined && clip.sourceEnd !== 0) ? clip.sourceEnd : (mf?.duration ?? clip.sourceStart + clip.duration * clip.speed);
        const splitSourcePoint = clip.sourceStart + splitPoint * clip.speed;
        const newClip: Clip = {
          ...clone(clip), id: newId, startAt: splitAt,
          duration: clip.duration - splitPoint,
          sourceStart: splitSourcePoint,
          sourceEnd: originalSourceEnd,
        };
        const updatedClip = { ...clip, duration: splitPoint, sourceEnd: splitSourcePoint };

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
        let currentTracks = st.project.tracks;
        
        // Sort selected clips in descending order of start time
        const clipsToDelete = currentTracks
          .flatMap((t) => t.clips)
          .filter((c) => selectedClipIds.includes(c.id))
          .sort((a, b) => b.startAt - a.startAt);

        for (const clip of clipsToDelete) {
          currentTracks = currentTracks.map((t) => {
            const hasClip = t.clips.some((c) => c.id === clip.id);
            let filtered = t.clips.filter((c) => c.id !== clip.id);
            // Only ripple-shift clips on the SAME track as the deleted clip
            if (rippleDelete && hasClip) {
              filtered = filtered.map((c) =>
                c.startAt >= clip.startAt
                  ? { ...c, startAt: Math.max(0, c.startAt - clip.duration) }
                  : c
              );
            }
            return { ...t, clips: filtered };
          });
        }

        return {
          project: { ...st.project, tracks: currentTracks },
          selectedClipIds: [],
          activeClipId: null,
          isDirty: true,
        };
      });
      get().recalcDuration();
    },

    addTrack: (type) => {
      get().pushHistory();
      const existing = get().project.tracks.filter((t) => t.type === type);
      const num = existing.length + 1;
      const nameMap: Record<string, string> = { video: 'Video', audio: 'Audio', text: 'Text', sticker: 'Sticker', vfx: 'VFX', drawing: 'Drawing', element: 'Element', tts: 'TTS', record: 'Record' };
      const newTrack: Track = { id: `track_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type, name: `${nameMap[type] || type} ${num}`, locked: false, visible: true, clips: [] };
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
    removeMedia: (id) => {
      get().pushHistory();
      revokeMediaUrl(id);
      set((st) => ({
        project: {
          ...st.project,
          media: st.project.media.filter((m) => m.id !== id),
          tracks: st.project.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.mediaId !== id) })),
        },
        isDirty: true,
      }));
    },

    addMarker: (m) => set((st) => ({ project: { ...st.project, markers: [...st.project.markers, m] }, isDirty: true })),
    removeMarker: (id) => set((st) => ({
      project: { ...st.project, markers: st.project.markers.filter((m) => m.id !== id) },
      isDirty: true,
    })),

    toggleMarker: (time) => {
      const { project: { markers } } = get();
      get().pushHistory();
      const existing = markers.find((m) => Math.abs(m.time - time) < 0.1);
      if (existing) get().removeMarker(existing.id);
      else {
        const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899'];
        get().addMarker({ id: genId(), time, label: `Marker ${markers.length + 1}`, color: colors[markers.length % colors.length] });
      }
    },

    loadProject: (p) => {
      const oldMedia = get().project.media;
      for (const m of oldMedia) revokeMediaUrl(m.id);
      set({
        project: clone(p),
        currentTime: 0, isPlaying: false,
        selectedClipIds: [], activeClipId: null,
        undoStack: [], redoStack: [], isDirty: false,
      });
    },

    newProject: () => {
      const oldMedia = get().project.media;
      for (const m of oldMedia) revokeMediaUrl(m.id);
      // genId uses crypto.randomUUID, no counter to reset
      set({
        project: clone(emptyProject()),
        currentTime: 0, isPlaying: false,
        selectedClipIds: [], activeClipId: null,
        undoStack: [], redoStack: [], isDirty: false, showOpenProject: false,
      });
    },

    cropToMarkers: () => {
      const { project: { markers } } = get();
      if (markers.length === 0) return;
      
      let start = 0;
      let end = 0;
      
      const inMarker = markers.find(m => m.label === 'In');
      const outMarker = markers.find(m => m.label === 'Out');
      
      if (inMarker && outMarker) {
        start = Math.min(inMarker.time, outMarker.time);
        end = Math.max(inMarker.time, outMarker.time);
      } else if (markers.length >= 2) {
        const sorted = [...markers].sort((a, b) => a.time - b.time);
        start = sorted[0].time;
        end = sorted[sorted.length - 1].time;
      } else {
        return;
      }

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
              const newDuration = newEnd - newStart;
              return {
                ...c,
                startAt: newStart - start,
                duration: newDuration,
                sourceStart: c.sourceStart + (newStart - c.startAt) * c.speed,
                sourceEnd: c.sourceStart + (newEnd - c.startAt) * c.speed,
              };
            }).filter(Boolean) as Clip[],
          })),
          markers: [],
          duration: end - start,
        },
      }));
    },

    setInPoint: (time) => {
      get().pushHistory();
      set((st) => {
        const filtered = st.project.markers.filter(m => m.label !== 'In');
        const newMarker: Marker = { id: `in_${Date.now()}`, time, label: 'In', color: '#10b981' };
        return {
          project: {
            ...st.project,
            markers: [...filtered, newMarker].sort((a, b) => a.time - b.time),
          },
          isDirty: true,
        };
      });
    },

    setOutPoint: (time) => {
      get().pushHistory();
      set((st) => {
        const filtered = st.project.markers.filter(m => m.label !== 'Out');
        const newMarker: Marker = { id: `out_${Date.now()}`, time, label: 'Out', color: '#ef4444' };
        return {
          project: {
            ...st.project,
            markers: [...filtered, newMarker].sort((a, b) => a.time - b.time),
          },
          isDirty: true,
        };
      });
    },

    _recalcDurationImmediate: () => {
      const { project: { tracks } } = get();
      let maxEnd = 0;
      for (const t of tracks) {
        for (const c of t.clips) maxEnd = Math.max(maxEnd, c.startAt + c.duration);
      }
      set((s) => ({ project: { ...s.project, duration: maxEnd > 0 ? maxEnd : 10 } }));
    },

    recalcDuration: () => {
      // Debounce: coalesce rapid successive calls into a single recalc
      if (_recalcTimer) clearTimeout(_recalcTimer);
      _recalcTimer = setTimeout(() => {
        _recalcTimer = null;
        get()._recalcDurationImmediate();
      }, 50);
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

    addKeyframe: (clipId, property, time, value, easing) => {
      const clip = get().getClip(clipId);
      if (!clip) return;
      const tracks = clip.keyframeTracks || [];
      const updated = addKeyframe(tracks, property, time, value, easing);
      get().updateClip(clipId, { keyframeTracks: updated });
    },

    removeKeyframe: (clipId, keyframeId) => {
      const clip = get().getClip(clipId);
      if (!clip || !clip.keyframeTracks) return;
      const updated = removeKeyframe(clip.keyframeTracks, keyframeId);
      get().updateClip(clipId, { keyframeTracks: updated });
    },
  };
});
