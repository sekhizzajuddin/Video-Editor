import { create } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";

export type PanelId =
  | "mediaLibrary"
  | "inspector"
  | "effects"
  | "audioMixer"
  | "colorGrading"
  | "subtitles"
  | "timeline"
  | "preview"
  | "toolbar"
  | "scopes"
  | "projectBin"
  | "keyframes"
  | "assetsBrowser"
  | "effectsPanel"
  | "transitionsPanel"
  | "aiGenerator"
  | "recipes"
  | "templates"
  | "metadataPanel"
  | "markerPanel"
  | "scopeWaveform"
  | "scopeVectorscope"
  | "scopeHistogram";

export type WorkspaceId = "editing" | "color" | "audio" | "assembly" | "effects" | "custom";

export interface PanelConfig {
  id: PanelId;
  visible: boolean;
  width?: number;
  height?: number;
  collapsed?: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  floating?: boolean;
  floatingPosition?: { x: number; y: number };
  floatingSize?: { width: number; height: number };
}

export type PanelLayout = {
  id: PanelId;
  visible: boolean;
  size?: number; // percentage or pixels depending on container
  collapsed?: boolean;
};

export type PanelGroup = {
  id: string;
  panels: PanelLayout[];
  direction: "horizontal" | "vertical";
  size?: number;
};

export type DockingArea = "left" | "right" | "top" | "bottom" | "center" | "floating";

export interface WorkspaceLayout {
  id: WorkspaceId;
  name: string;
  icon: string;
  description: string;
  leftPanel: PanelGroup | null;
  rightPanel: PanelGroup | null;
  topPanel: PanelGroup | null;
  bottomPanel: PanelGroup | null;
  centerPanel: PanelGroup | null;
  floatingPanels: PanelConfig[];
  timelinePanel: PanelGroup | null;
  panels: Record<string, PanelConfig>;
}

export interface WorkspaceState {
  currentWorkspace: WorkspaceId;
  activePanels: PanelId[];
  panelConfigs: Record<PanelId, PanelConfig>;
  layouts: Record<WorkspaceId, WorkspaceLayout>;
  isPanelDragging: boolean;
  draggedPanel: PanelId | null;
  dropTarget: { area: DockingArea; index?: number } | null;
  sidebarVisible: boolean;
  sidebarWidth: number;
  bottomPanelHeight: number;
  rightPanelWidth: number;

  // Actions
  setCurrentWorkspace: (workspace: WorkspaceId) => void;
  togglePanel: (panelId: PanelId) => void;
  setPanelVisible: (panelId: PanelId, visible: boolean) => void;
  setPanelCollapsed: (panelId: PanelId, collapsed: boolean) => void;
  setPanelWidth: (panelId: PanelId, width: number) => void;
  setPanelHeight: (panelId: PanelId, height: number) => void;
  startPanelDrag: (panelId: PanelId) => void;
  endPanelDrag: () => void;
  setDropTarget: (target: { area: DockingArea; index?: number } | null) => void;
  dropPanel: (panelId: PanelId, target: { area: DockingArea; index?: number }) => void;
  restoreDefaultLayout: (workspace: WorkspaceId) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setBottomPanelHeight: (height: number) => void;
  setRightPanelWidth: (width: number) => void;
  getPanelConfig: (panelId: PanelId) => PanelConfig;
  isPanelActive: (panelId: PanelId) => boolean;
  getWorkspacePanels: (workspace: WorkspaceId) => PanelId[];
}

