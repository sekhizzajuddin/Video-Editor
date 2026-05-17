import { useEditorStore } from '../store/editorStore';
import type { Clip } from '../types';

const FONT_FAMILIES = ['Inter, sans-serif', 'Georgia, serif', 'JetBrains Mono, monospace', 'Arial, sans-serif', 'Impact, sans-serif'];
const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'hard-light', 'soft-light', 'difference'];
const FILTER_PRESETS = ['none', 'bw', 'sepia', 'warm', 'cool', 'contrast', 'invert'];
const TRANSITION_TYPES = ['none', 'fade', 'wipe', 'slide', 'zoom'];

function Row({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="inspector-field">
      <span className="inspector-field-label">{label}</span>
      {children}
    </div>
  );
}
function Sec({ title }: { title?: string; children?: React.ReactNode }) {
  return <div className="inspector-section-header">{title}</div>;
}

/* ─── AUDIO INSPECTOR ─── */
function AudioInspector({ clip, update }: { clip: Clip; update: (p: Partial<Clip>) => void }) {
  return (
    <div className="inspector-scroll">
      <div className="inspector-section">
        <Sec>SELECTED AUDIO</Sec>
        <div className="inspector-filename">{clip.mediaId ? clip.mediaId.split('_').slice(0, -1).join(' ') || 'Audio Clip' : 'Audio Clip'}</div>
      </div>
      <div className="inspector-section">
        <Sec>TIMING</Sec>
        <Row label="Start">
          <input className="inspector-input" type="number" min={0} step={0.1}
            value={parseFloat(clip.startAt.toFixed(2))}
            onChange={e => update({ startAt: Math.max(0, parseFloat(e.target.value) || 0) })} />
        </Row>
        <Row label="Duration">
          <input className="inspector-input" type="number" min={0.1} step={0.1} value={parseFloat(clip.duration.toFixed(2))}
            onChange={e => update({ duration: Math.max(0.1, parseFloat(e.target.value) || 0.1) })} />
        </Row>
      </div>
      <div className="inspector-section">
        <Sec>VOLUME</Sec>
        <Row label={`${Math.round((clip.volume ?? 1) * 100)}%`}>
          <input className="inspector-range" type="range" min={0} max={200} step={1}
            value={Math.round((clip.volume ?? 1) * 100)}
            onChange={e => update({ volume: parseInt(e.target.value) / 100 })} />
        </Row>
      </div>
      <div className="inspector-section">
        <Sec>SPEED</Sec>
        <Row label={`${(clip.speed || 1).toFixed(2)}×`}>
          <input className="inspector-range" type="range" min={10} max={400} step={5}
            value={Math.round((clip.speed || 1) * 100)}
            onChange={e => update({ speed: parseInt(e.target.value) / 100 })} />
        </Row>
      </div>
      <div className="inspector-section">
        <Sec>AUDIO OPTIONS</Sec>
        <Row label="Muted">
          <label className="inspector-toggle">
            <input type="checkbox" checked={clip.muted} onChange={e => update({ muted: e.target.checked })} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </Row>
      </div>
    </div>
  );
}

