import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useEditorStore } from '../store/editorStore';
import { usePlaybackEngine } from '../engine/usePlaybackEngine';
import { useMediaManager } from '../engine/useMediaManager';
import { RenderEngine } from '../engine/RenderEngine';
import FullscreenIcon from './FullscreenIcon';

function SkipBackIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z"/></svg>; }
function PlayIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3l15 9-15 9V3z"/></svg>; }
function PauseIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="5" height="18" rx="1"/><rect x="14" y="3" width="5" height="18" rx="1"/></svg>; }
function SkipForwardIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13 18V6l8.5 6-8.5 6zM4.5 18V6l8.5 6-8.5 6z"/></svg>; }
function VolumeIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>; }
function MuteIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>; }

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export default function PreviewCanvas() {
  const {
    project: { tracks, duration: projectDuration, media },
    currentTime, isPlaying, aspectRatio, volume, setVolume, renderTick,
    activeClipId, updateClip, pushHistory,
  } = useEditorStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RenderEngine | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(480);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.parentElement?.getBoundingClientRect();
        if (rect) {
          const maxW = rect.width - 16;
          const maxH = rect.height - 80;
          const canvasW = Math.min(480, maxW);
          const canvasH = Math.round((canvasW * aspectRatio.h) / aspectRatio.w);
          if (canvasH > maxH) {
            const adjustedW = Math.round((maxH * aspectRatio.w) / aspectRatio.h);
            setContainerWidth(adjustedW);
          } else {
            setContainerWidth(canvasW);
          }
        }
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [aspectRatio]);

  const canvasWidth = containerWidth;
  const canvasHeight = Math.round((canvasWidth * aspectRatio.h) / aspectRatio.w);

  const { getUrl } = useMediaManager();

  const drawFrame = useCallback((time: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const state = useEditorStore.getState();
    engine.renderFrame({ time, tracks: state.project.tracks, getMediaUrl: getUrl });
  }, [getUrl]);

  const onFrame = useCallback((time: number) => { drawFrame(time); }, [drawFrame]);
  const engine = usePlaybackEngine(onFrame);

  // Locate current active selected clip
  const activeClip = useMemo(() => {
    if (!activeClipId) return null;
    for (const t of tracks) {
      const c = t.clips.find(clip => clip.id === activeClipId);
      if (c) return c;
    }
    return null;
  }, [tracks, activeClipId]);

  // Retrieve media details of the clip
  const activeMedia = useMemo(() => {
    if (!activeClip || !activeClip.mediaId) return null;
    return media.find(m => m.id === activeClip.mediaId);
  }, [activeClip, media]);

  // Snap active clip transformation coordinate space (1920x1080) to Canvas (480px width)
  const scaleFactor = canvasWidth / 1920;
  const tr = activeClip?.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
  const isVisible = activeClip && currentTime >= activeClip.startAt && currentTime < activeClip.startAt + activeClip.duration;

  const baseWidth = activeClip
    ? activeClip.trackType === 'text'
      ? 1000
      : activeClip.trackType === 'sticker'
        ? 300
        : activeMedia?.width || 1920
    : 1920;

  const baseHeight = activeClip
    ? activeClip.trackType === 'text'
      ? 200
      : activeClip.trackType === 'sticker'
        ? 300
        : activeMedia?.height || 1080
    : 1080;

  const boxWidth = baseWidth * tr.scale * scaleFactor;
  const boxHeight = baseHeight * tr.scale * scaleFactor;
  const boxLeft = canvasWidth / 2 + tr.x * scaleFactor - boxWidth / 2;
  const boxTop = canvasHeight / 2 + tr.y * scaleFactor - boxHeight / 2;

  // On-Canvas Drag-to-Move & Drag-to-Scale handlers
  const [isDragging, setIsDragging] = useState(false);
  const [isScaling, setIsScaling] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, clipX: 0, clipY: 0, clipScale: 1 });

  const handleBoxMouseDown = (e: React.MouseEvent) => {
    if (!activeClip) return;
    e.stopPropagation(); e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      clipX: tr.x,
      clipY: tr.y,
      clipScale: tr.scale
    };
  };

  const handleHandleMouseDown = (e: React.MouseEvent) => {
    if (!activeClip) return;
    e.stopPropagation(); e.preventDefault();
    setIsScaling(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      clipX: tr.x,
      clipY: tr.y,
      clipScale: tr.scale
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && activeClip) {
        const dx = e.clientX - dragStartRef.current.mouseX;
        const dy = e.clientY - dragStartRef.current.mouseY;
        updateClip(activeClip.id, {
          transform: {
            ...tr,
            x: dragStartRef.current.clipX + dx / scaleFactor,
            y: dragStartRef.current.clipY + dy / scaleFactor
          }
        });
      } else if (isScaling && activeClip) {
        const dx = e.clientX - dragStartRef.current.mouseX;
        const scaleDelta = dx / 150;
        updateClip(activeClip.id, {
          transform: {
            ...tr,
            scale: Math.max(0.1, Math.min(10, dragStartRef.current.clipScale + scaleDelta))
          }
        });
      }
    };

    const handleMouseUp = () => {
      if (isDragging || isScaling) {
        setIsDragging(false);
        setIsScaling(false);
        pushHistory();
      }
    };

    if (isDragging || isScaling) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isScaling, activeClip, tr, updateClip, pushHistory, scaleFactor]);

  // Sync isPlaying → engine + RenderEngine playback mode
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.setPlaybackMode(isPlaying);
    if (isPlaying) {
      const state = useEditorStore.getState();
      const allClips = state.project.tracks.flatMap(t => t.clips);
      engineRef.current.startLivePlayback(allClips, getUrl);
      engine.play();
    } else {
      engine.pause();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Initialize render engine
  useEffect(() => {
    if (!canvasRef.current) return;
    engineRef.current = new RenderEngine(canvasRef.current);
    engineRef.current.setSize(canvasWidth, canvasHeight);
    drawFrame(0);
    return () => { engineRef.current?.destroy(); engineRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.setSize(canvasWidth, canvasHeight);
  }, [canvasWidth, canvasHeight]);

  // Re-render when paused and time/properties change
  useEffect(() => {
    if (isPlaying || !engineRef.current) return;
    drawFrame(currentTime);
  }, [renderTick, currentTime, isPlaying, drawFrame]);

  const skipBackward = () => engine.seek(Math.max(0, currentTime - 5));
  const skipForward = () => engine.seek(Math.min(projectDuration, currentTime + 5));

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const seekBar = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    engine.seek(Math.max(0, Math.min(projectDuration, ((e.clientX - rect.left) / rect.width) * projectDuration)));
  };

  const effectiveVolume = muted ? 0 : (volume ?? 1);
  const hasContent = tracks.some(t => t.visible && t.clips.length > 0);

  return (
    <div className="preview-area">
      <div className={`preview-canvas-wrap ${isFullscreen ? 'fullscreen' : ''}`} style={{ width: canvasWidth, height: canvasHeight }}>
        <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} className="preview-canvas" />

        {/* Dynamic Bounding Box Overlay for Active Clip Manipulation */}
        {isVisible && !isPlaying && (
          <div
            className="transform-box"
            style={{
              left: boxLeft,
              top: boxTop,
              width: boxWidth,
              height: boxHeight,
              transform: `rotate(${tr.rotation}deg)`,
            }}
            onMouseDown={handleBoxMouseDown}
          >
            <div className="transform-handle top-left" onMouseDown={handleHandleMouseDown} />
            <div className="transform-handle top-right" onMouseDown={handleHandleMouseDown} />
            <div className="transform-handle bottom-left" onMouseDown={handleHandleMouseDown} />
            <div className="transform-handle bottom-right" onMouseDown={handleHandleMouseDown} />
          </div>
        )}

        {!hasContent && (
          <div className="preview-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
            <span>Import media and add to timeline</span>
          </div>
        )}
      </div>
      <div className="preview-control-bar">
        <div className="preview-control-left">
          <span className="preview-timecode">
            <span className="preview-time-current">{formatTime(currentTime)}</span>
            <span className="preview-time-sep">/</span>
            <span className="preview-time-total">{formatTime(projectDuration)}</span>
          </span>
        </div>
        <div className="preview-control-center">
          <button className="preview-btn" onClick={skipBackward} title="Skip back 5s"><SkipBackIcon /></button>
          <button className="preview-btn preview-play-btn" onClick={() => engine.toggle()} title="Play/Pause (Space)">
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="preview-btn" onClick={skipForward} title="Skip forward 5s"><SkipForwardIcon /></button>
        </div>
        <div className="preview-control-right">
          <div className="preview-volume-group">
            <button className="preview-btn" onClick={() => { setMuted(!muted); mutedRef.current = !muted; }}>
              {muted ? <MuteIcon /> : <VolumeIcon />}
            </button>
            <input type="range" className="preview-volume-slider" min={0} max={100}
              value={Math.round(effectiveVolume * 100)}
              onChange={e => { setVolume(parseInt(e.target.value) / 100); setMuted(false); mutedRef.current = false; }}
            />
          </div>
          <button className="preview-btn" onClick={toggleFullscreen} title="Fullscreen">
            <FullscreenIcon />
          </button>
        </div>
      </div>
      <div className="preview-seekbar" onClick={seekBar}>
        <div className="preview-seekbar-fill" style={{ width: `${(currentTime / Math.max(projectDuration, 0.01)) * 100}%` }} />
      </div>
    </div>
  );
}
