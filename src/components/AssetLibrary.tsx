import { useRef, useCallback, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getMediaDuration } from '../utils/fileUtils';
import { generateWaveformData, generateThumbnail, generateFilmstrip, registerMediaUrl } from '../engine/useMediaManager';
import AudioTools from './AudioTools';
import type { MediaFile } from '../types';
import { v4 as uuid } from 'uuid';

function UploadIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>; }
function VideoIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>; }
function AudioFileIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>; }
function ImageIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>; }
function PlusIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function PlayIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>; }
function PauseIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>; }

function formatDur(sec?: number) {
  if (!sec) return '';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const TEXT_PRESETS = [
  { label: 'Big Title', fontSize: 72, fontWeight: 700, color: '#ffffff', fontFamily: 'Inter, sans-serif' },
  { label: 'Subtitle', fontSize: 42, fontWeight: 600, color: '#e2e8f0', fontFamily: 'Inter, sans-serif' },
  { label: 'Caption', fontSize: 28, fontWeight: 400, color: '#94a3b8', fontFamily: 'Inter, sans-serif' },
  { label: 'Bold Quote', fontSize: 48, fontWeight: 700, color: '#f59e0b', fontFamily: 'Georgia, serif' },
];

const STICKER_GROUPS = [
  { label: 'Reactions', items: ['😂', '❤️', '🔥', '👏', '😍', '🎉', '😮', '🤩', '💩', '✨'] },
  { label: 'Symbols', items: ['▶️', '⏸️', '⏹️', '⚠️', '🟢', '🔵', '⚡', '💡', '🌟', '🎯'] },
];

const EFFECT_PRESETS = [
  { label: 'None', preset: 'none', color: '#64748b' },
  { label: 'B&W', preset: 'bw', color: '#94a3b8' },
  { label: 'Sepia', preset: 'sepia', color: '#b45309' },
  { label: 'Warm', preset: 'warm', color: '#f59e0b' },
  { label: 'Cool', preset: 'cool', color: '#3b82f6' },
  { label: 'Contrast', preset: 'contrast', color: '#e2e8f0' },
];

const VFX_ITEMS = [
  { id: 'lens-flare', label: 'Lens Flare', icon: '☀️', category: 'Light Effects', gradient: 'linear-gradient(135deg, #fbbf24, #f59e0b)' },
  { id: 'film-grain', label: 'Film Grain', icon: '📽️', category: 'Overlays', gradient: 'linear-gradient(135deg, #6b7280, #374151)' },
  { id: 'light-leak', label: 'Light Leak', icon: '🌅', category: 'Light Effects', gradient: 'linear-gradient(135deg, #f97316, #ef4444)' },
  { id: 'particles', label: 'Particles', icon: '✨', category: 'Particles', gradient: 'linear-gradient(135deg, #a78bfa, #7c3aed)' },
  { id: 'glitch', label: 'Glitch', icon: '📺', category: 'Distortion', gradient: 'linear-gradient(135deg, #22d3ee, #ef4444)' },
  { id: 'vhs', label: 'VHS', icon: '📼', category: 'Overlays', gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)' },
  { id: 'chromatic', label: 'Chromatic', icon: '🌀', category: 'Distortion', gradient: 'linear-gradient(135deg, #ef4444, #3b82f6, #22c55e)' },
  { id: 'bloom', label: 'Bloom', icon: '💡', category: 'Light Effects', gradient: 'linear-gradient(135deg, #fde68a, #fbbf24)' },
  { id: 'sparkle', label: 'Sparkle', icon: '⭐', category: 'Particles', gradient: 'linear-gradient(135deg, #fde047, #facc15)' },
  { id: 'smoke', label: 'Smoke', icon: '💨', category: 'Particles', gradient: 'linear-gradient(135deg, #9ca3af, #4b5563)' },
];

const AUDIO_ITEMS = [
  { id: 'cinematic-1', label: 'Epic Cinematic', duration: 45, category: 'Cinematic', icon: '🎬' },
  { id: 'cinematic-2', label: 'Dramatic Build', duration: 30, category: 'Cinematic', icon: '🎭' },
  { id: 'upbeat-1', label: 'Happy Vibes', duration: 60, category: 'Upbeat', icon: '🎉' },
  { id: 'upbeat-2', label: 'Energetic Pop', duration: 35, category: 'Upbeat', icon: '🎸' },
  { id: 'ambient-1', label: 'Calm Ambient', duration: 120, category: 'Ambient', icon: '🌊' },
  { id: 'ambient-2', label: 'Deep Space', duration: 90, category: 'Ambient', icon: '🌌' },
  { id: 'electronic-1', label: 'Synth Wave', duration: 40, category: 'Electronic', icon: '⚡' },
  { id: 'electronic-2', label: 'Lo-Fi Beat', duration: 55, category: 'Electronic', icon: '🎧' },
  { id: 'acoustic-1', label: 'Guitar Melody', duration: 50, category: 'Acoustic', icon: '🎵' },
  { id: 'acoustic-2', label: 'Piano Soft', duration: 65, category: 'Acoustic', icon: '🎹' },
];

function MediaPanel() {
  const { project: { media }, addMedia, addClip, updateClip } = useEditorStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const processFiles = useCallback(async (files: File[]) => {
    setImporting(true);
    for (const file of files) {
      const type = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';
      const id = uuid();
      const mf: MediaFile = { id, name: file.name, type, mimeType: file.type, blob: file, duration: 0 };
      try {
        if (type !== 'image') mf.duration = await getMediaDuration(file);
        mf.thumbnail = await generateThumbnail(mf, 320, 180).catch(() => undefined);
        if (type === 'audio' || type === 'video') mf.waveform = await generateWaveformData(mf, 200).catch(() => []);
        if (type === 'video') mf.thumbnails = await generateFilmstrip(mf, 8).catch(() => []);
        registerMediaUrl(id, file);
      } catch {}
      addMedia(mf);
    }
    setImporting(false);
  }, [addMedia]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('video/') || f.type.startsWith('audio/') || f.type.startsWith('image/')
    );
    if (files.length) processFiles(files);
  }, [processFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) processFiles(files);
    e.target.value = '';
  }, [processFiles]);

  const handleAddToTimeline = (mf: MediaFile) => {
    const clip = addClip(mf.type === 'audio' ? 'audio' : 'video', mf.id);
    if (!clip) return;
    if (mf.duration) updateClip(clip.id, { duration: mf.duration });
  };

  const ICON_MAP = { video: <VideoIcon />, audio: <AudioFileIcon />, image: <ImageIcon /> };

  return (
    <div className="media-panel">
      <div
        className={`media-dropzone ${dragOver ? 'drag-over' : ''} ${importing ? 'importing' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadIcon />
        <span className="dropzone-title">{importing ? 'Importing...' : 'Drop files or click to import'}</span>
        <span className="dropzone-sub">Files stay on your device</span>
        <input ref={fileInputRef} type="file" multiple accept="video/*,audio/*,image/*" style={{ display: 'none' }} onChange={handleFileInput} />
      </div>

      {media.length > 0 && (
        <div className="media-grid">
          {media.map(mf => (
            <div key={mf.id} className="media-card"
              draggable onDragStart={e => e.dataTransfer.setData('text/plain', mf.id)}
              onClick={() => handleAddToTimeline(mf)}
            >
              <div className="media-card-thumb">
                {mf.thumbnail ? <img src={mf.thumbnail} alt={mf.name} /> : <div className="media-card-icon">{ICON_MAP[mf.type]}</div>}
                {mf.duration ? <div className="media-card-dur">{formatDur(mf.duration)}</div> : null}
              </div>
              <div className="media-card-info">
                <span className="media-card-name">{mf.name.replace(/\.[^.]+$/, '')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TextPanel() {
  const { addClip, updateClip, activeClipId, project } = useEditorStore();
  const activeClip = activeClipId ? project.tracks.flatMap(t => t.clips).find(c => c.id === activeClipId) : null;

  const handleAddText = (p: typeof TEXT_PRESETS[number]) => {
    const clip = addClip('text');
    if (clip) updateClip(clip.id, {
      textOverlay: { text: p.label, fontFamily: p.fontFamily, fontSize: p.fontSize, color: p.color, fontWeight: p.fontWeight, textAlign: 'center' as const },
      duration: 4,
    });
  };

  const TEXT_ANIMATION_PRESETS = [
    { label: 'None', animation: 'none' as const, icon: '✕' },
    { label: 'Fade In', animation: 'fadeIn' as const, icon: '✦' },
    { label: 'Typewriter', animation: 'typewriter' as const, icon: '⌨️' },
    { label: 'Slide Up', animation: 'slideUp' as const, icon: '⬆️' },
    { label: 'Slide Down', animation: 'slideDown' as const, icon: '⬇️' },
    { label: 'Scale Pop', animation: 'scalePop' as const, icon: '💥' },
    { label: 'Bounce', animation: 'bounce' as const, icon: '🏀' },
    { label: 'Glitch Text', animation: 'glitch' as const, icon: '📺' },
    { label: 'Wave', animation: 'wave' as const, icon: '🌊' },
  ];

  const handleAddAnimatedText = (anim: typeof TEXT_ANIMATION_PRESETS[number]) => {
    if (activeClip && activeClip.trackType === 'text') {
      updateClip(activeClip.id, {
        textAnimation: anim.animation,
      });
    } else {
      const clip = addClip('text');
      if (clip) updateClip(clip.id, {
        textOverlay: { text: anim.label, fontFamily: 'Inter, sans-serif', fontSize: 48, color: '#ffffff', fontWeight: 600, textAlign: 'center' as const },
        duration: 4,
        textAnimation: anim.animation,
      });
    }
  };

  return (
    <div className="panel-content">
      <p className="panel-hint">Click a preset to add text</p>
      <div className="text-preset-list">
        {TEXT_PRESETS.map(p => (
          <button key={p.label} className="text-preset-btn" onClick={() => handleAddText(p)}>
            <span className="text-preset-label" style={{ fontSize: Math.min(p.fontSize / 3, 18), fontFamily: p.fontFamily, color: p.color, fontWeight: p.fontWeight }}>{p.label}</span>
          </button>
        ))}
      </div>

      <p className="panel-hint" style={{ marginTop: 14 }}>Animated text</p>
      <div className="text-anim-grid">
        {TEXT_ANIMATION_PRESETS.map(a => (
          <button key={a.animation} className="text-anim-btn" onClick={() => handleAddAnimatedText(a)}>
            <span className="text-anim-icon">{a.icon}</span>
            <span className="text-anim-label">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StickersPanel() {
  const { addClip, updateClip } = useEditorStore();
  const add = (emoji: string) => { const c = addClip('sticker', undefined, emoji); if (c) updateClip(c.id, { duration: 3 }); };
  return (
    <div className="panel-content">
      {STICKER_GROUPS.map(g => (
        <div key={g.label} className="sticker-group">
          <div className="sticker-group-label">{g.label}</div>
          <div className="sticker-grid">{g.items.map(s => <button key={s} className="sticker-btn" onClick={() => add(s)}>{s}</button>)}</div>
        </div>
      ))}
    </div>
  );
}

function EffectsPanel() {
  const { activeClipId, getClip, updateClip } = useEditorStore();
  const clip = activeClipId ? getClip(activeClipId) : null;
  const apply = (preset: string) => {
    if (clip) updateClip(clip.id, { filters: { brightness: clip.filters?.brightness ?? 0, contrast: clip.filters?.contrast ?? 0, saturation: clip.filters?.saturation ?? 0, preset: preset as any } });
  };
  return (
    <div className="panel-content">
      <p className="panel-hint">{clip ? 'Applying to selected clip' : 'Select a clip first'}</p>
      <div className="effect-grid">
        {EFFECT_PRESETS.map(e => (
          <button key={e.preset} className={`effect-btn ${(clip?.filters?.preset || 'none') === e.preset ? 'active' : ''}`}
            onClick={() => apply(e.preset)} disabled={!clip}>
            <div className="effect-swatch" style={{ background: e.color }} />
            <span className="effect-name">{e.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function VFXPanel() {
  const { addClip, updateClip, currentTime } = useEditorStore();
  const categories = [...new Set(VFX_ITEMS.map(v => v.category))];

  const handleAddVFX = (vfx: typeof VFX_ITEMS[number]) => {
    const clip = addClip('vfx');
    if (clip) {
      updateClip(clip.id, {
        duration: 3,
        startAt: currentTime,
        vfxOverlay: {
          type: vfx.id as any,
          intensity: 0.5,
          position: { x: 0, y: 0 },
          scale: 1,
          rotation: 0,
          opacity: 0.8,
        },
      });
    }
  };

  return (
    <div className="panel-content">
      {categories.map(cat => (
        <div key={cat} className="vfx-category">
          <div className="vfx-category-label">{cat}</div>
          <div className="vfx-grid">
            {VFX_ITEMS.filter(v => v.category === cat).map(v => (
              <div key={v.id} className="vfx-card" onClick={() => handleAddVFX(v)}>
                <div className="vfx-preview" style={{ background: v.gradient }}>{v.icon}</div>
                <span className="vfx-label">{v.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AudioPanel() {
  const { addClip, updateClip, currentTime } = useEditorStore();
  const [search, setSearch] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const categories = [...new Set(AUDIO_ITEMS.map(a => a.category))];

  const filtered = AUDIO_ITEMS.filter(a =>
    a.label.toLowerCase().includes(search.toLowerCase()) ||
    a.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddAudio = (audio: typeof AUDIO_ITEMS[number]) => {
    const clip = addClip('audio');
    if (clip) updateClip(clip.id, { duration: audio.duration, startAt: currentTime });
  };

  const handlePreview = (audio: typeof AUDIO_ITEMS[number]) => {
    if (playingId === audio.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    // In a real app, this would play a preview URL
    setPlayingId(audio.id);
    setTimeout(() => setPlayingId(null), 3000);
  };

  return (
    <div className="panel-content">
      <input
        className="audio-search"
        placeholder="Search audio..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {categories.map(cat => {
        const items = filtered.filter(a => a.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} className="audio-category">
            <div className="audio-category-label">{cat}</div>
            <div className="audio-list">
              {items.map(a => (
                <div key={a.id} className="audio-item" onClick={() => handleAddAudio(a)}>
                  <span className="audio-item-icon">{a.icon}</span>
                  <div className="audio-item-info">
                    <div className="audio-item-name">{a.label}</div>
                    <div className="audio-item-dur">{formatDur(a.duration)}</div>
                  </div>
                  <button className="audio-item-play" onClick={(e) => { e.stopPropagation(); handlePreview(a); }}>
                    {playingId === a.id ? <PauseIcon /> : <PlayIcon />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {filtered.length === 0 && <p className="panel-hint">No audio found</p>}
      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
}

const PANEL_MAP: Record<string, () => JSX.Element> = {
  media: MediaPanel,
  text: TextPanel,
  stickers: StickersPanel,
  effects: EffectsPanel,
  vfx: VFXPanel,
  audio: AudioPanel,
  ai: AudioTools,
};

const TITLE_MAP: Record<string, string> = {
  media: 'Media',
  text: 'Text',
  stickers: 'Stickers',
  effects: 'Effects',
  vfx: 'VFX',
  audio: 'Audio',
  ai: 'AI Tools',
};

export default function AssetLibrary({ activeTool }: { activeTool: string }) {
  const Panel = PANEL_MAP[activeTool] || MediaPanel;
  const title = TITLE_MAP[activeTool] || 'Media';

  return (
    <aside className="asset-library">
      <div className="asset-library-header">
        <span className="asset-library-title">{title}</span>
        {activeTool === 'media' && (
          <button className="asset-import-btn" onClick={() => document.querySelector<HTMLInputElement>('.media-dropzone input')?.click()}>
            <PlusIcon /> Import
          </button>
        )}
      </div>
      <div className="asset-panel">
        <Panel />
      </div>
    </aside>
  );
}
