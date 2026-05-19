import { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import type { Clip } from '../types';
import VFXInspector from './VFXInspector';

const FONT_FAMILIES = ['Inter, sans-serif', 'Georgia, serif', 'JetBrains Mono, monospace', 'Arial, sans-serif'];
const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];
const FILTER_PRESETS = ['none', 'bw', 'sepia', 'warm', 'cool', 'contrast'];
const TRANSITION_TYPES = ['none', 'fade', 'wipe', 'slide', 'zoom'];
const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

function CollapsibleSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="inspector-section">
      <div className="inspector-section-header" onClick={() => setIsOpen(!isOpen)}>
        <span>{title}</span>
        <span style={{ fontSize: 9, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
      </div>
      {isOpen && children}
    </div>
  );
}

function AudioInspector({ clip, update }: { clip: Clip; update: (p: Partial<Clip>) => void }) {
  return (
    <div className="inspector-scroll">
      <div className="inspector-clip-header">
        <div className="inspector-clip-type">Selected · Audio</div>
        <div className="inspector-clip-name">{clip.mediaId?.split('_')[0] || 'Audio Clip'}</div>
      </div>

      <CollapsibleSection title="Timing">
        <div className="inspector-timing-grid">
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Start</span>
            <span className="inspector-timing-value">{clip.startAt.toFixed(2)}s</span>
          </div>
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Duration</span>
            <span className="inspector-timing-value">{clip.duration.toFixed(2)}s</span>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Audio">
        <div className="inspector-volume-row">
          <span className="inspector-volume-pct">{Math.round((clip.volume ?? 1) * 100)}%</span>
          <input className="inspector-volume-slider" type="range" min={0} max={200} step={1}
            value={Math.round((clip.volume ?? 1) * 100)}
            onChange={e => update({ volume: parseInt(e.target.value) / 100 })} />
        </div>
        <div className="inspector-toggle-row">
          <span className="inspector-toggle-label">Muted</span>
          <label className="inspector-toggle">
            <input type="checkbox" checked={clip.muted} onChange={e => update({ muted: e.target.checked })} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
        <div className="inspector-fade-row">
          <span className="inspector-fade-label">Fade In</span>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input className="inspector-fade-input" type="number" min={0} max={10} step={0.1}
              value={clip.audioFadeIn || 0}
              onChange={e => update({ audioFadeIn: Math.max(0, parseFloat(e.target.value) || 0) })} />
            <span className="inspector-fade-unit">s</span>
          </div>
        </div>
        <div className="inspector-fade-row">
          <span className="inspector-fade-label">Fade Out</span>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input className="inspector-fade-input" type="number" min={0} max={10} step={0.1}
              value={clip.audioFadeOut || 0}
              onChange={e => update({ audioFadeOut: Math.max(0, parseFloat(e.target.value) || 0) })} />
            <span className="inspector-fade-unit">s</span>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Speed">
        <div className="speed-presets">
          {SPEED_PRESETS.map(speed => (
            <button key={speed} className={`speed-preset-btn ${Math.abs((clip.speed || 1) - speed) < 0.01 ? 'active' : ''}`}
              onClick={() => update({ speed })}>{speed}x</button>
          ))}
        </div>
        <div className="inspector-volume-row">
          <span className="inspector-volume-pct">{(clip.speed || 1).toFixed(2)}×</span>
          <input className="inspector-volume-slider" type="range" min={10} max={400} step={5}
            value={Math.round((clip.speed || 1) * 100)}
            onChange={e => update({ speed: parseInt(e.target.value) / 100 })} />
        </div>
        <div className="inspector-toggle-row">
          <span className="inspector-toggle-label">Auto Pitch</span>
          <label className="inspector-toggle">
            <input type="checkbox" checked={clip.preservePitch || false} onChange={e => update({ preservePitch: e.target.checked })} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
        <div className="inspector-toggle-row">
          <span className="inspector-toggle-label">AI Voice Stabilizer</span>
          <label className="inspector-toggle">
            <input type="checkbox" checked={clip.voiceStabilizer || false} onChange={e => update({ voiceStabilizer: e.target.checked })} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
      </CollapsibleSection>
    </div>
  );
}

