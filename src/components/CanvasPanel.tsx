import { useEditorStore } from '../store/editorStore';

const ASPECT_PRESETS = [
  { label: '16:9', w: 16, h: 9 },
  { label: '9:16', w: 9, h: 16 },
  { label: '1:1', w: 1, h: 1 },
  { label: '4:3', w: 4, h: 3 },
  { label: '4:5', w: 4, h: 5 },
  { label: '21:9', w: 21, h: 9 },
];

const BG_COLORS = [
  '#000000', '#ffffff', '#1e1e1e', '#374151', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6',
];

export default function CanvasPanel() {
  const { aspectRatio, setAspectRatio, canvasOptions, setCanvasOptions } = useEditorStore();
  const bg = canvasOptions.background;

  return (
    <div className="panel-content canvas-panel">
      <p className="panel-hint">Aspect Ratio</p>
      <div className="canvas-aspect-grid">
        {ASPECT_PRESETS.map(p => (
          <button
            key={`${p.w}:${p.h}`}
            className={`canvas-aspect-btn ${aspectRatio.w === p.w && aspectRatio.h === p.h ? 'active' : ''}`}
            onClick={() => setAspectRatio(p.w, p.h)}
          >
            <div className="canvas-aspect-preview" style={{ aspectRatio: `${p.w}/${p.h}` }} />
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      <p className="panel-hint" style={{ marginTop: 14 }}>Background Color</p>
      <div className="canvas-bg-grid">
        {BG_COLORS.map(c => (
          <button
            key={c}
            className={`canvas-bg-btn ${bg.type === 'solid' && bg.color === c ? 'active' : ''}`}
            style={{ background: c }}
            onClick={() => setCanvasOptions({ background: { type: 'solid', color: c } })}
          />
        ))}
        <div className="canvas-bg-picker-wrap">
          <input
            type="color"
            value={bg.type === 'solid' ? bg.color : '#000000'}
            onChange={e => setCanvasOptions({ background: { type: 'solid', color: e.target.value } })}
            className="canvas-bg-picker"
          />
        </div>
      </div>
    </div>
  );
}
