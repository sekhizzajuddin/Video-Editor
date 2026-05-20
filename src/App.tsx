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
import ShortcutsModal from './components/ShortcutsModal';
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
  const showOpenProject = useEditorStore(s => s.showOpenProject);
  const cropToMarkers = useEditorStore(s => s.cropToMarkers);
  const newProject = useEditorStore(s => s.newProject);
  const saveToast = useEditorStore(s => s.saveToast);
  const [activeTool, setActiveTool] = useState('media');
  const [dismissMobileWarning, setDismissMobileWarning] = useState(false);

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

    // Space: Play/Pause
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); togglePlayback(); return; }
    
    // JKL playback controls (like professional editors)
    if (e.key === 'k' || e.key === 'K') { store.setIsPlaying(false); store.setCurrentTime(store.currentTime); return; }
    if (e.key === 'l' || e.key === 'L') { if (!store.isPlaying) { e.preventDefault(); togglePlayback(); } return; }
    if (e.key === 'j' || e.key === 'J') { store.setIsPlaying(false); store.setCurrentTime(Math.max(0, store.currentTime - 1)); return; }
    
    // Arrow key frame navigation
    if (e.key === 'ArrowLeft') { e.preventDefault(); store.setCurrentTime(Math.max(0, store.currentTime - (e.shiftKey ? 5 : 1/30))); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); store.setCurrentTime(Math.min(store.project.duration, store.currentTime + (e.shiftKey ? 5 : 1/30))); return; }
    
    // Home/End navigation
    if (e.key === 'Home') { e.preventDefault(); store.setCurrentTime(0); return; }
    if (e.key === 'End') { e.preventDefault(); store.setCurrentTime(store.project.duration); return; }
    
    // S: Split at playhead (not Ctrl+S which is save)
    if (e.key === 's' || e.key === 'S') {
      if (!meta) {
        const id = store.activeClipId || store.selectedClipIds[0];
        if (id) { store.pushHistory(); store.splitClip(id, store.currentTime); }
        return;
      }
    }
    
    // Escape: Deselect all
    if (e.key === 'Escape') {
      store.setSelectedClipIds([]); store.setActiveClipId(null);
      store.setShowExport(false); store.setShowShortcuts(false); store.setShowOpenProject(false); return;
    }
    
    // Delete/Backspace: Remove selected clips
    if (e.key === 'Delete' || e.key === 'Backspace') { if (store.selectedClipIds.length > 0) store.removeSelectedClips(); return; }
    
    // Ctrl+A: Select all clips
    if (meta && e.key === 'a') { 
      e.preventDefault();
      const allClipIds: string[] = [];
      store.project.tracks.forEach(t => t.clips.forEach(c => allClipIds.push(c.id)));
      store.setSelectedClipIds(allClipIds);
      if (allClipIds.length > 0) store.setActiveClipId(allClipIds[0]);
      return; 
    }
    

    // Ctrl+Z/Y: Undo/Redo
    if (meta && e.key === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); return; }
    if (meta && e.key === 'y') { e.preventDefault(); store.redo(); return; }
    
    // Ctrl+S: Save
    if (meta && e.key === 's') { e.preventDefault(); store.saveToDB(); return; }
    
    // Ctrl+C/V/X: Copy/Paste/Cut
    if (meta && e.key === 'c') {
      const ids = store.selectedClipIds.length > 0 ? store.selectedClipIds : store.activeClipId ? [store.activeClipId] : [];
      const clips = ids.map(id => store.getClip(id)).filter(Boolean);
      if (clips.length > 0) store.setCopiedClip(JSON.parse(JSON.stringify(clips)));
      return;
    }
    if (meta && e.key === 'x') {
      const ids = store.selectedClipIds.length > 0 ? store.selectedClipIds : store.activeClipId ? [store.activeClipId] : [];
      const clips = ids.map(id => store.getClip(id)).filter(Boolean);
      if (clips.length > 0) {
        store.setCopiedClip(JSON.parse(JSON.stringify(clips)));
        store.pushHistory();
        store.removeSelectedClips();
      }
      return;
    }
    if (meta && e.key === 'v') {
      const { copiedClip, currentTime: ct } = store;
      if (copiedClip) {
        // Support both single clip (legacy) and array of clips
        const clips = Array.isArray(copiedClip) ? copiedClip : [copiedClip];
        const minStart = Math.min(...clips.map((c: any) => c.startAt));
        store.pushHistory();
        for (const clip of clips) {
          const newClip = store.addClip(clip.trackType, clip.mediaId, clip.sticker);
          if (newClip) {
            const { id: _id, trackId: _tid, ...rest } = clip;
            const offset = clip.startAt - minStart;
            store.updateClip(newClip.id, { ...rest, id: newClip.id, startAt: Math.max(0, ct + offset) });
          }
        }
      }
      return;
    }
    
    // +/-: Zoom in/out
    if (e.key === '+' || e.key === '=') { e.preventDefault(); store.setZoom(Math.min(5, store.zoom + 0.1)); return; }
    if (e.key === '-') { e.preventDefault(); store.setZoom(Math.max(0.05, store.zoom - 0.1)); return; }
    
    // 0: Fit to window
    if (e.key === '0') { store.setZoom(1); return; }
    
    // [/]: Nudge clip left/right
    if (e.key === '[') {
      e.preventDefault();
      store.selectedClipIds.forEach(id => {
        const clip = store.getClip(id);
        if (clip) store.updateClip(id, { startAt: Math.max(0, clip.startAt - 0.1) });
      });
      return;
    }
    if (e.key === ']') {
      e.preventDefault();
      store.selectedClipIds.forEach(id => {
        const clip = store.getClip(id);
        if (clip) store.updateClip(id, { startAt: clip.startAt + 0.1 });
      });
      return;
    }
    
    // M: Toggle marker
    if (e.key === 'm' || e.key === 'M') { store.toggleMarker(store.currentTime); return; }
    
    // I/O: In/Out points and Enter: Crop
    if (e.key === 'i' || e.key === 'I') { store.setInPoint(store.currentTime); return; }
    if (e.key === 'o' || e.key === 'O') { store.setOutPoint(store.currentTime); return; }
    if (e.key === 'Enter') { e.preventDefault(); store.cropToMarkers(); return; }
    
    // Ctrl+Shift+R: Toggle ripple mode
    if (meta && e.shiftKey && e.key === 'R') { 
      e.preventDefault();
      store.setRippleDelete(!store.rippleDelete); 
      return; 
    }
    
    // ? or Ctrl+/: Show shortcuts
    if (e.key === '?' || (meta && e.key === '/')) { store.setShowShortcuts(!store.showShortcuts); return; }
    
    // Ctrl+Shift+N: New project
    if (e.key === 'n' && meta && e.shiftKey) { e.preventDefault(); newProject(); return; }
    
    // Ctrl+D: Duplicate selected
    if (meta && e.key === 'd') {
      e.preventDefault();
      store.selectedClipIds.forEach(id => {
        const clip = store.getClip(id);
        if (clip) {
          const nc = store.addClip(clip.trackType, clip.mediaId, clip.sticker);
          if (nc) store.updateClip(nc.id, { ...clip, id: nc.id, startAt: clip.startAt + clip.duration });
        }
      });
      return;
    }
  }, [cropToMarkers, newProject, togglePlayback]);

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
          <div className="main-center">
            <AssetLibrary activeTool={activeTool} />
            <PreviewCanvas />
          </div>
          <InspectorPanel />
        </div>
        <Timeline />
        <ExportModal />
        <ShortcutsModal />
        {showOpenProject && <ProjectManagerModal />}
        {saveToast && <div className="toast">✓ Project saved</div>}
        
        {!dismissMobileWarning && (
          <div className="mobile-warning-overlay">
            <div className="mobile-warning-card">
              <span className="mobile-warning-icon">⚠</span>
              <h3 className="mobile-warning-title">Desktop Optimized</h3>
              <p className="mobile-warning-text">
                VidForge Pro is a professional video editor designed for desktop viewports. For the best editing experience, please use a tablet or laptop/desktop computer.
              </p>
              <button className="btn primary mobile-warning-btn" onClick={() => setDismissMobileWarning(true)}>
                Continue Anyway
              </button>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
