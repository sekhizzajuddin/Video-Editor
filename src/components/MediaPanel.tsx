import { useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { useEditorStore } from '../store/editorStore';
import { getFileType, generateThumbnail, getMediaDuration, formatDuration } from '../utils/fileUtils';
import type { MediaFile } from '../types';

const EMOJIS = ['😀', '🔥', '💯', '❤️', '⭐', '👏', '🎉', '🚀', '💡', '✨', '🎵', '🎬', '📱', '💻', '🎮', '🎨', '🏆', '👑', '🌟', '💫', '⚡', '🌈', '🍕', '🍔', '🍟', '🌮', '🍦', '🍪', '🎂', '🎁', '🎈', '🌸', '🌺', '🌴', '🏖️', '✈️', '🚗', '🚲', '⚽', '🏀'];

type TabType = 'media' | 'audio' | 'text' | 'stickers';

export function MediaPanel() {
  const { project, addMedia, addClip } = useEditorStore();
  const [activeTab, setActiveTab] = useState<TabType>('media');
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const type = getFileType(file);
      const thumbnail = await generateThumbnail(file);
      const duration = await getMediaDuration(file);

      const mediaFile: MediaFile = {
        id: uuid(),
        name: file.name,
        type,
        mimeType: file.type,
        blob: file,
        duration,
        thumbnail,
      };

      addMedia(mediaFile);
    }
  }, [addMedia]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const type = getFileType(file);
      const thumbnail = await generateThumbnail(file);
      const duration = await getMediaDuration(file);

      const mediaFile: MediaFile = {
        id: uuid(),
        name: file.name,
        type,
        mimeType: file.type,
        blob: file,
        duration,
        thumbnail,
      };

      addMedia(mediaFile);
    }
    e.target.value = '';
  };

  const handleMediaDrag = (e: React.DragEvent, mediaId: string) => {
    e.dataTransfer.setData('mediaId', mediaId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const filteredMedia = project.media.filter(m => {
    if (activeTab === 'media') return m.type === 'video' || m.type === 'image';
    if (activeTab === 'audio') return m.type === 'audio';
    return false;
  });

  const textClips = project.tracks.find(t => t.type === 'text')?.clips || [];
  const stickerClips = project.tracks.find(t => t.type === 'sticker')?.clips || [];

  return (
    <div className="media-panel">
      <div className="panel-header">
        <span className="panel-title">Media Library</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {project.media.length} files
        </span>
      </div>

      <div className="panel-tabs">
        <button
          className={`tab-btn ${activeTab === 'media' ? 'active' : ''}`}
          onClick={() => setActiveTab('media')}
        >
          Media
        </button>
        <button
          className={`tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => setActiveTab('audio')}
        >
          Audio
        </button>
        <button
          className={`tab-btn ${activeTab === 'text' ? 'active' : ''}`}
          onClick={() => setActiveTab('text')}
        >
          Text
        </button>
        <button
          className={`tab-btn ${activeTab === 'stickers' ? 'active' : ''}`}
          onClick={() => setActiveTab('stickers')}
        >
          Stickers
        </button>
      </div>

      <div className="panel-content">
        {activeTab === 'media' && (
          <>
            <div
              className={`import-zone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <div className="import-icon">📁</div>
              <div className="import-text">Drop files here</div>
              <div className="import-hint">or click to browse</div>
              <input
                id="file-input"
                type="file"
                accept="video/*,image/*,audio/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>

            <div className="media-grid">
              {filteredMedia.map((media) => (
                <div
                  key={media.id}
                  className="media-item"
                  draggable
                  onDragStart={(e) => handleMediaDrag(e, media.id)}
                  onClick={() => addClip(media.type === 'audio' ? 'audio' : 'video', media.id)}
                >
                  {media.thumbnail ? (
                    <img src={media.thumbnail} alt={media.name} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 24 }}>
                      {media.type === 'audio' ? '🎵' : '🎬'}
                    </div>
                  )}
                  <div className="media-item-overlay">
                    <span className="media-item-name">{media.name}</span>
                  </div>
                  {media.duration && (
                    <span className="media-item-duration" style={{ position: 'absolute', bottom: 4, right: 4 }}>
                      {formatDuration(media.duration)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'audio' && (
          <>
            <div
              className={`import-zone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('audio-input')?.click()}
            >
              <div className="import-icon">🎵</div>
              <div className="import-text">Drop audio here</div>
              <div className="import-hint">MP3, WAV supported</div>
              <input
                id="audio-input"
                type="file"
                accept="audio/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>

            <div className="media-grid">
              {filteredMedia.map((media) => (
                <div
                  key={media.id}
                  className="media-item"
                  style={{ aspectRatio: '1', background: 'linear-gradient(135deg, #10B981, #047857)' }}
                  draggable
                  onDragStart={(e) => handleMediaDrag(e, media.id)}
                  onClick={() => addClip('audio', media.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 32 }}>
                    🎵
                  </div>
                  <div className="media-item-overlay">
                    <span className="media-item-name">{media.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'text' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button className="btn btn-primary" onClick={() => addClip('text')}>
              + Add Text
            </button>
            {textClips.length > 0 && (
              <div className="media-grid">
                {textClips.map((clip) => (
                  <div
                    key={clip.id}
                    className="media-item"
                    style={{ aspectRatio: '16/9', background: 'linear-gradient(135deg, #F59E0B, #B45309)' }}
                    onClick={() => useEditorStore.getState().setSelectedClip(clip.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 14, color: 'white', padding: 8, textAlign: 'center' }}>
                      {clip.text?.slice(0, 20) || 'Text'}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              Click to add a text layer to your timeline
            </p>
          </div>
        )}

        {activeTab === 'stickers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button className="btn btn-primary" onClick={() => {}}>
              Click an emoji to add
            </button>
            <div className="emoji-grid">
              {EMOJIS.map((emoji, i) => (
                <button
                  key={i}
                  className="emoji-btn"
                  onClick={() => addClip('sticker', undefined, emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            {stickerClips.length > 0 && (
              <>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Recent stickers:</p>
                <div className="media-grid">
                  {stickerClips.slice(-4).map((clip) => (
                    <div
                      key={clip.id}
                      className="media-item"
                      style={{ aspectRatio: '1', background: 'linear-gradient(135deg, #EC4899, #BE185D)', cursor: 'pointer' }}
                      onClick={() => useEditorStore.getState().setSelectedClip(clip.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 32 }}>
                        {clip.sticker}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}