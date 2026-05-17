import React, { useRef, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { generateThumbnail, getMediaDuration, extractAudioWaveform } from '../utils/fileUtils';

export default function MediaPanel() {
  const { project: { media }, addMedia, removeMedia, addClip } = useEditorStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'image' : null;
      if (!type) continue;
      const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let thumbnail = '';
      let duration: number | undefined;
      let waveform: number[] | undefined;
      try {
        duration = await getMediaDuration(file);
      } catch { /* ignore */ }
      if (type === 'video' || type === 'image') {
        try { thumbnail = await generateThumbnail(file); } catch { /* ignore */ }
      }
      if (type === 'audio') {
        try { waveform = await extractAudioWaveform(file); } catch { /* ignore */ }
      }
      addMedia({ id, name: file.name, type, mimeType: file.type, blob: file, duration, thumbnail, waveform });
    }
  }, [addMedia]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files);
  }, [handleFile]);

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDragStart = (e: React.DragEvent, mediaId: string) => {
    e.dataTransfer.setData('text/plain', mediaId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="panel media-panel" onDrop={handleDrop} onDragOver={handleDragOver}>
      <div className="panel-header">
        <span>Media</span>
        <button className="btn icon" onClick={() => fileRef.current?.click()} title="Import media">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a1 1 0 011 1v4h4a1 1 0 110 2H9v4a1 1 0 11-2 0V9H3a1 1 0 010-2h4V3a1 1 0 011-1z"/></svg>
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="video/*,audio/*,image/*"
        multiple
        hidden
        onChange={(e) => handleFile(e.target.files)}
      />
      <div className="media-grid">
        {media.map((m) => (
          <div
            key={m.id}
            className="media-item"
            draggable
            onDragStart={(e) => handleDragStart(e, m.id)}
              onDoubleClick={() => {
              const trackMap: Record<string, 'video' | 'audio'> = { video: 'video', audio: 'audio' };
              addClip(m.type === 'image' ? 'video' : trackMap[m.type] || 'video', m.id);
            }}
          >
            <button className="media-remove" onClick={(e) => { e.stopPropagation(); removeMedia(m.id); }}>×</button>
            {m.thumbnail ? (
              <img src={m.thumbnail} alt={m.name} className="media-thumb" />
            ) : m.type === 'audio' && m.waveform && m.waveform.length > 0 ? (
              <div className="waveform-preview">
                {m.waveform.slice(0, 50).map((v, i) => (
                  <div key={i} className="waveform-bar" style={{ height: `${Math.max(2, v * 40)}px` }} />
                ))}
              </div>
            ) : (
              <div className="media-placeholder">{m.type === 'audio' ? '♪' : m.type === 'image' ? '🖼' : '🎬'}</div>
            )}
            <span className="media-name">{m.name}</span>
          </div>
        ))}
        {media.length === 0 && (
          <div className="empty-media-hint">Drop media here or click + to import</div>
        )}
      </div>
    </div>
  );
}
