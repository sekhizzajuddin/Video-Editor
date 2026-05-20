import { useEditorStore } from '../store/editorStore';

const SHORTCUTS = [
  { key: 'Space', desc: 'Play / Pause' },
  { key: 'Ctrl+Z', desc: 'Undo' },
  { key: 'Ctrl+Shift+Z', desc: 'Redo' },
  { key: 'Ctrl+S', desc: 'Save project' },
  { key: 'Ctrl+C', desc: 'Copy selected clip' },
  { key: 'Ctrl+X', desc: 'Cut selected clip' },
  { key: 'Ctrl+V', desc: 'Paste clip at playhead' },
  { key: 'Ctrl+D', desc: 'Duplicate selected clip(s)' },
  { key: 'Delete / Backspace', desc: 'Delete selected clip(s)' },
  { key: 'M', desc: 'Toggle marker at playhead' },
  { key: 'I', desc: 'Set In Point marker' },
  { key: 'O', desc: 'Set Out Point marker' },
  { key: 'Enter', desc: 'Crop timeline to markers' },
  { key: '? / Ctrl+/', desc: 'Toggle shortcuts' },
  { key: 'Escape', desc: 'Close modal / Deselect' },
  { key: 'Shift+Click', desc: 'Add to selection' },
  { key: 'Ctrl+Click', desc: 'Toggle clip selection' },
  { key: 'Shift+Click ruler', desc: 'Add marker at click' },
];

export default function ShortcutsModal() {
  const { showShortcuts, setShowShortcuts } = useEditorStore();
  if (!showShortcuts) return null;

  return (
    <div className="modal-overlay" onClick={() => setShowShortcuts(false)}>
      <div className="modal shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard Shortcuts</h2>
        <div className="shortcuts-list">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="shortcut-row">
              <kbd className="shortcut-key">{s.key}</kbd>
              <span className="shortcut-desc">{s.desc}</span>
            </div>
          ))}
        </div>
        <button className="btn secondary" onClick={() => setShowShortcuts(false)}>Close</button>
      </div>
    </div>
  );
}