const defaultPanelConfigs: Record<PanelId, PanelConfig> = {
  mediaLibrary: { id: "mediaLibrary", visible: true, width: 300, minWidth: 200, maxWidth: 500 },
  inspector: { id: "inspector", visible: true, width: 320, minWidth: 240, maxWidth: 480 },
  effects: { id: "effects", visible: false, width: 300, minWidth: 200, maxWidth: 500 },
  audioMixer: { id: "audioMixer", visible: false, width: 400, minWidth: 300, maxWidth: 600 },
  colorGrading: { id: "colorGrading", visible: false, width: 350, minWidth: 250, maxWidth: 500 },
  subtitles: { id: "subtitles", visible: false, width: 300, minWidth: 200, maxWidth: 500 },
  timeline: { id: "timeline", visible: true, height: 400, minHeight: 150, maxHeight: 800 },
  preview: { id: "preview", visible: true, minWidth: 320, minHeight: 180 },
  toolbar: { id: "toolbar", visible: true, height: 40, minHeight: 32, maxHeight: 56 },
  scopes: { id: "scopes", visible: false, height: 200, minHeight: 100, maxHeight: 400 },
  projectBin: { id: "projectBin", visible: false, width: 300, minWidth: 200, maxWidth: 500 },
  keyframes: { id: "keyframes", visible: false, height: 200, minHeight: 100, maxHeight: 400 },
  assetsBrowser: { id: "assetsBrowser", visible: false, width: 300, minWidth: 200, maxWidth: 400 },
  effectsPanel: { id: "effectsPanel", visible: false, width: 300, minWidth: 200, maxWidth: 500 },
  transitionsPanel: { id: "transitionsPanel", visible: false, width: 300, minWidth: 200, maxWidth: 500 },
  aiGenerator: { id: "aiGenerator", visible: false, width: 350, minWidth: 250, maxWidth: 500 },
  recipes: { id: "recipes", visible: false, width: 300, minWidth: 200, maxWidth: 500 },
  templates: { id: "templates", visible: false, width: 300, minWidth: 200, maxWidth: 500 },
  metadataPanel: { id: "metadataPanel", visible: false, width: 250, minWidth: 180, maxWidth: 400 },
  markerPanel: { id: "markerPanel", visible: false, width: 250, minWidth: 180, maxWidth: 400 },
  scopeWaveform: { id: "scopeWaveform", visible: false, height: 150, minHeight: 80, maxHeight: 300 },
  scopeVectorscope: { id: "scopeVectorscope", visible: false, height: 150, minHeight: 80, maxHeight: 300 },
  scopeHistogram: { id: "scopeHistogram", visible: false, height: 150, minHeight: 80, maxHeight: 300 },
};

const editingLayout: WorkspaceLayout = {
  id: "editing",
  name: "Editing",
  icon: "Layers",
  description: "Standard editing workspace with media, preview, inspector, and timeline",
  leftPanel: {
    id: "left",
    panels: [
      { id: "mediaLibrary", visible: true, size: 60 },
      { id: "projectBin", visible: false, size: 40 },
    ],
    direction: "vertical",
  },
  rightPanel: {
    id: "right",
    panels: [
      { id: "inspector", visible: true, size: 70 },
      { id: "effects", visible: false, size: 30 },
    ],
    direction: "vertical",
  },
  topPanel: null,
  bottomPanel: {
    id: "bottom",
    panels: [
      { id: "timeline", visible: true, size: 70 },
      { id: "keyframes", visible: false, size: 30 },
    ],
    direction: "vertical",
  },
  centerPanel: {
    id: "center",
    panels: [{ id: "preview", visible: true, size: 100 }],
    direction: "vertical",
  },
  floatingPanels: [],
  timelinePanel: null,
  panels: defaultPanelConfigs,
};

const colorLayout: WorkspaceLayout = {
  id: "color",
  name: "Color",
  icon: "Palette",
  description: "Color grading workspace with scopes, color wheels, and preview",
  leftPanel: {
    id: "left",
    panels: [
      { id: "mediaLibrary", visible: true, size: 50 },
      { id: "projectBin", visible: false, size: 50 },
    ],
    direction: "vertical",
  },
  rightPanel: {
    id: "right",
    panels: [
      { id: "colorGrading", visible: true, size: 70 },
      { id: "inspector", visible: false, size: 30 },
    ],
    direction: "vertical",
  },
  topPanel: null,
  bottomPanel: {
    id: "bottom",
    panels: [
      { id: "timeline", visible: true, size: 50 },
      { id: "scopeWaveform", visible: true, size: 25 },
      { id: "scopeVectorscope", visible: true, size: 25 },
    ],
    direction: "vertical",
  },
  centerPanel: {
    id: "center",
    panels: [{ id: "preview", visible: true, size: 100 }],
    direction: "vertical",
  },
  floatingPanels: [],
  timelinePanel: null,
  panels: defaultPanelConfigs,
};

const audioLayout: WorkspaceLayout = {
  id: "audio",
  name: "Audio",
  icon: "Music",
  description: "Audio editing workspace with mixer, meters, and waveform display",
  leftPanel: {
    id: "left",
    panels: [
      { id: "mediaLibrary", visible: true, size: 60 },
      { id: "projectBin", visible: false, size: 40 },
    ],
    direction: "vertical",
  },
  rightPanel: {
    id: "right",
    panels: [
      { id: "audioMixer", visible: true, size: 70 },
      { id: "inspector", visible: false, size: 30 },
    ],
    direction: "vertical",
  },
  topPanel: null,
  bottomPanel: {
    id: "bottom",
    panels: [
      { id: "timeline", visible: true, size: 80 },
      { id: "keyframes", visible: false, size: 20 },
    ],
    direction: "vertical",
  },
  centerPanel: {
    id: "center",
    panels: [{ id: "preview", visible: true, size: 100 }],
    direction: "vertical",
  },
  floatingPanels: [],
  timelinePanel: null,
  panels: defaultPanelConfigs,
};

