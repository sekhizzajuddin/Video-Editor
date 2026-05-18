import { useRef, useCallback, useState, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getMediaDuration } from '../utils/fileUtils';
import { generateWaveformData, generateThumbnail, generateFilmstrip, registerMediaUrl } from '../engine/useMediaManager';
import type { MediaFile } from '../types';
import { v4 as uuid } from 'uuid';

function UploadIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>; }
function VideoIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>; }
function AudioIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>; }
function ImageIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>; }
function PlusIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }

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
  { label: 'Reactions', items: ['😂', '❤️', '🔥', '👏', '😍', '🎉', '😮', '', '💯', '✨'] },
  { label: 'Symbols', items: ['▶️', '⏸️', '⏹️', '🔴', '🟢', '🔵', '⚡', '', '🌟', '💫'] },
];

const EFFECT_PRESETS = [
  { label: 'None', preset: 'none', color: '#64748b' },
  { label: 'B&W', preset: 'bw', color: '#94a3b8' },
  { label: 'Sepia', preset: 'sepia', color: '#b45309' },
  { label: 'Warm', preset: 'warm', color: '#f59e0b' },
  { label: 'Cool', preset: 'cool', color: '#3b82f6' },
  { label: 'Contrast', preset: 'contrast', color: '#e2e8f0' },
];

const TRANSITIONS = [
  { id: 'fade', label: 'Fade', preview: '◐' },
  { id: 'dissolve', label: 'Dissolve', preview: '◈' },
  { id: 'wipe-left', label: 'Wipe ←', preview: '◁' },
  { id: 'wipe-right', label: 'Wipe →', preview: '▷' },
  { id: 'slide-left', label: 'Slide ←', preview: '⟵' },
  { id: 'slide-right', label: 'Slide →', preview: '⟶' },
  { id: 'zoom', label: 'Zoom', preview: '⊕' },
  { id: 'blur', label: 'Blur', preview: '≋' },
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
        if (type === 'audio' || type === 'video') mf.waveform = await generateWaveformData(mf, 80).catch(() => []);
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

  const ICON_MAP = { video: <VideoIcon />, audio: <AudioIcon />, image: <ImageIcon /> };

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
        <span className="dropzone-title">{importing ? 'Importing...' : 'Drop files or click'}</span>
        <span className="dropzone-sub">Video · Audio · Images</span>
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
  const { addClip, updateClip } = useEditorStore();
  const handleAddText = (p: typeof TEXT_PRESETS[number]) => {
    const clip = addClip('text');
    if (clip) updateClip(clip.id, {
      textOverlay: { text: p.label, fontFamily: p.fontFamily, fontSize: p.fontSize, color: p.color, fontWeight: p.fontWeight, textAlign: 'center' as const },
      duration: 4,
    });
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

function TransitionsPanel() {
  return (
    <div className="panel-content">
      <p className="panel-hint">Drag a transition between clips on the timeline</p>
      <div className="transition-grid">
        {TRANSITIONS.map(t => (
          <div key={t.id} className="transition-card" draggable
            onDragStart={e => { e.dataTransfer.setData('transition', t.id); e.dataTransfer.effectAllowed = 'copy'; }}
          >
            <div className="transition-preview">{t.preview}</div>
            <span className="transition-label">{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS = [
  { id: 'media', label: 'Media' },
  { id: 'text', label: 'Text' },
  { id: 'stickers', label: 'Stickers' },
  { id: 'effects', label: 'Effects' },
  { id: 'transitions', label: 'Transitions' },
];

export default function AssetLibrary({ activeTool }: { activeTool: string }) {
  const [tab, setTab] = useState(activeTool === 'media' ? 'media' : activeTool);

  useEffect(() => {
    if (activeTool === 'audio') setTab('transitions');
    else if (activeTool === 'shapes') setTab('stickers');
    else setTab(activeTool);
  }, [activeTool]);

  return (
    <aside className="asset-library">
      <div className="asset-library-header">
        <span className="asset-library-title">{TABS.find(t => t.id === tab)?.label || 'Media'}</span>
        {tab === 'media' && (
          <button className="asset-import-btn" onClick={() => document.querySelector<HTMLInputElement>('.media-dropzone input')?.click()}>
            <PlusIcon /> Import
          </button>
        )}
      </div>
      <div className="asset-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`asset-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="asset-panel">
        {tab === 'media' && <MediaPanel />}
        {tab === 'text' && <TextPanel />}
        {tab === 'stickers' && <StickersPanel />}
        {tab === 'effects' && <EffectsPanel />}
        {tab === 'transitions' && <TransitionsPanel />}
      </div>
    </aside>
  );
}
