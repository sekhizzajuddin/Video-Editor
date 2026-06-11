import { create } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";

export type CommandId =
  | "playPause"
  | "stop"
  | "skipForward"
  | "skipBackward"
  | "nextFrame"
  | "prevFrame"
  | "nextEdit"
  | "prevEdit"
  | "cut"
  | "copy"
  | "paste"
  | "delete"
  | "duplicate"
  | "undo"
  | "redo"
  | "selectAll"
  | "deselectAll"
  | "split"
  | "trimStart"
  | "trimEnd"
  | "rippleDelete"
  | "addMarker"
  | "toggleSnapping"
  | "zoomIn"
  | "zoomOut"
  | "zoomToFit"
  | "toggleFullscreenPreview"
  | "toggleTrack1"
  | "toggleTrack2"
  | "toggleTrack3"
  | "toggleTrack4"
  | "toggleTrack5"
  | "toggleMute"
  | "toggleSolo"
  | "toggleLock"
  | "toggleTrackHeight"
  | "nudgeLeft"
  | "nudgeRight"
  | "nudgeLeftLarge"
  | "nudgeRightLarge"
  | "nextClip"
  | "prevClip"
  | "group"
  | "ungroup"
  | "nest"
  | "unnest"
  | "renderCache"
  | "toggleScrubbing"
  | "toggleWaveform"
  | "gotoStart"
  | "gotoEnd"
  | "gotoIn"
  | "gotoOut"
  | "setIn"
  | "setOut"
  | "clearInOut"
  | "loop"
  | "speedUp"
  | "slowDown"
  | "toggleProxy"
  | "saveProject"
  | "exportProject"
  | "importProject"
  | "newProject"
  | "openProject"
  | "toggleWorkspace"
  | "search"
  | "toggleSidebar"
  | "toggleInspector"
  | "toggleTimeline"
  | "toggleAudioMeter"
  | "toggleScopes"
  | "toggleMinimap"
  | "toggleHUD"
  | "emergencySave";

export interface Keybinding {
  commandId: CommandId;
  key: string;
  modifiers: {
ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
  }
  context?: "global" | "timeline" | "viewer" | "bin" | "all";
  label: string;
  description: string;
  category: string;
}

export interface KeybindingsProfile {
  id: string;
  name: string;
  description: string;
  bindings: Record<CommandId, Keybinding>;
  createdAt: number;
  modifiedAt: number;
}

export interface CustomKeybindingsState {
  activeProfileId: string;
  profiles: Record<string, KeybindingsProfile>;
  isRecording: boolean;
  recordingCommand: CommandId | null;
  pressedKeys: Set<string>;
  conflicts: Map<CommandId, CommandId[]>;

  // Actions
  createProfile: (name: string, description: string, basedOn?: string) => string;
  deleteProfile: (id: string) => void;
  activateProfile: (id: string) => void;
  setBinding: (profileId: string, commandId: CommandId, binding: Omit<Keybinding, "label" | "description" | "category">) => void;
  removeBinding: (profileId: string, commandId: CommandId) => void;
  startRecording: (commandId: CommandId) => void;
  stopRecording: () => void;
  addPressedKey: (key: string) => void;
  removePressedKey: (key: string) => void;
  checkConflicts: (profileId: string) => Map<CommandId, CommandId[]>;
  importProfile: (profile: KeybindingsProfile) => void;
  exportProfile: (profileId: string) => KeybindingsProfile | null;
  resetToDefaults: (profileId: string) => void;
  getBindingForKey: (profileId: string, key: string, modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean }) => Keybinding | null;
  getBindingsForContext: (profileId: string, context: string) => Keybinding[];
  getAllProfiles: () => KeybindingsProfile[];
  getActiveProfile: () => KeybindingsProfile;
}

