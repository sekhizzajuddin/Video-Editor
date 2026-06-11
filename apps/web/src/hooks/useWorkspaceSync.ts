import { useEffect } from "react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useUIStore, type PanelId } from "../stores/ui-store";

/**
 * Maps workspace layout panels to UI store PanelIds.
 * Only panels that exist in both systems are synced.
 */
const WORKSPACE_TO_UI_PANELS: Record<string, PanelId> = {
  mediaLibrary: "mediaLibrary",
  inspector: "inspector",
  effects: "effects",
  audioMixer: "audioMixer",
  colorGrading: "colorGrading",
  subtitles: "subtitles",
};

/**
 * Syncs workspace layout to UI panel visibility.
 * When the active workspace changes, panels are shown/hidden
 * according to the workspace's layout configuration.
 */
export function useWorkspaceSync(): void {
  const { currentWorkspace, layouts } = useWorkspaceStore();
  const { setPanelVisible } = useUIStore();

  useEffect(() => {
    const layout = layouts[currentWorkspace];
    if (!layout) return;

    // Collect all panels from all panel groups
    const allGroups = [
      layout.leftPanel,
      layout.rightPanel,
      layout.topPanel,
      layout.bottomPanel,
      layout.centerPanel,
    ].filter(Boolean);

    const visiblePanelIds = new Set<string>();

    for (const group of allGroups) {
      if (!group?.panels) continue;
      for (const panel of group.panels) {
        if (panel.visible && WORKSPACE_TO_UI_PANELS[panel.id]) {
          visiblePanelIds.add(panel.id);
        }
      }
    }

    // Update UI store visibility for known panels
    for (const [workspacePanelId, uiPanelId] of Object.entries(WORKSPACE_TO_UI_PANELS)) {
      const shouldBeVisible = visiblePanelIds.has(workspacePanelId);
      setPanelVisible(uiPanelId, shouldBeVisible);
    }
  }, [currentWorkspace, layouts, setPanelVisible]);
}
