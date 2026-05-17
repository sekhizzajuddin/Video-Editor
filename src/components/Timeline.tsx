import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useTimelineMath } from '../engine/useTimelineMath';
import { useDraggableClip, detectDragZone } from '../engine/useDraggableClip';
import { formatTime } from '../utils/fileUtils';
import type { Clip } from '../types';

const TRACK_HEIGHT = 52;
const RULER_HEIGHT = 28;
const HEADER_WIDTH = 112;

const TRACK_COLORS: Record<string, string> = {
  video: '#3b82f6', audio: '#22c55e', text: '#a855f7', sticker: '#f59e0b',
};

function ScissorsIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>; }
function TrashIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>; }
function ZoomInIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>; }
function ZoomOutIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>; }
function AddTrackIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function RippleIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>; }

interface CtxMenu { x: number; y: number; clipId: string; }

export default function Timeline() {
  const {
    project: { tracks, media },
    currentTime, isPlaying, zoom,
    selectedClipIds, activeClipId,
    setSelectedClipIds, setActiveClipId, setCurrentTime,
    updateClip, addClip, addTrack, removeClip,
    toggleMarker, setZoom, rippleDelete, setRippleDelete,
    splitClip, pushHistory, removeSelectedClips,
  } = useEditorStore();

  // Compute project duration dynamically from clip content
  const projectDuration = useMemo(() => {
    let max = 30;
    for (const t of tracks) for (const c of t.clips) max = Math.max(max, c.startAt + c.duration);
    return max + 10;
  }, [tracks]);

  const rulerRef = useRef<HTMLDivElement>(null);   // horizontal scroll sync (ruler)
  const tracksRef = useRef<HTMLDivElement>(null);   // main scrollable area (both axes)
  const activeDragRef = useRef<'none' | 'move' | 'trim-start' | 'trim-end'>('none');
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  const { scale, pixelsToTime } = useTimelineMath(tracks, zoom, projectDuration);
  const { pxPerSec } = scale;
  // Add breathing room at the end
  const totalWidth = Math.max(projectDuration * pxPerSec + 120, 800);
  const totalTracksHeight = Math.max(tracks.length * TRACK_HEIGHT, 80);

  const { snapLine, onDragStart, onDragMove, onDragEnd } = useDraggableClip(pxPerSec, TRACK_HEIGHT);

  // Sync ruler horizontal scroll with tracks area
  const onTracksScroll = useCallback(() => {
    if (rulerRef.current && tracksRef.current) {
      rulerRef.current.scrollLeft = tracksRef.current.scrollLeft;
    }
  }, []);

  // Auto-scroll playhead into view during playback
  useEffect(() => {
    if (!isPlaying || !tracksRef.current) return;
    const el = tracksRef.current;
    const px = currentTime * pxPerSec;
    if (px < el.scrollLeft || px > el.scrollLeft + el.clientWidth - 60) {
      el.scrollLeft = px - el.clientWidth / 3;
    }
  }, [currentTime, isPlaying, pxPerSec]);

  // Ruler marks (only visible range for performance)
  const rulerMarks = useMemo(() => {
    const interval = zoom < 0.2 ? 30 : zoom < 0.4 ? 10 : zoom < 0.7 ? 5 : zoom < 1.5 ? 2 : 1;
    const minor = interval / 5;
    const marks: { t: number; major: boolean }[] = [];
    for (let t = 0; t <= projectDuration + interval; t += minor) {
      marks.push({ t: parseFloat(t.toFixed(3)), major: Math.abs(t % interval) < minor / 2 });
    }
    return marks;
  }, [projectDuration, zoom]);

  // Ruler click → set playhead
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tracksRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (tracksRef.current.scrollLeft);
    const time = Math.max(0, Math.min(pixelsToTime(x), projectDuration));
    if (e.shiftKey) toggleMarker(time);
    else setCurrentTime(time);
  };

  // Mouse drag for clips
  const onClipMouseDown = useCallback((e: React.MouseEvent, clip: Clip) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
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

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (activeDragRef.current === 'none') return;
      const top = (tracksRef.current?.getBoundingClientRect().top ?? 0);
      onDragMove(e.clientX, e.clientY, top);
    };
    const onUp = () => { if (activeDragRef.current !== 'none') { onDragEnd(); activeDragRef.current = 'none'; } };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [onDragMove, onDragEnd]);

  // Close context menu
  useEffect(() => { const c = () => setCtxMenu(null); window.addEventListener('click', c); return () => window.removeEventListener('click', c); }, []);

  const handleContextMenu = (e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    if (!selectedClipIds.includes(clipId)) { setSelectedClipIds([clipId]); setActiveClipId(clipId); }
    setCtxMenu({ x: e.clientX, y: e.clientY, clipId });
  };

  const ctxAction = (action: string) => {
    if (!ctxMenu) return;
    const st = useEditorStore.getState();
    const { clipId } = ctxMenu;
    if (action === 'delete') { pushHistory(); removeClip(clipId); }
    else if (action === 'split') { pushHistory(); splitClip(clipId, currentTime); }
    else if (action === 'copy') { const c = st.getClip(clipId); if (c) st.setCopiedClip(JSON.parse(JSON.stringify(c))); }
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
    const trackIdx = Math.max(0, Math.floor(y / TRACK_HEIGHT));
    const track = tracks[trackIdx];
    if (!track) return;
    // Type enforcement: only match compatible tracks
    const isCompatible = (
      (mf.type === 'video' && (track.type === 'video')) ||
      (mf.type === 'audio' && track.type === 'audio') ||
      (mf.type === 'image' && track.type === 'video')
    );
    const targetTrackType: 'video' | 'audio' = mf.type === 'audio' ? 'audio' : 'video';
    const clip = addClip(isCompatible ? track.type as any : targetTrackType, mediaId);
    if (clip) updateClip(clip.id, { startAt: time });
  };

  const handleSplit = () => { const id = activeClipId || selectedClipIds[0]; if (id) { pushHistory(); splitClip(id, currentTime); } };
  const handleDelete = () => { if (selectedClipIds.length > 0) { pushHistory(); removeSelectedClips(); } };

  return (
    <section className="timeline-section">
      {/* ── Toolbar ── */}
      <div className="timeline-toolbar">
        <div className="timeline-toolbar-left">
          <button className="tl-btn" onClick={handleSplit} title="Split at playhead"><ScissorsIcon /></button>
          <button className="tl-btn" onClick={handleDelete} title="Delete selected"><TrashIcon /></button>
          <button className={`tl-btn ${rippleDelete ? 'active' : ''}`} onClick={() => setRippleDelete(!rippleDelete)} title="Ripple delete"><RippleIcon /></button>
          <div className="toolbar-sep" />
          <button className="tl-btn add-track-btn" onClick={() => addTrack('video')} title="Add video track"><AddTrackIcon /><span>V</span></button>
          <button className="tl-btn add-track-btn" onClick={() => addTrack('audio')} title="Add audio track"><AddTrackIcon /><span>A</span></button>
        </div>
        <div className="timeline-toolbar-center">
          <span className="tl-hint">SPACE play · S split · DEL delete · drag clips to move · drag between tracks</span>
        </div>
        <div className="timeline-toolbar-right">
          <button className="tl-btn" onClick={() => setZoom(Math.max(0.05, zoom - 0.15))}><ZoomOutIcon /></button>
          <input type="range" className="timeline-zoom-slider" min={0.05} max={5} step={0.05} value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))} />
          <button className="tl-btn" onClick={() => setZoom(Math.min(5, zoom + 0.15))}><ZoomInIcon /></button>
          <span className="timeline-zoom-label">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* ── Timeline Body ── */}
      <div className="tl-body">

        {/* Row 1: corner + ruler (pinned top, scrolls left/right only) */}
        <div className="tl-ruler-row">
          <div className="tl-corner" style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH }} />
          <div className="tl-ruler-scroll" ref={rulerRef} style={{ overflow: 'hidden', flex: 1, position: 'relative' }}>
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

        {/* Row 2: headers + scrollable clips area */}
        <div className="tl-tracks-row">
          {/* Track headers — scroll vertically with the tracks area */}
          <div className="tl-headers-col" style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH }}>
            {tracks.map(t => (
              <div key={t.id} className="tl-track-header" style={{ height: TRACK_HEIGHT }}>
                <div className="track-dot" style={{ background: TRACK_COLORS[t.type] || '#666' }} />
                <div className="track-header-content">
                  <span className="track-name">{t.name}</span>
                  <span className="track-type-label">{t.type}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Scrollable tracks area — both axes */}
          <div className="tl-clips-scroll" ref={tracksRef}
            onScroll={onTracksScroll}
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}>

            {/* Inner container: exact width for scrolling */}
            <div style={{ width: totalWidth, height: totalTracksHeight, position: 'relative' }}>
              {/* Row backgrounds */}
              {tracks.map((t, i) => (
                <div key={`bg-${t.id}`} className={`tl-row-bg ${i % 2 === 1 ? 'alt' : ''}`}
                  style={{ top: i * TRACK_HEIGHT, height: TRACK_HEIGHT }} />
              ))}

              {/* Clips */}
              {tracks.map((t, ti) =>
                t.clips.map(clip => {
                  const left = clip.startAt * pxPerSec;
                  const width = Math.max(4, clip.duration * pxPerSec);
                  const sel = selectedClipIds.includes(clip.id);
                  return (
                    <div key={clip.id} id={`clip-${clip.id}`}
                      className={`timeline-clip clip-${clip.trackType} ${sel ? 'selected' : ''}`}
                      style={{ left, width, top: ti * TRACK_HEIGHT + 2, height: TRACK_HEIGHT - 4 }}
                      onMouseDown={e => onClipMouseDown(e, clip)}
                      onContextMenu={e => handleContextMenu(e, clip.id)}>
                      {clip.thumbnailFrame && clip.trackType !== 'audio' && clip.trackType !== 'text' && (
                        <img src={clip.thumbnailFrame} alt="" className="clip-thumb" />
                      )}
                      {clip.textOverlay && <div className="clip-text-label">{clip.textOverlay.text}</div>}
                      {clip.sticker && <div className="clip-sticker-label">{clip.sticker}</div>}
                      <div className="clip-label">{media.find(m => m.id === clip.mediaId)?.name || clip.textOverlay?.text || clip.sticker || 'Clip'}</div>
                      <div className="clip-duration-label">{clip.duration.toFixed(1)}s</div>
                      <div className="trim-handle left" />
                      <div className="trim-handle right" />
                    </div>
                  );
                })
              )}

              {/* Playhead — spans full height within scroll area */}
              <div className="playhead" style={{ left: currentTime * pxPerSec, height: totalTracksHeight }} />
              {snapLine !== null && <div className="snap-line" style={{ left: snapLine }} />}
            </div>
          </div>
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div className="context-menu" style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000 }}>
          <div className="context-item" onClick={() => ctxAction('copy')}>Copy</div>
          <div className="context-item" onClick={() => ctxAction('split')}>Split at playhead</div>
          <div className="context-separator" />
          <div className="context-item context-danger" onClick={() => ctxAction('delete')}>Delete</div>
        </div>
      )}
    </section>
  );
}
