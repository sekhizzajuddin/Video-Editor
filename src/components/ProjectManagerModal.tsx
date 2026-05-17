import { useEditorStore } from '../store/editorStore';
import { getAllProjects, deleteProjectFromDB, loadMediaForProject } from '../utils/fileUtils';
import { useEffect, useState } from 'react';
import type { Project } from '../types';

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function countClips(p: Project) {
  return p.tracks.reduce((s, t) => s + t.clips.length, 0);
}

export default function ProjectManagerModal() {
  const { setShowOpenProject, loadProject, newProject } = useEditorStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllProjects().then(ps => {
      setProjects(ps.sort((a, b) => b.updatedAt - a.updatedAt));
      setLoading(false);
    });
  }, []);

  const handleOpen = async (proj: Project) => {
    const media = await loadMediaForProject(proj.media.map(m => m.id));
    const restored = { ...proj, media: media.length > 0 ? media : proj.media };
    loadProject(restored);
    localStorage.setItem('vidforge_last_project_id', proj.id);
    setShowOpenProject(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteProjectFromDB(id);
    setProjects(ps => ps.filter(p => p.id !== id));
    if (localStorage.getItem('vidforge_last_project_id') === id) localStorage.removeItem('vidforge_last_project_id');
  };

  return (
    <div className="modal-overlay" onClick={() => setShowOpenProject(false)}>
      <div className="modal project-manager-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-header">
          <h2>Open Project</h2>
          <button className="pm-new-btn" onClick={() => { newProject(); setShowOpenProject(false); }}>+ New Project</button>
        </div>
        {loading ? (
          <div className="pm-empty">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="pm-empty">No saved projects yet.<br />Start editing and press Ctrl+S to save.</div>
        ) : (
          <div className="project-list">
            {projects.map(p => (
              <div key={p.id} className="project-item" onClick={() => handleOpen(p)}>
                <div className="project-item-info">
                  <span className="project-item-name">{p.name || 'Untitled Project'}</span>
                  <span className="project-item-meta">{countClips(p)} clips · {p.fps}fps · {p.resolution.w}×{p.resolution.h}</span>
                  <span className="project-item-date">{formatDate(p.updatedAt)}</span>
                </div>
                <button className="project-item-delete" title="Delete" onClick={e => handleDelete(e, p.id)}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="pm-footer">
          <button className="btn secondary" onClick={() => setShowOpenProject(false)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
