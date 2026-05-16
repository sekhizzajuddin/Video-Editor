import { useRef, useState, useEffect } from 'react';
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

  const pixelsPerSecond = PIXELS_PER_SECOND * zoom;
  const timelineWidth = project.duration * pixelsPerSecond;

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('timeline-ruler')) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = x / pixelsPerSecond;
      setCurrentTime(Math.max(0, Math.min(time, project.duration)));
      setSelectedClip(null);
    }
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

  const handleMouseMove = (e: MouseEvent) => {
    if (!timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    if (draggingClip) {
      const track = project.tracks.find(t => t.clips.some(c => c.id === draggingClip));
      if (track && !track.locked) {
        const clip = track.clips.find(c => c.id === draggingClip);
        if (clip) {
          const newStartTime = Math.max(0, x / pixelsPerSecond - clip.duration / 2);
          useEditorStore.getState().updateClip(draggingClip, { startTime: newStartTime });
        }
      }
    }
    
    if (trimming) {
      const track = project.tracks.find(t => t.clips.some(c => c.id === trimming.clipId));
      if (track && !track.locked) {
        const clip = track.clips.find(c => c.id === trimming.clipId);
        if (clip) {
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
            const newDuration = Math.max(0.5, x / pixelsPerSecond - clip.startTime);
            useEditorStore.getState().updateClip(trimming.clipId, {
              duration: newDuration,
              trimEnd: clip.trimStart + newDuration,
            });
          }
        }
      }
    }
  };

  const handleMouseUp = () => {
    setDraggingClip(null);
    setTrimming(null);
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingClip, trimming]);

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

  const renderRuler = () => {
    const marks = [];
    const interval = zoom < 0.5 ? 10 : zoom < 1 ? 5 : 1;
    
    for (let i = 0; i <= project.duration; i += interval) {
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
  };

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
                  🔒
                </button>
                <button
                  className={`track-btn ${!track.visible ? 'active' : ''}`}
                  onClick={() => toggleTrackVisible(track.id)}
                  title="Toggle visibility"
                >
                  👁
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="timeline-scroll" ref={timelineRef} onClick={handleTimelineClick}>
          <div className="timeline-ruler" style={{ width: timelineWidth }}>
            <div className="ruler-marks">{renderRuler()}</div>
          </div>

          <div className="tracks-container" style={{ width: timelineWidth }}>
            {project.tracks.map((track) => (
              <div
                key={track.id}
                className="timeline-track"
                style={{ opacity: track.visible ? 1 : 0.5 }}
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
                        width: clip.duration * pixelsPerSecond,
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