const assemblyLayout: WorkspaceLayout = {
  id: "assembly",
  name: "Assembly",
  icon: "Film",
  description: "Assembly workspace with large preview and project bin",
  leftPanel: {
    id: "left",
    panels: [
      { id: "mediaLibrary", visible: true, size: 50 },
      { id: "projectBin", visible: true, size: 50 },
    ],
    direction: "vertical",
  },
  rightPanel: {
    id: "right",
    panels: [
      { id: "inspector", visible: false, size: 50 },
      { id: "metadataPanel", visible: false, size: 50 },
    ],
    direction: "vertical",
  },
  topPanel: null,
  bottomPanel: {
    id: "bottom",
    panels: [{ id: "timeline", visible: true, size: 100 }],
    direction: "vertical",
  },
  centerPanel: {
    id: "center",
    panels: [{ id: "preview", visible: true, size: 100 }],
    direction: "vertical",
  },
  floatingPanels: [],
  timelinePanel: null,
  panels: defaultPanelConfigs,
};

const effectsLayout: WorkspaceLayout = {
  id: "effects",
  name: "Effects",
  icon: "Wand2",
  description: "Effects workspace with effects panel, transitions, and preview",
  leftPanel: {
    id: "left",
    panels: [
      { id: "effectsPanel", visible: true, size: 50 },
      { id: "transitionsPanel", visible: true, size: 50 },
    ],
    direction: "vertical",
  },
  rightPanel: {
    id: "right",
    panels: [
      { id: "inspector", visible: true, size: 70 },
      { id: "keyframes", visible: false, size: 30 },
    ],
    direction: "vertical",
  },
  topPanel: null,
  bottomPanel: {
    id: "bottom",
    panels: [{ id: "timeline", visible: true, size: 100 }],
    direction: "vertical",
  },
  centerPanel: {
    id: "center",
    panels: [{ id: "preview", visible: true, size: 100 }],
    direction: "vertical",
  },
  floatingPanels: [],
  timelinePanel: null,
  panels: defaultPanelConfigs,
};

const defaultLayouts: Record<WorkspaceId, WorkspaceLayout> = {
  editing: editingLayout,
  color: colorLayout,
  audio: audioLayout,
  assembly: assemblyLayout,
  effects: effectsLayout,
  custom: { ...editingLayout, id: "custom", name: "Custom", description: "User-customized workspace" },
};

