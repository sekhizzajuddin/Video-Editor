import { useRef, useState, useMemo, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useTimelineMath } from '../engine/useTimelineMath';
import { useDraggableClip, detectDragZone } from '../engine/useDraggableClip';
import { formatTime } from '../utils/fileUtils';
import type { Clip } from '../types';

const TRACK_HEIGHT = 54;
const RULER_HEIGHT = 28;
const TRACK_HEADER_WIDTH = 110;

function ScissorsIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>; }
function TrashIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>; }
function ZoomOutIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>; }
function ZoomInIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/></svg>; }
function AddTrackIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }

const trackDotColors: Record<string, string> = {
  video: '#3b82f6', audio: '#22c55e', text: '#a855f7', sticker: '#f59e0b',
};

interface CtxMenu { x: number; y: number; clipId: string; }

export default function Timeline() {
  const {
    currentTime, setCurrentTime, isPlaying, zoom, project: { tracks, duration: projectDuration, media },
    selectedClipIds, setSelectedClipIds, activeClipId, setActiveClipId,
    updateClip, addClip, toggleMarker, addTrack,
    setZoom, rippleDelete, setRippleDelete,
  } = useEditorStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const tracksAreaRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const activeDragRef = useRef<'none' | 'move' | 'trim-start' | 'trim-end'>('none');
  const [activeDrag, setActiveDrag] = useState<'none' | 'move' | 'trim-start' | 'trim-end'>('none');

  const { scale, pixelsToTime } = useTimelineMath(tracks, zoom, projectDuration);
  const { pxPerSec } = scale;
  const totalWidth = Math.max(projectDuration * pxPerSec, 600);

  const { snapLine, onDragStart, onDragMove, onDragEnd } = useDraggableClip(pxPerSec, TRACK_HEIGHT);

  // Auto-scroll playhead into view during playback
  useEffect(() => {
    if (!isPlaying) return;
    const el = tracksAreaRef.current;
    if (!el) return;
    const playheadPos = currentTime * pxPerSec;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth;
    if (playheadPos < viewLeft || playheadPos > viewRight - 50) el.scrollLeft = playheadPos - el.clientWidth / 2;
  }, [currentTime, isPlaying, pxPerSec]);

  // Ruler ticks
  const rulerMarks = useMemo(() => {
    const marks: { time: number; major: boolean }[] = [];
    const interval = Math.max(0.1, Math.round(5 / zoom) / 10);
    const majorInterval = interval * 5;
    for (let t = 0; t <= projectDuration + interval; t += interval) {
      marks.push({ time: parseFloat(t.toFixed(2)), major: Math.abs(t % majorInterval) < 0.001 });
    }
    return marks;
  }, [projectDuration, zoom]);

  const handleRulerClick = (e: React.MouseEvent) => {
    const tracksArea = tracksAreaRef.current;
    if (!tracksArea) return;
    const rect = tracksArea.getBoundingClientRect();
    const x = e.clientX - rect.left + tracksArea.scrollLeft;
    const time = pixelsToTime(x);
    if (e.shiftKey) toggleMarker(time);
    else setCurrentTime(Math.max(0, Math.min(time, projectDuration)));
  };

  const handleMouseDown = (e: React.MouseEvent, clip: Clip) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();

    if (e.shiftKey) { setSelectedClipIds([...selectedClipIds, clip.id]); setActiveClipId(clip.id); return; }
    if (e.ctrlKey || e.metaKey) {
      setSelectedClipIds(selectedClipIds.includes(clip.id) ? selectedClipIds.filter(id => id !== clip.id) : [...selectedClipIds, clip.id]);
      setActiveClipId(clip.id); return;
    }
    if (!selectedClipIds.includes(clip.id)) { setSelectedClipIds([clip.id]); setActiveClipId(clip.id); }

    const zone = detectDragZone(e.clientX, rect);
    activeDragRef.current = zone;
    // Get tracks area top for cross-track Y calculation
    const tracksAreaTop = tracksAreaRef.current?.getBoundingClientRect().top ?? 0;
    onDragStart(clip, zone, e.clientX, e.clientY);
    setActiveDrag(zone);
    // Store tracksAreaTop for move events
    (onDragMove as any)._tracksAreaTop = tracksAreaTop + RULER_HEIGHT;
  };

  useEffect(() => {
    let tracksAreaTop = 0;
    const handleGlobalMouseUp = () => {
      if (activeDragRef.current === 'none') return;
      onDragEnd();
      activeDragRef.current = 'none';
      setActiveDrag('none');
      tracksAreaTop = 0;
    };
    const handleMouseMoveCapture = (e: MouseEvent) => {
      if (activeDragRef.current !== 'none') {
        tracksAreaTop = (tracksAreaRef.current?.getBoundingClientRect().top ?? 0) + RULER_HEIGHT;
        onDragMove(e.clientX, e.clientY, tracksAreaTop);
      }
    };
    window.addEventListener('mousemove', handleMouseMoveCapture);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveCapture);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [onDragMove, onDragEnd]);

  useEffect(() => { if (activeDrag === 'none') activeDragRef.current = 'none'; }, [activeDrag]);

  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    if (!selectedClipIds.includes(clipId)) { setSelectedClipIds([clipId]); setActiveClipId(clipId); }
    setCtxMenu({ x: e.clientX, y: e.clientY, clipId });
  };

  const handleCtxAction = (action: string) => {
    if (!ctxMenu) return;
    const store = useEditorStore.getState();
    const { clipId } = ctxMenu;
    if (action === 'copy') { const clip = store.getClip(clipId); if (clip) store.setCopiedClip(JSON.parse(JSON.stringify(clip))); }
    else if (action === 'cut') { const clip = store.getClip(clipId); if (clip) store.setCopiedClip(JSON.parse(JSON.stringify(clip))); store.removeClip(clipId); }
    else if (action === 'delete') store.removeClip(clipId);
    else if (action === 'split') { store.pushHistory(); store.splitClip(clipId, currentTime); }
    setCtxMenu(null);
  };

  const handleTimelineDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData('text/plain');
    if (!mediaId) return;
    const mediaItem = media.find(m => m.id === mediaId);
    if (!mediaItem) return;
    const tracksArea = tracksAreaRef.current;
    if (!tracksArea) return;
    const rect = tracksArea.getBoundingClientRect();
    const x = e.clientX - rect.left + tracksArea.scrollLeft;
    const y = e.clientY - rect.top - RULER_HEIGHT;
    const time = pixelsToTime(x);
    const trackIndex = Math.max(0, Math.floor(y / TRACK_HEIGHT));
    const track = tracks[trackIndex];
    if (!track) return;
    const targetType: 'video' | 'audio' | 'text' | 'sticker' =
      mediaItem.type === 'audio' ? 'audio' :
      track.type === 'text' ? 'text' :
      track.type === 'sticker' ? 'sticker' : 'video';
    const clip = addClip(targetType, mediaId);
    if (clip) updateClip(clip.id, { startAt: Math.max(0, time) });
  };

  const handleSplit = () => {
    const store = useEditorStore.getState();
    const id = activeClipId || selectedClipIds[0];
    if (id) { store.pushHistory(); store.splitClip(id, currentTime); }
  };
  const handleDelete = () => {
    if (selectedClipIds.length > 0) { const store = useEditorStore.getState(); store.pushHistory(); store.removeSelectedClips(); }
  };

  const totalTracksHeight = tracks.length * TRACK_HEIGHT;

  return (
    <div className="timeline-section">
      <div className="timeline-toolbar">
        <div className="timeline-toolbar-left">
          <button className="timeline-toolbar-btn" onClick={handleSplit} title="Split (S)"><ScissorsIcon /></button>
          <button className="timeline-toolbar-btn" onClick={handleDelete} title="Delete (Del)"><TrashIcon /></button>
          <button className={`timeline-toolbar-btn ${rippleDelete ? 'active' : ''}`} onClick={() => setRippleDelete(!rippleDelete)} title="Ripple Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
          <div className="toolbar-sep" />
          <button className="timeline-toolbar-btn" onClick={() => addTrack('video')} title="Add Video Track"><AddTrackIcon /><span style={{ fontSize: 9, marginLeft: 2 }}>V</span></button>
          <button className="timeline-toolbar-btn" onClick={() => addTrack('audio')} title="Add Audio Track"><AddTrackIcon /><span style={{ fontSize: 9, marginLeft: 2 }}>A</span></button>
        </div>
        <div className="timeline-toolbar-center">
          <span className="timeline-shortcuts-hint">SPACE play · S split · DEL delete · ^Z undo · drag clips between tracks</span>
        </div>
        <div className="timeline-toolbar-right">
          <button className="timeline-toolbar-btn" onClick={() => setZoom(Math.max(0.1, zoom - 0.2))}><ZoomOutIcon /></button>
          <input type="range" className="timeline-zoom-slider" min={0.1} max={4} step={0.1} value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} />
          <button className="timeline-toolbar-btn" onClick={() => setZoom(Math.min(4, zoom + 0.2))}><ZoomInIcon /></button>
          <span className="timeline-zoom-label">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      <div className="timeline-body" ref={containerRef}>
        {/* Track headers */}
        <div className="timeline-track-headers" style={{ width: TRACK_HEADER_WIDTH, minWidth: TRACK_HEADER_WIDTH }}>
          <div className="track-header ruler-spacer" style={{ height: RULER_HEIGHT }} />
          {tracks.map(t => (
            <div key={t.id} className="track-header-row" style={{ height: TRACK_HEIGHT }}>
              <div className="track-dot" style={{ backgroundColor: trackDotColors[t.type] || '#666' }} />
              <div className="track-header-content">
                <span className="track-name">{t.name}</span>
                <span className="track-type-label">{t.type}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Tracks area */}
        <div
          className="timeline-tracks-area"
          ref={tracksAreaRef}
          style={{ overflowX: 'auto', overflowY: 'hidden' }}
          onDrop={handleTimelineDrop}
          onDragOver={e => e.preventDefault()}
        >
          {/* Ruler — clicking sets playhead */}
          <div className="timeline-ruler" style={{ width: totalWidth, minWidth: '100%', height: RULER_HEIGHT }} onClick={handleRulerClick}>
            <div className="ruler-marks">
              {rulerMarks.map((mark, i) => (
                <div key={i} className={`ruler-mark ${mark.major ? 'major' : 'minor'}`} style={{ left: mark.time * pxPerSec }}>
                  {mark.major && <span className="ruler-label">{formatTime(mark.time)}</span>}
                </div>
              ))}
            </div>
            {/* Playhead triangle on ruler */}
            <div className="playhead-triangle" style={{ left: currentTime * pxPerSec }} />
          </div>

          {/* Clip rows */}
          <div className="timeline-grid-tracks" style={{ width: totalWidth, minWidth: '100%', height: totalTracksHeight, position: 'relative' }}>
            {/* Row backgrounds */}
            {tracks.map((t, i) => (
              <div key={`bg-${t.id}`} className="timeline-grid-row" style={{ height: TRACK_HEIGHT, top: i * TRACK_HEIGHT, position: 'absolute', left: 0, right: 0 }} />
            ))}
            {/* Clips */}
            {tracks.map((t, i) =>
              t.clips.map(clip => {
                const left = clip.startAt * pxPerSec;
                const width = clip.duration * pxPerSec;
                const isSelected = selectedClipIds.includes(clip.id);
                const isAudio = clip.trackType === 'audio';
                const isText = clip.trackType === 'text';
                const isSticker = clip.trackType === 'sticker';
                const mf = media.find(x => x.id === clip.mediaId);
                return (
                  <div
                    key={clip.id}
                    id={`clip-${clip.id}`}
                    className={`timeline-clip ${isSelected ? 'selected' : ''} ${isAudio ? 'clip-audio' : isText ? 'clip-text' : isSticker ? 'clip-sticker' : 'clip-video'}`}
                    style={{
                      left,
                      width: Math.max(4, width),
                      height: TRACK_HEIGHT - 4,
                      top: i * TRACK_HEIGHT + 2,
                      position: 'absolute',
                    }}
                    onMouseDown={e => handleMouseDown(e, clip)}
                    onContextMenu={e => handleContextMenu(e, clip.id)}
                  >
                    {!isAudio && !isText && !isSticker && clip.thumbnailFrame && (
                      <img src={clip.thumbnailFrame} alt="" className="clip-thumb" />
                    )}
                    {isText && clip.textOverlay && (
                      <div className="clip-text-label">{clip.textOverlay.text}</div>
                    )}
                    {isSticker && clip.sticker && (
                      <div className="clip-sticker-label">{clip.sticker}</div>
                    )}
                    <div className="clip-label">{mf?.name || clip.textOverlay?.text || clip.sticker || 'Clip'}</div>
                    <div className="clip-duration-label">{clip.duration.toFixed(1)}s</div>
                    <div className="trim-handle left" />
                    <div className="trim-handle right" />
                  </div>
                );
              })
            )}
          </div>

          {/* Playhead line — spans full height */}
          <div className="playhead" style={{ left: currentTime * pxPerSec, height: RULER_HEIGHT + totalTracksHeight }} />
          {snapLine !== null && <div className="snap-line" style={{ left: snapLine }} />}
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div className="context-menu" style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000 }}>
          <div className="context-item" onClick={() => handleCtxAction('cut')}>Cut</div>
          <div className="context-item" onClick={() => handleCtxAction('copy')}>Copy</div>
          <div className="context-item" onClick={() => handleCtxAction('delete')}>Delete</div>
          <div className="context-separator" />
          <div className="context-item" onClick={() => handleCtxAction('split')}>Split at playhead</div>
        </div>
      )}
    </div>
  );
}
