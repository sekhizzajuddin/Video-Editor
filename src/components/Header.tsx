import { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { saveProject } from '../utils/fileUtils';
import { ExportModal } from './ExportModal';

export function Header() {
  const { project, setProjectName, undo, redo, historyIndex, history } = useEditorStore();
  const [showExport, setShowExport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveProject(project);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save:', e);
    }
    setSaving(false);
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="logo">VidCraft</div>
          <input
            type="text"
            className="project-name"
            value={project.name}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </div>
        <div className="header-center" style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn btn-ghost btn-icon"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            style={{ opacity: canUndo ? 1 : 0.4 }}
          >
            ↩
          </button>
          <button
            className="btn btn-ghost btn-icon"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            style={{ opacity: canRedo ? 1 : 0.4 }}
          >
            ↪
          </button>
        </div>
        <div className="header-right">
          <button className="btn btn-secondary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : showSaved ? '✓ Saved' : 'Save'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowExport(true)}>
            Export
          </button>
        </div>
      </header>
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </>
  );
}