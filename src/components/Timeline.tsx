import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useTimelineMath } from '../engine/useTimelineMath';
import { useDraggableClip, detectDragZone } from '../engine/useDraggableClip';
import { formatTime } from '../utils/fileUtils';
import type { Clip, TransitionType, Marker } from '../types';

const TRACK_HEIGHTS: Record<string, number> = {
  video: 64,
  audio: 48,
  text: 40,
  sticker: 40,
};
const DEFAULT_TRACK_HEIGHT = 56;
const RULER_HEIGHT = 28;
const HEADER_WIDTH = 120;

function getTrackHeight(type: string): number {
  return TRACK_HEIGHTS[type] ?? DEFAULT_TRACK_HEIGHT;
}

const TRACK_COLORS: Record<string, string> = {
  video: '#3b82f6', audio: '#22c55e', text: '#a855f7', sticker: '#f59e0b',
};

/** Amplitude → waveform bar colour: vocals=pink/coral, loud=orange, medium=blue, quiet=dim */
function waveColor(amp: number, isVocal: boolean): string {
  if (isVocal) return '#f43f5e';     // bright rose for vocal presence!
  if (amp > 0.72) return '#f59e0b';  // loud
  if (amp > 0.42) return '#60a5fa';  // medium
  return 'rgba(96,165,250,0.35)';    // quiet / background
}

// ─── SVG icons ────────────────────────────────────────────────────
const Ico = {
  scissors: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
  trash:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>,
  zoomIn:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
  zoomOut:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
  fit:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>,
  plus:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  eye:      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  lock:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  unlock:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>,
  ripple:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
  solo:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  marker:   <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>,
};

interface CtxMenu { x: number; y: number; clipId: string; }

interface HoverClip { id: string; mf?: { name: string; thumbnail?: string; duration?: number }; clip: Clip; }

// ─── Waveform bars component ──────────────────────────────────────
function WaveformBars({ waveform, height }: { waveform: number[]; height: number }) {
  return (
    <div className="clip-waveform" style={{ height }}>
      {waveform.map((val, i) => {
        const amp = Math.abs(val);
        const isVocal = val < 0;
        return (
          <div key={i} className="waveform-bar"
            style={{ height: `${Math.max(4, amp * 92)}%`, background: waveColor(amp, isVocal) }} />
        );
      })}
    </div>
  );
}

// ─── Filmstrip component ──────────────────────────────────────────
function Filmstrip({ thumbnails, clipWidth, height }: { thumbnails: string[]; clipWidth: number; height: number }) {
  if (!thumbnails.length) return null;
  // Repeat thumbnails to fill clip width
  const frameW = 80; const needed = Math.ceil(clipWidth / frameW) + 1;
  const frames: string[] = [];
  for (let i = 0; i < needed; i++) frames.push(thumbnails[i % thumbnails.length]);
  return (
    <div className="clip-filmstrip" style={{ height }}>
      {frames.map((src, i) => <img key={i} src={src} className="filmstrip-frame" alt="" style={{ width: frameW, height }} />)}
    </div>
  );
}

// ─── Transition zone button ───────────────────────────────────────
function TransitionZone({ clipId, x, y, type }: { clipId: string; x: number; y: number; type?: TransitionType }) {
  const { updateClip } = useEditorStore();
  const [over, setOver] = useState(false);
  const has = type && type !== 'none';

  return (
    <div
      className={`tl-transition-zone ${has ? 'has' : ''} ${over ? 'drag-over' : ''}`}
      style={{ position: 'absolute', left: x - 12, top: y + 14, zIndex: 30 }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault(); e.stopPropagation(); setOver(false);
        const t = e.dataTransfer.getData('transition') as TransitionType;
        if (t) updateClip(clipId, { transition: { type: t, duration: 0.5 } });
      }}
      title={has ? `Transition: ${type} (click to remove)` : 'Drop a transition here'}
      onClick={() => { if (has) updateClip(clipId, { transition: { type: 'none', duration: 0.5 } }); }}
    >
      {has ? type!.charAt(0).toUpperCase() : '+'}
    </div>
  );
}

