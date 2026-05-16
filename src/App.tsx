import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { MediaPanel } from './components/MediaPanel';
import { PreviewCanvas } from './components/PreviewCanvas';
import { InspectorPanel } from './components/InspectorPanel';
import { Timeline } from './components/Timeline';
import { ExportModal } from './components/ExportModal';
import { useEditorStore } from './store/editorStore';
import { saveProject } from './utils/fileUtils';

function App() {
  const [showExport, setShowExport] = useState(false);
  const { project } = useEditorStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.code === 'Space') {
        e.preventDefault();
        useEditorStore.getState().setIsPlaying(!useEditorStore.getState().isPlaying);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const saveInterval = setInterval(async () => {
      await saveProject(project);
    }, 30000);
    
    return () => clearInterval(saveInterval);
  }, [project]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData('mediaId');
    if (mediaId) {
      const { addClip } = useEditorStore.getState();
      const media = project.media.find(m => m.id === mediaId);
      if (media) {
        addClip(media.type === 'audio' ? 'audio' : 'video', mediaId);
      }
    }
  }, [project.media]);

  return (
    <div className="app" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <Header />
      <div className="main-content">
        <MediaPanel />
        <PreviewCanvas />
        <InspectorPanel />
      </div>
      <Timeline />
      
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </div>
  );
}

export default App;