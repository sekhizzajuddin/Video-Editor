import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useTimelineMath } from '../engine/useTimelineMath';
import { useDraggableClip, detectDragZone } from '../engine/useDraggableClip';
import { formatTime } from '../utils/fileUtils';
import type { Clip, TransitionType, Marker, SpeedRampPoint } from '../types';

function formatTimeLumen(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function getTimelineRulerScale(pxPerSec: number) {
  const candidateIntervals = [
    0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300, 600
  ];
  let majorInterval = 10;
  for (const interval of candidateIntervals) {
    if (interval * pxPerSec >= 120) {
      majorInterval = interval;
      break;
    }
  }

  let subdivisions = 5;
  if (majorInterval === 0.02 || majorInterval === 0.2 || majorInterval === 2 || majorInterval === 20) {
    subdivisions = 4;
  } else if (majorInterval === 0.05 || majorInterval === 0.5 || majorInterval === 5 || majorInterval === 50) {
    subdivisions = 5;
  } else if (
    majorInterval === 0.1 || majorInterval === 1 || majorInterval === 10 ||
    majorInterval === 60 || majorInterval === 120 || majorInterval === 300 || majorInterval === 600
  ) {
    subdivisions = 10;
  }

  const minorInterval = majorInterval / subdivisions;
  const mediumInterval = subdivisions % 2 === 0 ? majorInterval / 2 : null;

  return { majorInterval, minorInterval, mediumInterval, subdivisions };
}

const TRACK_HEIGHTS: Record<string, number> = { video: 48, audio: 40, text: 36, sticker: 36, vfx: 36 };
const DEFAULT_TRACK_HEIGHT = 44;
const RULER_HEIGHT = 28;
const HEADER_WIDTH = 120;

function getTrackHeight(type: string): number { return TRACK_HEIGHTS[type] ?? DEFAULT_TRACK_HEIGHT; }

const TRACK_COLORS: Record<string, string> = { video: '#3b82f6', audio: '#22c55e', text: '#a855f7', sticker: '#f59e0b', vfx: '#c084fc' };

const Ico = {
  scissors: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>,
  zoomIn: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
  zoomOut: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
  fit: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>,
  plus: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  eye: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  lock: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  unlock: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>,
  ripple: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
  marker: <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>,
};

interface CtxMenu { x: number; y: number; clipId: string; }
interface HoverClip { id: string; mf?: { name: string; thumbnail?: string; duration?: number }; clip: Clip; }

function WaveformBars({ waveform, height, width }: { waveform: number[]; height: number; width: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!canvasRef.current || !waveform.length || width <= 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    
    const h = height;
    const centerY = h / 2;
    
    ctx.clearRect(0, 0, width, h);
    
    // Draw center line
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    const barWidth = 2;
    const barCount = Math.floor(width / barWidth);
    
    // Vocal Detection rolling window VAD
    const vocalActive = new Array(barCount).fill(false);
    for (let i = 0; i < barCount; i++) {
      const idx = Math.floor((i / barCount) * waveform.length);
      const val = Math.abs(waveform[idx] || 0);
      if (val > 0.12 && val < 0.85) {
        vocalActive[i] = true;
      }
    }
    
    const smoothedActive = [...vocalActive];
    const windowSize = 6;
    for (let i = 0; i < barCount; i++) {
      let count = 0;
      for (let w = -windowSize; w <= windowSize; w++) {
        if (vocalActive[i + w]) count++;
      }
      smoothedActive[i] = count > windowSize * 0.7;
    }
    
    for (let i = 0; i < barCount; i++) {
      const waveIndex = Math.floor((i / barCount) * waveform.length);
      const val = waveform[waveIndex] || 0;
      const absVal = Math.abs(val);
      
      const isVocal = smoothedActive[i];
      const barHeight = Math.max(2, absVal * h * 0.42);
      const x = i * barWidth;
      
      // Draw waveform line
      ctx.fillStyle = isVocal ? 'rgba(16, 185, 129, 0.8)' : 'rgba(59, 130, 246, 0.6)';
      ctx.fillRect(x + 0.4, centerY - barHeight, 1.2, barHeight * 2);
      
      // Draw peak dots
      if (absVal > 0.5) {
        ctx.fillStyle = isVocal ? 'rgba(52, 211, 153, 0.9)' : 'rgba(147, 197, 253, 0.9)';
        ctx.fillRect(x + 0.4, centerY - barHeight - 1, 1.2, 1);
        ctx.fillRect(x + 0.4, centerY + barHeight, 1.2, 1);
      }
      
      // Underline Vocal Bar at the bottom
      if (isVocal) {
        ctx.fillStyle = '#10b981';
        ctx.fillRect(x, h - 3, barWidth, 3);
      }
    }
  }, [waveform, height, width]);
  
  return (
    <canvas 
      ref={canvasRef} 
      className="clip-waveform-canvas" 
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} 
    />
  );
}

