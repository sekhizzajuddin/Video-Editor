import React, { useEffect, useCallback, useState } from 'react';
import { useEditorStore } from './store/editorStore';
import { getAllProjects, loadMediaForProject } from './utils/fileUtils';
import Header from './components/Header';
import LeftSidebar from './components/LeftSidebar';
import AssetLibrary from './components/AssetLibrary';
import PreviewCanvas from './components/PreviewCanvas';
import InspectorPanel from './components/InspectorPanel';
import Timeline from './components/Timeline';
import ExportModal from './components/ExportModal';
import ShorcutsModal from './components/ShorcutsModal';
import ProjectManagerModal from './components/ProjectManagerModal';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 40, color: '#EF4444', background: '#111', minHeight: '100vh', fontFamily: 'Inter, monospace' }}>
        <h2>Something went wrong</h2><pre>{this.state.error.message}</pre>
      </div>
    );
    return this.props.children;
  }
}

export default function App() {
  const { currentTime, cropToMarkers, newProject, saveToast, showOpenProject } = useEditorStore();
  const [activeTool, setActiveTool] = useState('media');

  // Auto-load most recent project on startup
  useEffect(() => {
    const lastId = localStorage.getItem('vidforge_last_project_id');
    if (!lastId) return;
    getAllProjects().then(async (projects) => {
      const proj = projects.find(p => p.id === lastId);
      if (!proj) return;
      const media = await loadMediaForProject(proj.media.map(m => m.id));
      const restoredProj = { ...proj, media: media.length > 0 ? media : proj.media };
      useEditorStore.getState().loadProject(restoredProj);
    }).catch(() => {});
  }, []);

  const togglePlayback = useCallback(() => {
    const s = useEditorStore.getState();
    s.setIsPlaying(!s.isPlaying);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const store = useEditorStore.getState();
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    const meta = e.ctrlKey || e.metaKey;

    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); togglePlayback(); return; }
    if (e.key === 'Escape') {
      store.setSelectedClipIds([]); store.setActiveClipId(null);
      store.setShowExport(false); store.setShowShorcuts(false); store.setShowOpenProject(false); return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (store.selectedClipIds.length > 0) store.removeSelectedClips(); return; }
    if (meta && e.key === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); return; }
    if (meta && e.key === 's') { e.preventDefault(); store.saveToDB(); return; }
    if (meta && e.key === 'c') {
      if (store.activeClipId) { const clip = store.getClip(store.activeClipId); if (clip) store.setCopiedClip(JSON.parse(JSON.stringify(clip))); } return;
    }
    if (meta && e.key === 'x') {
      if (store.activeClipId) { const clip = store.getClip(store.activeClipId); if (clip) store.setCopiedClip(JSON.parse(JSON.stringify(clip))); store.pushHistory(); store.removeSelectedClips(); } return;
    }
    if (meta && e.key === 'v') {
      const { copiedClip, currentTime: ct } = store;
      if (copiedClip) {
        const newClip = store.addClip(copiedClip.trackType, copiedClip.mediaId, copiedClip.sticker);
        if (newClip) store.updateClip(newClip.id, { ...copiedClip, id: newClip.id, startAt: Math.max(0, ct) });
      }
      return;
    }
    if (e.key === 'i') { store.toggleMarker(currentTime); return; }
    if (e.key === 'o') { cropToMarkers(); return; }
    if (e.key === '?' || (meta && e.key === '/')) { store.setShowShorcuts(!store.showShorcuts); return; }
    if (e.key === 'n' && meta && e.shiftKey) { e.preventDefault(); newProject(); return; }
  }, [currentTime, cropToMarkers, newProject, togglePlayback]);

  useEffect(() => { window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, [handleKeyDown]);

  // Auto-save every 30s if dirty
  useEffect(() => {
    const autoSave = setInterval(() => {
      const store = useEditorStore.getState();
      if (store.isDirty && store.project.id) {
        store.saveToDB().then(() => {
          localStorage.setItem('vidforge_last_project_id', store.project.id);
        });
      }
    }, 30000);
    return () => clearInterval(autoSave);
  }, []);

  return (
    <ErrorBoundary>
      <div className="app">
        <Header />
        <div className="main-workspace">
          <LeftSidebar activeTool={activeTool} onSetActiveTool={setActiveTool} />
          <AssetLibrary activeTool={activeTool} />
          <PreviewCanvas />
          <InspectorPanel />
        </div>
        <Timeline />
        <ExportModal />
        <ShorcutsModal />
        {showOpenProject && <ProjectManagerModal />}
        {saveToast && <div className="toast">✓ Project saved</div>}
      </div>
    </ErrorBoundary>
  );
}