const createDefaultBindings = (): Record<CommandId, Keybinding> => {
  const defaults: Partial<Record<CommandId, Keybinding>> = {
    playPause: { commandId: "playPause", key: "Space", modifiers: {}, context: "global", label: "Play / Pause", description: "Toggle playback", category: "Playback" },
    stop: { commandId: "stop", key: "Escape", modifiers: {}, context: "global", label: "Stop", description: "Stop playback", category: "Playback" },
    skipForward: { commandId: "skipForward", key: "ArrowRight", modifiers: { shift: true }, context: "global", label: "Skip Forward", description: "Skip 5 seconds forward", category: "Playback" },
    skipBackward: { commandId: "skipBackward", key: "ArrowLeft", modifiers: { shift: true }, context: "global", label: "Skip Backward", description: "Skip 5 seconds backward", category: "Playback" },
    nextFrame: { commandId: "nextFrame", key: "ArrowRight", modifiers: {}, context: "global", label: "Next Frame", description: "Advance one frame", category: "Playback" },
    prevFrame: { commandId: "prevFrame", key: "ArrowLeft", modifiers: {}, context: "global", label: "Previous Frame", description: "Go back one frame", category: "Playback" },
    cut: { commandId: "cut", key: "x", modifiers: { ctrl: true }, context: "global", label: "Cut", description: "Cut selected clips", category: "Editing" },
    copy: { commandId: "copy", key: "c", modifiers: { ctrl: true }, context: "global", label: "Copy", description: "Copy selected clips", category: "Editing" },
    paste: { commandId: "paste", key: "v", modifiers: { ctrl: true }, context: "global", label: "Paste", description: "Paste clips", category: "Editing" },
    delete: { commandId: "delete", key: "Delete", modifiers: {}, context: "global", label: "Delete", description: "Delete selected clips", category: "Editing" },
    duplicate: { commandId: "duplicate", key: "d", modifiers: { ctrl: true, shift: true }, context: "global", label: "Duplicate", description: "Duplicate selected clips", category: "Editing" },
    undo: { commandId: "undo", key: "z", modifiers: { ctrl: true }, context: "global", label: "Undo", description: "Undo last action", category: "General" },
    redo: { commandId: "redo", key: "z", modifiers: { ctrl: true, shift: true }, context: "global", label: "Redo", description: "Redo last action", category: "General" },
    selectAll: { commandId: "selectAll", key: "a", modifiers: { ctrl: true }, context: "global", label: "Select All", description: "Select all clips", category: "General" },
    deselectAll: { commandId: "deselectAll", key: "a", modifiers: { ctrl: true, shift: true }, context: "global", label: "Deselect All", description: "Deselect all clips", category: "General" },
    split: { commandId: "split", key: "s", modifiers: { ctrl: true }, context: "timeline", label: "Split", description: "Split clip at playhead", category: "Editing" },
    trimStart: { commandId: "trimStart", key: "[", modifiers: {}, context: "timeline", label: "Trim Start", description: "Trim clip start to playhead", category: "Editing" },
    trimEnd: { commandId: "trimEnd", key: "]", modifiers: {}, context: "timeline", label: "Trim End", description: "Trim clip end to playhead", category: "Editing" },
    rippleDelete: { commandId: "rippleDelete", key: "r", modifiers: { ctrl: true, shift: true }, context: "timeline", label: "Ripple Delete", description: "Ripple delete selected clips", category: "Editing" },
    zoomIn: { commandId: "zoomIn", key: "+", modifiers: {}, context: "timeline", label: "Zoom In", description: "Zoom in timeline", category: "Timeline" },
    zoomOut: { commandId: "zoomOut", key: "-", modifiers: {}, context: "timeline", label: "Zoom Out", description: "Zoom out timeline", category: "Timeline" },
    zoomToFit: { commandId: "zoomToFit", key: "f", modifiers: { ctrl: true }, context: "timeline", label: "Zoom to Fit", description: "Fit timeline to view", category: "Timeline" },
    toggleFullscreenPreview: { commandId: "toggleFullscreenPreview", key: "f", modifiers: { shift: true }, context: "viewer", label: "Fullscreen Preview", description: "Toggle fullscreen preview", category: "Viewer" },
    toggleSnapping: { commandId: "toggleSnapping", key: "n", modifiers: { ctrl: true }, context: "timeline", label: "Toggle Snapping", description: "Toggle snapping on/off", category: "Timeline" },
    nudgeLeft: { commandId: "nudgeLeft", key: "ArrowLeft", modifiers: { alt: true }, context: "timeline", label: "Nudge Left", description: "Nudge clip left", category: "Editing" },
    nudgeRight: { commandId: "nudgeRight", key: "ArrowRight", modifiers: { alt: true }, context: "timeline", label: "Nudge Right", description: "Nudge clip right", category: "Editing" },
    nudgeLeftLarge: { commandId: "nudgeLeftLarge", key: "ArrowLeft", modifiers: { alt: true, shift: true }, context: "timeline", label: "Nudge Left (Large)", description: "Nudge clip left (5 frames)", category: "Editing" },
    nudgeRightLarge: { commandId: "nudgeRightLarge", key: "ArrowRight", modifiers: { alt: true, shift: true }, context: "timeline", label: "Nudge Right (Large)", description: "Nudge clip right (5 frames)", category: "Editing" },
    gotoStart: { commandId: "gotoStart", key: "Home", modifiers: {}, context: "global", label: "Go to Start", description: "Go to timeline start", category: "Navigation" },
    gotoEnd: { commandId: "gotoEnd", key: "End", modifiers: {}, context: "global", label: "Go to End", description: "Go to timeline end", category: "Navigation" },
    setIn: { commandId: "setIn", key: "i", modifiers: {}, context: "global", label: "Set In Point", description: "Set in point at playhead", category: "Editing" },
    setOut: { commandId: "setOut", key: "o", modifiers: {}, context: "global", label: "Set Out Point", description: "Set out point at playhead", category: "Editing" },
    clearInOut: { commandId: "clearInOut", key: "x", modifiers: { alt: true }, context: "global", label: "Clear In/Out", description: "Clear in/out points", category: "Editing" },
    search: { commandId: "search", key: "k", modifiers: { ctrl: true }, context: "global", label: "Search", description: "Open search", category: "General" },
    saveProject: { commandId: "saveProject", key: "s", modifiers: { ctrl: true }, context: "global", label: "Save", description: "Save project", category: "General" },
    toggleWorkspace: { commandId: "toggleWorkspace", key: "w", modifiers: { ctrl: true, shift: true }, context: "global", label: "Switch Workspace", description: "Switch between workspaces", category: "General" },
  };

  return defaults as Record<CommandId, Keybinding>;
};

