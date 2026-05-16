import { useEditorStore } from '../store/editorStore';

const FONTS = [
  'Plus Jakarta Sans',
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Impact',
  'Comic Sans MS',
];

const FILTER_PRESETS = [
  { name: 'None', value: 'none' },
  { name: 'Vintage', value: 'vintage' },
  { name: 'Cool', value: 'cool' },
  { name: 'Warm', value: 'warm' },
  { name: 'B&W', value: 'bw' },
];

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

const TRANSITION_TYPES = [
  { name: 'None', value: 'none' },
  { name: 'Fade In', value: 'fadein' },
  { name: 'Fade Out', value: 'fadeout' },
  { name: 'Dissolve', value: 'dissolve' },
  { name: 'Crossfade', value: 'crossfade' },
];

export function InspectorPanel() {
  const { getSelectedClip, updateClip, removeClip } = useEditorStore();
  const clip = getSelectedClip();

  if (!clip) {
    return (
      <div className="inspector-panel">
        <div className="panel-header">
          <span className="panel-title">Inspector</span>
        </div>
        <div className="empty-inspector">
          Select a clip on the timeline to edit its properties
        </div>
      </div>
    );
  }

  const updateFilters = (updates: Partial<typeof clip.filters>) => {
    updateClip(clip.id, {
      filters: { ...clip.filters, ...updates }
    });
  };

  const updateTransition = (updates: Partial<typeof clip.transition>) => {
    updateClip(clip.id, {
      transition: { ...clip.transition, ...updates }
    });
  };

  return (
    <div className="inspector-panel">
      <div className="panel-header">
        <span className="panel-title">Inspector</span>
        <button className="btn btn-sm btn-ghost" onClick={() => removeClip(clip.id)}>
          🗑
        </button>
      </div>

      {clip.trackType === 'video' && (
        <>
          <div className="inspector-section">
            <div className="inspector-section-title">Filters</div>
            <div className="inspector-row">
              <span className="inspector-label">Brightness</span>
              <div className="inspector-value">
                <input
                  type="range"
                  className="slider"
                  min={-100}
                  max={100}
                  value={clip.filters?.brightness || 0}
                  onChange={(e) => updateFilters({ brightness: parseInt(e.target.value) })}
                />
                <span className="slider-value">{clip.filters?.brightness || 0}</span>
              </div>
            </div>
            <div className="inspector-row">
              <span className="inspector-label">Contrast</span>
              <div className="inspector-value">
                <input
                  type="range"
                  className="slider"
                  min={-100}
                  max={100}
                  value={clip.filters?.contrast || 0}
                  onChange={(e) => updateFilters({ contrast: parseInt(e.target.value) })}
                />
                <span className="slider-value">{clip.filters?.contrast || 0}</span>
              </div>
            </div>
            <div className="inspector-row">
              <span className="inspector-label">Saturation</span>
              <div className="inspector-value">
                <input
                  type="range"
                  className="slider"
                  min={-100}
                  max={100}
                  value={clip.filters?.saturation || 0}
                  onChange={(e) => updateFilters({ saturation: parseInt(e.target.value) })}
                />
                <span className="slider-value">{clip.filters?.saturation || 0}</span>
              </div>
            </div>
            <div className="inspector-row">
              <span className="inspector-label">Preset</span>
              <div className="preset-grid">
                {FILTER_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    className={`preset-btn ${clip.filters?.preset === preset.value ? 'active' : ''}`}
                    onClick={() => updateFilters({ preset: preset.value })}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="inspector-section">
            <div className="inspector-section-title">Speed</div>
            <div className="speed-btns">
              {SPEEDS.map((speed) => (
                <button
                  key={speed}
                  className={`speed-btn ${clip.speed === speed ? 'active' : ''}`}
                  onClick={() => updateClip(clip.id, { speed })}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          <div className="inspector-section">
            <div className="inspector-section-title">Transition</div>
            <div className="inspector-row">
              <span className="inspector-label">Type</span>
              <select
                className="select"
                value={clip.transition?.type || 'none'}
                onChange={(e) => updateTransition({ type: e.target.value as any })}
              >
                {TRANSITION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="inspector-row">
              <span className="inspector-label">Duration</span>
              <div className="inspector-value">
                <input
                  type="range"
                  className="slider"
                  min={0.1}
                  max={2}
                  step={0.1}
                  value={clip.transition?.duration || 0.5}
                  onChange={(e) => updateTransition({ duration: parseFloat(e.target.value) })}
                />
                <span className="slider-value">{clip.transition?.duration || 0.5}s</span>
              </div>
            </div>
          </div>
        </>
      )}

      {(clip.trackType === 'video' || clip.trackType === 'audio') && (
        <div className="inspector-section">
          <div className="inspector-section-title">Audio</div>
          <div className="inspector-row">
            <span className="inspector-label">Volume</span>
            <div className="inspector-value">
              <input
                type="range"
                className="slider"
                min={0}
                max={200}
                value={clip.volume}
                onChange={(e) => updateClip(clip.id, { volume: parseInt(e.target.value) })}
              />
              <span className="slider-value">{clip.volume}%</span>
            </div>
          </div>
          <div className="inspector-row">
            <span className="inspector-label">Mute</span>
            <button
              className={`btn btn-sm ${clip.muted ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => updateClip(clip.id, { muted: !clip.muted })}
            >
              {clip.muted ? 'Muted' : 'On'}
            </button>
          </div>
        </div>
      )}

      {clip.trackType === 'text' && (
        <div className="inspector-section">
          <div className="inspector-section-title">Text Content</div>
          <textarea
            className="text-input-area"
            value={clip.text || ''}
            onChange={(e) => updateClip(clip.id, { text: e.target.value })}
            placeholder="Enter your text..."
          />

          <div className="inspector-section-title" style={{ marginTop: 16 }}>Typography</div>
          <div className="inspector-row">
            <span className="inspector-label">Font</span>
            <select
              className="select"
              value={clip.textStyle?.fontFamily || 'Plus Jakarta Sans'}
              onChange={(e) => updateClip(clip.id, {
                textStyle: { ...clip.textStyle!, fontFamily: e.target.value }
              })}
            >
              {FONTS.map((font) => (
                <option key={font} value={font}>{font}</option>
              ))}
            </select>
          </div>
          <div className="inspector-row">
            <span className="inspector-label">Size</span>
            <div className="inspector-value">
              <input
                type="range"
                className="slider"
                min={12}
                max={120}
                value={clip.textStyle?.fontSize || 48}
                onChange={(e) => updateClip(clip.id, {
                  textStyle: { ...clip.textStyle!, fontSize: parseInt(e.target.value) }
                })}
              />
              <span className="slider-value">{clip.textStyle?.fontSize || 48}px</span>
            </div>
          </div>
          <div className="inspector-row">
            <span className="inspector-label">Color</span>
            <div className="color-picker">
              <input
                type="color"
                value={clip.textStyle?.color || '#FFFFFF'}
                onChange={(e) => updateClip(clip.id, {
                  textStyle: { ...clip.textStyle!, color: e.target.value }
                })}
              />
            </div>
          </div>
          <div className="inspector-row">
            <span className="inspector-label">Weight</span>
            <select
              className="select"
              value={clip.textStyle?.fontWeight || 600}
              onChange={(e) => updateClip(clip.id, {
                textStyle: { ...clip.textStyle!, fontWeight: parseInt(e.target.value) }
              })}
            >
              <option value={400}>Normal</option>
              <option value={500}>Medium</option>
              <option value={600}>Semi Bold</option>
              <option value={700}>Bold</option>
            </select>
          </div>
          <div className="inspector-row">
            <span className="inspector-label">Align</span>
            <div className="speed-btns">
              {['left', 'center', 'right'].map((align) => (
                <button
                  key={align}
                  className={`speed-btn ${clip.textStyle?.textAlign === align ? 'active' : ''}`}
                  onClick={() => updateClip(clip.id, {
                    textStyle: { ...clip.textStyle!, textAlign: align as any }
                  })}
                >
                  {align === 'left' ? '⫷' : align === 'center' ? '⫶' : '⫸'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {clip.trackType === 'sticker' && (
        <div className="inspector-section">
          <div className="inspector-section-title">Sticker Position</div>
          <div className="inspector-row">
            <span className="inspector-label">X Position</span>
            <div className="inspector-value">
              <input
                type="range"
                className="slider"
                min={0}
                max={100}
                value={clip.x || 50}
                onChange={(e) => updateClip(clip.id, { x: parseInt(e.target.value) })}
              />
              <span className="slider-value">{clip.x || 50}%</span>
            </div>
          </div>
          <div className="inspector-row">
            <span className="inspector-label">Y Position</span>
            <div className="inspector-value">
              <input
                type="range"
                className="slider"
                min={0}
                max={100}
                value={clip.y || 50}
                onChange={(e) => updateClip(clip.id, { y: parseInt(e.target.value) })}
              />
              <span className="slider-value">{clip.y || 50}%</span>
            </div>
          </div>
          <div style={{ fontSize: 32, textAlign: 'center', marginTop: 16 }}>
            {clip.sticker}
          </div>
        </div>
      )}

      <div className="inspector-section">
        <div className="inspector-section-title">Clip Timing</div>
        <div className="inspector-row">
          <span className="inspector-label">Start</span>
          <input
            type="number"
            className="input"
            style={{ width: 80 }}
            value={clip.startTime.toFixed(1)}
            onChange={(e) => updateClip(clip.id, { startTime: Math.max(0, parseFloat(e.target.value) || 0) })}
            step={0.1}
          />
        </div>
        <div className="inspector-row">
          <span className="inspector-label">Duration</span>
          <input
            type="number"
            className="input"
            style={{ width: 80 }}
            value={clip.duration.toFixed(1)}
            onChange={(e) => updateClip(clip.id, { duration: Math.max(0.1, parseFloat(e.target.value) || 0.1) })}
            step={0.1}
          />
        </div>
      </div>
    </div>
  );
}