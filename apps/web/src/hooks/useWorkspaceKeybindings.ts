import { useEffect, useCallback } from "react";
import { useWorkspaceStore, type WorkspaceId } from "../stores/workspace-store";

/**
 * Workspace keyboard integration.
 *
 * Adds keyboard shortcuts for workspace switching. Dispatches to the
 * existing keyboard shortcuts service for all other commands.
 */
export function useWorkspaceKeybindings(): void {
  const { currentWorkspace, setCurrentWorkspace } = useWorkspaceStore();

  const cycleWorkspace = useCallback(() => {
    const workspaces: WorkspaceId[] = [
      "editing",
      "assembly",
      "color",
      "audio",
      "effects",
    ];
    const currentIndex = workspaces.indexOf(currentWorkspace);
    const nextIndex = (currentIndex + 1) % workspaces.length;
    setCurrentWorkspace(workspaces[nextIndex]);
  }, [currentWorkspace, setCurrentWorkspace]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when user is typing in input/textarea/editable element
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }

      // Cycle workspace: Ctrl+Shift+W
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        e.stopPropagation();
        cycleWorkspace();
        return;
      }

      // Quick workspace switching要离开jumps
      if ((e.ctrlKey || e.metaKey) && e.altKey) {
        switch (e.key.toLowerCase()) {
          case "1":
            e.preventDefault();
            e.stopPropagation();
            setCurrentWorkspace("editing");
            return;
          case "2":
            e.preventDefault();
            e.stopPropagation();
            setCurrentWorkspace("assembly");
            return;
          case "3":
            e.preventDefault();
            e.stopPropagation();
            setCurrentWorkspace("color");
            return;
          case "4":
            e.preventDefault();
            e.stopPropagation();
            setCurrentWorkspace("audio");
            return;
          case "5":
            e.preventDefault();
            e.stopPropagation();
            setCurrentWorkspace("effects");
            return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cycleWorkspace, setCurrentWorkspace]);
}
