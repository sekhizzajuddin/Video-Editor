import React from "react";
import {
  Copy,
  Layers,
  Trash2,
  Scissors,
  Music,
  Sparkles,
  Volume2,
  Film,
  Image,
  ArrowLeftToLine,
  Captions,
} from "lucide-react";
import { toast } from "../../../stores/notification-store";
import type { Clip, Track } from "@openreel/core";
import { useProjectStore } from "../../../stores/project-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuLabel,
} from "@openreel/ui";

interface ClipContextMenuProps {
  clip: Clip;
  track: Track;
  onClose?: () => void;
}

export const ClipContextMenu: React.FC<ClipContextMenuProps> = ({
  clip,
  track,
  onClose,
}) => {
  const {
    copyClips,
    duplicateClip,
    removeClip,
    rippleDeleteClip,
    splitClip,
    separateAudio,
    getMediaItem,
    copyEffects,
    pasteEffects,
    copiedEffects,
    closeGapBeforeClip,
  } = useProjectStore();
  const { playheadPosition } = useTimelineStore();

  const isPlayheadOnClip =
    playheadPosition >= clip.startTime &&
    playheadPosition <= clip.startTime + clip.duration;

  const hasGapBeforeClip = React.useMemo(() => {
    const sorted = [...track.clips].sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((c) => c.id === clip.id);
    if (idx < 0) return false;
    const prev = idx > 0 ? sorted[idx - 1] : null;
    const target = prev ? prev.startTime + prev.duration : 0;
    return clip.startTime - target > 0.0001;
  }, [track.clips, clip.id, clip.startTime]);

  const mediaItem = getMediaItem(clip.mediaId);
  const isVideo = track.type === "video";
  const isAudio = track.type === "audio";
  const isImage = track.type === "image";
  const isVideoWithAudio =
    isVideo &&
    mediaItem?.type === "video" &&
    mediaItem?.metadata?.channels &&
    mediaItem.metadata.channels > 0;

  const hasEffects = clip.effects && clip.effects.length > 0;
  const hasCopiedEffects = copiedEffects && copiedEffects.length > 0;

  const handleCopy = () => {
    copyClips([clip.id]);
    onClose?.();
  };

  const handleDuplicate = async () => {
    await duplicateClip(clip.id);
    onClose?.();
  };

  const handleDelete = async () => {
    await removeClip(clip.id);
    onClose?.();
  };

  const handleRippleDelete = async () => {
    await rippleDeleteClip(clip.id);
    onClose?.();
  };

  const handleSplit = async () => {
    if (isPlayheadOnClip) {
      await splitClip(clip.id, playheadPosition);
    }
    onClose?.();
  };

  const handleCloseGap = async () => {
    await closeGapBeforeClip(clip.id);
    onClose?.();
  };

  const handleSeparateAudio = async () => {
    await separateAudio(clip.id);
    onClose?.();
  };

  const handleCopyEffects = () => {
    copyEffects(clip.id);
    onClose?.();
  };

  const handlePasteEffects = async () => {
    await pasteEffects(clip.id);
    onClose?.();
  };

  const handleGenerateCaptions = async () => {
    const file = mediaItem?.blob || (await mediaItem?.fileHandle?.getFile());
    if (!mediaItem || !file) {
      toast.error("Media file not found");
      return;
    }
    onClose?.();
    toast.info("Loading Offline AI Whisper Model...");
    
    try {
      const { transcriptionEngine } = await import("@openreel/core/media");
      const { loadAudioBuffer } = await import("../../../utils/load-audio-buffer");
      
      await transcriptionEngine.initialize();
      
      toast.info("Extracting and resampling audio to 16kHz...");
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 16000 });
      const audioBuffer = await loadAudioBuffer(ctx, file, {
        audioTrackIndex: clip.audioTrackIndex ?? 0
      });
      
      if (!audioBuffer) throw new Error("Failed to extract audio");

      toast.info("Transcribing (this may take a minute)...");
      
      const words = await transcriptionEngine.transcribe(audioBuffer);
      
      if (words.length === 0) {
        toast.error("No speech detected");
        return;
      }

      toast.info("Adding captions to timeline...");
      
      const { addSubtitle } = useProjectStore.getState();
      
      for (const word of words) {
        await addSubtitle({
          id: Math.random().toString(36).substring(7),
          startTime: clip.startTime + word.start,
          endTime: clip.startTime + word.end,
          text: word.text
        });
      }
      
      toast.success(`Generated ${words.length} captions`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate captions");
    }
  };

  const getClipTypeLabel = () => {
    if (isVideo) return "Video Clip";
    if (isAudio) return "Audio Clip";
    if (isImage) return "Image Clip";
    return "Clip";
  };

  const getClipTypeIcon = () => {
    if (isVideo) return <Film className="mr-2 h-3 w-3 text-primary" />;
    if (isAudio) return <Volume2 className="mr-2 h-3 w-3 text-blue-400" />;
    if (isImage) return <Image className="mr-2 h-3 w-3 text-purple-400" />;
    return null;
  };

  return (
    <ContextMenuContent className="min-w-[220px]">
      <ContextMenuLabel className="flex items-center text-[10px] text-text-muted">
        {getClipTypeIcon()}
        {getClipTypeLabel()}
      </ContextMenuLabel>
      <ContextMenuSeparator />

      <ContextMenuItem onClick={handleCopy}>
        <Copy className="mr-2 h-4 w-4" />
        Copy Clip
        <ContextMenuShortcut>⌘C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={handleDuplicate}>
        <Layers className="mr-2 h-4 w-4" />
        Duplicate
        <ContextMenuShortcut>⌘D</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem onClick={handleSplit} disabled={!isPlayheadOnClip}>
        <Scissors className="mr-2 h-4 w-4" />
        Split at Playhead
        <ContextMenuShortcut>S</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={handleCloseGap} disabled={!hasGapBeforeClip}>
        <ArrowLeftToLine className="mr-2 h-4 w-4" />
        Close Gap to Previous
      </ContextMenuItem>

      {(isVideo || isImage) && (
        <>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Sparkles className="mr-2 h-4 w-4" />
              Effects
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onClick={handleCopyEffects} disabled={!hasEffects}>
                Copy Effects
              </ContextMenuItem>
              <ContextMenuItem onClick={handlePasteEffects} disabled={!hasCopiedEffects}>
                Paste Effects
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </>
      )}

      {isVideoWithAudio && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleGenerateCaptions}>
            <Captions className="mr-2 h-4 w-4" />
            Generate Auto Captions
          </ContextMenuItem>
          <ContextMenuItem onClick={handleSeparateAudio}>
            <Music className="mr-2 h-4 w-4" />
            Separate Audio
          </ContextMenuItem>
        </>
      )}

      {isAudio && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleGenerateCaptions}>
            <Captions className="mr-2 h-4 w-4" />
            Generate Auto Captions
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Volume2 className="mr-2 h-4 w-4" />
              Audio
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onClick={handleCopyEffects} disabled={!hasEffects}>
                Copy Audio Effects
              </ContextMenuItem>
              <ContextMenuItem onClick={handlePasteEffects} disabled={!hasCopiedEffects}>
                Paste Audio Effects
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </>
      )}

      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleRippleDelete} className="text-red-400">
        <Trash2 className="mr-2 h-4 w-4" />
        Ripple Delete
        <ContextMenuShortcut>⌫</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={handleDelete} className="text-red-400">
        <Trash2 className="mr-2 h-4 w-4" />
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );
};
