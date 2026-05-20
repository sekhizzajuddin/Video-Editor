import { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import {
  analyzeAudio,
  generateAutoCutPoints,
  computeLipsyncAlignment,
  VOICE_EQ_PRESETS,
  applyVoiceStabilizer,
  type AudioAnalysis,
  type AmplitudePoint,
} from '../engine/AudioAnalyzer';
import { registerMediaUrl } from '../engine/useMediaManager';

// ─── Icons ──────────────────────────────────────────────────────
function WaveIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h2l3-7 4 14 4-10 3 6h4"/></svg>; }
function ScissorsIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>; }
function MicIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="1" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><line x1="12" y1="19" x2="12" y2="23"/></svg>; }
function SyncIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }

// ─── Mini waveform visualization ────────────────────────────────
function MiniWaveform({ data, highlights, width = 280, height = 48 }: {
  data: AmplitudePoint[];
  highlights?: { start: number; end: number; color: string }[];
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const centerY = height / 2;
    const maxTime = data[data.length - 1].time;
    const barW = Math.max(1, width / data.length);

    // Draw highlights (silence regions)
    if (highlights) {
      for (const h of highlights) {
        const x1 = (h.start / maxTime) * width;
        const x2 = (h.end / maxTime) * width;
        ctx.fillStyle = h.color;
        ctx.fillRect(x1, 0, x2 - x1, height);
      }
    }

    // Draw waveform
    for (let i = 0; i < data.length; i++) {
      const x = (i / data.length) * width;
      const barH = Math.max(1, data[i].amplitude * height * 0.9);
      ctx.fillStyle = data[i].isSpeech ? 'rgba(16, 185, 129, 0.8)' : 'rgba(100, 116, 139, 0.5)';
      ctx.fillRect(x, centerY - barH, barW, barH * 2);
    }

    // Center line
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [data, highlights, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, borderRadius: 6, background: 'rgba(0,0,0,0.2)' }}
    />
  );
}

// ─── Analysis Results Card ──────────────────────────────────────
function AnalysisCard({ analysis }: { analysis: AudioAnalysis }) {
  const speechPct = Math.round(analysis.speechRatio * 100);
  const silenceTotal = analysis.silenceRegions.reduce((s, r) => s + r.duration, 0);
  const silencePct = Math.round((silenceTotal / analysis.duration) * 100);

  return (
    <div className="ai-analysis-card">
      <div className="ai-stat-row">
        <div className="ai-stat">
          <span className="ai-stat-value">{analysis.duration.toFixed(1)}s</span>
          <span className="ai-stat-label">Duration</span>
        </div>
        <div className="ai-stat">
          <span className="ai-stat-value">{speechPct}%</span>
          <span className="ai-stat-label">Speech</span>
        </div>
        <div className="ai-stat">
          <span className="ai-stat-value">{analysis.beats.length}</span>
          <span className="ai-stat-label">Beats</span>
        </div>
        <div className="ai-stat">
          <span className="ai-stat-value">{silencePct}%</span>
          <span className="ai-stat-label">Silence</span>
        </div>
      </div>
      <MiniWaveform
        data={analysis.amplitudeEnvelope}
        highlights={analysis.silenceRegions.map(r => ({
          start: r.start,
          end: r.end,
          color: 'rgba(239, 68, 68, 0.15)',
        }))}
      />
    </div>
  );
}

