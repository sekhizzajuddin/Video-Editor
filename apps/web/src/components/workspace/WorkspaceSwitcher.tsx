import React, { useState } from "react";
import {
  Layers,
  Film,
  Music,
  Wand2,
  Palette,
  LayoutGrid,
  Music2,
  Star,
  ChevronDown,
  GripVertical,
  Maximize2,
  Minimize2,
  Pin,
  MoreHorizontal,
} from "lucide-react";
import { useWorkspaceStore, type WorkspaceId } from "../../stores/workspace-store";
import { cn } from "@openreel/ui";
import { Tooltip, TooltipTrigger, TooltipContent } from "@openreel/ui";

const WORKSPACES: Array<{ id: WorkspaceId; name: string; icon: React.ReactNode }> = [
  { id: "editing", name: "Editing", icon: <Layers size={14} /> },
  { id: "assembly", name: "Assembly", icon: <Film size={14} /> },
  { id: "color", name: "Color", icon: <Palette size={14} /> },
  { id: "audio", name: "Audio", icon: <Music size={14} /> },
  { id: "effects", name: "Effects", icon: <Wand2 size={14} /> },
];

export const WorkspaceSwitcher: React.FC = () => {
  const { currentWorkspace, setCurrentWorkspace } = useWorkspaceStore();
  const [isOpen, setIsOpen] = useState(false);

  const current = WORKSPACES.find((w) => w.id === currentWorkspace);

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-fg-2 hover:bg-hover hover:text-fg transition-colors group"
          >
            <span className="text-fg-2 group-hover:text-fg">{current?.icon}</span>
            <span className="text-[11px] font-medium">{current?.name}</span>
            <ChevronDown size={10} className={cn("transition-transform", isOpen && "rotate-180")} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Switch workspace</TooltipContent>
      </Tooltip>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-48 bg-bg-1 border border-border rounded-lg shadow-lg z-50 py-1 animate-in fade-in slide-in-from-top-2 duration-150">
            {WORKSPACES.map((workspace) => (
              <button
                key={workspace.id}
                onClick={() => {
                  setCurrentWorkspace(workspace.id);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-left transition-colors hover:bg-hover",
                  currentWorkspace === workspace.id && "bg-accent-soft text-accent font-medium"
                )}
              >
                <span className={cn(currentWorkspace === workspace.id ? "text-accent" : "text-fg-3")}>
                  {workspace.icon}
                </span>
                {workspace.name}
                {currentWorkspace === workspace.id && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
