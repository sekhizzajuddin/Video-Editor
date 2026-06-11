import React from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export type TrackHeaderMode = "minimal" | "standard" | "advanced";
export type TrackDisplayMode = "normal" | "minimized" | "expanded";

export interface TrackControlState {
  id: string;
  name: string;
  type: "video" | "audio" | "image" | "text" | "graphics";
  muted: boolean;
  solo: boolean;
  locked: boolean;
  hidden: boolean;
  expanded: boolean;
  minimized: boolean;
  color: string;
  target: "output" | "monitor" | "record";
  displayMode: TrackDisplayMode;
  volume: number; // 0-1 for audio tracks
  pan: number; // -1 to 1 for audio tracks
  output: string; // routing destination
  showWaveform: boolean;
  showThumbnails: boolean;
  height: number;
}

export interface FcpMagneticState {
  enabled: boolean;
  autoRipple: boolean;
  snapToPlayhead: boolean;
  collisionDetection: boolean;
}

export interface AdvancedTimelineState {
  trackControls: Record<string, TrackControlState>;
  selectedTrackIds: string[];
  magneticTimeline: FcpMagneticState;
  showTrackTargets: boolean;
  showTrackColors: boolean;
  showTrackRouting: boolean;
  trackHeightPreset: "small" | "medium" | "large" | "custom";
  defaultTrackHeight: number;
  minimizedTrackHeight: number;
  expandedTrackHeight: number;

  // Actions
  setTrackControl: (trackId: string, control: Partial<TrackControlState>) => void;
  setTrackMuted: (trackId: string, muted: boolean) => void;
  setTrackSolo: (trackId: string, solo: boolean) => void;
  setTrackLocked: (trackId: string, locked: boolean) => void;
  setTrackHidden: (trackId: string, hidden: boolean) => void;
  setTrackExpanded: (trackId: string, expanded: boolean) => void;
  setTrackMinimized: (trackId: string, minimized: boolean) => void;
  setTrackTarget: (trackId: string, target: "output" | "monitor" | "record") => void;
  setTrackColor: (trackId: string, color: string) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  setTrackRouting: (trackId: string, output: string) => void;
  toggleTrackShowWaveform: (trackId: string) => void;
  toggleTrackShowThumbnails: (trackId: string) => void;
  selectTrack: (trackId: string, addToSelection: boolean) => void;
  deselectTrack: (trackId: string) => void;
  clearTrackSelection: () => void;
  setMagneticEnabled: (enabled: boolean) => void;
  setMagneticAutoRipple: (enabled: boolean) => void;
  setMagneticCollision: (enabled: boolean) => void;
  setTrackHeightPreset: (preset: "small" | "medium" | "large" | "custom") => void;
  setDefaultTrackHeight: (height: number) => void;
  toggleShowTrackTargets: () => void;
  toggleShowTrackColors: () => void;
  toggleShowTrackRouting: () => void;
  registerTrack: (trackId: string, type: TrackControlState["type"], name: string) => void;
  unregisterTrack: (trackId: string) => void;
  getTrackControl: (trackId: string) => TrackControlState | undefined;
  getSelectedTrackControls: () => TrackControlState[];
  setAllTracksSolo: (trackIds: string[]) => void; // Resolve solo conflicts
}

const DEFAULT_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
];

function getRandomColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length];
}