// ─── Main AudioTools Component ──────────────────────────────────
export default function AudioTools() {
  const { project, activeClipId, getClip, updateClip, splitClip, removeClip, pushHistory, addMedia } = useEditorStore();
  const { media, tracks } = project;

  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [applyingEQ, setApplyingEQ] = useState(false);
  const [autoCutThreshold, setAutoCutThreshold] = useState(-35);
  const [autoCutMinDuration, setAutoCutMinDuration] = useState(0.3);
  const [lipsyncResult, setLipsyncResult] = useState<{ timeOffset: number; speedAdjustment: number; confidence: number } | null>(null);

  const activeClip = activeClipId ? getClip(activeClipId) : null;
  const activeMedia = activeClip?.mediaId ? media.find(m => m.id === activeClip.mediaId) : null;
  const isAudioClip = activeClip && (activeClip.trackType === 'audio' || activeClip.trackType === 'video');

  // ─── Analyze audio ─────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!activeMedia?.blob) return;
    setAnalyzing(true);
    setProgress(0);
    try {
      const result = await analyzeAudio(activeMedia.blob, setProgress);
      setAnalysis(result);
    } catch (err) {
      console.error('Audio analysis failed:', err);
    }
    setAnalyzing(false);
  }, [activeMedia]);

  // ─── Auto-cut silence ─────────────────────────────────────────
  const handleAutoCut = useCallback(() => {
    if (!analysis || !activeClip) return;
    pushHistory();

    const cutPoints = generateAutoCutPoints(analysis.silenceRegions, 0.05);
    if (!cutPoints.length) return;

    // Split the clip at each silence boundary and remove silent segments
    // We work backwards to preserve earlier split points
    const sortedCuts = [...cutPoints].sort((a, b) => b.cutStart - a.cutStart);
    for (const cut of sortedCuts) {
      const absStart = activeClip.startAt + cut.cutStart;
      const absEnd = activeClip.startAt + cut.cutEnd;
      // Split at silence start, then at silence end, remove the middle
      splitClip(activeClip.id, absStart);
      splitClip(activeClip.id, absEnd);
    }
  }, [analysis, activeClip, pushHistory, splitClip, removeClip]);

  // ─── Apply EQ preset ──────────────────────────────────────────
  const handleApplyEQ = useCallback(async (presetId: string) => {
    if (!activeMedia?.blob || !activeClip) return;
    setApplyingEQ(true);
    setSelectedPreset(presetId);
    try {
      const processedBlob = await applyVoiceStabilizer(activeMedia.blob, presetId);
      // Add as new media and swap the clip
      const newId = crypto.randomUUID();
      const newMedia = {
        id: newId,
        name: `${activeMedia.name} (${VOICE_EQ_PRESETS.find(p => p.id === presetId)?.name})`,
        type: activeMedia.type,
        mimeType: 'audio/wav',
        blob: processedBlob,
        duration: activeMedia.duration,
        waveform: activeMedia.waveform,
      };
      addMedia(newMedia as any);
      registerMediaUrl(newId, processedBlob);
      pushHistory();
      updateClip(activeClip.id, { mediaId: newId, voiceStabilizer: true });
    } catch (err) {
      console.error('EQ apply failed:', err);
    }
    setApplyingEQ(false);
  }, [activeMedia, activeClip, addMedia, updateClip, pushHistory]);

  // ─── Lipsync alignment ────────────────────────────────────────
  const handleLipsync = useCallback(async () => {
    if (!activeClip || !analysis) return;

    // Find the video clip that this audio should sync to
    const videoClips = tracks
      .filter(t => t.type === 'video')
      .flatMap(t => t.clips)
      .filter(c => {
        // Overlapping in timeline
        return c.startAt < activeClip.startAt + activeClip.duration &&
               c.startAt + c.duration > activeClip.startAt;
      });

    if (!videoClips.length) {
      console.warn('No overlapping video clip found for lip sync');
      return;
    }

    const videoClip = videoClips[0];
    const videoMedia = media.find(m => m.id === videoClip.mediaId);
    if (!videoMedia?.blob) return;

    // Analyze video's embedded audio
    const videoAnalysis = await analyzeAudio(videoMedia.blob);
    const videoEnvelope = videoAnalysis.amplitudeEnvelope;

    // Compute alignment
    const alignment = computeLipsyncAlignment(videoEnvelope, analysis.amplitudeEnvelope);
    setLipsyncResult(alignment);

    // Apply the offset and speed
    if (alignment.confidence > 0.3) {
      pushHistory();
      updateClip(activeClip.id, {
        startAt: activeClip.startAt + alignment.timeOffset,
        speed: alignment.speedAdjustment,
        preservePitch: true,
      });
    }
  }, [activeClip, analysis, tracks, media, pushHistory, updateClip]);

  // ─── Beat markers ─────────────────────────────────────────────
  const handleAddBeatMarkers = useCallback(() => {
    if (!analysis || !activeClip) return;
    const store = useEditorStore.getState();
    for (const beat of analysis.beats) {
      if (beat.strength > 0.5) {
        store.toggleMarker(activeClip.startAt + beat.time);
      }
    }
  }, [analysis, activeClip]);

  if (!isAudioClip) {
    return (
      <div className="ai-tools-panel">
        <div className="ai-tools-header">
          <WaveIcon />
          <span>AI Audio Tools</span>
        </div>
        <div className="ai-tools-empty">
          <MicIcon />
          <p>Select an audio or video clip to use AI audio tools</p>
          <span className="ai-tools-hint">These tools analyze and process audio locally on your device</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-tools-panel">
      <div className="ai-tools-header">
        <WaveIcon />
        <span>AI Audio Tools</span>
        <span className="ai-tools-badge">Local AI</span>
      </div>

      {/* Analyze Button */}
      <div className="ai-section">
        <button
          className={`ai-action-btn ${analyzing ? 'loading' : ''}`}
          onClick={handleAnalyze}
          disabled={analyzing}
        >
          {analyzing ? (
            <>
              <span className="ai-spinner" />
              Analyzing... {Math.round(progress)}%
            </>
          ) : (
            <>
              <WaveIcon /> {analysis ? 'Re-analyze Audio' : 'Analyze Audio'}
            </>
          )}
        </button>

        {analyzing && (
          <div className="ai-progress-bar">
            <div className="ai-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* Analysis Results */}
      {analysis && <AnalysisCard analysis={analysis} />}

      {/* Auto-Cut Silence */}
      {analysis && analysis.silenceRegions.length > 0 && (
        <div className="ai-section">
          <div className="ai-section-header">
            <ScissorsIcon />
            <span>Auto-Cut Silence</span>
          </div>
          <p className="ai-section-desc">
            Found {analysis.silenceRegions.length} silent regions ({(analysis.silenceRegions.reduce((s, r) => s + r.duration, 0)).toFixed(1)}s total)
          </p>
          <div className="ai-controls-row">
            <label className="ai-slider-label">
              Threshold
              <input
                type="range" min={-60} max={-10} step={1}
                value={autoCutThreshold}
                onChange={e => setAutoCutThreshold(Number(e.target.value))}
              />
              <span className="ai-slider-value">{autoCutThreshold}dB</span>
            </label>
            <label className="ai-slider-label">
              Min Duration
              <input
                type="range" min={0.1} max={2} step={0.1}
                value={autoCutMinDuration}
                onChange={e => setAutoCutMinDuration(Number(e.target.value))}
              />
              <span className="ai-slider-value">{autoCutMinDuration.toFixed(1)}s</span>
            </label>
          </div>
          <button className="ai-action-btn accent" onClick={handleAutoCut}>
            <ScissorsIcon /> Remove Silence ({analysis.silenceRegions.length} cuts)
          </button>
        </div>
      )}

      {/* Voice Stabilizer EQ */}
      {analysis && (
        <div className="ai-section">
          <div className="ai-section-header">
            <MicIcon />
            <span>Voice Stabilizer</span>
          </div>
          <p className="ai-section-desc">
            Apply EQ presets to make AI voices sound natural
          </p>
          <div className="ai-eq-grid">
            {VOICE_EQ_PRESETS.map(preset => (
              <button
                key={preset.id}
                className={`ai-eq-btn ${selectedPreset === preset.id ? 'active' : ''}`}
                onClick={() => handleApplyEQ(preset.id)}
                disabled={applyingEQ}
                title={preset.description}
              >
                <span className="ai-eq-icon">{preset.icon}</span>
                <span className="ai-eq-name">{preset.name}</span>
              </button>
            ))}
          </div>
          {applyingEQ && (
            <div className="ai-processing-indicator">
              <span className="ai-spinner" />
              Processing audio...
            </div>
          )}
        </div>
      )}

      {/* Lip Sync */}
      {analysis && (
        <div className="ai-section">
          <div className="ai-section-header">
            <SyncIcon />
            <span>Lip Sync Alignment</span>
          </div>
          <p className="ai-section-desc">
            Align this audio clip to the nearest video clip's lip movements
          </p>
          <button className="ai-action-btn" onClick={handleLipsync}>
            <SyncIcon /> Auto-Align to Video
          </button>
          {lipsyncResult && (
            <div className="ai-result-card">
              <div className="ai-result-row">
                <span>Time Offset</span>
                <span className="ai-result-value">{lipsyncResult.timeOffset > 0 ? '+' : ''}{(lipsyncResult.timeOffset * 1000).toFixed(0)}ms</span>
              </div>
              <div className="ai-result-row">
                <span>Speed Adjustment</span>
                <span className="ai-result-value">{lipsyncResult.speedAdjustment.toFixed(3)}x</span>
              </div>
              <div className="ai-result-row">
                <span>Confidence</span>
                <span className={`ai-result-value ${lipsyncResult.confidence > 0.7 ? 'high' : lipsyncResult.confidence > 0.4 ? 'medium' : 'low'}`}>
                  {Math.round(lipsyncResult.confidence * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Beat Markers */}
      {analysis && analysis.beats.length > 0 && (
        <div className="ai-section">
          <div className="ai-section-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
            <span>Beat Detection</span>
          </div>
          <p className="ai-section-desc">
            {analysis.beats.length} beats detected
          </p>
          <button className="ai-action-btn" onClick={handleAddBeatMarkers}>
            Add Beat Markers to Timeline
          </button>
        </div>
      )}
    </div>
  );
}
