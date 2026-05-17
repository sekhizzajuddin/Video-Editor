import React, { useEffect, useCallback, useState } from 'react';
import { useEditorStore } from './store/editorStore';
import { usePlaybackEngine } from './engine/usePlaybackEngine';
import Header from './components/Header';
import LeftSidebar from './components/LeftSidebar';
import AssetLibrary from './components/AssetLibrary';
import PreviewCanvas from './components/PreviewCanvas';
import InspectorPanel from './components/InspectorPanel';
import Timeline from './components/Timeline';
import ExportModal from './components/ExportModal';
import ShorcutsModal from './components/ShorcutsModal';

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div style={{ padding: 40, color: '#EF4444', background: '#111111', minHeight: '100vh', fontFamily: 'Inter, monospace' }}>
      <h2>Something went wrong</h2>
      <pre>{error.message}</pre>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return <ErrorFallback error={this.state.error} />;
    return this.props.children;
  }
}

export default function App() {
  const { currentTime, cropToMarkers, newProject } = useEditorStore();
  const [activeTool, setActiveTool] = useState('media');

  const engine = usePlaybackEngine();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const store = useEditorStore.getState();
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    const meta = e.ctrlKey || e.metaKey;

    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); engine.toggle(); return; }
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
      if (copiedClip) { const newClip = store.addClip(copiedClip.trackType, copiedClip.mediaId, copiedClip.sticker); if (newClip) store.updateClip(newClip.id, { ...copiedClip, id: newClip.id, startAt: Math.max(0, ct) }); } return;
    }
    if (e.key === 'i') { store.toggleMarker(currentTime); return; }
    if (e.key === 'o') { cropToMarkers(); return; }
    if (e.key === '?' || (meta && e.key === '/')) { store.setShowShorcuts(!store.showShorcuts); return; }
    if (e.key === 'n' && meta && e.shiftKey) { e.preventDefault(); newProject(); return; }
  }, [currentTime, cropToMarkers, newProject, engine]);

  useEffect(() => { window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, [handleKeyDown]);
  useEffect(() => { const autoSave = setInterval(() => { const store = useEditorStore.getState(); if (store.isDirty && store.project.id) store.saveToDB(); }, 30000); return () => clearInterval(autoSave); }, []);

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
        {useEditorStore.getState().saveToast && <div className="toast">Project saved</div>}
      </div>
    </ErrorBoundary>
  );
}
