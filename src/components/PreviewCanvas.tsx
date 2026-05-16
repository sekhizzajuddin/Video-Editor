import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { formatTime } from '../utils/fileUtils';

export function PreviewCanvas() {
  const { project, currentTime, isPlaying, setCurrentTime, setIsPlaying } = useEditorStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentVideoClip, setCurrentVideoClip] = useState<any>(null);
  const [currentImageClip, setCurrentImageClip] = useState<any>(null);
  const [currentAudioClip, setCurrentAudioClip] = useState<any>(null);
  const videoUrlRef = useRef<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    };
  }, []);

  const videoTrack = project.tracks.find(t => t.type === 'video');
  const audioTrack = project.tracks.find(t => t.type === 'audio');
  const textTrack = project.tracks.find(t => t.type === 'text');
  const stickerTrack = project.tracks.find(t => t.type === 'sticker');

  const findClipAtTime = useCallback((track: any, time: number) => {
    return track?.clips.find(c =>
      time >= c.startTime && time < c.startTime + c.duration
    );
  }, []);

  useEffect(() => {
    if (!videoTrack) { setCurrentVideoClip(null); setCurrentImageClip(null); return; }
    const clip = findClipAtTime(videoTrack, currentTime);
    if (clip) {
      const media = project.media.find(m => m.id === clip.mediaId);
      if (media?.type === 'image') {
        setCurrentImageClip(clip);
        setCurrentVideoClip(null);
      } else {
        setCurrentVideoClip(clip);
        setCurrentImageClip(null);
      }
    } else {
      setCurrentVideoClip(null);
      setCurrentImageClip(null);
    }
  }, [currentTime, videoTrack, project.media, findClipAtTime]);

  useEffect(() => {
    if (!audioTrack) { setCurrentAudioClip(null); return; }
    const clip = findClipAtTime(audioTrack, currentTime);
    setCurrentAudioClip(clip || null);
  }, [currentTime, audioTrack, findClipAtTime]);

  useEffect(() => {
    if (videoRef.current && currentVideoClip?.mediaId) {
      const media = project.media.find(m => m.id === currentVideoClip.mediaId);
      if (media) {
        if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
        const url = URL.createObjectURL(media.blob);
        videoUrlRef.current = url;
        videoRef.current.src = url;
        const clipTime = currentTime - currentVideoClip.startTime + currentVideoClip.trimStart;
        const seekTime = clipTime / currentVideoClip.speed;
        if (Math.abs(videoRef.current.currentTime - seekTime) > 0.5) {
          videoRef.current.currentTime = seekTime;
        }
        if (isPlaying) {
          videoRef.current.play().catch(() => {});
        } else {
          videoRef.current.pause();
        }
      }
    } else if (videoRef.current) {
      videoRef.current.pause();
    }
  }, [currentVideoClip, project.media, isPlaying, currentTime]);

  useEffect(() => {
    if (audioRef.current && currentAudioClip?.mediaId) {
      const media = project.media.find(m => m.id === currentAudioClip.mediaId);
      if (media) {
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        const url = URL.createObjectURL(media.blob);
        audioUrlRef.current = url;
        audioRef.current.src = url;
        const clipTime = currentTime - currentAudioClip.startTime + currentAudioClip.trimStart;
        const seekTime = clipTime / currentAudioClip.speed;
        if (Math.abs(audioRef.current.currentTime - seekTime) > 0.5) {
          audioRef.current.currentTime = seekTime;
        }
        audioRef.current.volume = (currentAudioClip.volume / 100) * (currentAudioClip.muted ? 0 : 1);
        if (isPlaying) {
          audioRef.current.play().catch(() => {});
        } else {
          audioRef.current.pause();
        }
      }
    } else if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [currentAudioClip, project.media, isPlaying, currentTime]);

  useEffect(() => {
    let lastTime = performance.now();
    let accumulatedTime = currentTime;

    const tick = (now: number) => {
      if (!isPlaying) return;
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      accumulatedTime += delta;

      if (accumulatedTime >= project.duration) {
        setIsPlaying(false);
        setCurrentTime(project.duration);
        return;
      }

      setCurrentTime(accumulatedTime);
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    if (isPlaying) {
      lastTime = performance.now();
      animationFrameRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, project.duration, setCurrentTime, setIsPlaying]);

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

  const getFilterStyle = (filters: any) => {
    if (!filters) return 'none';
    let filterStr = '';
    if (filters.brightness !== 0) filterStr += `brightness(${1 + filters.brightness/100}) `;
    if (filters.contrast !== 0) filterStr += `contrast(${1 + filters.contrast/100}) `;
    if (filters.saturation !== 0) filterStr += `saturate(${1 + filters.saturation/100}) `;
    if (filters.preset === 'vintage') filterStr += 'sepia(0.4) contrast(1.1) ';
    if (filters.preset === 'cool') filterStr += 'hue-rotate(20deg) saturate(1.2) ';
    if (filters.preset === 'warm') filterStr += 'sepia(0.3) saturate(1.3) ';
    if (filters.preset === 'bw') filterStr += 'grayscale(1) ';
    return filterStr || 'none';
  };

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
              style={{ filter: getFilterStyle(currentVideoClip.filters) }}
              muted={false}
              playsInline
            />
          ) : currentImageClip ? (
            (() => {
              const media = project.media.find(m => m.id === currentImageClip.mediaId);
              if (!media) return null;
              if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
              imageUrlRef.current = URL.createObjectURL(media.blob);
              return (
                <img
                  src={imageUrlRef.current}
                  alt=""
                  style={{ filter: getFilterStyle(currentImageClip.filters) }}
                />
              );
            })()
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

      <audio ref={audioRef} />

      <div className="playback-controls">
        <button className="btn btn-icon btn-ghost" onClick={() => setCurrentTime(Math.max(0, currentTime - 5))}>
          ⏮
        </button>
        <button className="play-btn" onClick={handlePlayPause}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className="btn btn-icon btn-ghost" onClick={() => setCurrentTime(Math.min(project.duration, currentTime + 5))}>
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