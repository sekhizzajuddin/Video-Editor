import { useEditorStore } from '../store/editorStore';

function UndoIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>; }
function RedoIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>; }
function SaveIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>; }
function DownloadIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>; }
function FolderOpenIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>; }
function PlusIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }

export default function Header() {
  const {
    project: { name: projectName }, setProjectName,
    undo, redo, undoStack, redoStack,
    setShowExport, setShowOpenProject, newProject,
    isDirty, saveToDB,
  } = useEditorStore();

  const handleSave = () => {
    saveToDB().then(() => {
      const id = useEditorStore.getState().project.id;
      if (id) localStorage.setItem('vidforge_last_project_id', id);
    });
  };

  return (
    <header className="navbar">
      <div className="navbar-left">
        <div className="navbar-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect width="20" height="20" x="2" y="2" rx="5" fill="#6366F1"/><polygon points="10,8 10,16 17,12" fill="#fff"/></svg>
          <span className="navbar-brand">VidForge Pro</span>
        </div>
        <div className="navbar-divider" />
        <input
          id="project-name-input"
          className="navbar-project-name"
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          title="Project name"
        />
        {isDirty && <span className="navbar-dirty" title="Unsaved changes">●</span>}
      </div>
      <div className="navbar-right">
        <button className="navbar-btn" onClick={() => setShowOpenProject(true)} title="Open Project"><FolderOpenIcon /></button>
        <button className="navbar-btn" onClick={() => newProject()} title="New Project (Ctrl+Shift+N)"><PlusIcon /></button>
        <div className="navbar-divider" />
        <button className="navbar-btn" onClick={undo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)"><UndoIcon /></button>
        <button className="navbar-btn" onClick={redo} disabled={redoStack.length === 0} title="Redo (Ctrl+Shift+Z)"><RedoIcon /></button>
        <button className="navbar-btn navbar-save" onClick={handleSave} title="Save (Ctrl+S)"><SaveIcon /></button>
        <button className="navbar-export-btn" onClick={() => setShowExport(true)}>
          <DownloadIcon />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
}
