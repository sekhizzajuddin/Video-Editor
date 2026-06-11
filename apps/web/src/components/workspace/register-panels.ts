import { lazy } from "react";
import type { ComponentType } from "react";
import { registerPanel } from "./ProWorkspaceLayout";

// Helper to create a typed lazy component wrapper
function lazyWrap<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>
): React.LazyExoticComponent<React.ComponentType<any>> {
  return lazy(loader) as React.LazyExoticComponent<React.ComponentType<any>>;
}

// Main editor panels (from src/components/editor/)
const previewPanel = lazyWrap(() =>
  import("../editor/Preview").then((m) => ({ default: m.Preview }))
);

const timelinePanel = lazyWrap(() =>
  import("../editor/Timeline").then((m) => ({ default: m.Timeline }))
);

const mediaLibraryPanel = lazy(() => import("../editor/AssetsPanel"));
const inspectorPanel = lazy(() => import("../editor/InspectorPanel"));
const keyframeEditorPanel = lazy(() => import("../editor/KeyframeEditorPanel"));
const audioMixerPanel = lazy(() =>
  import("../audio-mixer").then((m) => ({ default: m.AudioMixer }))
);

const colorGradingPanel = lazyWrap(() =>
  import("./ColorGradingControls").then((m) => ({ default: m.ColorGradingControls }))
);

const scopePanel = lazyWrap(() =>
  import("../scopes/RealScopeEngine").then((m) => ({ default: m.ScopePanel }))
);

// Panel ID mapping to component
export function initializePanelRegistry(): void {
  registerPanel("preview", previewPanel);
  registerPanel("timeline", timelinePanel);
  registerPanel("mediaLibrary", mediaLibraryPanel);
  registerPanel("inspector", inspectorPanel);
  registerPanel("keyframes", keyframeEditorPanel);
  registerPanel("audioMixer", audioMixerPanel);
  registerPanel("colorGrading", colorGradingPanel);
  registerPanel("scopes", scopePanel);
}