function Filmstrip({ thumbnails, clipWidth, height }: { thumbnails: string[]; clipWidth: number; height: number }) {
  if (!thumbnails.length) return null;
  const frameW = 60; const needed = Math.ceil(clipWidth / frameW) + 1;
  const frames: string[] = [];
  for (let i = 0; i < needed; i++) frames.push(thumbnails[i % thumbnails.length]);
  return (
    <div className="clip-filmstrip" style={{ height }}>
      {frames.map((src, i) => <img key={i} src={src} className="filmstrip-frame" alt="" style={{ width: frameW, height }} />)}
    </div>
  );
}

function SpeedRampOverlay({ speedRampPoints, width, height }: { speedRampPoints: SpeedRampPoint[]; width: number; height: number }) {
  if (!speedRampPoints.length || width <= 0 || height <= 0) return null;

  const sorted = [...speedRampPoints].sort((a, b) => a.time - b.time);

  // Determine the time range and speed range for normalization
  const maxTime = sorted[sorted.length - 1].time || 1;
  const speeds = sorted.map(p => p.speed);
  const minSpeed = Math.min(...speeds, 0.5);
  const maxSpeed = Math.max(...speeds, 2);
  const speedRange = maxSpeed - minSpeed || 1;

  // Convert points to SVG coordinates
  // x = normalized time → width, y = inverted speed → height (higher speed = higher on screen)
  const padding = 3;
  const drawH = height - padding * 2;
  const drawW = width - padding * 2;

  const svgPoints = sorted.map(p => ({
    x: padding + (p.time / maxTime) * drawW,
    y: padding + drawH - ((p.speed - minSpeed) / speedRange) * drawH,
    speed: p.speed,
  }));

  // Build colored segments (each pair of consecutive points)
  const segments: JSX.Element[] = [];
  for (let i = 0; i < svgPoints.length - 1; i++) {
    const a = svgPoints[i];
    const b = svgPoints[i + 1];
    const avgSpeed = (a.speed + b.speed) / 2;
    const color = avgSpeed > 1.05 ? '#22c55e' : avgSpeed < 0.95 ? '#f59e0b' : 'rgba(255,255,255,0.5)';
    segments.push(
      <line
        key={`seg-${i}`}
        x1={a.x} y1={a.y}
        x2={b.x} y2={b.y}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    );
  }

  // Baseline at speed=1 (if within range)
  const baselineY = padding + drawH - ((1 - minSpeed) / speedRange) * drawH;
  const showBaseline = minSpeed < 1 && maxSpeed > 1;

  return (
    <div className="speed-ramp-overlay" style={{ width, height }}>
      <svg width={width} height={height} className="speed-ramp-svg">
        {showBaseline && (
          <line
            x1={padding} y1={baselineY}
            x2={width - padding} y2={baselineY}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        )}
        {segments}
        {svgPoints.map((p, i) => (
          <circle
            key={`pt-${i}`}
            cx={p.x} cy={p.y} r={2}
            fill={p.speed > 1.05 ? '#22c55e' : p.speed < 0.95 ? '#f59e0b' : '#fff'}
            stroke="rgba(0,0,0,0.5)"
            strokeWidth={0.5}
          />
        ))}
      </svg>
    </div>
  );
}

function TransitionZone({ clipId, x, y, type }: { clipId: string; x: number; y: number; type?: TransitionType }) {
  const { updateClip } = useEditorStore();
  const [over, setOver] = useState(false);
  const has = type && type !== 'none';
  return (
    <div className={`tl-transition-zone ${has ? 'has' : ''} ${over ? 'drag-over' : ''}`}
      style={{ position: 'absolute', left: x - 10, top: y + 8, zIndex: 30 }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); const t = e.dataTransfer.getData('transition') as TransitionType; if (t) updateClip(clipId, { transition: { type: t, duration: 0.5 } }); }}
      onClick={() => { if (has) updateClip(clipId, { transition: { type: 'none', duration: 0.5 } }); }}
    >{has ? type!.charAt(0).toUpperCase() : '+'}</div>
  );
}

