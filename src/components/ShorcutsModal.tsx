import { useEditorStore } from '../store/editorStore';

const SHORTCUTS = [
  { key: 'Space', desc: 'Play / Pause' },
  { key: 'Ctrl+Z', desc: 'Undo' },
  { key: 'Ctrl+Shift+Z', desc: 'Redo' },
  { key: 'Ctrl+S', desc: 'Save project' },
  { key: 'Ctrl+C', desc: 'Copy selected clip' },
  { key: 'Ctrl+X', desc: 'Cut selected clip' },
  { key: 'Ctrl+V', desc: 'Paste clip at playhead' },
  { key: 'Delete / Backspace', desc: 'Delete selected clip(s)' },
  { key: 'I', desc: 'Toggle marker at playhead' },
  { key: 'O', desc: 'Crop to markers' },
  { key: '? / Ctrl+/', desc: 'Toggle shortcuts' },
  { key: 'Escape', desc: 'Close modal / Deselect' },
  { key: 'Shift+Click', desc: 'Add to selection' },
  { key: 'Ctrl+Click', desc: 'Toggle clip selection' },
  { key: 'Shift+Click ruler', desc: 'Add marker at click' },
];

export default function ShorcutsModal() {
  const { showShorcuts, setShowShorcuts } = useEditorStore();
  if (!showShorcuts) return null;

  return (
    <div className="modal-overlay" onClick={() => setShowShorcuts(false)}>
      <div className="modal shorcuts-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard Shortcuts</h2>
        <div className="shorcuts-list">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="shorcut-row">
              <kbd className="shorcut-key">{s.key}</kbd>
              <span className="shorcut-desc">{s.desc}</span>
            </div>
          ))}
        </div>
        <button className="btn secondary" onClick={() => setShowShorcuts(false)}>Close</button>
      </div>
    </div>
  );
}
