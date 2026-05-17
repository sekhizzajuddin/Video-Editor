import { useEditorStore } from '../store/editorStore';

/* Simple SVG icons */
function UndoIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>; }
function RedoIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>; }
function DownloadIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>; }
function SquareIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="#6366F1"><rect width="20" height="20" x="2" y="2" rx="4"/></svg>; }

export default function Header() {
  const { project: { name: projectName }, setProjectName, undo, redo, undoStack, redoStack, setShowExport, isDirty, saveToDB } = useEditorStore();

  return (
    <header className="navbar">
      <div className="navbar-left">
        <div className="navbar-logo">
          <SquareIcon />
          <span className="navbar-brand">Lumen</span>
          <span className="navbar-version">v1.0</span>
        </div>
        <div className="navbar-divider" />
        <input
          className="navbar-project-name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
        />
        {isDirty && <span className="navbar-dirty">*</span>}
      </div>
      <div className="navbar-right">
        <button className="navbar-btn" onClick={undo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)"><UndoIcon /></button>
        <button className="navbar-btn" onClick={redo} disabled={redoStack.length === 0} title="Redo (Ctrl+Shift+Z)"><RedoIcon /></button>
        <button className="navbar-btn navbar-save" onClick={saveToDB} title="Save (Ctrl+S)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        </button>
        <button className="navbar-export-btn" onClick={() => setShowExport(true)}>
          <DownloadIcon />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
}