export const useCustomKeybindingsStore = create<CustomKeybindingsState>()(
  subscribeWithSelector(
    persist(
      (set, get) => {
        const defaultProfile: KeybindingsProfile = {
          id: "default",
          name: "Default",
          description: "Default keybindings for OpenReel editor",
          bindings: createDefaultBindings(),
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };

        return {
          activeProfileId: "default",
          profiles: { default: defaultProfile },
          isRecording: false,
          recordingCommand: null,
          pressedKeys: new Set(),
          conflicts: new Map(),

          createProfile: (name, description, basedOn) => {
            const id = `profile-${Date.now()}`;
            const profiles = get().profiles;
            const baseProfile = basedOn ? profiles[basedOn] : null;

            const profile: KeybindingsProfile = {
              id,
              name,
              description,
              bindings: baseProfile ? { ...baseProfile.bindings } : createDefaultBindings(),
              createdAt: Date.now(),
              modifiedAt: Date.now(),
            };

            set({ profiles: { ...profiles, [id]: profile } });
            return id;
          },

          deleteProfile: (id) => {
            const profiles = { ...get().profiles };
            delete profiles[id];
            set({ profiles });
          },

          activateProfile: (id) => {
            set({ activeProfileId: id });
          },

          setBinding: (profileId, commandId, binding) => {
            const profiles = get().profiles;
            const profile = profiles[profileId];
            if (!profile) return;

            const existing = profile.bindings[commandId];
            const updatedProfile = {
              ...profile,
              bindings: {
                ...profile.bindings,
                [commandId]: {
                  ...existing,
                  ...binding,
                  commandId,
                  label: existing?.label || commandId,
                  description: existing?.description || "",
                  category: existing?.category || "General",
                },
              },
              modifiedAt: Date.now(),
            };

            set({ profiles: { ...profiles, [profileId]: updatedProfile } });
          },

          removeBinding: (profileId, commandId) => {
            const profiles = get().profiles;
            const profile = profiles[profileId];
            if (!profile) return;

            const updatedBindings = { ...profile.bindings };
            delete updatedBindings[commandId];

            set({
              profiles: {
                ...profiles,
                [profileId]: { ...profile, bindings: updatedBindings, modifiedAt: Date.now() },
              },
            });
          },

          startRecording: (commandId) => {
            set({ isRecording: true, recordingCommand: commandId, pressedKeys: new Set() });
          },

          stopRecording: () => {
            set({ isRecording: false, recordingCommand: null });
          },

          addPressedKey: (key) => {
            set((state) => {
              const newKeys = new Set(state.pressedKeys);
              newKeys.add(key);
              return { pressedKeys: newKeys };
            });
          },

          removePressedKey: (key) => {
            set((state) => {
              const newKeys = new Set(state.pressedKeys);
              newKeys.delete(key);
              return { pressedKeys: newKeys };
            });
          },

          checkConflicts: (profileId) => {
            const profile = get().profiles[profileId];
            if (!profile) return new Map();

            const conflicts = new Map<CommandId, CommandId[]>();
            const bindings = Object.values(profile.bindings);

            for (let i = 0; i < bindings.length; i++) {
              const a = bindings[i];
              for (let j = i + 1; j < bindings.length; j++) {
                const b = bindings[j];
                if (
                  a.key === b.key &&
                  !!a.modifiers.ctrl === !!b.modifiers.ctrl &&
                  !!a.modifiers.alt === !!b.modifiers.alt &&
                  !!a.modifiers.shift === !!b.modifiers.shift
                ) {
                  if (!conflicts.has(a.commandId)) conflicts.set(a.commandId, []);
                  if (!conflicts.has(b.commandId)) conflicts.set(b.commandId, []);
                  conflicts.get(a.commandId)!.push(b.commandId);
                  conflicts.get(b.commandId)!.push(a.commandId);
                }
              }
            }

            return conflicts;
          },

          importProfile: (profile) => {
            set({ profiles: { ...get().profiles, [profile.id]: profile } });
          },

          exportProfile: (profileId) => {
            return get().profiles[profileId] || null;
          },

          resetToDefaults: (profileId) => {
            const profiles = get().profiles;
            const profile = profiles[profileId];
            if (!profile) return;

            set({
              profiles: {
                ...profiles,
                [profileId]: { ...profile, bindings: createDefaultBindings(), modifiedAt: Date.now() },
              },
            });
          },

          getBindingForKey: (profileId, key, modifiers) => {
            const profile = get().profiles[profileId];
            if (!profile) return null;

            const binding = Object.values(profile.bindings).find(
              (b) =>
                b.key.toLowerCase() === key.toLowerCase() &&
                !!b.modifiers.ctrl === !!modifiers.ctrl &&
                !!b.modifiers.alt === !!modifiers.alt &&
                !!b.modifiers.shift === !!modifiers.shift
            );

            return binding || null;
          },

          getBindingsForContext: (profileId, context) => {
            const profile = get().profiles[profileId];
            if (!profile) return [];
            return Object.values(profile.bindings).filter(
              (b) => b.context === context || b.context === "all"
            );
          },

          getAllProfiles: () => {
            return Object.values(get().profiles);
          },

          getActiveProfile: () => {
            return get().profiles[get().activeProfileId];
          },
        };
      },
      {
        name: "openreel-keybindings",
        version: 1,
        partialize: (state) => ({
          activeProfileId: state.activeProfileId,
          profiles: state.profiles,
        }),
      }
    )
  )
);

export default useCustomKeybindingsStore;
