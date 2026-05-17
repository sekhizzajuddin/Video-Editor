import { useRef, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getMediaDuration } from '../utils/fileUtils';
import { generateWaveformData, generateThumbnail } from '../engine/useMediaManager';
import type { MediaFile } from '../types';

function UploadIcon() { return <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>; }

function formatDuration(sec?: number): string {
  if (!sec) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const toolTitles: Record<string, string> = {
  media: 'Media',
  text: 'Text',
  stickers: 'Stickers',
  effects: 'Effects',
  audio: 'Audio',
};

interface Props {
  activeTool: string;
}

export default function AssetLibrary({ activeTool }: Props) {
  const { project: { media }, addMedia, addClip, removeMedia } = useEditorStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type: MediaFile['type'] | null = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'image' : null;
      if (!type) continue;
      const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let thumbnail: string | undefined;
      let duration: number | undefined;
      let waveform: number[] | undefined;
      try { duration = await getMediaDuration(file); } catch {}
      const mf: MediaFile = { id, name: file.name, type, mimeType: file.type, blob: file, duration };
      if (type === 'video' || type === 'image') { try { thumbnail = await generateThumbnail(mf, 320, 180); } catch {} }
      if (type === 'audio' || type === 'video') {
        try { waveform = await generateWaveformData(mf, 128); } catch {}
      }
      addMedia({ id, name: file.name, type, mimeType: file.type, blob: file, duration, thumbnail, waveform });
    }
  }, [addMedia]);

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); handleFile(e.dataTransfer.files); }, [handleFile]);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const title = toolTitles[activeTool] || 'Media';
  const filteredMedia = media;

  return (
    <div className="asset-library" onDrop={handleDrop} onDragOver={handleDragOver}>
      <div className="asset-library-header">
        <span className="asset-library-title">{title}</span>
        <button className="asset-import-btn" onClick={() => fileRef.current?.click()}>+ Import</button>
      </div>
      <input ref={fileRef} type="file" accept="video/*,audio/*,image/*" multiple hidden onChange={(e) => handleFile(e.target.files)} />
      <div className="asset-library-body">
        {filteredMedia.length === 0 ? (
          <div className="asset-empty-state" onClick={() => fileRef.current?.click()}>
            <UploadIcon />
            <span className="asset-empty-text">Drop files or click to import</span>
          </div>
        ) : (
      <div className="asset-grid">
        {filteredMedia
          .filter((m) => {
            if (activeTool === 'media' || activeTool === 'all') return true;
            if (activeTool === 'audio') return m.type === 'audio';
            if (activeTool === 'text' || activeTool === 'sticker') return m.type === 'image';
            return m.type === activeTool;
          })
          .map((m) => (
              <div
                key={m.id}
                className="asset-item"
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', m.id); e.dataTransfer.effectAllowed = 'copy'; }}
                onDoubleClick={() => addClip(m.type === 'audio' ? 'audio' : 'video', m.id)}
              >
                <button className="asset-remove" onClick={(e) => { e.stopPropagation(); removeMedia(m.id); }}>×</button>
                {m.thumbnail ? (
                  <img src={m.thumbnail} alt={m.name} className="asset-thumb" />
                ) : m.type === 'audio' && m.waveform ? (
                  <div className="asset-audio-preview">
                    {m.waveform.slice(0, 40).map((v, i) => (
                      <div key={i} className="asset-wave-bar" style={{ height: `${Math.max(1, v * 24)}px` }} />
                    ))}
                  </div>
                ) : (
                  <div className="asset-icon">{m.type === 'audio' ? '♪' : '🎬'}</div>
                )}
                <div className="asset-item-info">
                  <span className="asset-item-name">{m.name}</span>
                  <span className="asset-item-duration">{formatDuration(m.duration)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
