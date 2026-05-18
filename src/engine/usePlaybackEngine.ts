import { useRef, useCallback, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getMediaUrl } from './useMediaManager';

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
  const audioEls = useRef<{ el: HTMLAudioElement; clipId: string }[]>([]);
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
        const isAudio = track.type === 'audio';
        const isVideo = track.type === 'video';
        if (!isAudio && !isVideo) continue;

        const clipEnd = clip.startAt + clip.duration;
        if (fromTime >= clipEnd + 0.05) continue;
        if (fromTime < clip.startAt - 0.05) {
          if (clip.startAt > fromTime + 0.5) continue;
        }

        const url = getMediaUrl(clip.mediaId);
        if (!url) continue;

        const el = document.createElement('audio');
        el.src = url;
        el.crossOrigin = 'anonymous'; // Avoid Web Audio CORS issues
        el.playbackRate = speed * (clip.speed || 1);
        el.muted = clip.muted;
        el.preload = 'auto';

        // Bind HTML5 audio element output to centralized Web Audio Mixer nodes
        try {
          const sourceNode = ctx.createMediaElementSource(el);
          const gainNode = ctx.createGain();
          gainNode.gain.setValueAtTime(Math.max(0, Math.min(2, clip.volume ?? 1)), ctx.currentTime);
          sourceNode.connect(gainNode);
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

        audioEls.current.push({ el, clipId: clip.id });
      }
    }
  }, [stopAllAudio, store, getAudioCtx]);

  const tick = useCallback((now: number) => {
    if (!isPlayingRef.current) return;
    const elapsed = (now - startWallRef.current) / 1000 * speedRef.current;
    let projectTime = startTimeRef.current + elapsed;
    if (projectTime >= durationRef.current) {
      projectTime = durationRef.current;
      isPlayingRef.current = false;
      store.getState().setCurrentTime(projectTime);
      store.getState().setIsPlaying(false);
      if (rAF.current) cancelAnimationFrame(rAF.current);
      stopAllAudio();
      return;
    }
    currentTimeRef.current = projectTime;
    store.getState().setCurrentTime(projectTime);
    const dt = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 0;
    lastFrameRef.current = now;
    onFrame?.(projectTime, dt);
    rAF.current = requestAnimationFrame(tick);
  }, [onFrame, store, stopAllAudio]);

  const play = useCallback(() => {
    if (isPlayingRef.current || isStartingRef.current) return;
    const state = store.getState();
    if (state.currentTime >= state.project.duration) {
      store.getState().setCurrentTime(0);
      currentTimeRef.current = 0;
    }
    isStartingRef.current = true;
    isPlayingRef.current = true;
    startWallRef.current = performance.now();
    startTimeRef.current = currentTimeRef.current;
    speedRef.current = state.speed;
    durationRef.current = state.project.duration;
    lastFrameRef.current = 0;
    store.getState().setIsPlaying(true);
    startAudio(currentTimeRef.current);
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
    const clamped = Math.max(0, Math.min(t, store.getState().project.duration));
    currentTimeRef.current = clamped;
    store.getState().setCurrentTime(clamped);
    if (isPlayingRef.current) {
      startWallRef.current = performance.now();
      startTimeRef.current = clamped;
      // Re-sync audio
      for (const { el } of audioEls.current) {
        try { el.currentTime = clamped; } catch {}
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