export const useWorkspaceStore = create<WorkspaceState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        currentWorkspace: "editing",
        activePanel: ["mediaLibrary", "inspector", "timeline", "preview", "toolbar"],
        panelConfigs: { ...defaultPanelConfigs },
        layouts: { ...defaultLayouts },
        isPanelDragging: false,
        draggedPanel: null,
        dropTarget: null,
        sidebarVisible: true,
        sidebarWidth: 300,
        bottomPanelHeight: 400,
        rightPanelWidth: 320,

        setCurrentWorkspace: (workspace: WorkspaceId) => {
          const layouts = get().layouts;
          const layout = layouts[workspace] || layouts.editing;
          const activePanel: PanelId[] = [];

          // Collect all visible panels from the layout
          const collectPanels = (group: PanelGroup | null) => {
            if (!group) return;
            group.panels.forEach((p) => {
              if (p.visible) activePanel.push(p.id as PanelId);
            });
          };

          collectPanels(layout.leftPanel);
          collectPanels(layout.rightPanel);
          collectPanels(layout.topPanel);
          collectPanels(layout.bottomPanel);
          collectPanels(layout.centerPanel);
          layout.floatingPanels.forEach((p) => {
            if (p.visible) activePanel.push(p.id as PanelId);
          });

          set({ currentWorkspace: workspace, activePanel });
        },

        togglePanel: (panelId: PanelId) => {
          const { panelConfigs, activePanel } = get();
          const config = panelConfigs[panelId];
          if (!config) return;

          const newVisible = !config.visible;
          const newConfigs = {
            ...panelConfigs,
            [panelId]: { ...config, visible: newVisible },
          };

          let newActive = [...activePanel];
          if (newVisible && !newActive.includes(panelId)) {
            newActive.push(panelId);
          } else if (!newVisible) {
            newActive = newActive.filter((id) => id !== panelId);
          }

          set({ panelConfigs: newConfigs, activePanel: newActive });
        },

        setPanelVisible: (panelId: PanelId, visible: boolean) => {
          const { panelConfigs, activePanel } = get();
          const config = panelConfigs[panelId];
          if (!config) return;

          const newConfigs = {
            ...panelConfigs,
            [panelId]: { ...config, visible },
          };

          let newActive = [...activePanel];
          if (visible && !newActive.includes(panelId)) {
            newActive.push(panelId);
          } else if (!visible) {
            newActive = newActive.filter((id) => id !== panelId);
          }

          set({ panelConfigs: newConfigs, activePanel: newActive });
        },

        setPanelCollapsed: (panelId: PanelId, collapsed: boolean) => {
          const { panelConfigs } = get();
          const config = panelConfigs[panelId];
          if (!config) return;
          set({
            panelConfigs: {
              ...panelConfigs,
              [panelId]: { ...config, collapsed },
            },
          });
        },

        setPanelWidth: (panelId: PanelId, width: number) => {
          const { panelConfigs } = get();
          const config = panelConfigs[panelId];
          if (!config) return;
          const clampedWidth = Math.max(
            config.minWidth || 150,
            Math.min(config.maxWidth || 800, width)
          );
          set({
            panelConfigs: {
              ...panelConfigs,
              [panelId]: { ...config, width: clampedWidth },
            },
          });
        },

        setPanelHeight: (panelId: PanelId, height: number) => {
          const { panelConfigs } = get();
          const config = panelConfigs[panelId];
          if (!config) return;
          const clampedHeight = Math.max(
            config.minHeight || 80,
            Math.min(config.maxHeight || 600, height)
          );
          set({
            panelConfigs: {
              ...panelConfigs,
              [panelId]: { ...config, height: clampedHeight },
            },
          });
        },

        startPanelDrag: (panelId: PanelId) => {
          set({ isPanelDragging: true, draggedPanel: panelId });
        },

        endPanelDrag: () => {
          set({ isPanelDragging: false, draggedPanel: null, dropTarget: null });
        },

        setDropTarget: (target) => {
          set({ dropTarget: target });
        },

        dropPanel: (panelId: PanelId, target) => {
          const { panelConfigs } = get();
          const config = panelConfigs[panelId];
          if (!config) return;

          // Make panel visible if it was hidden
          const newConfig = { ...config, visible: true, floating: target.area === "floating" };

          set({
            panelConfigs: {
              ...panelConfigs,
              [panelId]: newConfig,
            },
            isPanelDragging: false,
            draggedPanel: null,
            dropTarget: null,
          });
        },

        restoreDefaultLayout: (workspace: WorkspaceId) => {
          const layout = defaultLayouts[workspace];
          if (!layout) return;

          const activePanel: PanelId[] = [];
          const collectPanels = (group: PanelGroup | null) => {
            if (!group) return;
            group.panels.forEach((p) => {
              if (p.visible) activePanel.push(p.id as PanelId);
            });
          };

          collectPanels(layout.leftPanel);
          collectPanels(layout.rightPanel);
          collectPanels(layout.topPanel);
          collectPanels(layout.bottomPanel);
          collectPanels(layout.centerPanel);
          layout.floatingPanels.forEach((p) => {
            if (p.visible) activePanel.push(p.id as PanelId);
          });

          set({
            layouts: { ...get().layouts, [workspace]: layout },
            activePanel,
            panelConfigs: { ...defaultPanelConfigs },
          });
        },

        toggleSidebar: () => {
          set({ sidebarVisible: !get().sidebarVisible });
        },

        setSidebarWidth: (width: number) => {
          set({ sidebarWidth: Math.max(200, Math.min(500, width)) });
        },

        setBottomPanelHeight: (height: number) => {
          set({ bottomPanelHeight: Math.max(150, Math.min(800, height)) });
        },

        setRightPanelWidth: (width: number) => {
          set({ rightPanelWidth: Math.max(200, Math.min(500, width)) });
        },

        getPanelConfig: (panelId: PanelId) => {
          return get().panelConfigs[panelId] || defaultPanelConfigs[panelId];
        },

        isPanelActive: (panelId: PanelId) => {
          return get().activePanel.includes(panelId);
        },

        getWorkspacePanels: (workspace: WorkspaceId) => {
          const layout = get().layouts[workspace];
          if (!layout) return [];
          const panels: PanelId[] = [];
          const collect = (group: PanelGroup | null) => {
            if (!group) return;
            group.panels.forEach((p) => panels.push(p.id as PanelId));
          };
          collect(layout.leftPanel);
          collect(layout.rightPanel);
          collect(layout.topPanel);
          collect(layout.bottomPanel);
          collect(layout.centerPanel);
          layout.floatingPanels.forEach((p) => panels.push(p.id as PanelId));
          return panels;
        },
      }),
      {
        name: "openreel-workspace",
        version: 1,
        partialize: (state) => ({
          currentWorkspace: state.currentWorkspace,
          panelConfigs: state.panelConfigs,
          layouts: state.layouts,
          sidebarWidth: state.sidebarWidth,
          bottomPanelHeight: state.bottomPanelHeight,
          rightPanelWidth: state.rightPanelWidth,
        }),
      }
    )
  )
);
