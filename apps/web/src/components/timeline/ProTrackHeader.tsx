import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Volume2,
  VolumeX,
  Headphones,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  GripVertical,
  Settings2,
} from "lucide-react";
import { useAdvancedTimelineStore } from "../../stores/advanced-timeline-store";
import { useProjectStore } from "../../stores/project-store";
import { cn } from "@openreel/ui";

interface ProTrackHeaderProps {
  trackId: string;
  index: number;
}

export const ProTrackHeader: React.FC<ProTrackHeaderProps> = ({ trackId, index }) => {
  const { project } = useProjectStore();
  const {
    getTrackControl,
    setTrackMuted,
    setTrackSolo,
    setTrackLocked,
    setTrackHidden,
    setTrackExpanded,
    setTrackMinimized,
    setTrackColor,
    selectTrack,
    registerTrack,
  } = useAdvancedTimelineStore();

  const track = project.timeline.tracks.find((t) => t.id === trackId);
  const control = getTrackControl(trackId);

  // Register track if not already registered
  useEffect(() => {
    if (track && !control) {
      registerTrack(trackId, track.type, track.name || `Track ${index + 1}`);
    }
  }, [track, control, trackId, index, registerTrack]);

  if (!track || !control) return null;

  const iconColor = {
    video: "text-c-video",
    audio: "text-c-audio",
    image: "text-c-text",
    text: "text-c-text",
    graphics: "text-c-music",
  }[control.type] || "text-fg-3";

  const trackTypeLabel = {
    video: "V",
    audio: "A",
    image: "I",
    text: "T",
    graphics: "G",
  }[control.type] || "?";

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-1.5 border-t border-border/50 select-none transition-colors",
        control.selected ? "bg-accent-soft/30 border-l-2 border-l-accent" : "hover:bg-hover/50"
      )}
      style={{ height: control.height || 76 }}
      onClick={() => selectTrack(trackId, false)}
    >
      {/* Track color indicator */}
      <div
        className="w-1 h-full rounded-full mr-1 flex-shrink-0"
        style={{ backgroundColor: control.color }}
      />

      {/* Track type badge */}
      <div
        className={cn(
          "w-5 h-5 rounded-sm flex items-center justify-center text-[9px] font-bold flex-shrink-0",
          iconColor
        )}
        style={{ backgroundColor: `${control.color}15` }}
      >
        {trackTypeLabel}
      </div>

      {/* Track name */}
      <span className="flex-1 text-[10px] font-medium text-fg truncate min-w-0">
        {control.name}
      </span>

      {/* Track controls */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {/* Mute toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setTrackMuted(trackId, !control.muted);
          }}
          className={cn(
            "w-5 h-5 rounded flex items-center justify-center transition-colors",
            control.muted
              ? "bg-status-error/20 text-status-error"
              : "text-fg-3 hover:text-fg hover:bg-hover"
          )}
          title={control.muted ? "Unmute" : "Mute"}
        >
          {control.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
        </button>

        {/* Solo toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setTrackSolo(trackId, !control.solo);
          }}
          className={cn(
            "w-5 h-5 rounded flex items-center justify-center transition-colors text-[8px] font-bold",
            control.solo
              ? "bg-accent/20 text-accent"
              : "text-fg-3 hover:text-fg hover:bg-hover"
          )}
          title={control.solo ? "Unsolo" : "Solo"}
        >
          S
        </button>

        {/* Lock toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setTrackLocked(trackId, !control.locked);
          }}
          className={cn(
            "w-5 h-5 rounded flex items-center justify-center transition-colors",
            control.locked
              ? "bg-yellow-500/20 text-yellow-500"
              : "text-fg-3 hover:text-fg hover:bg-hover"
          )}
          title={control.locked ? "Unlock" : "Lock"}
        >
          {control.locked ? <Lock size={10} /> : <Unlock size={10} />}
        </button>

        {/* Eye toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setTrackHidden(trackId, !control.hidden);
          }}
          className={cn(
            "w-5 h-5 rounded flex items-center justify-center transition-colors",
            control.hidden
              ? "text-fg-muted"
              : "text-fg-3 hover:text-fg hover:bg-hover"
          )}
          title={control.hidden ? "Show" : "Hide"}
        >
          {control.hidden ? <EyeOff size={10} /> : <Eye size={10} />}
        </button>
      </div>
    </div>
  );
};

export default ProTrackHeader;
