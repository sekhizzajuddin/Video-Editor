import { useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { MediaPanel } from './components/MediaPanel';
import { PreviewCanvas } from './components/PreviewCanvas';
import { InspectorPanel } from './components/InspectorPanel';
import { Timeline } from './components/Timeline';
import { useEditorStore } from './store/editorStore';
import { saveProject } from './utils/fileUtils';

function App() {
  const { project, addClip, isPlaying, setIsPlaying } = useEditorStore();
  const lastSaveRef = useRef<number>(Date.now());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useEditorStore.getState().undo();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        useEditorStore.getState().redo();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveProject(project);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, setIsPlaying, project]);

  useEffect(() => {
    const saveInterval = setInterval(async () => {
      if (Date.now() - lastSaveRef.current > 15000) {
        await saveProject(project);
        lastSaveRef.current = Date.now();
      }
    }, 15000);

    return () => clearInterval(saveInterval);
  }, [project]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData('mediaId');
    if (mediaId) {
      const media = project.media.find(m => m.id === mediaId);
      if (media) {
        addClip(media.type === 'audio' ? 'audio' : media.type === 'image' ? 'video' : 'video', mediaId);
      }
    }
  }, [project.media, addClip]);

  return (
    <div className="app" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <Header />
      <div className="main-content">
        <MediaPanel />
        <PreviewCanvas />
        <InspectorPanel />
      </div>
      <Timeline />
    </div>
  );
}

export default App;