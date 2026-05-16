import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useEditorStore } from '../store/editorStore';
import { formatTime, extractVideoFrame } from '../utils/fileUtils';
import { SNAP_THRESHOLD } from '../types';

const PIXELS_PER_SECOND = 50;
const TRACK_HEIGHT = 72;
const FRAME_PREVIEW_HEIGHT = 44;

export function Timeline() {
  const {
    project,
    currentTime,
    zoom,
    selectedClipId,
    setSelectedClip,
    setCurrentTime,
    setZoom,
    toggleTrackLocked,
    toggleTrackVisible,
    removeClip,
    splitClip,
    updateClip,
    findSnapTime,
  } = useEditorStore();

  const timelineRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const [draggingClip, setDraggingClip] = useState<string | null>(null);
  const [trimming, setTrimming] = useState<{ clipId: string; edge: 'left' | 'right' } | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [framePreviews, setFramePreviews] = useState<Record<string, string>>({});
  const dragStartRef = useRef<{ x: number; time: number }>({ x: 0, time: 0 });

  const pixelsPerSecond = PIXELS_PER_SECOND * zoom;
  const timelineWidth = useMemo(() => project.duration * pixelsPerSecond, [project.duration, pixelsPerSecond]);

  const getTimeFromX = useCallback((clientX: number) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const scrollLeft = timelineRef.current?.scrollLeft || 0;
    const x = clientX - rect.left + scrollLeft;
    return Math.max(0, Math.min(x / pixelsPerSecond, project.duration));
  }, [pixelsPerSecond, project.duration]);

  const handleRulerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingPlayhead(true);
    const time = getTimeFromX(e.clientX);
    setCurrentTime(Math.max(0, Math.min(time, project.duration)));
  };

  const handleTrackClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.timeline-clip') || target.closest('.clip-trim-handle')) return;
    const rect = tracksRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scrollLeft = timelineRef.current?.scrollLeft || 0;
    const x = e.clientX - rect.left + scrollLeft;
    const time = x / pixelsPerSecond;
    setCurrentTime(Math.max(0, Math.min(time, project.duration)));
    setSelectedClip(null);
  };

  const handleClipMouseDown = (e: React.MouseEvent, clipId: string, edge?: 'left' | 'right') => {
    e.stopPropagation();
    setSelectedClip(clipId);
    if (edge) {
      setTrimming({ clipId, edge });
    } else {
      setDraggingClip(clipId);
    }
    dragStartRef.current = { x: e.clientX, time: getTimeFromX(e.clientX) };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingPlayhead) {
      const time = getTimeFromX(e.clientX);
      setCurrentTime(time);
      return;
    }

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scrollLeft = timelineRef.current?.scrollLeft || 0;
    const x = e.clientX - rect.left + scrollLeft;
    const rawTime = x / pixelsPerSecond;

    if (draggingClip) {
      const state = useEditorStore.getState();
      const track = state.project.tracks.find(t => t.clips.some(c => c.id === draggingClip));
      if (!track || track.locked) return;
      const clip = track.clips.find(c => c.id === draggingClip);
      if (!clip) return;

      const snapTime = findSnapTime(rawTime, track.id, draggingClip);
      const snapped = Math.abs(rawTime - snapTime) < SNAP_THRESHOLD;
      setSnapLine(snapped ? snapTime : null);

      const newStart = snapped ? snapTime : Math.max(0, rawTime);
      if (newStart !== clip.startTime) {
        updateClip(draggingClip, { startTime: newStart });
      }
    }

    if (trimming) {
      const state = useEditorStore.getState();
      const track = state.project.tracks.find(t => t.clips.some(c => c.id === trimming.clipId));
      if (!track || track.locked) return;
      const clip = track.clips.find(c => c.id === trimming.clipId);
      if (!clip) return;

      const rawEndTime = rawTime;

      if (trimming.edge === 'left') {
        const snapTime = findSnapTime(rawTime, track.id, trimming.clipId);
        const snapped = Math.abs(rawTime - snapTime) < SNAP_THRESHOLD;
        setSnapLine(snapped ? snapTime : null);
        const newStart = snapped ? snapTime : Math.max(0, rawTime);
        const newDuration = clip.duration + (clip.startTime - newStart);
        if (newDuration >= 0.3 && newStart < clip.startTime + clip.duration) {
          updateClip(trimming.clipId, {
            startTime: newStart,
            duration: newDuration,
            trimStart: clip.trimStart + (newStart - clip.startTime),
          });
        }
      } else {
        const snapTime = findSnapTime(rawEndTime, track.id, trimming.clipId);
        const snapped = Math.abs(rawEndTime - snapTime) < SNAP_THRESHOLD;
        setSnapLine(snapped ? snapTime : null);
        const newEnd = snapped ? snapTime : rawEndTime;
        const newDuration = Math.max(0.3, newEnd - clip.startTime);
        updateClip(trimming.clipId, {
          duration: newDuration,
          trimEnd: clip.trimStart + newDuration,
        });
      }
    }
  }, [draggingClip, trimming, isDraggingPlayhead, pixelsPerSecond, getTimeFromX, findSnapTime, updateClip, setCurrentTime]);

  const handleMouseUp = useCallback(() => {
    setDraggingClip(null);
    setTrimming(null);
    setIsDraggingPlayhead(false);
    setSnapLine(null);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId) removeClip(selectedClipId);
      }
      if ((e.key === 's' || e.key === 'S') && selectedClipId) {
        splitClip(selectedClipId, currentTime);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentTime(Math.max(0, currentTime - 0.1));
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentTime(Math.min(project.duration, currentTime + 0.1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, currentTime, removeClip, splitClip, setCurrentTime, project.duration]);

  useEffect(() => {
    const videoTrack = project.tracks.find(t => t.type === 'video');
    if (!videoTrack) return;

    const loadFrames = async () => {
      const newFrames: Record<string, string> = {};
      for (const clip of videoTrack.clips) {
        if (framePreviews[clip.id]) {
          newFrames[clip.id] = framePreviews[clip.id];
          continue;
        }
        if (!clip.mediaId) continue;
        const media = project.media.find(m => m.id === clip.mediaId);
        if (!media || media.type !== 'video') continue;
        const midTime = (clip.trimStart + clip.trimEnd) / 2;
        const frame = await extractVideoFrame(media.blob, midTime, 320);
        if (frame) newFrames[clip.id] = frame;
      }
      if (Object.keys(newFrames).length > 0) {
        setFramePreviews(prev => ({ ...prev, ...newFrames }));
      }
    };
    loadFrames();
  }, [project.tracks, project.media]);

  const rulerMarks = useMemo(() => {
    const marks: React.ReactNode[] = [];
    const duration = project.duration;

    let majorInterval: number;
    let minorInterval: number;
    if (zoom < 0.3) { majorInterval = 20; minorInterval = 10; }
    else if (zoom < 0.5) { majorInterval = 10; minorInterval = 5; }
    else if (zoom < 1) { majorInterval = 5; minorInterval = 1; }
    else if (zoom < 2) { majorInterval = 2; minorInterval = 1; }
    else { majorInterval = 1; minorInterval = 0.5; }

    for (let i = 0; i <= duration; i += majorInterval) {
      const px = i * pixelsPerSecond;
      marks.push(
        <div key={`major-${i}`} className="ruler-mark major" style={{ left: px }}>
          <span className="ruler-label">{formatTime(i)}</span>
        </div>
      );
      if (minorInterval < majorInterval) {
        for (let j = i + minorInterval; j < Math.min(i + majorInterval, duration); j += minorInterval) {
          marks.push(
            <div key={`minor-${j}`} className="ruler-mark minor" style={{ left: j * pixelsPerSecond }} />
          );
        }
      }
    }
    return marks;
  }, [project.duration, zoom, pixelsPerSecond]);

  return (
    <div className="timeline">
      <div className="timeline-header">
        <div className="timeline-tools">
          <button className="btn btn-sm btn-ghost" onClick={() => selectedClipId && splitClip(selectedClipId, currentTime)} title="Split clip (S)">
            ✂ Split
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => selectedClipId && removeClip(selectedClipId)} title="Delete clip (Del)">
            🗑 Delete
          </button>
        </div>
        <div className="timeline-zoom">
          <span className="zoom-label">Zoom:</span>
          <input type="range" className="slider" min={0.1} max={4} step={0.1} value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))} style={{ width: 100 }} />
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      <div className="timeline-content">
        <div className="timeline-tracks-header">
          {project.tracks.map((track) => (
            <div key={track.id} className="track-header" style={{ height: TRACK_HEIGHT }}>
              <span className="track-name">{track.name}</span>
              <div className="track-controls">
                <button className={`track-btn ${track.locked ? 'active' : ''}`}
                  onClick={() => toggleTrackLocked(track.id)} title="Lock track">
                  {track.locked ? '🔒' : '🔓'}
                </button>
                <button className={`track-btn ${!track.visible ? 'active' : ''}`}
                  onClick={() => toggleTrackVisible(track.id)} title="Toggle visibility">
                  {track.visible ? '👁' : '👁‍🗨'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="timeline-scroll" ref={timelineRef}>
          <div className="timeline-ruler" style={{ width: timelineWidth }}
            onMouseDown={handleRulerMouseDown}>
            <div className="ruler-marks">{rulerMarks}</div>
            <div className="ruler-time-indicator" style={{ left: currentTime * pixelsPerSecond }}>
              <span className="ruler-time-label">{formatTime(currentTime)}</span>
            </div>
          </div>

          <div className="tracks-container" ref={tracksRef}
            style={{ width: timelineWidth }}
            onMouseDown={handleTrackClick}>
            {project.tracks.map((track) => (
              <div key={track.id} className="timeline-track"
                style={{ height: TRACK_HEIGHT, opacity: track.visible ? 1 : 0.4 }}>
                {track.clips.map((clip) => {
                  const media = project.media.find(m => m.id === clip.mediaId);
                  const clipName = clip.trackType === 'text'
                    ? (clip.text?.slice(0, 15) || 'Text')
                    : clip.trackType === 'sticker'
                    ? (clip.sticker || 'Sticker')
                    : (media?.name?.slice(0, 15) || 'Clip');
                  const frame = clip.trackType === 'video' ? framePreviews[clip.id] : null;

                  return (
                    <div key={clip.id}
                      className={`timeline-clip clip-${clip.trackType} ${selectedClipId === clip.id ? 'selected' : ''}`}
                      style={{
                        left: clip.startTime * pixelsPerSecond,
                        width: Math.max(clip.duration * pixelsPerSecond, 24),
                      }}
                      onMouseDown={(e) => handleClipMouseDown(e, clip.id)}>
                      <div className="clip-trim-handle left"
                        onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'left')} />
                      <div className="clip-inner">
                        {frame && (
                          <div className="clip-frame-preview" style={{ height: FRAME_PREVIEW_HEIGHT }}>
                            <img src={frame} alt="" draggable={false} />
                          </div>
                        )}
                        <div className="clip-info">
                          <span className="clip-name">{clipName}</span>
                          <span className="clip-duration">{clip.duration.toFixed(1)}s</span>
                        </div>
                        {clip.speed !== 1 && (
                          <div className="clip-speed-badge">{clip.speed}x</div>
                        )}
                      </div>
                      <div className="clip-trim-handle right"
                        onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'right')} />
                    </div>
                  );
                })}
              </div>
            ))}

            {snapLine !== null && (
              <div className="snap-indicator" style={{ left: snapLine * pixelsPerSecond }} />
            )}

            <div className="playhead" style={{ left: currentTime * pixelsPerSecond }}>
              <div className="playhead-head" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