/* ─── VIDEO INSPECTOR ─── */
function VideoInspector({ clip, update }: { clip: Clip; update: (p: Partial<Clip>) => void }) {
  const { tr } = { tr: clip.transform };
  return (
    <div className="inspector-scroll">
      <div className="inspector-section">
        <Sec>SELECTED VIDEO</Sec>
        <div className="inspector-filename">{clip.mediaId?.split('_')[0] || 'Video Clip'}</div>
      </div>
      <div className="inspector-section">
        <Sec>TIMING</Sec>
        <div className="inspector-grid-2">
          <Row label="Start"><span className="inspector-field-value">{clip.startAt.toFixed(2)}s</span></Row>
          <Row label="Duration">
            <input className="inspector-input" type="number" min={0.1} step={0.1} value={parseFloat(clip.duration.toFixed(2))}
              onChange={e => update({ duration: Math.max(0.1, parseFloat(e.target.value) || 0.1) })} />
          </Row>
        </div>
      </div>
      <div className="inspector-section">
        <Sec>TRANSFORM</Sec>
        <Row label="Scale">
          <input className="inspector-range" type="range" min={10} max={300} step={1}
            value={Math.round(clip.transform.scale * 100)}
            onChange={e => update({ transform: { ...tr, scale: parseInt(e.target.value) / 100 } })} />
          <span className="inspector-range-value">{clip.transform.scale.toFixed(2)}</span>
        </Row>
        <Row label="Pos X">
          <input className="inspector-range" type="range" min={-960} max={960}
            value={clip.transform.x}
            onChange={e => update({ transform: { ...tr, x: parseInt(e.target.value) } })} />
          <span className="inspector-range-value">{clip.transform.x}</span>
        </Row>
        <Row label="Pos Y">
          <input className="inspector-range" type="range" min={-540} max={540}
            value={clip.transform.y}
            onChange={e => update({ transform: { ...tr, y: parseInt(e.target.value) } })} />
          <span className="inspector-range-value">{clip.transform.y}</span>
        </Row>
        <Row label="Rotate">
          <input className="inspector-range" type="range" min={-180} max={180}
            value={clip.transform.rotation}
            onChange={e => update({ transform: { ...tr, rotation: parseInt(e.target.value) } })} />
          <span className="inspector-range-value">{clip.transform.rotation}°</span>
        </Row>
      </div>
      <div className="inspector-section">
        <Sec>VOLUME</Sec>
        <Row label={`${Math.round((clip.volume ?? 1) * 100)}%`}>
          <input className="inspector-range" type="range" min={0} max={200} step={1}
            value={Math.round((clip.volume ?? 1) * 100)}
            onChange={e => update({ volume: parseInt(e.target.value) / 100 })} />
        </Row>
        <Row label="Muted">
          <label className="inspector-toggle">
            <input type="checkbox" checked={clip.muted} onChange={e => update({ muted: e.target.checked })} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </Row>
      </div>
      <div className="inspector-section">
        <Sec>SPEED</Sec>
        <Row label={`${(clip.speed || 1).toFixed(2)}×`}>
          <input className="inspector-range" type="range" min={10} max={400} step={5}
            value={Math.round((clip.speed || 1) * 100)}
            onChange={e => update({ speed: parseInt(e.target.value) / 100 })} />
        </Row>
      </div>
      <div className="inspector-section">
        <Sec>OPACITY</Sec>
        <Row label={`${Math.round(clip.opacity ?? 100)}%`}>
          <input className="inspector-range" type="range" min={0} max={100}
            value={Math.round(clip.opacity ?? 100)}
            onChange={e => update({ opacity: parseInt(e.target.value) })} />
        </Row>
      </div>
      <div className="inspector-section">
        <Sec title="BLEND MODE" />
        <select className="inspector-select" value={clip.blendMode} onChange={e => update({ blendMode: e.target.value as any })}>
          {BLEND_MODES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="inspector-section">
        <Sec title="FILTERS" />
        <div className="filter-pill-row">
          {FILTER_PRESETS.map(f => (
            <button key={f} className={`filter-pill ${(clip.filters?.preset || 'none') === f ? 'active' : ''}`}
              onClick={() => update({ filters: { brightness: clip.filters?.brightness ?? 0, contrast: clip.filters?.contrast ?? 0, saturation: clip.filters?.saturation ?? 0, preset: f as any } })}>
              {f === 'none' ? '✕' : f}
            </button>
          ))}
        </div>
        <Row label="Brightness">
          <input className="inspector-range" type="range" min={-100} max={100}
            value={clip.filters?.brightness ?? 0}
            onChange={e => update({ filters: { brightness: parseInt(e.target.value), contrast: clip.filters?.contrast ?? 0, saturation: clip.filters?.saturation ?? 0, preset: clip.filters?.preset ?? 'none' } })} />
          <span className="inspector-range-value">{clip.filters?.brightness ?? 0}</span>
        </Row>
        <Row label="Contrast">
          <input className="inspector-range" type="range" min={-100} max={100}
            value={clip.filters?.contrast ?? 0}
            onChange={e => update({ filters: { brightness: clip.filters?.brightness ?? 0, contrast: parseInt(e.target.value), saturation: clip.filters?.saturation ?? 0, preset: clip.filters?.preset ?? 'none' } })} />
          <span className="inspector-range-value">{clip.filters?.contrast ?? 0}</span>
        </Row>
        <Row label="Saturation">
          <input className="inspector-range" type="range" min={-100} max={100}
            value={clip.filters?.saturation ?? 0}
            onChange={e => update({ filters: { brightness: clip.filters?.brightness ?? 0, contrast: clip.filters?.contrast ?? 0, saturation: parseInt(e.target.value), preset: clip.filters?.preset ?? 'none' } })} />
          <span className="inspector-range-value">{clip.filters?.saturation ?? 0}</span>
        </Row>
      </div>
      <div className="inspector-section">
        <Sec title="TRANSITION" />
        <select className="inspector-select" value={clip.transition?.type || 'none'}
          onChange={e => update({ transition: { type: e.target.value as any, duration: clip.transition?.duration || 0.5 } })}>
          {TRANSITION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {clip.transition?.type && clip.transition.type !== 'none' && (
          <Row label={`${(clip.transition.duration || 0.5).toFixed(1)}s`}>
            <input className="inspector-range" type="range" min={1} max={30} step={1}
              value={Math.round((clip.transition.duration || 0.5) * 10)}
              onChange={e => update({ transition: { type: clip.transition!.type, duration: parseInt(e.target.value) / 10 } })} />
          </Row>
        )}
      </div>
    </div>
  );
}

/* ─── TEXT INSPECTOR ─── */
function TextInspector({ clip, update }: { clip: Clip; update: (p: Partial<Clip>) => void }) {
  const to = clip.textOverlay || { text: '', fontFamily: 'Inter, sans-serif', fontSize: 48, color: '#ffffff', fontWeight: 700, textAlign: 'center' as const };
  const { tr } = { tr: clip.transform };
  return (
    <div className="inspector-scroll">
      <div className="inspector-section">
        <Sec>SELECTED TEXT</Sec>
      </div>
      <div className="inspector-section">
        <Sec>TIMING</Sec>
        <div className="inspector-grid-2">
          <Row label="Start"><span className="inspector-field-value">{clip.startAt.toFixed(2)}s</span></Row>
          <Row label="Duration">
            <input className="inspector-input" type="number" min={0.1} step={0.1} value={parseFloat(clip.duration.toFixed(2))}
              onChange={e => update({ duration: Math.max(0.1, parseFloat(e.target.value) || 0.1) })} />
          </Row>
        </div>
      </div>
      <div className="inspector-section">
        <Sec>TEXT CONTENT</Sec>
        <textarea className="inspector-textarea" rows={3} value={to.text}
          onChange={e => update({ textOverlay: { ...to, text: e.target.value } })} />
      </div>
      <div className="inspector-section">
        <Sec>TYPOGRAPHY</Sec>
        <Row label="Font">
          <select className="inspector-select" value={to.fontFamily}
            onChange={e => update({ textOverlay: { ...to, fontFamily: e.target.value } })}>
            {FONT_FAMILIES.map(f => <option key={f} value={f}>{f.split(',')[0]}</option>)}
          </select>
        </Row>
        <Row label="Size">
          <input className="inspector-range" type="range" min={12} max={160}
            value={to.fontSize || 48}
            onChange={e => update({ textOverlay: { ...to, fontSize: parseInt(e.target.value) } })} />
          <span className="inspector-range-value">{to.fontSize || 48}px</span>
        </Row>
        <Row label="Weight">
          <select className="inspector-select" value={to.fontWeight || 700}
            onChange={e => update({ textOverlay: { ...to, fontWeight: parseInt(e.target.value) } })}>
            <option value={400}>Regular</option><option value={600}>Semi-Bold</option>
            <option value={700}>Bold</option><option value={900}>Black</option>
          </select>
        </Row>
        <Row label="Align">
          <div className="align-btn-group">
            {(['left', 'center', 'right'] as const).map(a => (
              <button key={a} className={`align-btn ${to.textAlign === a ? 'active' : ''}`}
                onClick={() => update({ textOverlay: { ...to, textAlign: a } })}>{a === 'left' ? '⬅' : a === 'center' ? '⬛' : '➡'}</button>
            ))}
          </div>
        </Row>
        <Row label="Color">
          <input className="inspector-input" type="color" value={to.color || '#ffffff'}
            onChange={e => update({ textOverlay: { ...to, color: e.target.value } })} />
          <span className="inspector-field-value">{to.color || '#ffffff'}</span>
        </Row>
      </div>
      <div className="inspector-section">
        <Sec>POSITION</Sec>
        <Row label="X">
          <input className="inspector-range" type="range" min={-960} max={960}
            value={tr.x} onChange={e => update({ transform: { ...tr, x: parseInt(e.target.value) } })} />
          <span className="inspector-range-value">{tr.x}</span>
        </Row>
        <Row label="Y">
          <input className="inspector-range" type="range" min={-540} max={540}
            value={tr.y} onChange={e => update({ transform: { ...tr, y: parseInt(e.target.value) } })} />
          <span className="inspector-range-value">{tr.y}</span>
        </Row>
        <Row label="Scale">
          <input className="inspector-range" type="range" min={10} max={300}
            value={Math.round(tr.scale * 100)}
            onChange={e => update({ transform: { ...tr, scale: parseInt(e.target.value) / 100 } })} />
          <span className="inspector-range-value">{tr.scale.toFixed(2)}</span>
        </Row>
        <Row label="Opacity">
          <input className="inspector-range" type="range" min={0} max={100}
            value={clip.opacity ?? 100}
            onChange={e => update({ opacity: parseInt(e.target.value) })} />
          <span className="inspector-range-value">{clip.opacity ?? 100}%</span>
        </Row>
      </div>
    </div>
  );
}

/* ─── STICKER INSPECTOR ─── */
function StickerInspector({ clip, update }: { clip: Clip; update: (p: Partial<Clip>) => void }) {
  const { tr } = { tr: clip.transform };
  return (
    <div className="inspector-scroll">
      <div className="inspector-section">
        <Sec>SELECTED STICKER</Sec>
        <div style={{ fontSize: 40, textAlign: 'center', padding: '8px 0' }}>{clip.sticker}</div>
      </div>
      <div className="inspector-section">
        <Sec>TIMING</Sec>
        <div className="inspector-grid-2">
          <Row label="Start"><span className="inspector-field-value">{clip.startAt.toFixed(2)}s</span></Row>
          <Row label="Duration">
            <input className="inspector-input" type="number" min={0.1} step={0.1} value={parseFloat(clip.duration.toFixed(2))}
              onChange={e => update({ duration: Math.max(0.1, parseFloat(e.target.value) || 0.1) })} />
          </Row>
        </div>
      </div>
      <div className="inspector-section">
        <Sec>POSITION & SIZE</Sec>
        <Row label="Scale">
          <input className="inspector-range" type="range" min={10} max={300}
            value={Math.round(tr.scale * 100)}
            onChange={e => update({ transform: { ...tr, scale: parseInt(e.target.value) / 100 } })} />
          <span className="inspector-range-value">{tr.scale.toFixed(2)}</span>
        </Row>
        <Row label="X">
          <input className="inspector-range" type="range" min={-960} max={960}
            value={tr.x} onChange={e => update({ transform: { ...tr, x: parseInt(e.target.value) } })} />
          <span className="inspector-range-value">{tr.x}</span>
        </Row>
        <Row label="Y">
          <input className="inspector-range" type="range" min={-540} max={540}
            value={tr.y} onChange={e => update({ transform: { ...tr, y: parseInt(e.target.value) } })} />
          <span className="inspector-range-value">{tr.y}</span>
        </Row>
        <Row label="Rotate">
          <input className="inspector-range" type="range" min={-180} max={180}
            value={tr.rotation} onChange={e => update({ transform: { ...tr, rotation: parseInt(e.target.value) } })} />
          <span className="inspector-range-value">{tr.rotation}°</span>
        </Row>
        <Row label="Opacity">
          <input className="inspector-range" type="range" min={0} max={100}
            value={clip.opacity ?? 100} onChange={e => update({ opacity: parseInt(e.target.value) })} />
          <span className="inspector-range-value">{clip.opacity ?? 100}%</span>
        </Row>
      </div>
    </div>
  );
}

/* ─── ROOT INSPECTOR ─── */
export default function InspectorPanel() {
  const { activeClipId, getClip, updateClip } = useEditorStore();
  const clip = activeClipId ? getClip(activeClipId) : null;

  const update = (patch: Partial<Clip>) => { if (clip) updateClip(clip.id, patch); };

  if (!clip) {
    return (
      <aside className="inspector-panel">
        <div className="inspector-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ opacity: 0.3 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span className="inspector-empty-text">Select a clip on the timeline to view and edit its properties</span>
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
    </aside>
  );
}
