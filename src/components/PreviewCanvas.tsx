import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { formatTime } from '../utils/fileUtils';

export function PreviewCanvas() {
  const { project, currentTime, isPlaying, setCurrentTime, setIsPlaying } = useEditorStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentVideoClip, setCurrentVideoClip] = useState<any>(null);

  const videoTrack = project.tracks.find(t => t.type === 'video');
  const textTrack = project.tracks.find(t => t.type === 'text');
  const stickerTrack = project.tracks.find(t => t.type === 'sticker');

  useEffect(() => {
    if (!videoTrack) return;
    
    const clip = videoTrack.clips.find(c => 
      currentTime >= c.startTime && currentTime < c.startTime + c.duration
    );
    
    setCurrentVideoClip(clip || null);
  }, [currentTime, videoTrack]);

  useEffect(() => {
    if (videoRef.current && currentVideoClip?.mediaId) {
      const media = project.media.find(m => m.id === currentVideoClip.mediaId);
      if (media) {
        const url = URL.createObjectURL(media.blob);
        videoRef.current.src = url;
        
        const clipTime = currentTime - currentVideoClip.startTime + currentVideoClip.trimStart;
        videoRef.current.currentTime = clipTime / currentVideoClip.speed;
        
        return () => URL.revokeObjectURL(url);
      }
    }
  }, [currentVideoClip, project.media]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime(currentTime + 0.1);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentTime, setCurrentTime]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(parseFloat(e.target.value));
  };

  const textClips = textTrack?.clips.filter(c => 
    currentTime >= c.startTime && currentTime < c.startTime + c.duration
  ) || [];

  const stickerClips = stickerTrack?.clips.filter(c => 
    currentTime >= c.startTime && currentTime < c.startTime + c.duration
  ) || [];

  return (
    <div className="preview-container">
      <div className="preview-header">
        <span className="preview-title">Preview</span>
        <div className="preview-controls">
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {project.media.length} media files
          </span>
        </div>
      </div>

      <div className="preview-canvas-wrapper">
        <div className="preview-canvas">
          {currentVideoClip ? (
            <video
              ref={videoRef}
              style={{
                filter: currentVideoClip.filters ? 
                  `brightness(${1 + currentVideoClip.filters.brightness/100}) ` +
                  `contrast(${1 + currentVideoClip.filters.contrast/100}) ` +
                  `saturate(${1 + currentVideoClip.filters.saturation/100})`
                  : 'none'
              }}
              muted
            />
          ) : (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100%', 
              color: 'var(--text-muted)',
              fontSize: 48,
              flexDirection: 'column',
              gap: 16
            }}>
              <span>🎬</span>
              <span style={{ fontSize: 14 }}>Add media to preview</span>
            </div>
          )}
          
          {textClips.map((clip) => (
            <div key={clip.id} className="preview-text-overlay">
              <div 
                className="preview-text-content"
                style={{
                  fontFamily: clip.textStyle?.fontFamily,
                  fontSize: clip.textStyle?.fontSize,
                  color: clip.textStyle?.color,
                  fontWeight: clip.textStyle?.fontWeight,
                  textAlign: clip.textStyle?.textAlign,
                }}
              >
                {clip.text}
              </div>
            </div>
          ))}

          <div className="preview-sticker-overlay">
            {stickerClips.map((clip) => (
              <div
                key={clip.id}
                className="sticker-item"
                style={{
                  left: `${clip.x || 50}%`,
                  top: `${clip.y || 50}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {clip.sticker}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="playback-controls">
        <button className="btn btn-icon btn-ghost" onClick={() => setCurrentTime(Math.max(0, currentTime - 5))}>
          ⏮
        </button>
        <button className="play-btn" onClick={handlePlayPause}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className="btn btn-icon btn-ghost" onClick={() => setCurrentTime(currentTime + 5)}>
          ⏭
        </button>
        
        <div className="time-display">
          {formatTime(currentTime)} / {formatTime(project.duration)}
        </div>
        
        <input
          type="range"
          className="slider"
          min={0}
          max={project.duration}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          style={{ width: 200 }}
        />
      </div>
    </div>
  );
}