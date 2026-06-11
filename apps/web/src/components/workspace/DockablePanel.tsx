import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  GripVertical,
  Minus,
  Plus,
  X,
  Pin,
  Maximize2,
  Minimize2,
  Move,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { cn } from "@openreel/ui";

interface DockablePanelProps {
  id: string;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  defaultHeight?: number;
  className?: string;
  headerClassName?: string;
  onClose?: () => void;
  onPin?: () => void;
  onMaximize?: () => void;
  onMinimize?: () => void;
  draggable?: boolean;
  collapsible?: boolean;
  resizable?: boolean;
}

export const DockablePanel: React.FC<DockablePanelProps> = ({
  id,
  title,
  icon,
  children,
  defaultCollapsed = false,
  defaultHeight = 200,
  className,
  headerClassName,
  onClose,
  onPin,
  onMaximize,
  onMinimize,
  draggable = false,
  collapsible = true,
  resizable = true,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [height, setHeight] = useState(defaultHeight);
  const [isDragging, setIsDragging] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!resizable) return;
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      setHeight(Math.max(80, startHeight + deltaY));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [height, resizable]);

  return (
    <div
      ref={panelRef}
      data-panel-id={id}
      className={cn(
        "flex flex-col border border-border bg-bg-1 rounded-lg overflow-hidden transition-all",
        isDragging && "opacity-50 shadow-lg",
        isMaximized && "fixed inset-4 z-50",
        className
      )}
      style={{ height: isCollapsed ? 36 : height, minHeight: isCollapsed ? 36 : 80 }}
    >
      {/* Panel Header */}
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 border-b border-border bg-bg-2 select-none",
          isDragging && "cursor-grabbing",
          draggable && !isDragging && "cursor-grab",
          headerClassName
        )}
        onMouseDown={(e) => {
          if (!draggable) return;
          if ((e.target as HTMLElement).closest("button")) return;
          // Drag logic handled by parent
        }}
      >
        {draggable && (
          <GripVertical size={12} className="text-fg-3 cursor-grab" />
        )}

        {icon && <span className="text-fg-3">{icon}</span>}

        <span className="flex-1 text-[11px] font-semibold text-fg truncate">{title}</span>

        <div className="flex items-center gap-0.5">
          {collapsible && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded hover:bg-hover text-fg-3 hover:text-fg transition-colors"
              title={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          )}

          {onPin && (
            <button
              onClick={onPin}
              className="p-1 rounded hover:bg-hover text-fg-3 hover:text-fg transition-colors"
              title="Pin panel"
            >
              <Pin size={12} />
            </button>
          )}

          {onMinimize && (
            <button
              onClick={onMinimize}
              className="p-1 rounded hover:bg-hover text-fg-3 hover:text-fg transition-colors"
              title="Minimize"
            >
              <Minimize2 size={12} />
            </button>
          )}

          {onMaximize && (
            <button
              onClick={() => {
                setIsMaximized(!isMaximized);
                onMaximize?.();
              }}
              className="p-1 rounded hover:bg-hover text-fg-3 hover:text-fg transition-colors"
              title="Maximize"
            >
              <Maximize2 size={12} />
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-hover text-fg-3 hover:text-fg transition-colors"
              title="Close"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Panel Content */}
      {!isCollapsed && (
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      )}

      {/* Resize handle */}
      {resizable && !isCollapsed && (
        <div
          ref={resizeRef}
          className="h-1.5 cursor-row-resize bg-transparent hover:bg-accent/20 transition-colors group"
          onMouseDown={handleMouseDown}
        >
          <div className="h-px bg-border group-hover:bg-accent/30 mx-6" />
        </div>
      )}
    </div>
  );
};

export default DockablePanel;
