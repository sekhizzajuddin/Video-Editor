import { useRef, useCallback, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getMediaUrl } from './useMediaManager';
import type { Clip } from '../types';

export interface PlaybackEngine {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  stop: () => void;
  isPlayingRef: () => boolean;
  currentTimeRef: () => number;
}

export function usePlaybackEngine(onFrame?: (time: number, delta: number) => void): PlaybackEngine {
  const rAF = useRef<number>(0);
  const isPlayingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const startWallRef = useRef(0);
  const startTimeRef = useRef(0);
  const speedRef = useRef(1);
  const durationRef = useRef(10);
  const lastFrameRef = useRef(0);
  const audioEls = useRef<{ el: HTMLAudioElement; clipId: string; clip: Clip }[]>([]);
  const isStartingRef = useRef(false);
  const store = useEditorStore;

  // Centralized Web Audio API context & master dynamics compressor
  const audioCtxRef = useRef<AudioContext | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      const comp = ctx.createDynamicsCompressor();
      // Configure compressor as a master brickwall limiter
      comp.threshold.setValueAtTime(-10, ctx.currentTime); // start soft compression at -10dB
      comp.knee.setValueAtTime(8, ctx.currentTime);
      comp.ratio.setValueAtTime(16, ctx.currentTime); // brickwall ratio
      comp.attack.setValueAtTime(0.003, ctx.currentTime); // ultra fast attack
      comp.release.setValueAtTime(0.08, ctx.currentTime);
      comp.connect(ctx.destination);

      audioCtxRef.current = ctx;
      compressorRef.current = comp;
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return { ctx: audioCtxRef.current, compressor: compressorRef.current! };
  }, []);

  const stopAllAudio = useCallback(() => {
    for (const { el } of audioEls.current) {
      el.pause();
      el.src = '';
    }
    audioEls.current = [];
  }, []);

  const startAudio = useCallback((fromTime: number) => {
    stopAllAudio();
    const state = store.getState();
    const tracks = state.project.tracks;
    const speed = state.speed || 1;

    // Initialize/resume Audio Context on user play action
    const { ctx, compressor } = getAudioCtx();

    for (const track of tracks) {
      for (const clip of track.clips) {
        if (!clip.mediaId || clip.muted) continue;
        const isAudio = track.type === 'audio' || track.type === 'tts';
        const isVideo = track.type === 'video' || track.type === 'record';
        if (!isAudio && !isVideo) continue;

        const clipEnd = clip.startAt + clip.duration;
        if (fromTime >= clipEnd + 0.05) continue;
        // Allow clips starting up to 10 seconds in the future (handled with setTimeout delay)
        if (fromTime < clip.startAt - 0.05) {
          if (clip.startAt > fromTime + 10) continue;
        }

        const url = getMediaUrl(clip.mediaId);
        if (!url) continue;

        const el = document.createElement('audio');
        el.src = url;
        el.crossOrigin = 'anonymous'; // Avoid Web Audio CORS issues
        el.playbackRate = speed * (clip.speed || 1);
        el.preload = 'auto';
        
        // Enable pitch preservation if the clip has preservePitch enabled
        if (clip.preservePitch) {
          el.preservesPitch = true;
          // Also set vendor prefixes for compatibility
          (el as any).mozPreservesPitch = true;
          (el as any).webkitPreservesPitch = true;
        }

        // Bind HTML5 audio element output to centralized Web Audio Mixer nodes
        try {
          const sourceNode = ctx.createMediaElementSource(el);
          const gainNode = ctx.createGain();
          const baseVolume = Math.max(0, Math.min(2, clip.volume ?? 1));
          gainNode.gain.setValueAtTime(baseVolume, ctx.currentTime);

          // Apply audio fade-in if configured
          const fadeIn = clip.audioFadeIn || 0;
          const fadeOut = clip.audioFadeOut || 0;
          if (fadeIn > 0) {
            // Start at 0, ramp to full volume over fadeIn seconds
            const localStart = Math.max(0, fromTime - clip.startAt);
            if (localStart < fadeIn) {
              const remaining = fadeIn - localStart;
              const startVol = baseVolume * (localStart / fadeIn);
              gainNode.gain.setValueAtTime(startVol, ctx.currentTime);
              gainNode.gain.linearRampToValueAtTime(baseVolume, ctx.currentTime + remaining);
            }
          }
          if (fadeOut > 0 && clip.duration > 0) {
            // Ramp down to 0 at the end of the clip's fade-out duration
            const clipEndCtxTime = ctx.currentTime + Math.max(0, (clip.startAt + clip.duration) - fromTime);
            const fadeOutStartCtxTime = clipEndCtxTime - fadeOut;
            if (fadeOutStartCtxTime > ctx.currentTime) {
              gainNode.gain.setValueAtTime(baseVolume, fadeOutStartCtxTime);
            }
            gainNode.gain.linearRampToValueAtTime(0.0001, clipEndCtxTime);
          }
          
          // Apply voice stabilizer if enabled
          if (clip.voiceStabilizer) {
            // Add a compressor for voice stabilization
            const voiceCompressor = ctx.createDynamicsCompressor();
            voiceCompressor.threshold.setValueAtTime(-24, ctx.currentTime);
            voiceCompressor.knee.setValueAtTime(30, ctx.currentTime);
            voiceCompressor.ratio.setValueAtTime(12, ctx.currentTime);
            voiceCompressor.attack.setValueAtTime(0.003, ctx.currentTime);
            voiceCompressor.release.setValueAtTime(0.25, ctx.currentTime);
            
            // Add a high-pass filter to remove low frequency noise
            const highPass = ctx.createBiquadFilter();
            highPass.type = 'highpass';
            highPass.frequency.setValueAtTime(80, ctx.currentTime);
            highPass.Q.setValueAtTime(0.5, ctx.currentTime);
            
            // Add a low-pass filter to remove high frequency noise
            const lowPass = ctx.createBiquadFilter();
            lowPass.type = 'lowpass';
            lowPass.frequency.setValueAtTime(12000, ctx.currentTime);
            lowPass.Q.setValueAtTime(0.5, ctx.currentTime);
            
            sourceNode.connect(highPass);
            highPass.connect(lowPass);
            lowPass.connect(voiceCompressor);
            voiceCompressor.connect(gainNode);
          } else {
            sourceNode.connect(gainNode);
          }
          
          gainNode.connect(compressor);
        } catch {
          // Fallback if media elements routing fails (e.g. cross-origin issues)
          el.volume = Math.max(0, Math.min(1, clip.volume ?? 1));
        }

        const localTime = Math.max(0, fromTime - clip.startAt);
        const sourceTime = clip.sourceStart + localTime * (clip.speed || 1);
        el.currentTime = sourceTime;

        const delay = Math.max(0, clip.startAt - fromTime) / speed;
        if (delay > 0) {
          setTimeout(() => { if (isPlayingRef.current) el.play().catch(() => {}); }, delay * 1000);
        } else {
          el.play().catch(() => {});
        }

        audioEls.current.push({ el, clipId: clip.id, clip });
      }
    }
  }, [stopAllAudio, store, getAudioCtx]);

  const tick = useCallback((now: number) => {
    if (!isPlayingRef.current) return;
    const state = store.getState();
    const selectedIds = state.selectedClipIds;
    const tracks = state.project.tracks;

    let loopStart = 0;
    let loopEnd = state.project.duration;
    let isSelectedLoop = false;

    if (selectedIds && selectedIds.length > 0) {
      let minStart = Infinity;
      let maxEnd = -Infinity;
      for (const t of tracks) {
        for (const c of t.clips) {
          if (selectedIds.includes(c.id)) {
            minStart = Math.min(minStart, c.startAt);
            maxEnd = Math.max(maxEnd, c.startAt + c.duration);
          }
        }
      }
      if (minStart !== Infinity && maxEnd !== -Infinity) {
        loopStart = minStart;
        loopEnd = maxEnd;
        isSelectedLoop = true;
      }
    }

    if (!isSelectedLoop) {
      let maxContentEnd = 0;
      for (const t of tracks) {
        for (const c of t.clips) {
          maxContentEnd = Math.max(maxContentEnd, c.startAt + c.duration);
        }
      }
      if (maxContentEnd > 0) {
        loopEnd = maxContentEnd;
      }
    }

    const elapsed = (now - startWallRef.current) / 1000 * speedRef.current;
    let projectTime = startTimeRef.current + elapsed;

    if (projectTime >= loopEnd) {
      // Loop back to loopStart
      projectTime = loopStart;
      startWallRef.current = now;
      startTimeRef.current = loopStart;
      currentTimeRef.current = loopStart;
      state.setCurrentTime(loopStart);
      startAudio(loopStart);
    } else {
      currentTimeRef.current = projectTime;
      state.setCurrentTime(projectTime);
    }

    const dt = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 0;
    lastFrameRef.current = now;
    onFrame?.(currentTimeRef.current, dt);
    rAF.current = requestAnimationFrame(tick);
  }, [onFrame, store, stopAllAudio, startAudio]);

  const play = useCallback(() => {
    if (isPlayingRef.current || isStartingRef.current) return;
    const state = store.getState();
    const selectedIds = state.selectedClipIds;
    const tracks = state.project.tracks;

    let loopStart = 0;
    let loopEnd = state.project.duration;
    let isSelectedLoop = false;

    if (selectedIds && selectedIds.length > 0) {
      let minStart = Infinity;
      let maxEnd = -Infinity;
      for (const t of tracks) {
        for (const c of t.clips) {
          if (selectedIds.includes(c.id)) {
            minStart = Math.min(minStart, c.startAt);
            maxEnd = Math.max(maxEnd, c.startAt + c.duration);
          }
        }
      }
      if (minStart !== Infinity && maxEnd !== -Infinity) {
        loopStart = minStart;
        loopEnd = maxEnd;
        isSelectedLoop = true;
      }
    }

    if (!isSelectedLoop) {
      let maxContentEnd = 0;
      for (const t of tracks) {
        for (const c of t.clips) {
          maxContentEnd = Math.max(maxContentEnd, c.startAt + c.duration);
        }
      }
      if (maxContentEnd > 0) {
        loopEnd = maxContentEnd;
      }
    }

    let targetStart = currentTimeRef.current;
    if (targetStart < loopStart || targetStart >= loopEnd) {
      targetStart = loopStart;
    }

    isStartingRef.current = true;
    isPlayingRef.current = true;
    startWallRef.current = performance.now();
    startTimeRef.current = targetStart;
    currentTimeRef.current = targetStart;
    state.setCurrentTime(targetStart);
    speedRef.current = state.speed;
    durationRef.current = loopEnd;
    lastFrameRef.current = 0;
    state.setIsPlaying(true);
    startAudio(targetStart);
    rAF.current = requestAnimationFrame(tick);
    setTimeout(() => { isStartingRef.current = false; }, 100);
  }, [tick, store, startAudio]);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    if (rAF.current) cancelAnimationFrame(rAF.current);
    store.getState().setIsPlaying(false);
    stopAllAudio();
  }, [store, stopAllAudio]);

  const toggle = useCallback(() => {
    if (isPlayingRef.current) pause();
    else play();
  }, [play, pause]);

  const seek = useCallback((t: number) => {
    const state = store.getState();
    let maxContentEnd = 0;
    for (const track of state.project.tracks) {
      for (const clip of track.clips) {
        maxContentEnd = Math.max(maxContentEnd, clip.startAt + clip.duration);
      }
    }
    const maxDur = maxContentEnd > 0 ? maxContentEnd : state.project.duration;
    const clamped = Math.max(0, Math.min(t, maxDur));
    currentTimeRef.current = clamped;
    state.setCurrentTime(clamped);
    if (isPlayingRef.current) {
      startWallRef.current = performance.now();
      startTimeRef.current = clamped;
      // Re-sync audio to correct per-clip source time
      for (const { el, clip } of audioEls.current) {
        try {
          const localTime = clamped - clip.startAt;
          const sourceTime = clip.sourceStart + localTime * (clip.speed || 1);
          el.currentTime = Math.max(0, sourceTime);
        } catch {}
      }
    }
  }, [store]);

  const stop = useCallback(() => {
    pause();
    currentTimeRef.current = 0;
    store.getState().setCurrentTime(0);
  }, [pause, store]);

  useEffect(() => {
    const unsub = useEditorStore.subscribe(s => {
      speedRef.current = s.speed;
      durationRef.current = s.project.duration;
    });
    return () => {
      unsub();
      if (rAF.current) cancelAnimationFrame(rAF.current);
      stopAllAudio();
    };
  }, [stopAllAudio]);

  return {
    play, pause, toggle, seek, stop,
    isPlayingRef: () => isPlayingRef.current,
    currentTimeRef: () => currentTimeRef.current,
  };
}
