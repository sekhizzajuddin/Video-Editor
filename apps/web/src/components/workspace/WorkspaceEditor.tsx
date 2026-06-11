import React, { useEffect, lazy } from "react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { ProWorkspaceLayout } from "../workspace/ProWorkspaceLayout";
import { initializePanelRegistry } from "../workspace/register-panels";

// Lazy-load the existing EditorInterface to preserve its own code splitting
const ExistingEditorInterface = lazy(() =>
  import("../editor/EditorInterface").then((m) => ({
    default: m.EditorInterface,
  }))
);

/**
 * Workspace-aware editor interface.
 *
 * The "editing" workspace uses the original cinematic layout for full
 * backward compatibility. All other workspaces (color, audio, effects,
 * assembly) render via ProWorkspaceLayout with dockable panels.
 */
export const WorkspaceEditor: React.FC = () => {
  const { currentWorkspace } = useWorkspaceStore();

  // Initialise panel registry once on mount so lazy panels are registered
  // before any ProWorkspaceLayout renders.
  useEffect(() => {
    initializePanelRegistry();
  }, []);

  // Editing workspace: legacy cinematic layout (existing EditorInterface)
  if (currentWorkspace === "editing") {
    return <ExistingEditorInterface />;
  }

  // Other workspaces: pro workspace with dockable panels
  return <ProWorkspaceLayout />;
};

export default WorkspaceEditor;
