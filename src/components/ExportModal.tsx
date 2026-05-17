import { useState, useRef, useCallback, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { startExport } from '../engine/exportEngine';

export default function ExportModal() {
  const {
    showExport, setShowExport,
    exportSettings, setExportSettings,
    exportProgress, setExportProgress, exportStage, setExportStage,
    setExportError, exportError,
    project,
  } = useEditorStore();
  const { tracks, duration: projectDuration, media, name: projectName } = project;

  const [eta, setEta] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  // Reset state every time modal opens
  useEffect(() => {
    if (showExport) { setExportProgress(0); setExportStage(''); setExportError(null); setEta(''); }
  }, [showExport, setExportProgress, setExportStage, setExportError]);

  const handleExport = useCallback(async () => {
    setExportProgress(0);
    setExportStage('Preparing...');
    setExportError(null);

    const abort = new AbortController();
    abortRef.current = abort;

    const startTime = Date.now();

    try {
      const result = await startExport(
        {
          id: project.id,
          fps: project.fps,
          resolution: project.resolution,
          duration: projectDuration,
          tracks,
          media: media.map((m) => ({
            id: m.id,
            blob: m.blob,
            mimeType: m.mimeType,
            type: m.type,
            duration: m.duration,
          })),
        },
        { format: exportSettings.format, quality: exportSettings.quality },
        (p) => {
          setExportProgress(p.percent);
          setExportStage(p.stage);
          const elapsed = (Date.now() - startTime) / 1000;
          if (p.percent > 0) {
            const total = (elapsed / p.percent) * 100;
            const remaining = Math.max(0, total - elapsed);
            setEta(`${Math.round(remaining)}s remaining`);
          }
        },
        abort.signal,
      );

      if (result.type === 'cancelled') {
        setExportStage('Cancelled');
        setExportProgress(0);
        return;
      }

      setExportProgress(100);
      setExportStage('Done');

      const ext = exportSettings.format;
      const blobUrl = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${projectName || 'export'}.${ext}`;
      a.click();
      URL.revokeObjectURL(blobUrl);

      setTimeout(() => setShowExport(false), 1500);
    } catch (err: any) {
      setExportError(err.message || 'Export failed');
      setExportStage('Failed');
    } finally {
      abortRef.current = null;
    }
  }, [project, projectDuration, tracks, media, projectName, exportSettings, setExportProgress, setExportStage, setExportError, setShowExport]);

  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setExportProgress(0);
    setExportStage('Cancelled');
  }, [setExportProgress, setExportStage]);

  if (!showExport) return null;

  const isExporting = exportProgress > 0 && exportProgress < 100;

  return (
    <div className="modal-overlay" onClick={() => { if (!isExporting) setShowExport(false); }}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export</h2>

        <div className="export-settings">
          <label className="export-label">
            Format
            <select
              className="export-select"
              value={exportSettings.format}
              onChange={(e) => setExportSettings({ ...exportSettings, format: e.target.value as any })}
              disabled={isExporting}
            >
              <option value="mp4">MP4 (H.264)</option>
              <option value="webm">WebM (VP9)</option>
              <option value="mp3">MP3 (Audio only)</option>
              <option value="wav">WAV (Audio only)</option>
            </select>
          </label>

          {exportSettings.format !== 'mp3' && exportSettings.format !== 'wav' && (
            <label className="export-label">
              Resolution
              <select
                className="export-select"
                value={exportSettings.resolution}
                onChange={(e) => setExportSettings({ ...exportSettings, resolution: e.target.value as any })}
                disabled={isExporting}
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="4k">4K</option>
              </select>
            </label>
          )}

          <label className="export-label">
            Quality
            <select
              className="export-select"
              value={exportSettings.quality}
              onChange={(e) => setExportSettings({ ...exportSettings, quality: e.target.value as any })}
              disabled={isExporting}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        <div className="export-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${exportProgress}%` }} />
          </div>
          <span className="progress-text">{exportStage}</span>
          {eta && <span className="eta-text">{eta}</span>}
          {exportProgress > 0 && <span className="progress-pct">{exportProgress}%</span>}
        </div>

        {exportError && <div className="export-error">{exportError}</div>}

        <div className="export-actions">
          {isExporting ? (
            <button className="btn danger" onClick={handleCancel}>
              Cancel Export
            </button>
          ) : (
            <>
              <button className="btn secondary" onClick={() => setShowExport(false)}>Close</button>
              <button className="btn primary" onClick={handleExport} disabled={exportProgress >= 100}>
                {exportProgress >= 100 ? 'Done' : 'Export'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
