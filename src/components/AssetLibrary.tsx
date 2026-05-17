import { useRef, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getMediaDuration } from '../utils/fileUtils';
import { generateWaveformData, generateThumbnail } from '../engine/useMediaManager';
import type { MediaFile } from '../types';

function UploadIcon() { return <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>; }

function formatDuration(sec?: number): string {
  if (!sec) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ─── Text Presets ───────────────────────────────────────────────
const TEXT_PRESETS = [
  { label: 'Big Title', fontSize: 72, fontWeight: 700, color: '#ffffff', fontFamily: 'Inter, sans-serif' },
  { label: 'Subtitle', fontSize: 42, fontWeight: 600, color: '#e2e8f0', fontFamily: 'Inter, sans-serif' },
  { label: 'Caption', fontSize: 28, fontWeight: 400, color: '#94a3b8', fontFamily: 'Inter, sans-serif' },
  { label: 'Bold Quote', fontSize: 48, fontWeight: 700, color: '#f59e0b', fontFamily: 'Georgia, serif' },
  { label: 'Mono Code', fontSize: 32, fontWeight: 400, color: '#34d399', fontFamily: 'JetBrains Mono, monospace' },
  { label: 'Neon', fontSize: 56, fontWeight: 700, color: '#a78bfa', fontFamily: 'Inter, sans-serif' },
];

function TextPanel() {
  const { addClip, updateClip } = useEditorStore();
  const handleAddText = (preset: typeof TEXT_PRESETS[number]) => {
    const clip = addClip('text');
    if (clip) {
      updateClip(clip.id, {
        textOverlay: {
          text: preset.label,
          fontFamily: preset.fontFamily,
          fontSize: preset.fontSize,
          color: preset.color,
          fontWeight: preset.fontWeight,
          textAlign: 'center',
        },
        duration: 4,
      });
    }
  };
  return (
    <div className="panel-content">
      <p className="panel-hint">Click a preset to add text to the timeline</p>
      <div className="text-preset-list">
        {TEXT_PRESETS.map(p => (
          <button key={p.label} className="text-preset-btn" onClick={() => handleAddText(p)}>
            <span className="text-preset-label" style={{ fontSize: Math.min(p.fontSize / 2.5, 22), fontFamily: p.fontFamily, color: p.color, fontWeight: p.fontWeight }}>{p.label}</span>
            <span className="text-preset-meta">{p.fontSize}px · {p.fontFamily.split(',')[0]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Sticker Panel ──────────────────────────────────────────────
const STICKER_GROUPS = [
  { label: 'Reactions', items: ['😂', '❤️', '🔥', '👏', '😍', '🎉', '😮', '👍', '💯', '✨', '🚀', '⭐'] },
  { label: 'Symbols', items: ['▶️', '⏸️', '⏹️', '🔴', '🟢', '🔵', '⚡', '💥', '🌟', '💫', '🎵', '📍'] },
  { label: 'Arrows', items: ['⬆️', '⬇️', '⬅️', '➡️', '↗️', '↘️', '🔄', '↩️', '↪️', '🔃', '⤴️', '⤵️'] },
];

function StickersPanel() {
  const { addClip, updateClip } = useEditorStore();
  const handleAddSticker = (emoji: string) => {
    const clip = addClip('sticker', undefined, emoji);
    if (clip) updateClip(clip.id, { duration: 3 });
  };
  return (
    <div className="panel-content">
      <p className="panel-hint">Click a sticker to add it to the timeline</p>
      {STICKER_GROUPS.map(g => (
        <div key={g.label} className="sticker-group">
          <div className="sticker-group-label">{g.label}</div>
          <div className="sticker-grid">
            {g.items.map(s => (
              <button key={s} className="sticker-btn" onClick={() => handleAddSticker(s)} title={s}>{s}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Effects Panel ──────────────────────────────────────────────
const EFFECT_PRESETS = [
  { label: 'None', preset: 'none', color: '#64748b', desc: 'Remove all filters' },
  { label: 'B&W', preset: 'bw', color: '#94a3b8', desc: 'Black & white' },
  { label: 'Sepia', preset: 'sepia', color: '#b45309', desc: 'Warm vintage tone' },
  { label: 'Warm', preset: 'warm', color: '#f59e0b', desc: 'Warm golden hues' },
  { label: 'Cool', preset: 'cool', color: '#3b82f6', desc: 'Cool blue tones' },
  { label: 'Contrast', preset: 'contrast', color: '#e2e8f0', desc: 'High contrast' },
  { label: 'Invert', preset: 'invert', color: '#a78bfa', desc: 'Invert colors' },
] as const;

function EffectsPanel() {
  const { activeClipId, getClip, updateClip } = useEditorStore();
  const clip = activeClipId ? getClip(activeClipId) : null;
  const currentPreset = clip?.filters?.preset || 'none';
  const handleApply = (preset: string) => {
    if (!clip) return;
    updateClip(clip.id, { filters: { brightness: 0, contrast: 0, saturation: 0, preset: preset as any } });
  };
  return (
    <div className="panel-content">
      {!clip && <p className="panel-hint">Select a clip on the timeline to apply effects</p>}
      {clip && <p className="panel-hint">Applying to: <strong style={{ color: '#a78bfa' }}>{clip.textOverlay?.text || clip.mediaId || 'Clip'}</strong></p>}
      <div className="effect-grid">
        {EFFECT_PRESETS.map(e => (
          <button
            key={e.preset}
            className={`effect-btn ${currentPreset === e.preset ? 'active' : ''}`}
            onClick={() => handleApply(e.preset)}
            disabled={!clip}
          >
            <div className="effect-swatch" style={{ background: e.preset === 'none' ? 'var(--bg-tertiary)' : `linear-gradient(135deg, ${e.color}66, ${e.color}22)`, borderColor: currentPreset === e.preset ? e.color : 'transparent' }} />
            <span className="effect-name">{e.label}</span>
            <span className="effect-desc">{e.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Media / Audio Panel ─────────────────────────────────────────
interface Props { activeTool: string; }

export default function AssetLibrary({ activeTool }: Props) {
  const { project: { media }, addMedia, addClip, removeMedia } = useEditorStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type: MediaFile['type'] | null =
        file.type.startsWith('video/') ? 'video' :
        file.type.startsWith('audio/') ? 'audio' :
        file.type.startsWith('image/') ? 'image' : null;
      if (!type) continue;
      const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let thumbnail: string | undefined;
      let duration: number | undefined;
      let waveform: number[] | undefined;
      try { duration = await getMediaDuration(file); } catch {}
      const mf: MediaFile = { id, name: file.name, type, mimeType: file.type, blob: file, duration };
      if (type === 'video' || type === 'image') { try { thumbnail = await generateThumbnail(mf, 320, 180); } catch {} }
      if (type === 'audio' || type === 'video') { try { waveform = await generateWaveformData(mf, 128); } catch {} }
      addMedia({ id, name: file.name, type, mimeType: file.type, blob: file, duration, thumbnail, waveform });
    }
  }, [addMedia]);

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); handleFile(e.dataTransfer.files); }, [handleFile]);

  // Panels that don't show the media grid
  if (activeTool === 'text') return (
    <div className="asset-library"><div className="asset-library-header"><span className="asset-library-title">Text</span></div><TextPanel /></div>
  );
  if (activeTool === 'stickers') return (
    <div className="asset-library"><div className="asset-library-header"><span className="asset-library-title">Stickers</span></div><StickersPanel /></div>
  );
  if (activeTool === 'effects') return (
    <div className="asset-library"><div className="asset-library-header"><span className="asset-library-title">Effects</span></div><EffectsPanel /></div>
  );

  // Media / Audio panel
  const filteredMedia = activeTool === 'audio'
    ? media.filter(m => m.type === 'audio')
    : media;

  const accept = activeTool === 'audio' ? 'audio/*' : 'video/*,audio/*,image/*';
  const title = activeTool === 'audio' ? 'Audio' : 'Media';

  return (
    <div className="asset-library" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
      <div className="asset-library-header">
        <span className="asset-library-title">{title}</span>
        <button className="asset-import-btn" onClick={() => fileRef.current?.click()}>+ Import</button>
      </div>
      <input ref={fileRef} type="file" accept={accept} multiple hidden onChange={e => handleFile(e.target.files)} />
      <div className="asset-library-body">
        {filteredMedia.length === 0 ? (
          <div className="asset-empty-state" onClick={() => fileRef.current?.click()}>
            <UploadIcon />
            <span className="asset-empty-text">
              {activeTool === 'audio' ? 'Drop audio files or click to import' : 'Drop files or click to import'}
            </span>
          </div>
        ) : (
          <div className="asset-grid">
            {filteredMedia.map(m => (
              <div
                key={m.id}
                className="asset-item"
                draggable
                onDragStart={e => { e.dataTransfer.setData('text/plain', m.id); e.dataTransfer.effectAllowed = 'copy'; }}
                onDoubleClick={() => addClip(m.type === 'audio' ? 'audio' : 'video', m.id)}
              >
                <button className="asset-remove" onClick={e => { e.stopPropagation(); removeMedia(m.id); }}>×</button>
                {m.thumbnail ? (
                  <img src={m.thumbnail} alt={m.name} className="asset-thumb" />
                ) : m.type === 'audio' && m.waveform ? (
                  <div className="asset-audio-preview">
                    {m.waveform.slice(0, 40).map((v, i) => (
                      <div key={i} className="asset-wave-bar" style={{ height: `${Math.max(2, v * 28)}px` }} />
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