export default function Timeline() {
  const {
    project, currentTime, isPlaying, zoom,
    selectedClipIds, activeClipId, dynamicSpeedMode, snapEnabled,
    setSelectedClipIds, setActiveClipId, setCurrentTime,
    updateClip, updateTrack, addClip, addTrack, removeClip, removeTrack,
    setZoom, rippleDelete, setRippleDelete, setSnapEnabled, setDynamicSpeedMode, splitClip, pushHistory, removeSelectedClips,
  } = useEditorStore();

  const { tracks, media } = project;

  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tracksRef.current) tracksRef.current.scrollLeft = 0;
    if (rulerRef.current) rulerRef.current.scrollLeft = 0;
  }, [project.id]);
  const headersRef = useRef<HTMLDivElement>(null);
  const activeDragRef = useRef<'none' | 'move' | 'trim-start' | 'trim-end'>('none');
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [hoverClip, setHoverClip] = useState<HoverClip | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const selectStartRef = useRef({ x: 0, y: 0 });

  const projectDuration = useMemo(() => {
    let max = 30;
    for (const t of tracks) for (const c of t.clips) max = Math.max(max, c.startAt + c.duration);
    return max + 10;
  }, [tracks]);

  const { scale, pixelsToTime } = useTimelineMath(tracks, zoom, projectDuration);
  const { pxPerSec } = scale;
  const totalWidth = Math.max(projectDuration * pxPerSec + 160, 800);
  const totalTracksH = useMemo(() => tracks.reduce((sum, t) => sum + getTrackHeight(t.type), 0), [tracks]);

  const { snapLine, onDragStart, onDragMove, onDragEnd } = useDraggableClip(pxPerSec, DEFAULT_TRACK_HEIGHT);

  const onTracksScroll = useCallback(() => {
    if (rulerRef.current && tracksRef.current) rulerRef.current.scrollLeft = tracksRef.current.scrollLeft;
    if (headersRef.current && tracksRef.current) headersRef.current.scrollTop = tracksRef.current.scrollTop;
  }, []);

  const onWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) { 
      e.preventDefault();
      const rect = tracksRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left + (tracksRef.current?.scrollLeft || 0);
        const mouseTime = mouseX / pxPerSec;
        
        const newZoom = Math.max(0.05, Math.min(5, zoom + (e.deltaY > 0 ? -0.1 : 0.1)));
        const newPxPerSec = 30 + newZoom * 270;
        const newMouseTime = mouseX / newPxPerSec;
        
        setZoom(newZoom);
        
        // Adjust scroll to keep cursor position stable
        if (tracksRef.current) {
          const scrollLeft = tracksRef.current.scrollLeft;
          tracksRef.current.scrollLeft = newMouseTime * newPxPerSec - mouseX + (scrollLeft - mouseTime * pxPerSec);
        }
      }
    }
    else if (e.shiftKey) { e.preventDefault(); if (tracksRef.current) tracksRef.current.scrollLeft += e.deltaY; }
  }, [zoom, setZoom, pxPerSec]);

  useEffect(() => { const el = tracksRef.current; if (!el) return; el.addEventListener('wheel', onWheel, { passive: false }); return () => el.removeEventListener('wheel', onWheel); }, [onWheel]);

  const fitToScreen = useCallback(() => {
    if (!tracksRef.current) return;
    const clientW = tracksRef.current.clientWidth - HEADER_WIDTH;
    setZoom(Math.max(0.05, Math.min(5, clientW / projectDuration / 100)));
  }, [projectDuration, setZoom]);

  useEffect(() => {
    if (!isPlaying || !tracksRef.current) return;
    const el = tracksRef.current; const px = currentTime * pxPerSec;
    if (px < el.scrollLeft || px > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = px - el.clientWidth / 3;
  }, [currentTime, isPlaying, pxPerSec]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (activeDragRef.current !== 'none') { const top = tracksRef.current?.getBoundingClientRect().top ?? 0; onDragMove(e.clientX, e.clientY, top); } };
    const onUp = () => { if (activeDragRef.current !== 'none') { onDragEnd(); activeDragRef.current = 'none'; } };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [onDragMove, onDragEnd]);

  useEffect(() => { const h = () => setCtxMenu(null); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isSelecting || !tracksRef.current) return;
      const rect = tracksRef.current.getBoundingClientRect();
      const x = Math.max(0, e.clientX - rect.left + tracksRef.current.scrollLeft);
      const y = Math.max(0, e.clientY - rect.top + tracksRef.current.scrollTop);
      setSelectionBox({ x: Math.min(selectStartRef.current.x, x), y: Math.min(selectStartRef.current.y, y), w: Math.abs(x - selectStartRef.current.x), h: Math.abs(y - selectStartRef.current.y) });
    };
    const handleMouseUp = () => {
      if (!isSelecting || !selectionBox) { setIsSelecting(false); setSelectionBox(null); return; }
      const selected: string[] = []; let trackTopOffset = 0;
      tracks.forEach((track, _) => {
        const trackH = getTrackHeight(track.type);
        if (selectionBox.y < trackTopOffset + trackH && selectionBox.y + selectionBox.h > trackTopOffset) {
          track.clips.forEach(clip => {
            const clipLeft = clip.startAt * pxPerSec; const clipRight = clipLeft + clip.duration * pxPerSec;
            if (selectionBox.x < clipRight && selectionBox.x + selectionBox.w > clipLeft) selected.push(clip.id);
          });
        }
        trackTopOffset += trackH;
      });
      if (selected.length > 0) { setSelectedClipIds(selected); setActiveClipId(selected[0]); }
      setIsSelecting(false); setSelectionBox(null);
    };
    if (isSelecting) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isSelecting, selectionBox, tracks, pxPerSec, setSelectedClipIds, setActiveClipId]);

  const rulerMarks = useMemo(() => {
    const { majorInterval, minorInterval, mediumInterval } = getTimelineRulerScale(pxPerSec);
    const marks: { t: number; type: 'major' | 'medium' | 'minor'; showLabel: boolean }[] = [];
    
    const step = minorInterval;
    for (let t = 0; t <= projectDuration + majorInterval; t += step) {
      const tRounded = parseFloat(t.toFixed(3));
      
      const isMajor = Math.abs(tRounded % majorInterval) < step / 2 || Math.abs((tRounded % majorInterval) - majorInterval) < step / 2;
      
      let isMedium = false;
      if (!isMajor && mediumInterval !== null) {
        isMedium = Math.abs(tRounded % mediumInterval) < step / 2 || Math.abs((tRounded % mediumInterval) - mediumInterval) < step / 2;
      }
      
      const type = isMajor ? 'major' : isMedium ? 'medium' : 'minor';
      const showLabel = isMajor;
      
      marks.push({
        t: tRounded,
        type,
        showLabel,
      });
    }
    return marks;
  }, [projectDuration, pxPerSec]);

  // Draggable playhead
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const playheadDragRef = useRef(false);
  const rulerDragRef = useRef(false);
  const pxPerSecRef = useRef(pxPerSec);
  const projectDurationRef = useRef(projectDuration);
  const setCurrentTimeRef = useRef(setCurrentTime);
  
  useEffect(() => { pxPerSecRef.current = pxPerSec; }, [pxPerSec]);
  useEffect(() => { projectDurationRef.current = projectDuration; }, [projectDuration]);
  useEffect(() => { setCurrentTimeRef.current = setCurrentTime; }, [setCurrentTime]);

  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    playheadDragRef.current = true;
    setIsDraggingPlayhead(true);
    const store = useEditorStore.getState();
    store.setIsPlaying(false);
  }, []);

  const handleRulerMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.tl-marker')) return;
    e.preventDefault();
    rulerDragRef.current = true;
    const store = useEditorStore.getState();
    store.setIsPlaying(false);
    
    if (tracksRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left + tracksRef.current.scrollLeft;
      const time = Math.max(0, Math.min(x / pxPerSec, projectDuration));
      setCurrentTime(time);
    }
  }, [pxPerSec, projectDuration, setCurrentTime]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (playheadDragRef.current && tracksRef.current) {
        const rect = tracksRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + tracksRef.current.scrollLeft;
        const time = Math.max(0, Math.min(x / pxPerSecRef.current, projectDurationRef.current));
        setCurrentTimeRef.current(time);
      } else if (rulerDragRef.current && rulerRef.current && tracksRef.current) {
        const rect = rulerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + tracksRef.current.scrollLeft;
        const time = Math.max(0, Math.min(x / pxPerSecRef.current, projectDurationRef.current));
        setCurrentTimeRef.current(time);
      }
    };
    const onUp = () => {
      if (playheadDragRef.current) {
        playheadDragRef.current = false;
        setIsDraggingPlayhead(false);
      }
      if (rulerDragRef.current) {
        rulerDragRef.current = false;
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const lastClickedClipRef = useRef<string | null>(null);

  const onClipMouseDown = useCallback((e: React.MouseEvent, clip: Clip) => {
    if (e.button !== 0) return; e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    
    // Shift+Click: Range select from last clicked to current
    if (e.shiftKey && lastClickedClipRef.current) {
      // Find all clips between last clicked and current
      const allClips: { id: string; startAt: number }[] = [];
      tracks.forEach(t => {
        t.clips.forEach(c => allClips.push({ id: c.id, startAt: c.startAt }));
      });
      allClips.sort((a, b) => a.startAt - b.startAt);
      
      const lastIdx = allClips.findIndex(c => c.id === lastClickedClipRef.current);
      const currIdx = allClips.findIndex(c => c.id === clip.id);
      
      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        const rangeIds = allClips.slice(start, end + 1).map(c => c.id);
        setSelectedClipIds([...new Set([...selectedClipIds, ...rangeIds])]);
        setActiveClipId(clip.id);
      }
      return;
    }
    
    // Ctrl/Cmd+Click: Toggle selection
    if (e.ctrlKey || e.metaKey) {
      if (selectedClipIds.includes(clip.id)) {
        setSelectedClipIds(selectedClipIds.filter(x => x !== clip.id));
        if (activeClipId === clip.id) setActiveClipId(selectedClipIds.length > 1 ? selectedClipIds.find(id => id !== clip.id) || null : null);
      } else {
        setSelectedClipIds([...selectedClipIds, clip.id]);
        setActiveClipId(clip.id);
      }
      lastClickedClipRef.current = clip.id;
      return;
    }
    
    // Normal click: Select single clip and start drag
    if (!selectedClipIds.includes(clip.id)) { setSelectedClipIds([clip.id]); setActiveClipId(clip.id); }
    lastClickedClipRef.current = clip.id;
    const zone = detectDragZone(e.clientX, rect);
    activeDragRef.current = zone; onDragStart(clip, zone, e.clientX, e.clientY);
  }, [selectedClipIds, setSelectedClipIds, setActiveClipId, onDragStart, tracks]);

  const handleContextMenu = (e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    if (!selectedClipIds.includes(clipId)) { setSelectedClipIds([clipId]); setActiveClipId(clipId); }
    setCtxMenu({ x: e.clientX, y: e.clientY, clipId });
  };

  // Handle trim start - initiate trim operation from trim handles
  const handleTrimStart = useCallback((e: React.MouseEvent, clip: Clip, zone: 'trim-start' | 'trim-end') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!selectedClipIds.includes(clip.id)) { setSelectedClipIds([clip.id]); setActiveClipId(clip.id); }
    activeDragRef.current = zone;
    onDragStart(clip, zone, e.clientX, e.clientY);
  }, [selectedClipIds, setSelectedClipIds, setActiveClipId, onDragStart]);

  const ctxAction = (action: string) => {
    if (!ctxMenu) return; const store = useEditorStore.getState();
    if (action === 'delete') { pushHistory(); removeClip(ctxMenu.clipId); }
    else if (action === 'split') { pushHistory(); splitClip(ctxMenu.clipId, currentTime); }
    else if (action === 'copy') { const c = store.getClip(ctxMenu.clipId); if (c) store.setCopiedClip(JSON.parse(JSON.stringify(c))); }
    else if (action === 'duplicate') { const c = store.getClip(ctxMenu.clipId); if (c) { const nc = store.addClip(c.trackType, c.mediaId, c.sticker); if (nc) store.updateClip(nc.id, { ...c, id: nc.id, startAt: c.startAt + c.duration }); } }
    else if (action === 'freeze') { const c = store.getClip(ctxMenu.clipId); if (c) store.updateClip(c.id, { speed: 0 }); }
    else if (action === 'reverse') { const c = store.getClip(ctxMenu.clipId); if (c) store.updateClip(c.id, { speed: -(c.speed || 1) }); }
    else if (action === 'detachAudio') { const c = store.getClip(ctxMenu.clipId); if (c && c.mediaId && c.trackType === 'video') { pushHistory(); const ac = store.addClip('audio', c.mediaId); if (ac) { store.updateClip(ac.id, { startAt: c.startAt, duration: c.duration, sourceStart: c.sourceStart }); store.updateClip(c.id, { muted: true }); } } }
    setCtxMenu(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); const mediaId = e.dataTransfer.getData('text/plain'); if (!mediaId) return;
    const mf = media.find(m => m.id === mediaId); if (!mf) return;
    const rect = tracksRef.current?.getBoundingClientRect(); if (!rect) return;
    const x = e.clientX - rect.left + (tracksRef.current?.scrollLeft ?? 0);
    const y = e.clientY - rect.top; const time = Math.max(0, pixelsToTime(x));
    let trackTopOffset = 0; let targetTrackIndex = -1;
    for (let i = 0; i < tracks.length; i++) { const trackH = getTrackHeight(tracks[i].type); if (y >= trackTopOffset && y < trackTopOffset + trackH) { targetTrackIndex = i; break; } trackTopOffset += trackH; }
    if (targetTrackIndex === -1) targetTrackIndex = tracks.length - 1;
    const track = tracks[targetTrackIndex]; if (!track) return;
    const targetType: 'video' | 'audio' = mf.type === 'audio' ? 'audio' : 'video';
    if (track.type !== targetType) return;
    const clip = addClip(targetType, mediaId);
    if (clip) { updateClip(clip.id, { startAt: time }); if (mf.duration) updateClip(clip.id, { duration: mf.duration }); }
  };

  const handleSplit = () => { const id = activeClipId || selectedClipIds[0]; if (id) { pushHistory(); splitClip(id, currentTime); } };
  const handleDelete = () => { if (selectedClipIds.length) { pushHistory(); removeSelectedClips(); } };
  
  // AI Video Editing Features
  const handleDetectScenes = () => {
    // Add scene markers at regular intervals for AI video editing
    const store = useEditorStore.getState();
    const duration = store.project.duration;
    const interval = 5; // Detect scenes every 5 seconds
    for (let t = 0; t < duration; t += interval) {
      store.toggleMarker(t);
    }
  };
  
  const handleAddSyncMarker = () => {
    // Add a sync marker at current time for lip sync alignment
    useEditorStore.getState().toggleMarker(currentTime);
  };
  
  const handleApplyToSelected = () => {
    // Apply current clip settings to all selected clips
    const store = useEditorStore.getState();
    const activeClip = store.getClip(activeClipId || '');
    if (!activeClip || selectedClipIds.length <= 1) return;
    
    selectedClipIds.forEach(id => {
      if (id !== activeClipId) {
        store.updateClip(id, {
          speed: activeClip.speed,
          volume: activeClip.volume,
          preservePitch: activeClip.preservePitch,
          voiceStabilizer: activeClip.voiceStabilizer,
          filters: activeClip.filters,
        });
      }
    });
  };

  const clipCount = useMemo(() => tracks.reduce((sum, t) => sum + t.clips.length, 0), [tracks]);

  return (
    <section className="timeline-section">
      <div className="timeline-toolbar">
        <div className="timeline-toolbar-left">
          <button className="tl-btn" onClick={handleSplit} title="Split (S)">{Ico.scissors} Split</button>
          <button className="tl-btn" onClick={handleDelete} title="Delete (Del)">{Ico.trash} Delete</button>
          <div className="toolbar-sep" />
          <button className={`tl-btn ${rippleDelete ? 'active' : ''}`} onClick={() => setRippleDelete(!rippleDelete)} title="Ripple delete (Ctrl+Shift+R)">{Ico.ripple}</button>
          <button className={`tl-btn ${snapEnabled ? 'active' : ''}`} onClick={() => setSnapEnabled(!snapEnabled)} title="Toggle snap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 14h-5v5M21 3l-5 5M3 21l5-5M3 10h5v5"/></svg>
            Snap
          </button>
          <button className="tl-btn" onClick={() => useEditorStore.getState().toggleMarker(currentTime)} title="Marker (M)">{Ico.marker}</button>
          <div className="toolbar-sep" />
          <button className={`tl-btn ${dynamicSpeedMode ? 'active dynamic-speed' : ''}`} onClick={() => setDynamicSpeedMode(!dynamicSpeedMode)} title="Dynamic Speed Mode - Drag clip borders to change speed for lip sync">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            Speed
          </button>
          <div className="toolbar-sep" />
          <button className="tl-btn" onClick={handleDetectScenes} title="Auto-detect scenes and add markers">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/></svg>
            Scenes
          </button>
          <button className="tl-btn" onClick={handleAddSyncMarker} title="Add sync marker at playhead for lip sync">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Sync
          </button>
          <button className="tl-btn" onClick={handleApplyToSelected} title="Apply active clip settings to all selected clips">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.91 4.895 3 6 3h8c1.105 0 2 .911 2 2.036v1.866m-6 .17h8c1.105 0 2 .91 2 2.035v10.857C20 21.09 19.105 22 18 22h-8c-1.105 0-2-.911-2-2.036V9.107c0-1.124.895-2.036 2-2.036z"/></svg>
            Apply
          </button>
          <div className="toolbar-sep" />
          <button className="tl-btn" onClick={() => addTrack('video')} title="Add Video track">{Ico.plus} V</button>
          <button className="tl-btn" onClick={() => addTrack('audio')} title="Add Audio track">{Ico.plus} A</button>
          <button className="tl-btn" onClick={() => addTrack('text')} title="Add Text track">{Ico.plus} T</button>
          <button className="tl-btn" onClick={() => addTrack('vfx')} title="Add VFX track">{Ico.plus} VFX</button>
        </div>
        <div className="timeline-toolbar-center">
          <span className="tl-hint">SPACE play · S split · DEL remove · M marker · Ctrl+Scroll zoom · Shift+Scroll pan</span>
        </div>
        <div className="timeline-toolbar-right">
          <button className="tl-btn" onClick={fitToScreen} title="Fit">{Ico.fit}</button>
          <div className="toolbar-sep" />
          <button className="tl-btn" onClick={() => setZoom(Math.max(0.05, zoom - 0.15))}>{Ico.zoomOut}</button>
          <input type="range" className="timeline-zoom-slider" min={0.05} max={5} step={0.05} value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} />
          <button className="tl-btn" onClick={() => setZoom(Math.min(5, zoom + 0.15))}>{Ico.zoomIn}</button>
          <span className="timeline-zoom-label">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      <div className="tl-body">
        <div className="tl-ruler-row">
          <div className="tl-corner" style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH }} />
          <div className="tl-ruler-scroll" ref={rulerRef}>
            <div style={{ width: totalWidth, height: RULER_HEIGHT, position: 'relative' }} onMouseDown={handleRulerMouseDown} className="tl-ruler-inner">
              {rulerMarks.map((m, i) => (
                <div key={i} className={`ruler-mark ${m.type}`} style={{ left: m.t * pxPerSec }}>
                  {m.showLabel && <span className="ruler-label">{formatTimeLumen(m.t)}</span>}
                </div>
              ))}
              {project.markers.map((marker: Marker) => (
                <div key={marker.id} className="tl-marker" style={{ left: marker.time * pxPerSec }} title={marker.label} onClick={e => { e.stopPropagation(); setCurrentTime(marker.time); }}>
                  <div className="tl-marker-flag" style={{ background: marker.color }} />
                </div>
              ))}
              <div className="playhead-triangle" style={{ left: currentTime * pxPerSec, pointerEvents: 'auto', cursor: 'ew-resize' }} onMouseDown={handlePlayheadMouseDown} />
            </div>
          </div>
        </div>

        <div className="tl-tracks-row">
          <div className="tl-headers-col" ref={headersRef} style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH }}>
            {tracks.map(t => {
              const trackH = getTrackHeight(t.type);
              return (
                <div key={t.id} className="tl-track-header" style={{ height: trackH }}>
                  <div className="track-dot" style={{ background: TRACK_COLORS[t.type] || '#666' }} />
                  <div className="track-header-content">
                    <span className="track-name">{t.name}</span>
                    <span className="track-type-badge">{t.type}</span>
                  </div>
                  <div className="track-header-actions">
                    <button className="track-icon-btn" title={t.visible ? 'Hide' : 'Show'} onClick={() => updateTrack(t.id, { visible: !t.visible })}>{t.visible ? Ico.eye : Ico.eyeOff}</button>
                    <button className="track-icon-btn" title={t.locked ? 'Unlock' : 'Lock'} onClick={() => updateTrack(t.id, { locked: !t.locked })}>{t.locked ? Ico.lock : Ico.unlock}</button>
                    <button className="track-icon-btn track-del-btn" title="Remove track" onClick={() => removeTrack(t.id)}>×</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="tl-clips-scroll" ref={tracksRef} onScroll={onTracksScroll}
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onMouseDown={e => {
              const target = e.target as HTMLElement;
              if (e.button === 0 && !target.closest('.timeline-clip') && !target.closest('.tl-transition-zone')) {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                selectStartRef.current = { x: e.clientX - rect.left + tracksRef.current!.scrollLeft, y: e.clientY - rect.top + tracksRef.current!.scrollTop };
                setIsSelecting(true);
                if (!e.shiftKey && !e.ctrlKey) { setSelectedClipIds([]); setActiveClipId(null); }
              }
            }}>

            <div style={{ width: totalWidth, height: totalTracksH, position: 'relative' }}>
              {(() => {
                let trackTopOffset = 0;
                return tracks.map((t, i) => {
                  const trackH = getTrackHeight(t.type);
                  const row = <div key={`bg-${t.id}`} className={`tl-row-bg ${i % 2 ? 'alt' : ''} ${t.locked ? 'locked' : ''}`} style={{ top: trackTopOffset, height: trackH }} />;
                  trackTopOffset += trackH; return row;
                });
              })()}

              {selectionBox && <div className="tl-selection-box" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.w, height: selectionBox.h }} />}

              {(() => {
                let trackTopOffset = 0;
                return tracks.map((track, _) => {
                  const trackH = getTrackHeight(track.type);
                  const top = trackTopOffset + 2; const h = trackH - 4;
                  trackTopOffset += trackH;
                  return track.clips.map(clip => {
                    const left = clip.startAt * pxPerSec;
                    const width = Math.max(6, clip.duration * pxPerSec);
                    const sel = selectedClipIds.includes(clip.id);
                    const mf = media.find(m => m.id === clip.mediaId);
                    return (
                      <div key={clip.id} id={`clip-${clip.id}`}
                        className={`timeline-clip clip-${clip.trackType} ${sel ? 'selected' : ''} ${!track.visible ? 'hidden-clip' : ''}`}
                        style={{ left, width, top, height: h }}
                        onMouseDown={e => onClipMouseDown(e, clip)}
                        onContextMenu={e => handleContextMenu(e, clip.id)}
                        onMouseEnter={() => setHoverClip({ id: clip.id, mf, clip })}
                        onMouseLeave={() => setHoverClip(null)}>
                        {clip.trackType === 'video' && mf?.thumbnails?.length ? <Filmstrip thumbnails={mf.thumbnails} clipWidth={width} height={h} /> : null}
                        {(clip.trackType === 'audio' || (clip.trackType === 'video' && mf?.waveform?.length)) && mf?.waveform?.length ? <WaveformBars waveform={mf.waveform} height={h} width={width} /> : null}
                        {clip.textOverlay && <div className="clip-text-label">{clip.textOverlay.text}</div>}
                        {clip.sticker && <div className="clip-sticker-label">{clip.sticker}</div>}
                        {clip.vfxOverlay && <div className="clip-label" style={{ fontSize: 9 }}>✦ {clip.vfxOverlay.type}</div>}
                        <div className="clip-overlay">
                          <span className="clip-label">
                            {clip.trackType === 'video' || clip.trackType === 'audio'
                              ? (mf?.name?.replace(/\.[^.]+$/, '') || 'Media Clip')
                              : clip.trackType === 'text'
                                ? 'Text'
                                : clip.trackType === 'sticker'
                                  ? 'Sticker'
                                  : clip.trackType === 'vfx'
                                    ? 'VFX'
                                    : 'Clip'}
                          </span>
                          <span className="clip-duration-label">{clip.duration.toFixed(1)}s</span>
                        </div>
                        {dynamicSpeedMode && clip.speed !== 1 && (
                          <span className="clip-speed-indicator">{clip.speed.toFixed(2)}x</span>
                        )}
                        {dynamicSpeedMode && clip.speedRampPoints && clip.speedRampPoints.length >= 2 && (
                          <SpeedRampOverlay speedRampPoints={clip.speedRampPoints} width={width} height={h} />
                        )}
                        <div 
                          className="trim-handle left" 
                          onMouseDown={(e) => { e.stopPropagation(); handleTrimStart(e, clip, 'trim-start'); }}
                          title="Trim start"
                        />
                        <div 
                          className="trim-handle right" 
                          onMouseDown={(e) => { e.stopPropagation(); handleTrimStart(e, clip, 'trim-end'); }}
                          title="Trim end"
                        />
                      </div>
                    );
                  });
                });
              })()}

              {(() => {
                let trackTopOffset = 0;
                return tracks.map((track, _) => {
                  const trackH = getTrackHeight(track.type);
                  const y = trackTopOffset; trackTopOffset += trackH;
                  const sorted = [...track.clips].sort((a, b) => a.startAt - b.startAt);
                  return sorted.slice(0, -1).map((a, ci) => {
                    const b = sorted[ci + 1];
                    if (b.startAt - (a.startAt + a.duration) < 0.6) {
                      return <TransitionZone key={`tz-${a.id}`} clipId={a.id} x={(a.startAt + a.duration) * pxPerSec} y={y} type={a.transition?.type} />;
                    }
                    return null;
                  });
                });
              })()}

              <div className={`playhead ${isDraggingPlayhead ? 'dragging' : ''}`}
                style={{ left: currentTime * pxPerSec, height: totalTracksH }}
                onMouseDown={handlePlayheadMouseDown} />
              {snapLine !== null && <div className="snap-line" style={{ left: snapLine }} />}
            </div>
          </div>
        </div>
      </div>

      {ctxMenu && (
        <div className="context-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <div className="context-item" onClick={() => ctxAction('copy')}>Copy</div>
          <div className="context-item" onClick={() => ctxAction('duplicate')}>Duplicate</div>
          <div className="context-item" onClick={() => ctxAction('split')}>Split at playhead</div>
          <div className="context-separator" />
          <div className="context-item" onClick={() => ctxAction('freeze')}>Freeze frame</div>
          <div className="context-item" onClick={() => ctxAction('reverse')}>Reverse</div>
          <div className="context-item" onClick={() => ctxAction('detachAudio')}>Detach audio</div>
          <div className="context-separator" />
          <div className="context-item context-danger" onClick={() => ctxAction('delete')}>Delete</div>
        </div>
      )}

      {hoverClip && hoverClip.mf?.thumbnail && (
        <div className="tl-hover-preview" style={{ left: 100, top: -70 }}>
          <img src={hoverClip.mf.thumbnail} alt="" />
          <div className="tl-hover-info">
            <span className="tl-hover-name">{hoverClip.mf.name.replace(/\.[^.]+$/, '')}</span>
            <span className="tl-hover-dur">{hoverClip.clip.duration.toFixed(1)}s</span>
          </div>
        </div>
      )}

      <div className="tl-status-bar">
        <span className="tl-status-item">{tracks.length} tracks</span>
        <span className="tl-status-sep">·</span>
        <span className="tl-status-item">{clipCount} clips</span>
        <span className="tl-status-sep">·</span>
        <span className="tl-status-item">{formatTime(currentTime)} / {formatTime(projectDuration)}</span>
        <span className="tl-status-sep">·</span>
        <span className="tl-status-item">{Math.round(zoom * 100)}%</span>
        {rippleDelete && <span className="tl-status-badge">RIPPLE</span>}
      </div>
    </section>
  );
}
