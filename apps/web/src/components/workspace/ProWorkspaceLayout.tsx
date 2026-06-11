import React, { useState, useCallback, useEffect } from "react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { cn } from "@openreel/ui";

// Panel registry for lazy panel content loading
const panelRegistry: Record<string, React.LazyExoticComponent<React.FC<any>>> = {};

export function registerPanel(id: string, component: React.LazyExoticComponent<React.FC<any>>) {
  panelRegistry[id] = component;
}

// Main workspace layout manager
export const ProWorkspaceLayout: React.FC = () => {
  const {
    currentWorkspace,
    layouts,
    sidebarVisible,
    sidebarWidth,
    bottomPanelHeight,
    rightPanelWidth,
    setSidebarWidth,
    setBottomPanelHeight,
    setRightPanelWidth,
  } = useWorkspaceStore();

  const layout = layouts[currentWorkspace];
  const [isResizing, setIsResizing] = useState(false);
  const [resizeTarget, setResizeTarget] = useState<string | null>(null);

  // Resizing handlers
  const handleResizeStart = useCallback((target: string) => {
    setIsResizing(true);
    setResizeTarget(target);
  }, []);

  const handleResizeMove = useCallback((e: React.MouseEvent) => {
    if (!isResizing || !resizeTarget) return;

    if (resizeTarget === "sidebar") {
      setSidebarWidth(e.clientX);
    } else if (resizeTarget === "rightPanel") {
      setRightPanelWidth(window.innerWidth - e.clientX);
    } else if (resizeTarget === "bottomPanel") {
      setBottomPanelHeight(window.innerHeight - e.clientY);
    }
  }, [isResizing, resizeTarget, setSidebarWidth, setRightPanelWidth, setBottomPanelHeight]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeTarget(null);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    window.addEventListener("mousemove", handleResizeMove as any);
    window.addEventListener("mouseup", handleResizeEnd);
    return () => {
      window.removeEventListener("mousemove", handleResizeMove as any);
      window.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-bg">
      {/* Main workspace grid */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Left sidebar - Media/Project Bin */}
        {sidebarVisible && (
          <>
            <div
              className="flex-shrink-0 h-full overflow-hidden border-r border-border bg-bg-1"
              style={{ width: sidebarWidth }}
            >
              <PanelContainer group={layout?.leftPanel} direction="vertical" />
            </div>
            {/* Sidebar resize handle */}
            <div
              className={cn(
                "w-1 cursor-col-resize flex-shrink-0 z-10 transition-colors",
                isResizing && resizeTarget === "sidebar" ? "bg-accent" : "bg-transparent hover:bg-accent/30"
              )}
              onMouseDown={() => handleResizeStart("sidebar")}
            />
          </>
        )}

        {/* Center panel - Preview or Timeline */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar area */}
          <div className="flex-shrink-0">
            <PanelContainer group={layout?.topPanel} direction="horizontal" />
          </div>

          {/* Main content */}
          <div className="flex-1 min-h-0">
            <PanelContainer group={layout?.centerPanel} direction="vertical" />
          </div>

          {/* Bottom panel - Timeline */}
          <div
            className="flex-shrink-0 border-t border-border bg-bg-1 relative"
            style={{ height: bottomPanelHeight }}
          >
            <PanelContainer group={layout?.bottomPanel} direction="vertical" />
            {/* Bottom panel resize handle */}
            <div
              className={cn(
                "absolute top-0 left-0 right-0 h-1 -mt-px cursor-row-resize z-10 transition-colors",
                isResizing && resizeTarget === "bottomPanel" ? "bg-accent" : "bg-transparent hover:bg-accent/30"
              )}
              onMouseDown={() => handleResizeStart("bottomPanel")}
            />
          </div>
        </div>

        {/* Right panel - Inspector/Effects */}
        <div
          className="flex-shrink-0 h-full overflow-hidden border-l border-border bg-bg-1 relative"
          style={{ width: rightPanelWidth }}
        >
          <PanelContainer group={layout?.rightPanel} direction="vertical" />
          {/* Right panel resize handle */}
          <div
            className={cn(
              "absolute top-0 left-0 bottom-0 w-1 -ml-px cursor-col-resize z-10 transition-colors",
              isResizing && resizeTarget === "rightPanel" ? "bg-accent" : "bg-transparent hover:bg-accent/30"
            )}
            onMouseDown={() => handleResizeStart("rightPanel")}
          />
        </div>
      </div>

      {/* Floating panels */}
      {layout?.floatingPanels.map((panel) => {
        if (!panel.visible) return null;
        const PanelComponent = panelRegistry[panel.id];
        if (!PanelComponent) return null;

        return (
          <div
            key={panel.id}
            className="absolute bg-bg-1 border border-border rounded-lg shadow-lg z-50"
            style={{
              left: panel.floatingPosition?.x || 100,
              top: panel.floatingPosition?.y || 100,
              width: panel.floatingSize?.width || 300,
              height: panel.floatingSize?.height || 200,
            }}
          >
            <PanelContent panelId={panel.id as any} />
          </div>
        );
      })}
    </div>
  );
};

// Panel container that renders panel groups
const PanelContainer: React.FC<{ group: any; direction: "horizontal" | "vertical" }> = ({ group }) => {
  if (!group || !group.panels) return null;

  return (
    <div className="w-full h-full flex flex-col">
      {group.panels.map((panel: any) => {
        if (!panel.visible) return null;
        return (
          <div
            key={panel.id}
            className="flex-1 min-h-0 overflow-hidden"
            style={{ flex: panel.size ? `${panel.size}` : "1" }}
          >
            <PanelContent panelId={panel.id} />
          </div>
        );
      })}
    </div>
  );
};

// Panel content wrapper
const PanelContent: React.FC<{ panelId: string }> = ({ panelId }) => {
  const PanelComponent = panelRegistry[panelId];
  if (!PanelComponent) {
    return (
      <div className="w-full h-full flex items-center justify-center text-fg-3 text-xs">
        Panel: {panelId}
      </div>
    );
  }

  // Use Suspense for lazy-loaded panels
  return (
    <React.Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PanelComponent />
    </React.Suspense>
  );
};

export default ProWorkspaceLayout;
