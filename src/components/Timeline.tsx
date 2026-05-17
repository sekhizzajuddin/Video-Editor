import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useTimelineMath } from '../engine/useTimelineMath';
import { useDraggableClip, detectDragZone } from '../engine/useDraggableClip';
import { formatTime } from '../utils/fileUtils';
import type { Clip, TransitionType } from '../types';

const TRACK_HEIGHT = 56;
const RULER_HEIGHT = 28;
const HEADER_WIDTH = 120;

const TRACK_COLORS: Record<string, string> = {
  video: '#3b82f6', audio: '#22c55e', text: '#a855f7', sticker: '#f59e0b',
};

/** Amplitude → waveform bar colour: loud=orange, medium=blue, quiet=dim */
function waveColor(amp: number): string {
  if (amp > 0.72) return '#f59e0b';  // vocal / loud
  if (amp > 0.42) return '#60a5fa';  // medium
  return 'rgba(96,165,250,0.35)';    // quiet / background
}

// ─── SVG icons ────────────────────────────────────────────────────
const Ico = {
  scissors: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
  trash:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>,
  zoomIn:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
  zoomOut:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
  plus:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  eye:      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  lock:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  unlock:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>,
  ripple:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
};

interface CtxMenu { x: number; y: number; clipId: string; }

// ─── Waveform bars component ──────────────────────────────────────
function WaveformBars({ waveform, height }: { waveform: number[]; height: number }) {
  return (
    <div className="clip-waveform" style={{ height }}>
      {waveform.map((amp, i) => (
        <div key={i} className="waveform-bar"
          style={{ height: `${Math.max(4, amp * 92)}%`, background: waveColor(amp) }} />
      ))}
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
  const activeDragRef = useRef<'none' | 'move' | 'trim-start' | 'trim-end'>('none');
  const [ctxMenu, setCtxMenu]   = useState<CtxMenu | null>(null);

  const projectDuration = useMemo(() => {
    let max = 30;
    for (const t of tracks) for (const c of t.clips) max = Math.max(max, c.startAt + c.duration);
    return max + 10;
  }, [tracks]);

  const { scale, pixelsToTime } = useTimelineMath(tracks, zoom, projectDuration);
  const { pxPerSec } = scale;
  const totalWidth = Math.max(projectDuration * pxPerSec + 160, 800);
  const totalTracksH = Math.max(tracks.length * TRACK_HEIGHT, 80);

  const { snapLine, onDragStart, onDragMove, onDragEnd } = useDraggableClip(pxPerSec, TRACK_HEIGHT);

  // Ruler scroll sync
  const onTracksScroll = useCallback(() => {
    if (rulerRef.current && tracksRef.current)
      rulerRef.current.scrollLeft = tracksRef.current.scrollLeft;
  }, []);

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
    if (action === 'delete') { pushHistory(); removeClip(ctxMenu.clipId); }
    else if (action === 'split') { pushHistory(); splitClip(ctxMenu.clipId, currentTime); }
    else if (action === 'copy') {
      const c = useEditorStore.getState().getClip(ctxMenu.clipId);
      if (c) useEditorStore.getState().setCopiedClip(JSON.parse(JSON.stringify(c)));
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
    const ti   = Math.max(0, Math.floor(y / TRACK_HEIGHT));
    const track = tracks[ti];
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

  // Transition zones: find adjacent clip pairs
  const transitionZones = useMemo(() => {
    const zones: { clipId: string; x: number; trackIdx: number; type?: TransitionType }[] = [];
    tracks.forEach((track, ti) => {
      const sorted = [...track.clips].sort((a, b) => a.startAt - b.startAt);
      for (let ci = 0; ci < sorted.length - 1; ci++) {
        const a = sorted[ci], b = sorted[ci + 1];
        const gap = b.startAt - (a.startAt + a.duration);
        if (gap < 0.6) zones.push({ clipId: a.id, x: (a.startAt + a.duration) * pxPerSec, trackIdx: ti, type: a.transition?.type });
      }
    });
    return zones;
  }, [tracks, pxPerSec]);

  return (
    <section className="timeline-section">
      {/* ── Toolbar ── */}
      <div className="timeline-toolbar">
        <div className="timeline-toolbar-left">
          <button className="tl-btn" onClick={handleSplit}  title="Split (S)">{Ico.scissors}</button>
          <button className="tl-btn" onClick={handleDelete} title="Delete (Del)">{Ico.trash}</button>
          <button className={`tl-btn ${rippleDelete ? 'active' : ''}`} onClick={() => setRippleDelete(!rippleDelete)} title="Ripple delete">{Ico.ripple}</button>
          <div className="toolbar-sep" />
          <button className="tl-btn add-track-btn" onClick={() => addTrack('video')}  title="Add Video track">{Ico.plus}<span>V</span></button>
          <button className="tl-btn add-track-btn" onClick={() => addTrack('audio')}  title="Add Audio track">{Ico.plus}<span>A</span></button>
          <button className="tl-btn add-track-btn" onClick={() => addTrack('text')}   title="Add Text track">{Ico.plus}<span>T</span></button>
        </div>
        <div className="timeline-toolbar-center">
          <span className="tl-hint">SPACE play · S split · Del delete · drag clips · drag transitions between clips</span>
        </div>
        <div className="timeline-toolbar-right">
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
              <div className="playhead-triangle" style={{ left: currentTime * pxPerSec }} />
            </div>
          </div>
        </div>

        {/* Tracks row (both-axis scroll) */}
        <div className="tl-tracks-row">
          {/* Track headers (sticky left column) */}
          <div className="tl-headers-col" style={{ width: HEADER_WIDTH }}>
            {tracks.map(t => (
              <div key={t.id} className="tl-track-header" style={{ height: TRACK_HEIGHT }}>
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
                  <button className="track-icon-btn" title={t.locked ? 'Unlock' : 'Lock'}
                    onClick={() => updateTrack(t.id, { locked: !t.locked })}>
                    {t.locked ? Ico.lock : Ico.unlock}
                  </button>
                  <button className="track-icon-btn track-del-btn" title="Remove track"
                    onClick={() => removeTrack(t.id)}>×</button>
                </div>
              </div>
            ))}
          </div>

          {/* Clip area */}
          <div className="tl-clips-scroll" ref={tracksRef}
            onScroll={onTracksScroll}
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}>

            <div style={{ width: totalWidth, height: totalTracksH, position: 'relative' }}>
              {/* Row backgrounds */}
              {tracks.map((t, i) => (
                <div key={`bg-${t.id}`} className={`tl-row-bg ${i % 2 ? 'alt' : ''} ${t.locked ? 'locked' : ''}`}
                  style={{ top: i * TRACK_HEIGHT, height: TRACK_HEIGHT }} />
              ))}

              {/* Clips */}
              {tracks.map((track, ti) =>
                track.clips.map(clip => {
                  const left  = clip.startAt * pxPerSec;
                  const width = Math.max(6, clip.duration * pxPerSec);
                  const sel   = selectedClipIds.includes(clip.id);
                  const mf    = media.find(m => m.id === clip.mediaId);
                  const top   = ti * TRACK_HEIGHT + 2;
                  const h     = TRACK_HEIGHT - 4;

                  return (
                    <div key={clip.id} id={`clip-${clip.id}`}
                      className={`timeline-clip clip-${clip.trackType} ${sel ? 'selected' : ''} ${!track.visible ? 'hidden-clip' : ''}`}
                      style={{ left, width, top, height: h }}
                      onMouseDown={e => onClipMouseDown(e, clip)}
                      onContextMenu={e => handleContextMenu(e, clip.id)}>

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
                })
              )}

              {/* Transition zones */}
              {transitionZones.map(z => (
                <TransitionZone key={`tz-${z.clipId}`}
                  clipId={z.clipId} x={z.x}
                  y={z.trackIdx * TRACK_HEIGHT} type={z.type} />
              ))}

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
          <div className="context-item" onClick={() => ctxAction('copy')}>📋 Copy</div>
          <div className="context-item" onClick={() => ctxAction('split')}>✂️ Split at playhead</div>
          <div className="context-separator" />
          <div className="context-item context-danger" onClick={() => ctxAction('delete')}>🗑 Delete</div>
        </div>
      )}
    </section>
  );
}