// ─── Main Timeline ────────────────────────────────────────────────
export default function Timeline() {
  const {
    project: { tracks, media },
    currentTime, isPlaying, zoom,
    selectedClipIds, activeClipId,
    setSelectedClipIds, setActiveClipId, setCurrentTime,
    updateClip, updateTrack, addClip, addTrack, removeClip, removeTrack,
    setZoom, rippleDelete, setRippleDelete,
    splitClip, pushHistory, removeSelectedClips,
  } = useEditorStore();

  const rulerRef  = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);
  const activeDragRef = useRef<'none' | 'move' | 'trim-start' | 'trim-end'>('none');
  const [ctxMenu, setCtxMenu]   = useState<CtxMenu | null>(null);
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
  const totalTracksH = useMemo(() => {
    return tracks.reduce((sum, t) => sum + getTrackHeight(t.type), 0);
  }, [tracks]);

  const { snapLine, onDragStart, onDragMove, onDragEnd } = useDraggableClip(pxPerSec, TRACK_HEIGHT);

  // Ruler scroll sync
  const onTracksScroll = useCallback(() => {
    if (rulerRef.current && tracksRef.current)
      rulerRef.current.scrollLeft = tracksRef.current.scrollLeft;
    if (headersRef.current && tracksRef.current)
      headersRef.current.scrollTop = tracksRef.current.scrollTop;
  }, []);

  // Wheel handler: Ctrl+Scroll = zoom, Shift+Scroll = horizontal
  const onWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(Math.max(0.05, Math.min(5, zoom + delta)));
    } else if (e.shiftKey) {
      e.preventDefault();
      if (tracksRef.current) {
        tracksRef.current.scrollLeft += e.deltaY;
      }
    }
  }, [zoom, setZoom]);

  useEffect(() => {
    const el = tracksRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // Fit timeline to screen
  const fitToScreen = useCallback(() => {
    if (!tracksRef.current) return;
    const clientW = tracksRef.current.clientWidth - HEADER_WIDTH;
    const newPxPerSec = clientW / projectDuration;
    const newZoom = newPxPerSec / 100;
    setZoom(Math.max(0.05, Math.min(5, newZoom)));
  }, [projectDuration, setZoom]);

  // Auto-scroll playhead during playback
  useEffect(() => {
    if (!isPlaying || !tracksRef.current) return;
    const el = tracksRef.current;
    const px = currentTime * pxPerSec;
    if (px < el.scrollLeft || px > el.scrollLeft + el.clientWidth - 80)
      el.scrollLeft = px - el.clientWidth / 3;
  }, [currentTime, isPlaying, pxPerSec]);

  // Global mouse handlers for clip drag
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (activeDragRef.current === 'none') return;
      const top = tracksRef.current?.getBoundingClientRect().top ?? 0;
      onDragMove(e.clientX, e.clientY, top);
    };
    const onUp = () => {
      if (activeDragRef.current !== 'none') { onDragEnd(); activeDragRef.current = 'none'; }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [onDragMove, onDragEnd]);

  // Close ctx menu on click outside
  useEffect(() => {
    const h = () => setCtxMenu(null);
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, []);

  // Selection box mouse handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isSelecting || !tracksRef.current) return;
      const rect = tracksRef.current.getBoundingClientRect();
      const x = Math.max(0, e.clientX - rect.left + tracksRef.current.scrollLeft);
      const y = Math.max(0, e.clientY - rect.top + tracksRef.current.scrollTop);
      const startX = selectStartRef.current.x;
      const startY = selectStartRef.current.y;
      setSelectionBox({
        x: Math.min(startX, x),
        y: Math.min(startY, y),
        w: Math.abs(x - startX),
        h: Math.abs(y - startY),
      });
    };
    const handleMouseUp = () => {
      if (!isSelecting || !selectionBox) { setIsSelecting(false); setSelectionBox(null); return; }
      // Find clips within selection box
      const selected: string[] = [];
      let trackTopOffset = 0;
      tracks.forEach((track, ti) => {
        const trackH = getTrackHeight(track.type);
        const trackBottom = trackTopOffset + trackH;
        if (selectionBox.y < trackBottom && selectionBox.y + selectionBox.h > trackTopOffset) {
          track.clips.forEach(clip => {
            const clipLeft = clip.startAt * pxPerSec;
            const clipRight = clipLeft + clip.duration * pxPerSec;
            if (selectionBox.x < clipRight && selectionBox.x + selectionBox.w > clipLeft) {
              selected.push(clip.id);
            }
          });
        }
        trackTopOffset += trackH;
      });
      if (selected.length > 0) {
        setSelectedClipIds(selected);
        setActiveClipId(selected[0]);
      }
      setIsSelecting(false);
      setSelectionBox(null);
    };
    if (isSelecting) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSelecting, selectionBox, tracks, pxPerSec, setSelectedClipIds, setActiveClipId]);

  // Ruler marks
  const rulerMarks = useMemo(() => {
    const interval = zoom < 0.2 ? 30 : zoom < 0.4 ? 10 : zoom < 0.7 ? 5 : zoom < 1.5 ? 2 : 1;
    const minor = interval / 5;
    const marks: { t: number; major: boolean }[] = [];
    for (let t = 0; t <= projectDuration + interval; t += minor)
      marks.push({ t: parseFloat(t.toFixed(3)), major: Math.abs(t % interval) < minor / 2 });
    return marks;
  }, [projectDuration, zoom]);

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tracksRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + tracksRef.current.scrollLeft;
    setCurrentTime(Math.max(0, Math.min(pixelsToTime(x), projectDuration)));
  };

  const onClipMouseDown = useCallback((e: React.MouseEvent, clip: Clip) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.shiftKey) { setSelectedClipIds([...selectedClipIds, clip.id]); setActiveClipId(clip.id); return; }
    if (e.ctrlKey || e.metaKey) {
      setSelectedClipIds(selectedClipIds.includes(clip.id) ? selectedClipIds.filter(x => x !== clip.id) : [...selectedClipIds, clip.id]);
      setActiveClipId(clip.id); return;
    }
    if (!selectedClipIds.includes(clip.id)) { setSelectedClipIds([clip.id]); setActiveClipId(clip.id); }
    const zone = detectDragZone(e.clientX, rect);
    activeDragRef.current = zone;
    onDragStart(clip, zone, e.clientX, e.clientY);
  }, [selectedClipIds, setSelectedClipIds, setActiveClipId, onDragStart]);

  const handleContextMenu = (e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    if (!selectedClipIds.includes(clipId)) { setSelectedClipIds([clipId]); setActiveClipId(clipId); }
    setCtxMenu({ x: e.clientX, y: e.clientY, clipId });
  };

  const ctxAction = (action: string) => {
    if (!ctxMenu) return;
    const store = useEditorStore.getState();
    if (action === 'delete') { pushHistory(); removeClip(ctxMenu.clipId); }
    else if (action === 'split') { pushHistory(); splitClip(ctxMenu.clipId, currentTime); }
    else if (action === 'copy') {
      const c = store.getClip(ctxMenu.clipId);
      if (c) store.setCopiedClip(JSON.parse(JSON.stringify(c)));
    }
    else if (action === 'duplicate') {
      const c = store.getClip(ctxMenu.clipId);
      if (c) {
        const newClip = store.addClip(c.trackType, c.mediaId, c.sticker);
        if (newClip) store.updateClip(newClip.id, { ...c, id: newClip.id, startAt: c.startAt + c.duration });
      }
    }
    else if (action === 'freeze') {
      const c = store.getClip(ctxMenu.clipId);
      if (c) store.updateClip(c.id, { speed: 0 });
    }
    else if (action === 'reverse') {
      const c = store.getClip(ctxMenu.clipId);
      if (c) store.updateClip(c.id, { speed: -(c.speed || 1) });
    }
    else if (action === 'detachAudio') {
      const c = store.getClip(ctxMenu.clipId);
      if (c && c.mediaId && c.trackType === 'video') {
        pushHistory();
        const audioClip = store.addClip('audio', c.mediaId);
        if (audioClip) {
          store.updateClip(audioClip.id, { startAt: c.startAt, duration: c.duration, sourceStart: c.sourceStart });
          store.updateClip(c.id, { muted: true });
        }
      }
    }
    setCtxMenu(null);
  };

  // Drop from asset library
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData('text/plain');
    if (!mediaId) return;
    const mf = media.find(m => m.id === mediaId);
    if (!mf) return;
    const rect = tracksRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left + (tracksRef.current?.scrollLeft ?? 0);
    const y = e.clientY - rect.top;
    const time = Math.max(0, pixelsToTime(x));

    // Find which track the drop is on using dynamic heights
    let trackTopOffset = 0;
    let targetTrackIndex = -1;
    for (let i = 0; i < tracks.length; i++) {
      const trackH = getTrackHeight(tracks[i].type);
      if (y >= trackTopOffset && y < trackTopOffset + trackH) {
        targetTrackIndex = i;
        break;
      }
      trackTopOffset += trackH;
    }
    if (targetTrackIndex === -1) targetTrackIndex = tracks.length - 1;

    const track = tracks[targetTrackIndex];
    if (!track) return;
    const targetType: 'video' | 'audio' = mf.type === 'audio' ? 'audio' : 'video';
    if (track.type !== targetType) return; // type safety
    const clip = addClip(targetType, mediaId);
    if (clip) {
      updateClip(clip.id, { startAt: time });
      if (mf.duration) updateClip(clip.id, { duration: mf.duration });
    }
  };

  const handleSplit  = () => { const id = activeClipId || selectedClipIds[0]; if (id) { pushHistory(); splitClip(id, currentTime); } };
  const handleDelete = () => { if (selectedClipIds.length) { pushHistory(); removeSelectedClips(); } };

  // Clip count for status bar
  const clipCount = useMemo(() => tracks.reduce((sum, t) => sum + t.clips.length, 0), [tracks]);

  return (
    <section className="timeline-section">
      {/* ── Toolbar ── */}
      <div className="timeline-toolbar">
        <div className="timeline-toolbar-left">
          <button className="tl-btn" onClick={handleSplit}  title="Split (S)">{Ico.scissors}</button>
          <button className="tl-btn" onClick={handleDelete} title="Delete (Del)">{Ico.trash}</button>
          <button className={`tl-btn ${rippleDelete ? 'active' : ''}`} onClick={() => setRippleDelete(!rippleDelete)} title="Ripple delete">{Ico.ripple}</button>
          <div className="toolbar-sep" />
          <button className="tl-btn" onClick={() => useEditorStore.getState().toggleMarker(currentTime)} title="Add Marker (M)">{Ico.marker}</button>
          <div className="toolbar-sep" />
          <button className="tl-btn add-track-btn" onClick={() => addTrack('video')}  title="Add Video track">{Ico.plus}<span>V</span></button>
          <button className="tl-btn add-track-btn" onClick={() => addTrack('audio')}  title="Add Audio track">{Ico.plus}<span>A</span></button>
          <button className="tl-btn add-track-btn" onClick={() => addTrack('text')}   title="Add Text track">{Ico.plus}<span>T</span></button>
        </div>
        <div className="timeline-toolbar-center">
          <span className="tl-hint">SPACE play · S split · Del delete · M marker · Ctrl+Scroll zoom · Shift+Scroll pan · drag to multi-select</span>
        </div>
        <div className="timeline-toolbar-right">
          <button className="tl-btn" onClick={fitToScreen} title="Fit to Screen">{Ico.fit}</button>
          <div className="toolbar-sep" />
          <button className="tl-btn" onClick={() => setZoom(Math.max(0.05, zoom - 0.15))}>{Ico.zoomOut}</button>
          <input type="range" className="timeline-zoom-slider" min={0.05} max={5} step={0.05} value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))} />
          <button className="tl-btn" onClick={() => setZoom(Math.min(5, zoom + 0.15))}>{Ico.zoomIn}</button>
          <span className="timeline-zoom-label">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="tl-body">
        {/* Ruler row (pinned top, synced scroll) */}
        <div className="tl-ruler-row">
          <div className="tl-corner" style={{ width: HEADER_WIDTH }} />
          <div className="tl-ruler-scroll" ref={rulerRef}>
            <div style={{ width: totalWidth, height: RULER_HEIGHT, position: 'relative' }}
              onClick={handleRulerClick} className="tl-ruler-inner">
              {rulerMarks.map((m, i) => (
                <div key={i} className={`ruler-mark ${m.major ? 'major' : 'minor'}`} style={{ left: m.t * pxPerSec }}>
                  {m.major && <span className="ruler-label">{formatTime(m.t)}</span>}
                </div>
              ))}
              {/* Timeline markers on ruler */}
              {useEditorStore.getState().project.markers.map((marker: Marker) => (
                <div key={marker.id} className="tl-marker" style={{ left: marker.time * pxPerSec }}
                  title={marker.label} onClick={e => { e.stopPropagation(); setCurrentTime(marker.time); }}>
                  <div className="tl-marker-flag" style={{ background: marker.color }} />
                </div>
              ))}
              <div className="playhead-triangle" style={{ left: currentTime * pxPerSec }} />
            </div>
          </div>
        </div>

        {/* Tracks row (both-axis scroll) */}
        <div className="tl-tracks-row">
          {/* Track headers (sticky left column) */}
          <div className="tl-headers-col" ref={headersRef} style={{ width: HEADER_WIDTH }}>
            {tracks.map(t => {
              const trackH = getTrackHeight(t.type);
              return (
                <div key={t.id} className="tl-track-header" style={{ height: trackH }}>
                  <div className="track-dot" style={{ background: TRACK_COLORS[t.type] || '#666' }} />
                  <div className="track-header-content">
                    <span className="track-name">{t.name}</span>
                    <span className="track-type-label">{t.type}</span>
                  </div>
                  <div className="track-header-actions">
                    <button className="track-icon-btn" title={t.visible ? 'Hide' : 'Show'}
                      onClick={() => updateTrack(t.id, { visible: !t.visible })}>
                      {t.visible ? Ico.eye : Ico.eyeOff}
                    </button>
                    <button className={`track-icon-btn ${(t as any).solo ? 'active' : ''}`} title={(t as any).solo ? 'Unsolo' : 'Solo'}
                      onClick={() => updateTrack(t.id, { solo: !(t as any).solo } as any)}>
                      {Ico.solo}
                    </button>
                    <button className="track-icon-btn" title={t.locked ? 'Unlock' : 'Lock'}
                      onClick={() => updateTrack(t.id, { locked: !t.locked })}>
                      {t.locked ? Ico.lock : Ico.unlock}
                    </button>
                    <button className="track-icon-btn track-del-btn" title="Remove track"
                      onClick={() => removeTrack(t.id)}>×</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Clip area */}
          <div className="tl-clips-scroll" ref={tracksRef}
            onScroll={onTracksScroll}
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onMouseDown={e => {
              const target = e.target as HTMLElement;
              if (e.button === 0 && !target.closest('.timeline-clip') && !target.closest('.tl-transition-zone')) {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                selectStartRef.current = {
                  x: e.clientX - rect.left + tracksRef.current!.scrollLeft,
                  y: e.clientY - rect.top + tracksRef.current!.scrollTop,
                };
                setIsSelecting(true);
                if (!e.shiftKey && !e.ctrlKey) {
                  setSelectedClipIds([]);
                  setActiveClipId(null);
                }
              }
            }}>

            <div style={{ width: totalWidth, height: totalTracksH, position: 'relative' }}>
              {/* Row backgrounds */}
              {(() => {
                let trackTopOffset = 0;
                return tracks.map((t, i) => {
                  const trackH = getTrackHeight(t.type);
                  const row = (
                    <div key={`bg-${t.id}`} className={`tl-row-bg ${i % 2 ? 'alt' : ''} ${t.locked ? 'locked' : ''}`}
                      style={{ top: trackTopOffset, height: trackH }} />
                  );
                  trackTopOffset += trackH;
                  return row;
                });
              })()}

              {/* Selection box */}
              {selectionBox && (
                <div className="tl-selection-box" style={{
                  left: selectionBox.x,
                  top: selectionBox.y,
                  width: selectionBox.w,
                  height: selectionBox.h,
                }} />
              )}

              {/* Clips */}
              {(() => {
                let trackTopOffset = 0;
                return tracks.map((track, ti) => {
                  const trackH = getTrackHeight(track.type);
                  const top = trackTopOffset + 2;
                  const h = trackH - 4;
                  trackTopOffset += trackH;

                  return track.clips.map(clip => {
                    const left  = clip.startAt * pxPerSec;
                    const width = Math.max(6, clip.duration * pxPerSec);
                    const sel   = selectedClipIds.includes(clip.id);
                    const mf    = media.find(m => m.id === clip.mediaId);

                    return (
                      <div key={clip.id} id={`clip-${clip.id}`}
                        className={`timeline-clip clip-${clip.trackType} ${sel ? 'selected' : ''} ${!track.visible ? 'hidden-clip' : ''}`}
                        style={{ left, width, top, height: h }}
                        onMouseDown={e => onClipMouseDown(e, clip)}
                        onContextMenu={e => handleContextMenu(e, clip.id)}
                        onMouseEnter={() => setHoverClip({ id: clip.id, mf, clip })}
                        onMouseLeave={() => setHoverClip(null)}>

                        {/* Filmstrip for video clips */}
                        {clip.trackType === 'video' && mf?.thumbnails?.length ? (
                          <Filmstrip thumbnails={mf.thumbnails} clipWidth={width} height={h} />
                        ) : null}

                        {/* Waveform for audio clips + video clips with audio */}
                        {(clip.trackType === 'audio' || (clip.trackType === 'video' && mf?.waveform?.length)) && mf?.waveform?.length ? (
                          <WaveformBars waveform={mf.waveform} height={h} />
                        ) : null}

                        {/* Text / Sticker content */}
                        {clip.textOverlay && <div className="clip-text-label">{clip.textOverlay.text}</div>}
                        {clip.sticker     && <div className="clip-sticker-label">{clip.sticker}</div>}

                        {/* Overlay: name + duration */}
                        <div className="clip-overlay">
                          <span className="clip-label">
                            {mf?.name?.replace(/\.[^.]+$/, '') || clip.textOverlay?.text || clip.sticker || 'Clip'}
                          </span>
                          <span className="clip-duration-label">{clip.duration.toFixed(1)}s</span>
                        </div>

                        <div className="trim-handle left" />
                        <div className="trim-handle right" />
                      </div>
                    );
                  });
                });
              })()}

              {/* Transition zones */}
              {(() => {
                let trackTopOffset = 0;
                return tracks.map((track, ti) => {
                  const trackH = getTrackHeight(track.type);
                  const y = trackTopOffset;
                  trackTopOffset += trackH;

                  const sorted = [...track.clips].sort((a, b) => a.startAt - b.startAt);
                  return sorted.slice(0, -1).map((a, ci) => {
                    const b = sorted[ci + 1];
                    const gap = b.startAt - (a.startAt + a.duration);
                    if (gap < 0.6) {
                      return (
                        <TransitionZone key={`tz-${a.id}`}
                          clipId={a.id} x={(a.startAt + a.duration) * pxPerSec}
                          y={y} type={a.transition?.type} />
                      );
                    }
                    return null;
                  });
                });
              })()}

              {/* Playhead */}
              <div className="playhead" style={{ left: currentTime * pxPerSec, height: totalTracksH }} />
              {snapLine !== null && <div className="snap-line" style={{ left: snapLine }} />}
            </div>
          </div>
        </div>
      </div>

      {/* Context menu */}
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

      {/* Hover preview */}
      {hoverClip && hoverClip.mf?.thumbnail && (
        <div className="tl-hover-preview" style={{ left: hoverClip.mf ? 100 : 0, top: -80 }}>
          <img src={hoverClip.mf.thumbnail} alt="" />
          <div className="tl-hover-info">
            <span className="tl-hover-name">{hoverClip.mf.name.replace(/\.[^.]+$/, '')}</span>
            <span className="tl-hover-dur">{hoverClip.clip.duration.toFixed(1)}s</span>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="tl-status-bar">
        <span className="tl-status-item">{tracks.length} tracks</span>
        <span className="tl-status-sep">·</span>
        <span className="tl-status-item">{clipCount} clips</span>
        <span className="tl-status-sep">·</span>
        <span className="tl-status-item">{formatTime(currentTime)} / {formatTime(projectDuration)}</span>
        <span className="tl-status-sep">·</span>
        <span className="tl-status-item">{Math.round(zoom * 100)}%</span>
        {rippleDelete && <span className="tl-status-badge">RIPPLE</span>}
        {selectedClipIds.length > 1 && <span className="tl-status-badge">{selectedClipIds.length} selected</span>}
      </div>
    </section>
  );
}
