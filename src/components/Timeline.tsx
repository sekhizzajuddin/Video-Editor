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
function ZoomOutIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>; }
function ZoomInIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/></svg>; }
function SettingsIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }

const trackDotColors: Record<string, string> = {
  video: '#3b82f6',
  audio: '#22c55e',
  text: '#a855f7',
  sticker: '#f59e0b',
};

interface CtxMenu { x: number; y: number; clipId: string; }

export default function Timeline() {
  const {
    currentTime, setCurrentTime, isPlaying, zoom, project: { tracks, duration: projectDuration, media },
    selectedClipIds, setSelectedClipIds, activeClipId, setActiveClipId,
    updateClip, addClip, toggleMarker,
    setZoom, rippleDelete, setRippleDelete,
  } = useEditorStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const tracksAreaRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const activeDragRef = useRef<'none' | 'move' | 'trim-start' | 'trim-end'>('none');
  const [activeDrag, setActiveDrag] = useState<'none' | 'move' | 'trim-start' | 'trim-end'>('none');

  const { scale, pixelsToTime } = useTimelineMath(tracks, zoom, projectDuration);
  const { pxPerSec } = scale;
  const totalWidth = projectDuration * pxPerSec;

  const { snapLine, onDragStart, onDragMove, onDragEnd } = useDraggableClip(pxPerSec);

  // Auto-scroll playhead into view during playback
  useEffect(() => {
    if (!isPlaying) return;
    const el = tracksAreaRef.current || containerRef.current;
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
    for (let t = 0; t <= projectDuration; t += interval) {
      marks.push({ time: parseFloat(t.toFixed(2)), major: Math.abs(t % majorInterval) < 0.001 });
    }
    return marks;
  }, [projectDuration, zoom]);

  // === Mouse handlers ===

  const handleRulerClick = (e: React.MouseEvent) => {
    const tracksArea = tracksAreaRef.current;
    const scrollLeft = tracksArea?.scrollLeft ?? 0;
    const rect = (e.currentTarget as HTMLElement).closest('.timeline-tracks-area')?.getBoundingClientRect()
      || e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    const time = pixelsToTime(x);
    if (e.shiftKey) toggleMarker(time);
    else setCurrentTime(Math.max(0, Math.min(time, projectDuration)));
  };

  const handleMouseDown = (e: React.MouseEvent, clip: Clip) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();

    // Multi-select
    if (e.shiftKey) {
      setSelectedClipIds([...selectedClipIds, clip.id]);
      setActiveClipId(clip.id);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedClipIds(
        selectedClipIds.includes(clip.id)
          ? selectedClipIds.filter((id) => id !== clip.id)
          : [...selectedClipIds, clip.id],
      );
      setActiveClipId(clip.id);
      return;
    }
    if (!selectedClipIds.includes(clip.id)) {
      setSelectedClipIds([clip.id]);
      setActiveClipId(clip.id);
    }

    // Detect drag zone via pixel coordinates
    const zone = detectDragZone(e.clientX, rect);
    activeDragRef.current = zone;
    onDragStart(clip, zone, e.clientX);
    setActiveDrag(zone);
  };

  // Global mouse move / up listeners — use ref to avoid race on React state update
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (activeDragRef.current === 'none') return;
      onDragMove(e.clientX);
    };
    const handleGlobalMouseUp = () => {
      if (activeDragRef.current === 'none') return;
      onDragEnd();
      activeDragRef.current = 'none';
      setActiveDrag('none');
    };
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [onDragMove, onDragEnd]);

  // De-sync activeDragRef from React state after effect-less transitions
  useEffect(() => {
    if (activeDrag === 'none') activeDragRef.current = 'none';
  }, [activeDrag]);

  // Context menu
  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, clipId });
  };

  const handleCtxAction = (action: string) => {
    if (!ctxMenu) return;
    const store = useEditorStore.getState();
    const { clipId } = ctxMenu;
    if (action === 'copy') {
      const clip = store.getClip(clipId);
      if (clip) store.setCopiedClip(JSON.parse(JSON.stringify(clip)));
    } else if (action === 'cut') {
      const clip = store.getClip(clipId);
      if (clip) store.setCopiedClip(JSON.parse(JSON.stringify(clip)));
      store.removeClip(clipId);
    } else if (action === 'delete') {
      store.removeClip(clipId);
    } else if (action === 'split') {
      store.pushHistory();
      store.splitClip(clipId, currentTime);
    }
    setCtxMenu(null);
  };

  const handleTimelineDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData('text/plain');
    if (!mediaId) return;
    const mediaItem = media.find((m) => m.id === mediaId);
    if (!mediaItem) return;
    const tracksArea = tracksAreaRef.current;
    const scrollLeft = tracksArea?.scrollLeft ?? 0;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    const time = pixelsToTime(x);
    const trackIndex = Math.floor((e.clientY - rect.top) / TRACK_HEIGHT);
    const track = tracks[trackIndex];
    if (!track) return;
    const targetType = mediaItem.type === 'audio' ? 'audio' : track.type;
    const clip = addClip(targetType as 'video' | 'audio' | 'text' | 'sticker', mediaId);
    if (clip) updateClip(clip.id, { startAt: Math.max(0, time) });
  };

  const handleRipple = () => setRippleDelete(!rippleDelete);
  const handleSplit = () => {
    const store = useEditorStore.getState();
    const id = activeClipId || selectedClipIds[0];
    if (id) {
      store.pushHistory();
      store.splitClip(id, currentTime);
    }
  };
  const handleDelete = () => {
    if (selectedClipIds.length > 0) {
      const store = useEditorStore.getState();
      store.pushHistory();
      store.removeSelectedClips();
    }
  };

  return (
    <div className="timeline-section">
      <div className="timeline-toolbar">
        <div className="timeline-toolbar-left">
          <button className="timeline-toolbar-btn" onClick={handleSplit} title="Split (S)"><ScissorsIcon /></button>
          <button className="timeline-toolbar-btn" onClick={handleDelete} title="Delete (Del)"><TrashIcon /></button>
          <button className={`timeline-toolbar-btn ${rippleDelete ? 'active' : ''}`} onClick={handleRipple} title="Ripple Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
        <div className="timeline-toolbar-center">
          <span className="timeline-shortcuts-hint">SPACE play  S split  DEL remove  ^Z undo</span>
        </div>
        <div className="timeline-toolbar-right">
          <button className="timeline-toolbar-btn" onClick={() => setZoom(Math.max(0.1, zoom - 0.2))}><ZoomOutIcon /></button>
          <input type="range" className="timeline-zoom-slider" min={0.1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} />
          <button className="timeline-toolbar-btn" onClick={() => setZoom(Math.min(3, zoom + 0.2))}><ZoomInIcon /></button>
          <button className="timeline-toolbar-btn"><SettingsIcon /></button>
        </div>
      </div>

      <div className="timeline-body" ref={containerRef} onDrop={handleTimelineDrop} onDragOver={(e) => e.preventDefault()}>
        {/* Track headers */}
        <div className="timeline-track-headers" style={{ width: TRACK_HEADER_WIDTH, minWidth: TRACK_HEADER_WIDTH }}>
          <div className="track-header ruler-spacer" style={{ height: RULER_HEIGHT }} />
          {tracks.map((t) => (
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
        <div className="timeline-tracks-area" ref={tracksAreaRef} style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          {/* Ruler */}
          <div className="timeline-ruler" style={{ width: totalWidth, height: RULER_HEIGHT }} onClick={handleRulerClick}>
            <div className="ruler-marks">
              {rulerMarks.map((mark, i) => (
                <div key={i} className={`ruler-mark ${mark.major ? 'major' : 'minor'}`} style={{ left: mark.time * pxPerSec }}>
                  {mark.major && <span className="ruler-label">{formatTime(mark.time)}</span>}
                </div>
              ))}
            </div>
            <div className="playhead-triangle" style={{ left: currentTime * pxPerSec }} />
          </div>

          {/* Clip rows */}
          <div className="timeline-grid-tracks" style={{ width: totalWidth }}>
            {tracks.map((t, i) => (
              <div key={t.id} className="timeline-grid-row" style={{ height: TRACK_HEIGHT, top: i * TRACK_HEIGHT }}>
                {t.clips.map((clip) => {
                  const left = clip.startAt * pxPerSec;
                  const width = clip.duration * pxPerSec;
                  const isSelected = selectedClipIds.includes(clip.id);
                  const isAudio = clip.trackType === 'audio';
                  const mf = media.find((x) => x.id === clip.mediaId);
                  return (
                    <div
                      key={clip.id}
                      className={`timeline-clip ${isSelected ? 'selected' : ''} ${isAudio ? 'clip-audio' : 'clip-video'}`}
                      style={{ left, width: Math.max(4, width), height: TRACK_HEIGHT - 4 }}
                      onMouseDown={(e) => handleMouseDown(e, clip)}
                      onContextMenu={(e) => handleContextMenu(e, clip.id)}
                    >
                      {!isAudio && clip.thumbnailFrame && <img src={clip.thumbnailFrame} alt="" className="clip-thumb" />}
                      {clip.trackType === 'text' && clip.textOverlay && (
                        <div className="clip-text-label">{clip.textOverlay.text}</div>
                      )}
                      {clip.trackType === 'sticker' && clip.sticker && (
                        <div className="clip-text-label">{clip.sticker}</div>
                      )}
                      <div className="clip-label">{mf?.name || clip.textOverlay?.text || clip.sticker || 'Clip'}</div>
                      <div className="clip-duration-label">{clip.duration.toFixed(1)}s</div>
                      <div className="trim-handle left" />
                      <div className="trim-handle right" />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Playhead */}
          <div className="playhead" style={{ left: currentTime * pxPerSec }} />
          {/* Snap guide line */}
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
          <div className="context-item" onClick={() => handleCtxAction('split')}>Split</div>
        </div>
      )}
    </div>
  );
}
