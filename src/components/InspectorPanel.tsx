import { useEditorStore } from '../store/editorStore';

function SelectionIcon() { return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/></svg>; }

const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge'];
const FILTER_PRESETS = ['none', 'vintage', 'cool', 'warm', 'bw'];

export default function InspectorPanel() {
  const { project: { tracks }, activeClipId, getClip, updateClip, updateTrack } = useEditorStore();
  const clip = activeClipId ? getClip(activeClipId) : null;
  const track = clip ? tracks.find((t) => t.id === clip.trackId) : null;

  if (!clip) {
    return (
      <div className="inspector-panel">
        <div className="inspector-empty">
          <SelectionIcon />
          <span className="inspector-empty-text">No selection — Select a clip on the timeline to edit its properties</span>
        </div>
      </div>
    );
  }

  const mf = [...useEditorStore.getState().project.media].find((m) => m.id === clip.mediaId);

  return (
    <div className="inspector-panel">
      <div className="inspector-scroll">
        {mf && (
          <div className="inspector-section">
            <div className="inspector-section-header">SELECTED VIDEO</div>
            <div className="inspector-file-name">{mf.name}</div>
          </div>
        )}

        <div className="inspector-section">
          <div className="inspector-section-header">TIMING</div>
          <div className="inspector-grid-2">
            <div className="inspector-field">
              <label className="inspector-field-label">Start</label>
              <span className="inspector-field-value">{clip.startAt.toFixed(2)}s</span>
            </div>
            <div className="inspector-field">
              <label className="inspector-field-label">Duration</label>
              <input className="inspector-input" type="number" min={0.3} step={0.1} value={parseFloat(clip.duration.toFixed(2))} onChange={(e) => updateClip(clip.id, { duration: Math.max(0.3, parseFloat(e.target.value) || 0.3) })} />
            </div>
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-header">TRANSFORM</div>
          <div className="inspector-field">
            <label className="inspector-field-label">Scale</label>
            <input className="inspector-range" type="range" min={0.1} max={3} step={0.01} value={clip.transform.scale} onChange={(e) => updateClip(clip.id, { transform: { ...clip.transform, scale: parseFloat(e.target.value) } })} />
            <span className="inspector-range-value">{clip.transform.scale.toFixed(2)}</span>
          </div>
          <div className="inspector-field">
            <label className="inspector-field-label">Position X</label>
            <input className="inspector-range" type="range" min={-500} max={500} step={1} value={clip.transform.x} onChange={(e) => updateClip(clip.id, { transform: { ...clip.transform, x: parseInt(e.target.value) } })} />
            <span className="inspector-range-value">{clip.transform.x.toFixed(0)}</span>
          </div>
          <div className="inspector-field">
            <label className="inspector-field-label">Position Y</label>
            <input className="inspector-range" type="range" min={-500} max={500} step={1} value={clip.transform.y} onChange={(e) => updateClip(clip.id, { transform: { ...clip.transform, y: parseInt(e.target.value) } })} />
            <span className="inspector-range-value">{clip.transform.y.toFixed(0)}</span>
          </div>
          <div className="inspector-field">
            <label className="inspector-field-label">Rotation</label>
            <input className="inspector-range" type="range" min={-180} max={180} step={1} value={clip.transform.rotation} onChange={(e) => updateClip(clip.id, { transform: { ...clip.transform, rotation: parseInt(e.target.value) } })} />
            <span className="inspector-range-value">{clip.transform.rotation}°</span>
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-header">VOLUME</div>
          <div className="inspector-field">
            <input className="inspector-range" type="range" min={0} max={2} step={0.05} value={clip.volume} onChange={(e) => updateClip(clip.id, { volume: parseFloat(e.target.value) })} />
            <span className="inspector-range-value">{Math.round(clip.volume * 100)}%</span>
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-header">SPEED</div>
          <div className="inspector-field">
            <input className="inspector-range" type="range" min={0.5} max={3} step={0.1} value={clip.speed} onChange={(e) => updateClip(clip.id, { speed: parseFloat(e.target.value) })} />
            <span className="inspector-range-value">{clip.speed.toFixed(1)}x</span>
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-header">OPACITY</div>
          <div className="inspector-field">
            <input className="inspector-range" type="range" min={0} max={100} step={1} value={clip.opacity} onChange={(e) => updateClip(clip.id, { opacity: parseInt(e.target.value) })} />
            <span className="inspector-range-value">{clip.opacity}%</span>
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-header">BLEND MODE</div>
          <select className="inspector-select" value={clip.blendMode || 'normal'} onChange={(e) => updateClip(clip.id, { blendMode: e.target.value })}>
            {BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-header">FILTERS</div>
          <select className="inspector-select" value={clip.filters?.preset || 'none'} onChange={(e) => updateClip(clip.id, { filters: { ...clip.filters || { brightness: 0, contrast: 0, saturation: 0, preset: 'none' }, preset: e.target.value } })}>
            {FILTER_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="inspector-field">
            <label className="inspector-field-label">Brightness</label>
            <input className="inspector-range" type="range" min={-100} max={100} value={clip.filters?.brightness || 0} onChange={(e) => updateClip(clip.id, { filters: { ...clip.filters || { brightness: 0, contrast: 0, saturation: 0, preset: 'none' }, brightness: parseInt(e.target.value) } })} />
          </div>
          <div className="inspector-field">
            <label className="inspector-field-label">Contrast</label>
            <input className="inspector-range" type="range" min={-100} max={100} value={clip.filters?.contrast || 0} onChange={(e) => updateClip(clip.id, { filters: { ...clip.filters || { brightness: 0, contrast: 0, saturation: 0, preset: 'none' }, contrast: parseInt(e.target.value) } })} />
          </div>
          <div className="inspector-field">
            <label className="inspector-field-label">Saturation</label>
            <input className="inspector-range" type="range" min={-100} max={100} value={clip.filters?.saturation || 0} onChange={(e) => updateClip(clip.id, { filters: { ...clip.filters || { brightness: 0, contrast: 0, saturation: 0, preset: 'none' }, saturation: parseInt(e.target.value) } })} />
          </div>
        </div>

        {clip.trackType === 'text' && clip.textOverlay && (
          <div className="inspector-section">
            <div className="inspector-section-header">TEXT</div>
            <input className="inspector-input" value={clip.textOverlay.text} onChange={(e) => updateClip(clip.id, { textOverlay: { ...clip.textOverlay!, text: e.target.value } })} />
            <div className="inspector-field">
              <label className="inspector-field-label">Font Size</label>
              <input className="inspector-input" type="number" min={8} max={200} value={clip.textOverlay.fontSize} onChange={(e) => updateClip(clip.id, { textOverlay: { ...clip.textOverlay!, fontSize: parseInt(e.target.value) } })} />
            </div>
            <div className="inspector-field">
              <label className="inspector-field-label">Color</label>
              <input className="inspector-input" type="color" value={clip.textOverlay.color} onChange={(e) => updateClip(clip.id, { textOverlay: { ...clip.textOverlay!, color: e.target.value } })} />
            </div>
          </div>
        )}

        {track && (
          <div className="inspector-section">
            <div className="inspector-section-header">TRACK</div>
            <input className="inspector-input" value={track.name} onChange={(e) => updateTrack(track.id, { name: e.target.value })} />
          </div>
        )}
      </div>
    </div>
  );
}