export const useAdvancedTimelineStore = create<AdvancedTimelineState>()(
  subscribeWithSelector((set, get) => ({
    trackControls: {},
    selectedTrackIds: [],
    magneticTimeline: {
      enabled: false,
      autoRipple: true,
      snapToPlayhead: true,
      collisionDetection: true,
    },
    showTrackTargets: true,
    showTrackColors: true,
    showTrackRouting: false,
    trackHeightPreset: "medium",
    defaultTrackHeight: 76,
    minimizedTrackHeight: 28,
    expandedTrackHeight: 140,

    registerTrack: (trackId, type, name) => {
      set((state) => {
        if (state.trackControls[trackId]) return state;
        const color = getRandomColor(trackId);
        return {
          trackControls: {
            ...state.trackControls,
            [trackId]: {
              id: trackId,
              name,
              type,
              muted: false,
              solo: false,
              locked: false,
              hidden: false,
              expanded: false,
              minimized: false,
              color,
              target: "output",
              displayMode: "normal",
              volume: 1,
              pan: 0,
              output: "master",
              showWaveform: true,
              showThumbnails: true,
              height: state.defaultTrackHeight,
            },
          },
        };
      });
    },

    unregisterTrack: (trackId) => {
      set((state) => {
        const controls = { ...state.trackControls };
        delete controls[trackId];
        return {
          trackControls: controls,
          selectedTrackIds: state.selectedTrackIds.filter((id) => id !== trackId),
        };
      });
    },

    setTrackControl: (trackId, control) => {
      set((state) => {
        const track = state.trackControls[trackId];
        if (!track) return state;
        return {
          trackControls: {
            ...state.trackControls,
            [trackId]: { ...track, ...control },
          },
        };
      });
    },

    setTrackMuted: (trackId, muted) => {
      get().setTrackControl(trackId, { muted });
    },

    setTrackSolo: (trackId, solo) => {
      get().setTrackControl(trackId, { solo });
    },

    setTrackLocked: (trackId, locked) => {
      get().setTrackControl(trackId, { locked });
    },

    setTrackHidden: (trackId, hidden) => {
      get().setTrackControl(trackId, { hidden });
    },

    setTrackExpanded: (trackId, expanded) => {
      get().setTrackControl(trackId, { expanded, minimized: false, displayMode: expanded ? "expanded" : "normal" });
    },

    setTrackMinimized: (trackId, minimized) => {
      get().setTrackControl(trackId, { minimized, expanded: false, displayMode: minimized ? "minimized" : "normal", height: minimized ? get().minimizedTrackHeight : get().defaultTrackHeight });
    },

    setTrackTarget: (trackId, target) => {
      get().setTrackControl(trackId, { target });
    },

    setTrackColor: (trackId, color) => {
      get().setTrackControl(trackId, { color });
    },

    setTrackVolume: (trackId, volume) => {
      get().setTrackControl(trackId, { volume: Math.max(0, Math.min(1, volume)) });
    },

    setTrackPan: (trackId, pan) => {
      get().setTrackControl(trackId, { pan: Math.max(-1, Math.min(1, pan)) });
    },

    setTrackHeightPreset: (preset) => {
      const heights = {
        small: 56,
        medium: 76,
        large: 100,
        custom: 76,
      };
      set({
        trackHeightPreset: preset,
        defaultTrackHeight: heights[preset],
      });
    },

    selectTrack: (trackId, addToSelection) => {
      set((state) => {
        if (addToSelection) {
          if (state.selectedTrackIds.includes(trackId)) {
            return state;
          }
          return { selectedTrackIds: [...state.selectedTrackIds, trackId] };
        }
        return { selectedTrackIds: [trackId] };
      });
    },

    deselectTrack: (trackId) => {
      set((state) => ({
        selectedTrackIds: state.selectedTrackIds.filter((id) => id !== trackId),
      }));
    },

    clearTrackSelection: () => {
      set({ selectedTrackIds: [] });
    },

    toggleShowTrackTargets: () => {
      set((state) => ({ showTrackTargets: !state.showTrackTargets }));
    },

    toggleShowTrackColors: () => {
      set((state) => ({ showTrackColors: !state.showTrackColors }));
    },

    toggleShowTrackRouting: () => {
      set((state) => ({ showTrackRouting: !state.showTrackRouting }));
    },

    toggleTrackShowWaveform: (trackId) => {
      const track = get().trackControls[trackId];
      if (track) {
        get().setTrackControl(trackId, { showWaveform: !track.showWaveform });
      }
    },

    toggleTrackShowThumbnails: (trackId) => {
      const track = get().trackControls[trackId];
      if (track) {
        get().setTrackControl(trackId, { showThumbnails: !track.showThumbnails });
      }
    },

    setMagneticEnabled: (enabled) => {
      set((state) => ({
        magneticTimeline: { ...state.magneticTimeline, enabled },
      }));
    },

    setMagneticAutoRipple: (enabled) => {
      set((state) => ({
        magneticTimeline: { ...state.magneticTimeline, autoRipple: enabled },
      }));
    },

    setMagneticCollision: (enabled) => {
      set((state) => ({
        magneticTimeline: { ...state.magneticTimeline, collisionDetection: enabled },
      }));
    },

    setDefaultTrackHeight: (height) => {
      set({ defaultTrackHeight: Math.max(28, Math.min(200, height)) });
    },

    getTrackControl: (trackId) => {
      return get().trackControls[trackId];
    },

    getSelectedTrackControls: () => {
      const { trackControls, selectedTrackIds } = get();
      return selectedTrackIds.map((id) => trackControls[id]).filter(Boolean);
    },

    setAllTracksSolo: (trackIds) => {
      // When multiple tracks are solo'd, only those tracks play
      set((state) => {
        const newControls = { ...state.trackControls };
        Object.keys(newControls).forEach((id) => {
          newControls[id] = { ...newControls[id], solo: trackIds.includes(id) };
        });
        return { trackControls: newControls };
      });
    },
  }))
);