function VideoInspector({ clip, update }: { clip: Clip; update: (p: Partial<Clip>) => void }) {
  const tr = clip.transform;
  
  const applyPipPreset = (preset: string) => {
    const presets: Record<string, { x: number; y: number; scale: number }> = {
      'bottom-right': { x: 500, y: 250, scale: 0.35 },
      'bottom-left': { x: -500, y: 250, scale: 0.35 },
      'top-right': { x: 500, y: -250, scale: 0.35 },
      'top-left': { x: -500, y: -250, scale: 0.35 },
      'center': { x: 0, y: 0, scale: 0.5 },
      'full': { x: 0, y: 0, scale: 1 },
    };
    const p = presets[preset];
    if (p) update({ transform: { ...tr, x: p.x, y: p.y, scale: p.scale } });
  };
  
  return (
    <div className="inspector-scroll">
      <div className="inspector-clip-header">
        <div className="inspector-clip-type">Selected · Video</div>
        <div className="inspector-clip-name">{clip.mediaId?.split('_')[0] || 'Video Clip'}</div>
      </div>

      <CollapsibleSection title="Timing">
        <div className="inspector-timing-grid">
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Start</span>
            <span className="inspector-timing-value">{clip.startAt.toFixed(2)}s</span>
          </div>
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Duration</span>
            <span className="inspector-timing-value">{clip.duration.toFixed(2)}s</span>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Transform">
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Scale</span>
          <input className="inspector-transform-slider" type="range" min={10} max={300} step={1}
            value={Math.round(tr.scale * 100)}
            onChange={e => update({ transform: { ...tr, scale: parseInt(e.target.value) / 100 } })} />
          <span className="inspector-transform-value">{tr.scale.toFixed(2)}</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Position X</span>
          <input className="inspector-transform-slider" type="range" min={-960} max={960}
            value={tr.x} onChange={e => update({ transform: { ...tr, x: parseInt(e.target.value) } })} />
          <span className="inspector-transform-value">{tr.x.toFixed(0)}</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Position Y</span>
          <input className="inspector-transform-slider" type="range" min={-540} max={540}
            value={tr.y} onChange={e => update({ transform: { ...tr, y: parseInt(e.target.value) } })} />
          <span className="inspector-transform-value">{tr.y.toFixed(0)}</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Rotation</span>
          <input className="inspector-transform-slider" type="range" min={-180} max={180}
            value={tr.rotation} onChange={e => update({ transform: { ...tr, rotation: parseInt(e.target.value) } })} />
          <span className="inspector-transform-value">{tr.rotation}°</span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="PIP Presets" defaultOpen={false}>
        <div className="pip-presets-grid">
          <button className="pip-preset-btn" onClick={() => applyPipPreset('full')}>Full</button>
          <button className="pip-preset-btn" onClick={() => applyPipPreset('center')}>Center</button>
          <button className="pip-preset-btn" onClick={() => applyPipPreset('top-left')}>Top Left</button>
          <button className="pip-preset-btn" onClick={() => applyPipPreset('top-right')}>Top Right</button>
          <button className="pip-preset-btn" onClick={() => applyPipPreset('bottom-left')}>Bottom Left</button>
          <button className="pip-preset-btn" onClick={() => applyPipPreset('bottom-right')}>Bottom Right</button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Audio">
        <div className="inspector-volume-row">
          <span className="inspector-volume-pct">{Math.round((clip.volume ?? 1) * 100)}%</span>
          <input className="inspector-volume-slider" type="range" min={0} max={200} step={1}
            value={Math.round((clip.volume ?? 1) * 100)}
            onChange={e => update({ volume: parseInt(e.target.value) / 100 })} />
        </div>
        <div className="inspector-toggle-row">
          <span className="inspector-toggle-label">Muted</span>
          <label className="inspector-toggle">
            <input type="checkbox" checked={clip.muted} onChange={e => update({ muted: e.target.checked })} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Speed">
        <div className="speed-presets">
          {SPEED_PRESETS.map(speed => (
            <button key={speed} className={`speed-preset-btn ${Math.abs((clip.speed || 1) - speed) < 0.01 ? 'active' : ''}`}
              onClick={() => update({ speed })}>{speed}x</button>
          ))}
        </div>
        <div className="inspector-volume-row">
          <span className="inspector-volume-pct">{(clip.speed || 1).toFixed(2)}×</span>
          <input className="inspector-volume-slider" type="range" min={10} max={400} step={5}
            value={Math.round((clip.speed || 1) * 100)}
            onChange={e => update({ speed: parseInt(e.target.value) / 100 })} />
        </div>
        <div className="inspector-toggle-row">
          <span className="inspector-toggle-label">Auto Pitch</span>
          <label className="inspector-toggle">
            <input type="checkbox" checked={clip.preservePitch || false} onChange={e => update({ preservePitch: e.target.checked })} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
        <div className="inspector-toggle-row">
          <span className="inspector-toggle-label">AI Voice Stabilizer</span>
          <label className="inspector-toggle">
            <input type="checkbox" checked={clip.voiceStabilizer || false} onChange={e => update({ voiceStabilizer: e.target.checked })} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Opacity">
        <div className="inspector-volume-row">
          <span className="inspector-volume-pct">{Math.round(clip.opacity ?? 100)}%</span>
          <input className="inspector-volume-slider" type="range" min={0} max={100}
            value={Math.round(clip.opacity ?? 100)}
            onChange={e => update({ opacity: parseInt(e.target.value) })} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Blend Mode" defaultOpen={false}>
        <select className="inspector-select" value={clip.blendMode} onChange={e => update({ blendMode: e.target.value as any })}>
          {BLEND_MODES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </CollapsibleSection>

      <CollapsibleSection title="Filters">
        <div className="filter-pill-row">
          {FILTER_PRESETS.map(f => (
            <button key={f} className={`filter-pill ${(clip.filters?.preset || 'none') === f ? 'active' : ''}`}
              onClick={() => update({ filters: { brightness: clip.filters?.brightness ?? 0, contrast: clip.filters?.contrast ?? 0, saturation: clip.filters?.saturation ?? 0, preset: f as any } })}>
              {f === 'none' ? 'None' : f}
            </button>
          ))}
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Brightness</span>
          <input className="inspector-transform-slider" type="range" min={-100} max={100}
            value={clip.filters?.brightness ?? 0}
            onChange={e => update({ filters: { brightness: parseInt(e.target.value), contrast: clip.filters?.contrast ?? 0, saturation: clip.filters?.saturation ?? 0, preset: clip.filters?.preset ?? 'none' } })} />
          <span className="inspector-transform-value">{clip.filters?.brightness ?? 0}</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Contrast</span>
          <input className="inspector-transform-slider" type="range" min={-100} max={100}
            value={clip.filters?.contrast ?? 0}
            onChange={e => update({ filters: { brightness: clip.filters?.brightness ?? 0, contrast: parseInt(e.target.value), saturation: clip.filters?.saturation ?? 0, preset: clip.filters?.preset ?? 'none' } })} />
          <span className="inspector-transform-value">{clip.filters?.contrast ?? 0}</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Saturation</span>
          <input className="inspector-transform-slider" type="range" min={-100} max={100}
            value={clip.filters?.saturation ?? 0}
            onChange={e => update({ filters: { brightness: clip.filters?.brightness ?? 0, contrast: clip.filters?.contrast ?? 0, saturation: parseInt(e.target.value), preset: clip.filters?.preset ?? 'none' } })} />
          <span className="inspector-transform-value">{clip.filters?.saturation ?? 0}</span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Transition" defaultOpen={false}>
        <select className="inspector-select" value={clip.transition?.type || 'none'}
          onChange={e => update({ transition: { type: e.target.value as any, duration: clip.transition?.duration || 0.5 } })}>
          {TRANSITION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </CollapsibleSection>
    </div>
  );
}

function TextInspector({ clip, update }: { clip: Clip; update: (p: Partial<Clip>) => void }) {
  const to = clip.textOverlay || { text: '', fontFamily: 'Inter, sans-serif', fontSize: 48, color: '#ffffff', fontWeight: 700, textAlign: 'center' as const };
  const tr = clip.transform;
  return (
    <div className="inspector-scroll">
      <div className="inspector-clip-header">
        <div className="inspector-clip-type">Selected · Text</div>
      </div>

      <CollapsibleSection title="Timing">
        <div className="inspector-timing-grid">
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Start</span>
            <span className="inspector-timing-value">{clip.startAt.toFixed(2)}s</span>
          </div>
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Duration</span>
            <span className="inspector-timing-value">{clip.duration.toFixed(2)}s</span>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Text">
        <textarea className="inspector-textarea" rows={3} value={to.text}
          onChange={e => update({ textOverlay: { ...to, text: e.target.value } })} />
        <div style={{ marginTop: 8 }}>
          <select className="inspector-select" value={to.fontFamily}
            onChange={e => update({ textOverlay: { ...to, fontFamily: e.target.value } })}>
            {FONT_FAMILIES.map(f => <option key={f} value={f}>{f.split(',')[0]}</option>)}
          </select>
        </div>
        <div className="inspector-transform-row" style={{ marginTop: 8 }}>
          <span className="inspector-transform-label">Size</span>
          <input className="inspector-transform-slider" type="range" min={12} max={160}
            value={to.fontSize || 48}
            onChange={e => update({ textOverlay: { ...to, fontSize: parseInt(e.target.value) } })} />
          <span className="inspector-transform-value">{to.fontSize || 48}px</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Align</span>
          <div className="align-btn-group">
            {(['left', 'center', 'right'] as const).map(a => (
              <button key={a} className={`align-btn ${to.textAlign === a ? 'active' : ''}`}
                onClick={() => update({ textOverlay: { ...to, textAlign: a } })}>
                {a === 'left' ? '◀' : a === 'center' ? '■' : '▶'}
              </button>
            ))}
          </div>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Color</span>
          <input className="inspector-input" type="color" value={to.color || '#ffffff'}
            onChange={e => update({ textOverlay: { ...to, color: e.target.value } })} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Position">
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Scale</span>
          <input className="inspector-transform-slider" type="range" min={10} max={300}
            value={Math.round(tr.scale * 100)}
            onChange={e => update({ transform: { ...tr, scale: parseInt(e.target.value) / 100 } })} />
          <span className="inspector-transform-value">{tr.scale.toFixed(2)}</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Position X</span>
          <input className="inspector-transform-slider" type="range" min={-960} max={960}
            value={tr.x} onChange={e => update({ transform: { ...tr, x: parseInt(e.target.value) } })} />
          <span className="inspector-transform-value">{tr.x.toFixed(0)}</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Position Y</span>
          <input className="inspector-transform-slider" type="range" min={-540} max={540}
            value={tr.y} onChange={e => update({ transform: { ...tr, y: parseInt(e.target.value) } })} />
          <span className="inspector-transform-value">{tr.y.toFixed(0)}</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Opacity</span>
          <input className="inspector-transform-slider" type="range" min={0} max={100}
            value={clip.opacity ?? 100}
            onChange={e => update({ opacity: parseInt(e.target.value) })} />
          <span className="inspector-transform-value">{clip.opacity ?? 100}%</span>
        </div>
      </CollapsibleSection>
    </div>
  );
}

function StickerInspector({ clip, update }: { clip: Clip; update: (p: Partial<Clip>) => void }) {
  const tr = clip.transform;
  return (
    <div className="inspector-scroll">
      <div className="inspector-clip-header">
        <div className="inspector-clip-type">Selected · Sticker</div>
        <div style={{ fontSize: 36, textAlign: 'center', padding: '8px 0' }}>{clip.sticker}</div>
      </div>

      <CollapsibleSection title="Timing">
        <div className="inspector-timing-grid">
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Start</span>
            <span className="inspector-timing-value">{clip.startAt.toFixed(2)}s</span>
          </div>
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Duration</span>
            <span className="inspector-timing-value">{clip.duration.toFixed(2)}s</span>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Position">
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Scale</span>
          <input className="inspector-transform-slider" type="range" min={10} max={300}
            value={Math.round(tr.scale * 100)}
            onChange={e => update({ transform: { ...tr, scale: parseInt(e.target.value) / 100 } })} />
          <span className="inspector-transform-value">{tr.scale.toFixed(2)}</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Position X</span>
          <input className="inspector-transform-slider" type="range" min={-960} max={960}
            value={tr.x} onChange={e => update({ transform: { ...tr, x: parseInt(e.target.value) } })} />
          <span className="inspector-transform-value">{tr.x.toFixed(0)}</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Position Y</span>
          <input className="inspector-transform-slider" type="range" min={-540} max={540}
            value={tr.y} onChange={e => update({ transform: { ...tr, y: parseInt(e.target.value) } })} />
          <span className="inspector-transform-value">{tr.y.toFixed(0)}</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Rotation</span>
          <input className="inspector-transform-slider" type="range" min={-180} max={180}
            value={tr.rotation} onChange={e => update({ transform: { ...tr, rotation: parseInt(e.target.value) } })} />
          <span className="inspector-transform-value">{tr.rotation}°</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Opacity</span>
          <input className="inspector-transform-slider" type="range" min={0} max={100}
            value={clip.opacity ?? 100}
            onChange={e => update({ opacity: parseInt(e.target.value) })} />
          <span className="inspector-transform-value">{clip.opacity ?? 100}%</span>
        </div>
      </CollapsibleSection>
    </div>
  );
}

export default function InspectorPanel() {
  const { activeClipId, getClip, updateClip } = useEditorStore();
  const clip = activeClipId ? getClip(activeClipId) : null;
  const update = (patch: Partial<Clip>) => { if (clip) updateClip(clip.id, patch); };

  if (!clip) {
    return (
      <aside className="inspector-panel">
        <div className="inspector-empty" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="inspector-empty-card" style={{
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '24px 16px',
            margin: '0 16px',
            width: 'calc(100% - 32px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.01)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-dim)', marginBottom: 12 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l8.904-4.218M9.813 15.904L14.5 12.5M9.813 15.904l-4.218-.813M21 9.75c0-1.855-1.542-3.325-3.375-3.325-.56 0-1.077.14-1.53.385C15.19 5.093 13.565 4.5 11.875 4.5c-3.13 0-5.625 2.616-5.625 5.625 0 .235.014.47.043.7-.638.167-1.229.5-1.728.95C3.398 12.87 3 14.135 3 15.48c0 2.925 2.375 5.3 5.3 5.3h10.4c2.925 0 5.3-2.375 5.3-5.3 0-1.724-.82-3.256-2.1-4.23z" />
            </svg>
            <span className="inspector-empty-title" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>No Clip Selected</span>
            <span className="inspector-empty-text" style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.5, textAlign: 'center' }}>Select any clip on the timeline to edit properties</span>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="inspector-panel">
      {clip.trackType === 'audio' && <AudioInspector clip={clip} update={update} />}
      {clip.trackType === 'video' && <VideoInspector clip={clip} update={update} />}
      {clip.trackType === 'text' && <TextInspector clip={clip} update={update} />}
      {clip.trackType === 'sticker' && <StickerInspector clip={clip} update={update} />}
      {clip.trackType === 'vfx' && <VFXInspector clip={clip} />}
    </aside>
  );
}
