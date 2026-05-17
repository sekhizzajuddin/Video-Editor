import { useRef, useEffect, useState, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { usePlaybackEngine } from '../engine/usePlaybackEngine';
import { useMediaManager } from '../engine/useMediaManager';
import { RenderEngine } from '../engine/RenderEngine';

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
  const { project: { tracks, duration: projectDuration }, currentTime, isPlaying, aspectRatio, volume, setVolume } = useEditorStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RenderEngine | null>(null);
  const mutedRef = useRef(false);
  const [muted, setMuted] = useState(false);

  const canvasWidth = 480;
  const canvasHeight = (canvasWidth * aspectRatio.h) / aspectRatio.w;

  const { getUrl } = useMediaManager();

  const { renderTick } = useEditorStore();

  const drawFrame = useCallback((time: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const state = useEditorStore.getState();
    engine.renderFrame({ time, tracks: state.project.tracks, getMediaUrl: getUrl });
  }, [getUrl]);

  const onFrame = useCallback((time: number) => {
    drawFrame(time);
  }, [drawFrame]);

  const engine = usePlaybackEngine(onFrame);

  // Sync store.isPlaying → engine play/pause (bridges keyboard shortcuts from App.tsx)
  useEffect(() => {
    if (isPlaying) engine.play();
    else engine.pause();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(() => {
    if (!canvasRef.current) return;
    engineRef.current = new RenderEngine(canvasRef.current);
    engineRef.current.setSize(canvasWidth, canvasHeight);
    drawFrame(currentTime);
    return () => { engineRef.current?.destroy(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.setSize(canvasWidth, canvasHeight);
  }, [canvasWidth, canvasHeight]);

  // Re-render on visual property changes (renderTick) when paused
  useEffect(() => {
    if (isPlaying || !engineRef.current) return;
    drawFrame(currentTime);
  }, [renderTick, currentTime, isPlaying, drawFrame]);

  useEffect(() => {
    if (!isPlaying && engineRef.current) {
      drawFrame(currentTime);
    }
  }, [currentTime, isPlaying, drawFrame]);

  const skipBackward = () => engine.seek(Math.max(0, currentTime - 5));
  const skipForward = () => engine.seek(Math.min(projectDuration, currentTime + 5));

  const seekBar = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    engine.seek(Math.max(0, Math.min(projectDuration, ((e.clientX - rect.left) / rect.width) * projectDuration)));
  };

  const effectiveVolume = muted ? 0 : (volume ?? 1);

  return (
    <div className="preview-player">
      <div className="preview-canvas-wrap">
        <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} className="preview-canvas" />
        {!tracks.some((t) => t.visible && t.clips.length > 0) && (
          <div className="preview-placeholder">Start by importing your media</div>
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
            <button className="preview-btn" onClick={() => { setMuted(!muted); mutedRef.current = !muted; }}>{muted ? <MuteIcon /> : <VolumeIcon />}</button>
            <input
              type="range"
              className="preview-volume-slider"
              min={0}
              max={100}
              value={Math.round(effectiveVolume * 100)}
              onChange={(e) => { setVolume(parseInt(e.target.value) / 100); setMuted(false); mutedRef.current = false; }}
            />
          </div>
        </div>
      </div>
      <div className="preview-seekbar" onClick={seekBar}>
        <div className="preview-seekbar-fill" style={{ width: `${(currentTime / projectDuration) * 100}%` }} />
      </div>
    </div>
  );
}
