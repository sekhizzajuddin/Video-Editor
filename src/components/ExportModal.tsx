import { useState, useRef, useCallback, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { startExport } from '../engine/exportEngine';
import type { ExportFormat, ExportResolution } from '../types';

const EXPORT_PRESETS = [
  { id: 'youtube', label: 'YouTube', icon: '▶️', format: 'mp4' as ExportFormat, resolution: '1080p' as ExportResolution, quality: 'high' as const, desc: '1080p H.264, High quality' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵', format: 'mp4' as ExportFormat, resolution: '1080p' as ExportResolution, quality: 'medium' as const, desc: '9:16 vertical, optimized' },
  { id: 'instagram-reel', label: 'IG Reel', icon: '📸', format: 'mp4' as ExportFormat, resolution: '1080p' as ExportResolution, quality: 'medium' as const, desc: '9:16 vertical' },
  { id: 'twitter', label: 'X/Twitter', icon: '🐦', format: 'mp4' as ExportFormat, resolution: '720p' as ExportResolution, quality: 'medium' as const, desc: '720p, fast upload' },
  { id: 'discord', label: 'Discord', icon: '💬', format: 'webm' as ExportFormat, resolution: '720p' as ExportResolution, quality: 'low' as const, desc: 'Under 8MB target' },
  { id: 'podcast', label: 'Podcast', icon: '🎧', format: 'mp3' as ExportFormat, resolution: '720p' as ExportResolution, quality: 'high' as const, desc: 'Audio only, high quality' },
  { id: 'gif-preview', label: 'GIF Preview', icon: '🎞️', format: 'webm' as ExportFormat, resolution: '720p' as ExportResolution, quality: 'low' as const, desc: 'Quick preview' },
  { id: 'archive', label: '4K Archive', icon: '💎', format: 'mp4' as ExportFormat, resolution: '4k' as ExportResolution, quality: 'high' as const, desc: 'Maximum quality' },
];

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
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset state every time modal opens
  useEffect(() => {
    if (showExport) { setExportProgress(0); setExportStage(''); setExportError(null); setEta(''); }
  }, [showExport, setExportProgress, setExportStage, setExportError]);

  // Detect if current settings match a preset
  useEffect(() => {
    const match = EXPORT_PRESETS.find(
      p => p.format === exportSettings.format && p.resolution === exportSettings.resolution && p.quality === exportSettings.quality
    );
    setActivePreset(match?.id ?? null);
  }, [exportSettings]);

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
      // Delay revocation to ensure the download has started
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);

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

  const handlePresetClick = (preset: typeof EXPORT_PRESETS[number]) => {
    if (isExporting) return;
    setExportSettings({ format: preset.format, resolution: preset.resolution, quality: preset.quality });
    setActivePreset(preset.id);
  };

  return (
    <div className="modal-overlay" onClick={() => { if (!isExporting) setShowExport(false); }}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export</h2>

        <div className="export-preset-row">
          {EXPORT_PRESETS.map(p => (
            <button
              key={p.id}
              className={`export-preset-card ${activePreset === p.id ? 'export-preset-active' : ''}`}
              onClick={() => handlePresetClick(p)}
              disabled={isExporting}
              title={p.desc}
            >
              <span className="export-preset-icon">{p.icon}</span>
              <span className="export-preset-label">{p.label}</span>
              <span className="export-preset-desc">{p.desc}</span>
            </button>
          ))}
        </div>

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
