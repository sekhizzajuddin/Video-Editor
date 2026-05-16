import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useEditorStore } from '../store/editorStore';
import { formatTime } from '../utils/fileUtils';

const PIXELS_PER_SECOND = 50;

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
  } = useEditorStore();

  const timelineRef = useRef<HTMLDivElement>(null);
  const [draggingClip, setDraggingClip] = useState<string | null>(null);
  const [trimming, setTrimming] = useState<{ clipId: string; edge: 'left' | 'right' } | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

  const pixelsPerSecond = PIXELS_PER_SECOND * zoom;
  const timelineWidth = useMemo(() => project.duration * pixelsPerSecond, [project.duration, pixelsPerSecond]);

  const getTimeFromX = useCallback((x: number) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const scrollLeft = timelineRef.current?.scrollLeft || 0;
    const absoluteX = x - rect.left + scrollLeft;
    return Math.max(0, Math.min(absoluteX / pixelsPerSecond, project.duration));
  }, [pixelsPerSecond, project.duration]);

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('timeline-ruler') || (e.target as HTMLElement).classList.contains('ruler-marks') || (e.target as HTMLElement).classList.contains('tracks-container')) {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scrollLeft = timelineRef.current?.scrollLeft || 0;
      const x = e.clientX - rect.left + scrollLeft;
      const time = x / pixelsPerSecond;
      setCurrentTime(Math.max(0, Math.min(time, project.duration)));
      setSelectedClip(null);
    }
  };

  const handleRulerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingPlayhead(true);
    const time = getTimeFromX(e.clientX);
    setCurrentTime(time);
  };

  const handleClipMouseDown = (e: React.MouseEvent, clipId: string, edge?: 'left' | 'right') => {
    e.stopPropagation();
    setSelectedClip(clipId);
    if (edge) {
      setTrimming({ clipId, edge });
    } else {
      setDraggingClip(clipId);
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingPlayhead) {
      const time = getTimeFromX(e.clientX);
      setCurrentTime(time);
      return;
    }

    if (draggingClip) {
      const state = useEditorStore.getState();
      const track = state.project.tracks.find(t => t.clips.some(c => c.id === draggingClip));
      if (track && !track.locked) {
        const clip = track.clips.find(c => c.id === draggingClip);
        if (clip) {
          const rect = timelineRef.current?.getBoundingClientRect();
          if (!rect) return;
          const scrollLeft = timelineRef.current?.scrollLeft || 0;
          const x = e.clientX - rect.left + scrollLeft;
          const newStartTime = Math.max(0, x / pixelsPerSecond - clip.duration / 2);
          useEditorStore.getState().updateClip(draggingClip, { startTime: newStartTime });
        }
      }
    }

    if (trimming) {
      const state = useEditorStore.getState();
      const track = state.project.tracks.find(t => t.clips.some(c => c.id === trimming.clipId));
      if (track && !track.locked) {
        const clip = track.clips.find(c => c.id === trimming.clipId);
        if (clip) {
          const rect = timelineRef.current?.getBoundingClientRect();
          if (!rect) return;
          const scrollLeft = timelineRef.current?.scrollLeft || 0;
          const x = e.clientX - rect.left + scrollLeft;

          if (trimming.edge === 'left') {
            const newStart = Math.max(0, x / pixelsPerSecond);
            const newDuration = clip.duration + (clip.startTime - newStart);
            if (newDuration > 0.5) {
              useEditorStore.getState().updateClip(trimming.clipId, {
                startTime: newStart,
                duration: newDuration,
                trimStart: clip.trimStart + (newStart - clip.startTime),
              });
            }
          } else {
            const newEnd = x / pixelsPerSecond;
            const newDuration = Math.max(0.5, newEnd - clip.startTime);
            useEditorStore.getState().updateClip(trimming.clipId, {
              duration: newDuration,
              trimEnd: clip.trimStart + newDuration,
            });
          }
        }
      }
    }
  }, [draggingClip, trimming, isDraggingPlayhead, pixelsPerSecond, getTimeFromX, setCurrentTime]);

  const handleMouseUp = useCallback(() => {
    setDraggingClip(null);
    setTrimming(null);
    setIsDraggingPlayhead(false);
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
        if (selectedClipId) {
          removeClip(selectedClipId);
        }
      }

      if (e.key === 's' || e.key === 'S') {
        if (selectedClipId) {
          splitClip(selectedClipId, currentTime);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, currentTime, removeClip, splitClip]);

  const renderRuler = useMemo(() => {
    const marks = [];
    const duration = project.duration;
    let interval: number;

    if (zoom < 0.3) interval = 20;
    else if (zoom < 0.5) interval = 10;
    else if (zoom < 1) interval = 5;
    else if (zoom < 2) interval = 2;
    else interval = 1;

    for (let i = 0; i <= duration; i += interval) {
      marks.push(
        <div
          key={i}
          className="ruler-mark"
          style={{ left: i * pixelsPerSecond }}
        >
          {formatTime(i)}
        </div>
      );
    }

    return marks;
  }, [project.duration, zoom, pixelsPerSecond]);

  return (
    <div className="timeline">
      <div className="timeline-header">
        <div className="timeline-tools">
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => selectedClipId && splitClip(selectedClipId, currentTime)}
            title="Split clip (S)"
          >
            ✂ Split
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => selectedClipId && removeClip(selectedClipId)}
            title="Delete clip (Del)"
          >
            🗑 Delete
          </button>
        </div>
        <div className="timeline-zoom">
          <span className="zoom-label">Zoom:</span>
          <input
            type="range"
            className="slider"
            min={0.1}
            max={4}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            style={{ width: 100 }}
          />
        </div>
      </div>

      <div className="timeline-content">
        <div className="timeline-tracks-header">
          {project.tracks.map((track) => (
            <div key={track.id} className="track-header">
              <span className="track-name">{track.name}</span>
              <div className="track-controls">
                <button
                  className={`track-btn ${track.locked ? 'active' : ''}`}
                  onClick={() => toggleTrackLocked(track.id)}
                  title="Lock track"
                >
                  {track.locked ? '🔒' : '🔓'}
                </button>
                <button
                  className={`track-btn ${!track.visible ? 'active' : ''}`}
                  onClick={() => toggleTrackVisible(track.id)}
                  title="Toggle visibility"
                >
                  {track.visible ? '👁' : '👁‍🗨'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="timeline-scroll" ref={timelineRef} onClick={handleTimelineClick}>
          <div
            className="timeline-ruler"
            style={{ width: timelineWidth, cursor: 'pointer' }}
            onMouseDown={handleRulerMouseDown}
          >
            <div className="ruler-marks">{renderRuler}</div>
          </div>

          <div className="tracks-container" style={{ width: timelineWidth }}>
            {project.tracks.map((track) => (
              <div
                key={track.id}
                className="timeline-track"
                style={{ opacity: track.visible ? 1 : 0.4 }}
              >
                {track.clips.map((clip) => {
                  const media = project.media.find(m => m.id === clip.mediaId);
                  const clipName = clip.trackType === 'text'
                    ? (clip.text?.slice(0, 10) || 'Text')
                    : clip.trackType === 'sticker'
                    ? clip.sticker
                    : (media?.name?.slice(0, 10) || 'Clip');

                  return (
                    <div
                      key={clip.id}
                      className={`timeline-clip clip-${clip.trackType} ${selectedClipId === clip.id ? 'selected' : ''}`}
                      style={{
                        left: clip.startTime * pixelsPerSecond,
                        width: Math.max(clip.duration * pixelsPerSecond, 20),
                      }}
                      onMouseDown={(e) => handleClipMouseDown(e, clip.id)}
                    >
                      <div
                        className="clip-trim-handle left"
                        onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'left')}
                      />
                      <span className="clip-name">{clipName}</span>
                      <div
                        className="clip-trim-handle right"
                        onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'right')}
                      />
                    </div>
                  );
                })}
              </div>
            ))}

            <div
              className="playhead"
              style={{ left: currentTime * pixelsPerSecond }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}