import React, { useState } from "react";
import { Plus, X, Settings2 } from "lucide-react";
import type { Transition, Clip } from "@openreel/core";
import { useProjectStore } from "../../../stores/project-store";

interface TransitionIndicatorProps {
  clipA: Clip;
  clipB: Clip;
  transition?: Transition;
  pixelsPerSecond: number;
}

export const TransitionIndicator: React.FC<TransitionIndicatorProps> = ({
  clipA,
  clipB,
  transition,
  pixelsPerSecond,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const addClipTransition = useProjectStore((s) => s.addClipTransition);
  const removeClipTransition = useProjectStore((s) => s.removeClipTransition);

  // Position is right at the boundary
  const boundaryTime = clipB.startTime;
  const positionX = boundaryTime * pixelsPerSecond;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const rawData = e.dataTransfer.getData("application/x-openreel-transition") || e.dataTransfer.getData("application/json");
      if (!rawData) return;
      const data = JSON.parse(rawData);
      
      const transitionType = data.transitionType || data.effectId;
      if (transitionType) {
        addClipTransition({
          id: crypto.randomUUID(),
          clipAId: clipA.id,
          clipBId: clipB.id,
          type: transitionType,
          duration: 1, // Default 1 second
          params: {},
        });
      }
    } catch {
      // Ignore
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (transition) {
      removeClipTransition(transition.id);
    }
  };

  const handleSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Open settings (to be implemented in UI or inspector)
    console.log("Settings for transition:", transition);
  };

  // Render applied transition
  if (transition) {
    return (
      <div
        className="absolute top-0 bottom-0 flex items-center justify-center z-20 group"
        style={{
          left: positionX,
          width: 24, // width of the indicator
          transform: "translateX(-50%)",
        }}
      >
        <div className="w-6 h-6 bg-primary/90 text-primary-foreground rounded-sm flex items-center justify-center shadow-lg cursor-pointer">
          <Settings2 size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={handleSettings} />
        </div>
        <button
          className="absolute -top-2 -right-2 w-4 h-4 bg-destructive text-destructive-foreground rounded-full items-center justify-center hidden group-hover:flex shadow-sm z-30"
          onClick={handleDelete}
        >
          <X size={10} />
        </button>
      </div>
    );
  }

  // Render Drop Target / Add Button
  return (
    <div
      className={`absolute top-0 bottom-0 flex items-center justify-center z-10 transition-colors ${
        isDragOver ? "bg-primary/20" : "hover:bg-primary/10"
      }`}
      style={{
        left: positionX,
        width: 32,
        transform: "translateX(-50%)",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`w-5 h-5 rounded-sm flex items-center justify-center transition-all ${
          isDragOver
            ? "bg-primary text-primary-foreground scale-110"
            : "bg-background-secondary/80 text-muted-foreground border border-border hover:bg-primary/80 hover:text-primary-foreground"
        }`}
      >
        <Plus size={12} />
      </div>
    </div>
  );
};
