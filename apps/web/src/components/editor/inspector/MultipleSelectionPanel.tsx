import React, { useState } from "react";
import { useProjectStore } from "../../../stores/project-store";
import { audioMatchEngine } from "@openreel/core/media";
import { loadAudioBuffer } from "../../../utils/load-audio-buffer";
import { toast } from "../../../stores/notification-store";
import { Mic2, Layers } from "lucide-react";

interface Props {
  selectedClipIds: string[];
}

export const MultipleSelectionPanel: React.FC<Props> = ({ selectedClipIds }) => {
  const [isMatching, setIsMatching] = useState(false);

  const handleAutoVoiceMatch = async () => {
    setIsMatching(true);
    toast.info("Analyzing selected audio clips...");
    try {
      const { project, getMediaItem, addAudioEffect } = useProjectStore.getState();
      
      // Get all clips
      const clips = project.timeline.tracks.flatMap(t => t.clips).filter(c => selectedClipIds.includes(c.id));
      
      // Filter clips with audio
      const audioClips = clips.filter(c => {
        const media = getMediaItem(c.mediaId);
        return media && (media.type === "audio" || (media.type === "video" && (media.metadata?.channels || 0) > 0));
      });

      if (audioClips.length < 2) {
        throw new Error("Select at least 2 audio/video clips to match voices.");
      }

      // We use the first clip as the reference
      const referenceClip = audioClips[0];
      const referenceMedia = getMediaItem(referenceClip.mediaId);
      const refFile = referenceMedia?.blob || (await referenceMedia?.fileHandle?.getFile());
      if (!refFile) throw new Error("Reference media file missing");

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 44100 });
      
      const referenceBuffer = await loadAudioBuffer(ctx, refFile, { audioTrackIndex: referenceClip.audioTrackIndex ?? 0 });
      if (!referenceBuffer) throw new Error("Failed to load reference audio");

      toast.info("Matching voices (this may take a moment)...");

      for (let i = 1; i < audioClips.length; i++) {
        const targetClip = audioClips[i];
        const targetMedia = getMediaItem(targetClip.mediaId);
        const targetFile = targetMedia?.blob || (await targetMedia?.fileHandle?.getFile());
        if (!targetFile) continue;

        const targetBuffer = await loadAudioBuffer(ctx, targetFile, { audioTrackIndex: targetClip.audioTrackIndex ?? 0 });
        if (!targetBuffer) continue;

        const { eqEffect, gainEffect } = await audioMatchEngine.matchAudio(referenceBuffer, targetBuffer);

        // Apply effects
        addAudioEffect(targetClip.id, eqEffect);
        addAudioEffect(targetClip.id, gainEffect);
      }

      toast.success("Voices perfectly matched!");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to match voices");
    } finally {
      setIsMatching(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background-secondary border-border overflow-y-auto w-full">
      <div className="flex-1 flex flex-col p-6">
        <div className="flex items-center gap-3 mb-8 pb-4 border-b border-border">
          <Layers className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-base font-semibold text-text-primary">Multiple Selection</h2>
            <p className="text-xs text-text-secondary mt-1">
              {selectedClipIds.length} items selected
            </p>
          </div>
        </div>
        
        <div className="bg-background-tertiary p-5 rounded-xl border border-border hover:border-primary/50 transition-colors shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Mic2 className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary">Auto Voice Matcher</h3>
          </div>
          <p className="text-xs text-text-secondary mb-6 leading-relaxed">
            Automatically balance the volume and frequency profile of all selected clips to sound consistent. 
            The first selected clip acts as the reference profile.
          </p>
          <button
            onClick={handleAutoVoiceMatch}
            disabled={isMatching}
            className="w-full py-2.5 bg-primary hover:bg-primary-hover disabled:bg-background-modifier-disabled disabled:text-text-muted text-background-primary font-medium rounded-lg text-sm transition-all flex items-center justify-center gap-2"
          >
            {isMatching ? (
              <>
                <span className="w-4 h-4 border-2 border-background-primary/30 border-t-background-primary rounded-full animate-spin" />
                Matching Voices...
              </>
            ) : (
              "Match Voices"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
