import { useRef, useCallback, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';

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

  const store = useEditorStore;

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
      return;
    }
    currentTimeRef.current = projectTime;
    store.getState().setCurrentTime(projectTime);
    const dt = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 0;
    lastFrameRef.current = now;
    onFrame?.(projectTime, dt);
    rAF.current = requestAnimationFrame(tick);
  }, [onFrame, store]);

  const play = useCallback(() => {
    if (isPlayingRef.current) return;
    const state = store.getState();
    if (state.currentTime >= state.project.duration) {
      store.getState().setCurrentTime(0);
      currentTimeRef.current = 0;
    }
    isPlayingRef.current = true;
    startWallRef.current = performance.now();
    startTimeRef.current = currentTimeRef.current;
    speedRef.current = state.speed;
    durationRef.current = state.project.duration;
    lastFrameRef.current = 0;
    store.getState().setIsPlaying(true);

    rAF.current = requestAnimationFrame(tick);
  }, [tick, store]);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    if (rAF.current) cancelAnimationFrame(rAF.current);
    store.getState().setIsPlaying(false);
  }, [store]);

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
    }
  }, [store]);

  const stop = useCallback(() => {
    pause();
    currentTimeRef.current = 0;
    store.getState().setCurrentTime(0);
  }, [pause, store]);

  useEffect(() => {
    const unsub = useEditorStore.subscribe((s) => {
      speedRef.current = s.speed;
      durationRef.current = s.project.duration;
    });
    return () => { unsub(); if (rAF.current) cancelAnimationFrame(rAF.current); };
  }, []);

  return {
    play, pause, toggle, seek, stop,
    isPlayingRef: () => isPlayingRef.current,
    currentTimeRef: () => currentTimeRef.current,
  };
}
