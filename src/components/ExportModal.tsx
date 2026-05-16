import { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { exportVideo, downloadBlob } from '../utils/exportUtils';
import type { ExportSettings, ExportFormat, ExportResolution } from '../types';

interface ExportModalProps {
  onClose: () => void;
}

export function ExportModal({ onClose }: ExportModalProps) {
  const { project } = useEditorStore();
  const [settings, setSettings] = useState<ExportSettings>({
    format: 'webm',
    resolution: '1080p',
    quality: 'high',
  });
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setProgress(0);
    setError(null);

    try {
      const blob = await exportVideo(
        project,
        project.media,
        settings,
        setProgress
      );

      const filename = `${project.name.replace(/\s+/g, '_')}.${settings.format}`;
      downloadBlob(blob, filename);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }

    setExporting(false);
  };

  const isValid = project.tracks.some(t => t.type === 'video' && t.clips.length > 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Export Video</h2>
        
        <div className="modal-content">
          {!isValid && (
            <div style={{ 
              padding: 16, 
              background: 'rgba(239, 68, 68, 0.1)', 
              borderRadius: 8, 
              marginBottom: 16,
              color: '#EF4444',
              fontSize: 14
            }}>
              Add at least one video clip to export
            </div>
          )}

          <div className="export-options">
            <div className="export-option">
              <label>Format</label>
              <select
                className="select"
                value={settings.format}
                onChange={(e) => setSettings({ ...settings, format: e.target.value as ExportFormat })}
                disabled={exporting}
              >
                <option value="webm">WebM (Fast, browser-native)</option>
                <option value="mp4">MP4 (More compatible)</option>
              </select>
            </div>

            <div className="export-option">
              <label>Resolution</label>
              <select
                className="select"
                value={settings.resolution}
                onChange={(e) => setSettings({ ...settings, resolution: e.target.value as ExportResolution })}
                disabled={exporting}
              >
                <option value="720p">720p (HD)</option>
                <option value="1080p">1080p (Full HD)</option>
                <option value="4k">4K (Ultra HD)</option>
              </select>
            </div>

            <div className="export-option">
              <label>Quality</label>
              <select
                className="select"
                value={settings.quality}
                onChange={(e) => setSettings({ ...settings, quality: e.target.value as any })}
                disabled={exporting}
              >
                <option value="low">Low (Smaller file)</option>
                <option value="medium">Medium</option>
                <option value="high">High (Best quality)</option>
              </select>
            </div>

            {exporting && (
              <div className="export-progress">
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  Exporting... {Math.round(progress)}%
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {error && (
              <div style={{ 
                padding: 12, 
                background: 'rgba(239, 68, 68, 0.1)', 
                borderRadius: 8,
                color: '#EF4444',
                fontSize: 13
              }}>
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={exporting}>
            Cancel
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleExport}
            disabled={exporting || !isValid}
          >
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}