import React, { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import type { Clip } from '../types';
import VFXInspector from './VFXInspector';
import { interpolateKeyframes } from '../utils/keyframeUtils';

const FONT_FAMILIES = ['Inter, sans-serif', 'Georgia, serif', 'JetBrains Mono, monospace', 'Arial, sans-serif'];
const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];
const FILTER_PRESETS = ['none', 'bw', 'sepia', 'warm', 'cool', 'contrast'];
const TRANSITION_TYPES = ['none', 'fade', 'dissolve', 'wipe', 'wipe-left', 'wipe-right', 'slide', 'slide-left', 'slide-right', 'zoom', 'spin', 'blur', 'flash'];
const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

interface KeyframeButtonProps {
  clip: Clip;
  property: string;
  currentTime: number;
  currentValue: number;
  addKeyframe: (clipId: string, property: string, time: number, value: number) => void;
  removeKeyframe: (clipId: string, kfId: string) => void;
}

function KeyframeButton({
  clip,
  property,
  currentTime,
  currentValue,
  addKeyframe,
  removeKeyframe,
}: KeyframeButtonProps) {
  const localTime = currentTime - clip.startAt;
  const track = clip.keyframeTracks?.find(t => t.property === property);
  const existingKf = track?.keyframes.find(k => Math.abs(k.time - localTime) < 0.05);
  const active = !!existingKf;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (active && existingKf) {
      removeKeyframe(clip.id, existingKf.id);
    } else {
      addKeyframe(clip.id, property, localTime, currentValue);
    }
  };

  return (
    <button
      className={`inspector-keyframe-btn ${active ? 'active' : ''}`}
      onClick={handleClick}
      title={active ? 'Remove Keyframe' : 'Add Keyframe'}
      style={{
        background: 'none',
        border: 'none',
        color: active ? '#6366f1' : '#71717a',
        cursor: 'pointer',
        fontSize: '15px',
        padding: '0 4px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 0.15s, transform 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.25)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
    >
      {active ? '◆' : '◇'}
    </button>
  );
}

function CollapsibleSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="inspector-section">
      <div className="inspector-section-header" onClick={() => setIsOpen(!isOpen)}>
        <span>{title}</span>
        <span style={{ fontSize: 9, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
      </div>
      {isOpen && children}
    </div>
  );
}

function AudioInspector({ clip, update, getClipName }: { clip: Clip; update: (p: Partial<Clip>) => void; getClipName: (c: Clip) => string }) {
  return (
    <div className="inspector-scroll">
      <div className="inspector-clip-header">
        <div className="inspector-clip-type">Selected · Audio</div>
        <div className="inspector-clip-name">{getClipName(clip)}</div>
      </div>

      <CollapsibleSection title="Timing">
        <div className="inspector-timing-grid">
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Start</span>
            <span className="inspector-timing-value">{clip.startAt.toFixed(2)}s</span>
          </div>
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Duration</span>
            <span className="inspector-timing-value">{clip.duration.toFixed(2)}s</span>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Audio">
        <div className="inspector-volume-row">
          <span className="inspector-volume-pct">{Math.round((clip.volume ?? 1) * 100)}%</span>
          <input className="inspector-volume-slider" type="range" min={0} max={200} step={1}
            value={Math.round((clip.volume ?? 1) * 100)}
            onChange={e => update({ volume: parseInt(e.target.value) / 100 })} />
        </div>
        <div className="inspector-toggle-row">
          <span className="inspector-toggle-label">Muted</span>
          <label className="inspector-toggle">
            <input type="checkbox" checked={clip.muted} onChange={e => update({ muted: e.target.checked })} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
        <div className="inspector-fade-row">
          <span className="inspector-fade-label">Fade In</span>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input className="inspector-fade-input" type="number" min={0} max={10} step={0.1}
              value={clip.audioFadeIn || 0}
              onChange={e => update({ audioFadeIn: Math.max(0, parseFloat(e.target.value) || 0) })} />
            <span className="inspector-fade-unit">s</span>
          </div>
        </div>
        <div className="inspector-fade-row">
          <span className="inspector-fade-label">Fade Out</span>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input className="inspector-fade-input" type="number" min={0} max={10} step={0.1}
              value={clip.audioFadeOut || 0}
              onChange={e => update({ audioFadeOut: Math.max(0, parseFloat(e.target.value) || 0) })} />
            <span className="inspector-fade-unit">s</span>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Speed">
        <div className="speed-presets">
          {SPEED_PRESETS.map(speed => (
            <button key={speed} className={`speed-preset-btn ${Math.abs((clip.speed || 1) - speed) < 0.01 ? 'active' : ''}`}
              onClick={() => update({ speed })}>{speed}x</button>
          ))}
        </div>
        <div className="inspector-volume-row">
          <span className="inspector-volume-pct">{(clip.speed || 1).toFixed(2)}×</span>
          <input className="inspector-volume-slider" type="range" min={10} max={400} step={5}
            value={Math.round((clip.speed || 1) * 100)}
            onChange={e => update({ speed: parseInt(e.target.value) / 100 })} />
        </div>
        <div className="inspector-toggle-row">
          <span className="inspector-toggle-label">Auto Pitch</span>
          <label className="inspector-toggle">
            <input type="checkbox" checked={clip.preservePitch || false} onChange={e => update({ preservePitch: e.target.checked })} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
        <div className="inspector-toggle-row">
          <span className="inspector-toggle-label">AI Voice Stabilizer</span>
          <label className="inspector-toggle">
            <input type="checkbox" checked={clip.voiceStabilizer || false} onChange={e => update({ voiceStabilizer: e.target.checked })} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
      </CollapsibleSection>
    </div>
  );
}

interface VideoInspectorProps {
  clip: Clip;
  update: (p: Partial<Clip>) => void;
  currentTime: number;
  addKeyframe: (clipId: string, property: string, time: number, value: number) => void;
  removeKeyframe: (clipId: string, kfId: string) => void;
  getClipName: (c: Clip) => string;
}

function VideoInspector({ clip, update, currentTime, addKeyframe, removeKeyframe, getClipName }: VideoInspectorProps) {
  const tr = clip.transform;
  const localTime = currentTime - clip.startAt;

  // Compute interpolated keyframe values or fallback to static defaults
  const hasScaleKfs = !!clip.keyframeTracks?.some(t => t.property === 'scale' && t.keyframes.length > 0);
  const currentScale = hasScaleKfs ? interpolateKeyframes(clip.keyframeTracks, localTime, 'scale') : tr.scale;

  const hasXKfs = !!clip.keyframeTracks?.some(t => t.property === 'x' && t.keyframes.length > 0);
  const currentX = hasXKfs ? interpolateKeyframes(clip.keyframeTracks, localTime, 'x') : tr.x;

  const hasYKfs = !!clip.keyframeTracks?.some(t => t.property === 'y' && t.keyframes.length > 0);
  const currentY = hasYKfs ? interpolateKeyframes(clip.keyframeTracks, localTime, 'y') : tr.y;

  const hasRotationKfs = !!clip.keyframeTracks?.some(t => t.property === 'rotation' && t.keyframes.length > 0);
  const currentRotation = hasRotationKfs ? interpolateKeyframes(clip.keyframeTracks, localTime, 'rotation') : tr.rotation;

  const hasOpacityKfs = !!clip.keyframeTracks?.some(t => t.property === 'opacity' && t.keyframes.length > 0);
  const currentOpacity = hasOpacityKfs ? interpolateKeyframes(clip.keyframeTracks, localTime, 'opacity') : (clip.opacity ?? 100);

  const handlePropertyChange = (property: string, value: number, basePatch: Partial<Clip>) => {
    const hasKfs = !!clip.keyframeTracks?.some(t => t.property === property && t.keyframes.length > 0);
    if (hasKfs) {
      addKeyframe(clip.id, property, localTime, value);
    } else {
      update(basePatch);
    }
  };

  const applyPipPreset = (preset: string) => {
    const presets: Record<string, { x: number; y: number; scale: number }> = {
      'bottom-right': { x: 500, y: 250, scale: 0.35 },
      'bottom-left': { x: -500, y: 250, scale: 0.35 },
      'top-right': { x: 500, y: -250, scale: 0.35 },
      'top-left': { x: -500, y: -250, scale: 0.35 },
      'center': { x: 0, y: 0, scale: 0.5 },
      'full': { x: 0, y: 0, scale: 1 },
    };
    const p = presets[preset];
    if (p) update({ transform: { ...tr, x: p.x, y: p.y, scale: p.scale } });
  };
  
  return (
    <div className="inspector-scroll">
      <div className="inspector-clip-header">
        <div className="inspector-clip-type">Selected · Video</div>
        <div className="inspector-clip-name">{getClipName(clip)}</div>
      </div>

      <CollapsibleSection title="Timing">
        <div className="inspector-timing-grid">
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Start</span>
            <span className="inspector-timing-value">{clip.startAt.toFixed(2)}s</span>
          </div>
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Duration</span>
            <span className="inspector-timing-value">{clip.duration.toFixed(2)}s</span>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Transform">
        <div className="inspector-transform-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="inspector-transform-label">Scale</span>
            <KeyframeButton clip={clip} property="scale" currentTime={currentTime} currentValue={currentScale} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />
          </div>
          <input className="inspector-transform-slider" type="range" min={10} max={300} step={1}
            value={Math.round(currentScale * 100)}
            onChange={e => {
              const val = parseInt(e.target.value) / 100;
              handlePropertyChange('scale', val, { transform: { ...tr, scale: val } });
            }} />
          <span className="inspector-transform-value">{currentScale.toFixed(2)}</span>
        </div>
        <div className="inspector-transform-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="inspector-transform-label">Position X</span>
            <KeyframeButton clip={clip} property="x" currentTime={currentTime} currentValue={currentX} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />
          </div>
          <input className="inspector-transform-slider" type="range" min={-960} max={960}
            value={currentX} onChange={e => {
              const val = parseInt(e.target.value);
              handlePropertyChange('x', val, { transform: { ...tr, x: val } });
            }} />
          <span className="inspector-transform-value">{currentX.toFixed(0)}</span>
        </div>
        <div className="inspector-transform-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="inspector-transform-label">Position Y</span>
            <KeyframeButton clip={clip} property="y" currentTime={currentTime} currentValue={currentY} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />
          </div>
          <input className="inspector-transform-slider" type="range" min={-540} max={540}
            value={currentY} onChange={e => {
              const val = parseInt(e.target.value);
              handlePropertyChange('y', val, { transform: { ...tr, y: val } });
            }} />
          <span className="inspector-transform-value">{currentY.toFixed(0)}</span>
        </div>
        <div className="inspector-transform-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="inspector-transform-label">Rotation</span>
            <KeyframeButton clip={clip} property="rotation" currentTime={currentTime} currentValue={currentRotation} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />
          </div>
          <input className="inspector-transform-slider" type="range" min={-180} max={180}
            value={currentRotation} onChange={e => {
              const val = parseInt(e.target.value);
              handlePropertyChange('rotation', val, { transform: { ...tr, rotation: val } });
            }} />
          <span className="inspector-transform-value">{currentRotation}°</span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="PIP Presets" defaultOpen={false}>
        <div className="pip-presets-grid">
          <button className="pip-preset-btn" onClick={() => applyPipPreset('full')}>Full</button>
          <button className="pip-preset-btn" onClick={() => applyPipPreset('center')}>Center</button>
          <button className="pip-preset-btn" onClick={() => applyPipPreset('top-left')}>Top Left</button>
          <button className="pip-preset-btn" onClick={() => applyPipPreset('top-right')}>Top Right</button>
          <button className="pip-preset-btn" onClick={() => applyPipPreset('bottom-left')}>Bottom Left</button>
          <button className="pip-preset-btn" onClick={() => applyPipPreset('bottom-right')}>Bottom Right</button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Crop" defaultOpen={false}>
        <div className="inspector-crop-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="inspector-transform-row">
            <span className="inspector-transform-label">Crop X</span>
            <input className="inspector-transform-slider" type="range" min={0} max={95} step={1}
              value={Math.round((clip.crop?.x ?? 0) * 100)}
              onChange={e => {
                const newX = parseFloat(e.target.value) / 100;
                const currentW = clip.crop?.width ?? 1;
                const width = Math.min(currentW, 1 - newX);
                const newCrop = { x: newX, y: clip.crop?.y ?? 0, width, height: clip.crop?.height ?? 1 };
                update({ crop: newCrop });
              }} />
            <span className="inspector-transform-value">{Math.round((clip.crop?.x ?? 0) * 100)}%</span>
          </div>
          <div className="inspector-transform-row">
            <span className="inspector-transform-label">Crop Y</span>
            <input className="inspector-transform-slider" type="range" min={0} max={95} step={1}
              value={Math.round((clip.crop?.y ?? 0) * 100)}
              onChange={e => {
                const newY = parseFloat(e.target.value) / 100;
                const currentH = clip.crop?.height ?? 1;
                const height = Math.min(currentH, 1 - newY);
                const newCrop = { x: clip.crop?.x ?? 0, y: newY, width: clip.crop?.width ?? 1, height };
                update({ crop: newCrop });
              }} />
            <span className="inspector-transform-value">{Math.round((clip.crop?.y ?? 0) * 100)}%</span>
          </div>
          <div className="inspector-transform-row">
            <span className="inspector-transform-label">Width</span>
            <input className="inspector-transform-slider" type="range" min={5} max={100} step={1}
              value={Math.round((clip.crop?.width ?? 1) * 100)}
              onChange={e => {
                const width = parseFloat(e.target.value) / 100;
                const currentX = clip.crop?.x ?? 0;
                const x = Math.min(currentX, 1 - width);
                const newCrop = { x, y: clip.crop?.y ?? 0, width, height: clip.crop?.height ?? 1 };
                update({ crop: newCrop });
              }} />
            <span className="inspector-transform-value">{Math.round((clip.crop?.width ?? 1) * 100)}%</span>
          </div>
          <div className="inspector-transform-row">
            <span className="inspector-transform-label">Height</span>
            <input className="inspector-transform-slider" type="range" min={5} max={100} step={1}
              value={Math.round((clip.crop?.height ?? 1) * 100)}
              onChange={e => {
                const height = parseFloat(e.target.value) / 100;
                const currentY = clip.crop?.y ?? 0;
                const y = Math.min(currentY, 1 - height);
                const newCrop = { x: clip.crop?.x ?? 0, y, width: clip.crop?.width ?? 1, height };
                update({ crop: newCrop });
              }} />
            <span className="inspector-transform-value">{Math.round((clip.crop?.height ?? 1) * 100)}%</span>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button className="btn secondary size-sm" style={{ flex: 1, padding: '4px 8px', fontSize: '12px' }} onClick={() => update({ crop: undefined })}>
              Reset Crop
            </button>
            <button className="btn primary size-sm" style={{ flex: 1, padding: '4px 8px', fontSize: '12px' }} onClick={() => update({ crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } })}>
              Preset (80%)
            </button>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Audio">
        <div className="inspector-volume-row">
          <span className="inspector-volume-pct">{Math.round((clip.volume ?? 1) * 100)}%</span>
          <input className="inspector-volume-slider" type="range" min={0} max={200} step={1}
            value={Math.round((clip.volume ?? 1) * 100)}
            onChange={e => update({ volume: parseInt(e.target.value) / 100 })} />
        </div>
        <div className="inspector-toggle-row">
          <span className="inspector-toggle-label">Muted</span>
          <label className="inspector-toggle">
            <input type="checkbox" checked={clip.muted} onChange={e => update({ muted: e.target.checked })} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Speed">
        <div className="speed-presets">
          {SPEED_PRESETS.map(speed => (
            <button key={speed} className={`speed-preset-btn ${Math.abs((clip.speed || 1) - speed) < 0.01 ? 'active' : ''}`}
              onClick={() => update({ speed })}>{speed}x</button>
          ))}
        </div>
        <div className="inspector-volume-row">
          <span className="inspector-volume-pct">{(clip.speed || 1).toFixed(2)}×</span>
          <input className="inspector-volume-slider" type="range" min={10} max={400} step={5}
            value={Math.round((clip.speed || 1) * 100)}
            onChange={e => update({ speed: parseInt(e.target.value) / 100 })} />
        </div>
        <div className="inspector-toggle-row">
          <span className="inspector-toggle-label">Auto Pitch</span>
          <label className="inspector-toggle">
            <input type="checkbox" checked={clip.preservePitch || false} onChange={e => update({ preservePitch: e.target.checked })} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
        <div className="inspector-toggle-row">
          <span className="inspector-toggle-label">AI Voice Stabilizer</span>
          <label className="inspector-toggle">
            <input type="checkbox" checked={clip.voiceStabilizer || false} onChange={e => update({ voiceStabilizer: e.target.checked })} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Opacity">
        <div className="inspector-volume-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '80px' }}>
            <span className="inspector-volume-pct">{Math.round(currentOpacity)}%</span>
            <KeyframeButton clip={clip} property="opacity" currentTime={currentTime} currentValue={currentOpacity} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />
          </div>
          <input className="inspector-volume-slider" type="range" min={0} max={100} style={{ flex: 1 }}
            value={Math.round(currentOpacity)}
            onChange={e => {
              const val = parseInt(e.target.value);
              handlePropertyChange('opacity', val, { opacity: val });
            }} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Blend Mode" defaultOpen={false}>
        <select className="inspector-select" value={clip.blendMode} onChange={e => update({ blendMode: e.target.value as any })}>
          {BLEND_MODES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </CollapsibleSection>

      <CollapsibleSection title="Filters">
        <div className="filter-pill-row">
          {FILTER_PRESETS.map(f => (
            <button key={f} className={`filter-pill ${(clip.filters?.preset || 'none') === f ? 'active' : ''}`}
              onClick={() => update({ filters: { brightness: clip.filters?.brightness ?? 0, contrast: clip.filters?.contrast ?? 0, saturation: clip.filters?.saturation ?? 0, preset: f as any } })}>
              {f === 'none' ? 'None' : f}
            </button>
          ))}
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Brightness</span>
          <input className="inspector-transform-slider" type="range" min={-100} max={100}
            value={clip.filters?.brightness ?? 0}
            onChange={e => update({ filters: { brightness: parseInt(e.target.value), contrast: clip.filters?.contrast ?? 0, saturation: clip.filters?.saturation ?? 0, preset: clip.filters?.preset ?? 'none' } })} />
          <span className="inspector-transform-value">{clip.filters?.brightness ?? 0}</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Contrast</span>
          <input className="inspector-transform-slider" type="range" min={-100} max={100}
            value={clip.filters?.contrast ?? 0}
            onChange={e => update({ filters: { brightness: clip.filters?.brightness ?? 0, contrast: parseInt(e.target.value), saturation: clip.filters?.saturation ?? 0, preset: clip.filters?.preset ?? 'none' } })} />
          <span className="inspector-transform-value">{clip.filters?.contrast ?? 0}</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Saturation</span>
          <input className="inspector-transform-slider" type="range" min={-100} max={100}
            value={clip.filters?.saturation ?? 0}
            onChange={e => update({ filters: { brightness: clip.filters?.brightness ?? 0, contrast: clip.filters?.contrast ?? 0, saturation: parseInt(e.target.value), preset: clip.filters?.preset ?? 'none' } })} />
          <span className="inspector-transform-value">{clip.filters?.saturation ?? 0}</span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Transition" defaultOpen={false}>
        <select className="inspector-select" value={clip.transition?.type || 'none'}
          onChange={e => update({ transition: { type: e.target.value as any, duration: clip.transition?.duration || 0.5 } })}>
          {TRANSITION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </CollapsibleSection>
    </div>
  );
}

interface TextInspectorProps {
  clip: Clip;
  update: (p: Partial<Clip>) => void;
  currentTime: number;
  addKeyframe: (clipId: string, property: string, time: number, value: number) => void;
  removeKeyframe: (clipId: string, kfId: string) => void;
}

function TextInspector({ clip, update, currentTime, addKeyframe, removeKeyframe }: TextInspectorProps) {
  const to = clip.textOverlay || { text: '', fontFamily: 'Inter, sans-serif', fontSize: 48, color: '#ffffff', fontWeight: 700, textAlign: 'center' as const };
  const tr = clip.transform;
  const localTime = currentTime - clip.startAt;

  // Compute interpolated keyframe values or fallback to static defaults
  const hasScaleKfs = !!clip.keyframeTracks?.some(t => t.property === 'scale' && t.keyframes.length > 0);
  const currentScale = hasScaleKfs ? interpolateKeyframes(clip.keyframeTracks, localTime, 'scale') : tr.scale;

  const hasXKfs = !!clip.keyframeTracks?.some(t => t.property === 'x' && t.keyframes.length > 0);
  const currentX = hasXKfs ? interpolateKeyframes(clip.keyframeTracks, localTime, 'x') : tr.x;

  const hasYKfs = !!clip.keyframeTracks?.some(t => t.property === 'y' && t.keyframes.length > 0);
  const currentY = hasYKfs ? interpolateKeyframes(clip.keyframeTracks, localTime, 'y') : tr.y;

  const hasOpacityKfs = !!clip.keyframeTracks?.some(t => t.property === 'opacity' && t.keyframes.length > 0);
  const currentOpacity = hasOpacityKfs ? interpolateKeyframes(clip.keyframeTracks, localTime, 'opacity') : (clip.opacity ?? 100);

  const handlePropertyChange = (property: string, value: number, basePatch: Partial<Clip>) => {
    const hasKfs = !!clip.keyframeTracks?.some(t => t.property === property && t.keyframes.length > 0);
    if (hasKfs) {
      addKeyframe(clip.id, property, localTime, value);
    } else {
      update(basePatch);
    }
  };

  return (
    <div className="inspector-scroll">
      <div className="inspector-clip-header">
        <div className="inspector-clip-type">Selected · Text</div>
      </div>

      <CollapsibleSection title="Timing">
        <div className="inspector-timing-grid">
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Start</span>
            <span className="inspector-timing-value">{clip.startAt.toFixed(2)}s</span>
          </div>
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Duration</span>
            <span className="inspector-timing-value">{clip.duration.toFixed(2)}s</span>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Text">
        <textarea className="inspector-textarea" rows={3} value={to.text}
          onChange={e => update({ textOverlay: { ...to, text: e.target.value } })} />
        <div style={{ marginTop: 8 }}>
          <select className="inspector-select" value={to.fontFamily}
            onChange={e => update({ textOverlay: { ...to, fontFamily: e.target.value } })}>
            {FONT_FAMILIES.map(f => <option key={f} value={f}>{f.split(',')[0]}</option>)}
          </select>
        </div>
        <div className="inspector-transform-row" style={{ marginTop: 8 }}>
          <span className="inspector-transform-label">Size</span>
          <input className="inspector-transform-slider" type="range" min={12} max={160}
            value={to.fontSize || 48}
            onChange={e => update({ textOverlay: { ...to, fontSize: parseInt(e.target.value) } })} />
          <span className="inspector-transform-value">{to.fontSize || 48}px</span>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Align</span>
          <div className="align-btn-group">
            {(['left', 'center', 'right'] as const).map(a => (
              <button key={a} className={`align-btn ${to.textAlign === a ? 'active' : ''}`}
                onClick={() => update({ textOverlay: { ...to, textAlign: a } })}>
                {a === 'left' ? '◀' : a === 'center' ? '■' : '▶'}
              </button>
            ))}
          </div>
        </div>
        <div className="inspector-transform-row">
          <span className="inspector-transform-label">Color</span>
          <input className="inspector-input" type="color" value={to.color || '#ffffff'}
            onChange={e => update({ textOverlay: { ...to, color: e.target.value } })} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Position">
        <div className="inspector-transform-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="inspector-transform-label">Scale</span>
            <KeyframeButton clip={clip} property="scale" currentTime={currentTime} currentValue={currentScale} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />
          </div>
          <input className="inspector-transform-slider" type="range" min={10} max={300}
            value={Math.round(currentScale * 100)}
            onChange={e => {
              const val = parseInt(e.target.value) / 100;
              handlePropertyChange('scale', val, { transform: { ...tr, scale: val } });
            }} />
          <span className="inspector-transform-value">{currentScale.toFixed(2)}</span>
        </div>
        <div className="inspector-transform-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="inspector-transform-label">Position X</span>
            <KeyframeButton clip={clip} property="x" currentTime={currentTime} currentValue={currentX} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />
          </div>
          <input className="inspector-transform-slider" type="range" min={-960} max={960}
            value={currentX} onChange={e => {
              const val = parseInt(e.target.value);
              handlePropertyChange('x', val, { transform: { ...tr, x: val } });
            }} />
          <span className="inspector-transform-value">{currentX.toFixed(0)}</span>
        </div>
        <div className="inspector-transform-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="inspector-transform-label">Position Y</span>
            <KeyframeButton clip={clip} property="y" currentTime={currentTime} currentValue={currentY} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />
          </div>
          <input className="inspector-transform-slider" type="range" min={-540} max={540}
            value={currentY} onChange={e => {
              const val = parseInt(e.target.value);
              handlePropertyChange('y', val, { transform: { ...tr, y: val } });
            }} />
          <span className="inspector-transform-value">{currentY.toFixed(0)}</span>
        </div>
        <div className="inspector-transform-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="inspector-transform-label">Opacity</span>
            <KeyframeButton clip={clip} property="opacity" currentTime={currentTime} currentValue={currentOpacity} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />
          </div>
          <input className="inspector-transform-slider" type="range" min={0} max={100}
            value={Math.round(currentOpacity)}
            onChange={e => {
              const val = parseInt(e.target.value);
              handlePropertyChange('opacity', val, { opacity: val });
            }} />
          <span className="inspector-transform-value">{currentOpacity}%</span>
        </div>
      </CollapsibleSection>
    </div>
  );
}

interface StickerInspectorProps {
  clip: Clip;
  update: (p: Partial<Clip>) => void;
  currentTime: number;
  addKeyframe: (clipId: string, property: string, time: number, value: number) => void;
  removeKeyframe: (clipId: string, kfId: string) => void;
}

function StickerInspector({ clip, update, currentTime, addKeyframe, removeKeyframe }: StickerInspectorProps) {
  const tr = clip.transform;
  const localTime = currentTime - clip.startAt;

  // Compute interpolated keyframe values or fallback to static defaults
  const hasScaleKfs = !!clip.keyframeTracks?.some(t => t.property === 'scale' && t.keyframes.length > 0);
  const currentScale = hasScaleKfs ? interpolateKeyframes(clip.keyframeTracks, localTime, 'scale') : tr.scale;

  const hasXKfs = !!clip.keyframeTracks?.some(t => t.property === 'x' && t.keyframes.length > 0);
  const currentX = hasXKfs ? interpolateKeyframes(clip.keyframeTracks, localTime, 'x') : tr.x;

  const hasYKfs = !!clip.keyframeTracks?.some(t => t.property === 'y' && t.keyframes.length > 0);
  const currentY = hasYKfs ? interpolateKeyframes(clip.keyframeTracks, localTime, 'y') : tr.y;

  const hasRotationKfs = !!clip.keyframeTracks?.some(t => t.property === 'rotation' && t.keyframes.length > 0);
  const currentRotation = hasRotationKfs ? interpolateKeyframes(clip.keyframeTracks, localTime, 'rotation') : tr.rotation;

  const hasOpacityKfs = !!clip.keyframeTracks?.some(t => t.property === 'opacity' && t.keyframes.length > 0);
  const currentOpacity = hasOpacityKfs ? interpolateKeyframes(clip.keyframeTracks, localTime, 'opacity') : (clip.opacity ?? 100);

  const handlePropertyChange = (property: string, value: number, basePatch: Partial<Clip>) => {
    const hasKfs = !!clip.keyframeTracks?.some(t => t.property === property && t.keyframes.length > 0);
    if (hasKfs) {
      addKeyframe(clip.id, property, localTime, value);
    } else {
      update(basePatch);
    }
  };

  return (
    <div className="inspector-scroll">
      <div className="inspector-clip-header">
        <div className="inspector-clip-type">Selected · Sticker</div>
        <div style={{ fontSize: 36, textAlign: 'center', padding: '8px 0' }}>{clip.sticker}</div>
      </div>

      <CollapsibleSection title="Timing">
        <div className="inspector-timing-grid">
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Start</span>
            <span className="inspector-timing-value">{clip.startAt.toFixed(2)}s</span>
          </div>
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Duration</span>
            <span className="inspector-timing-value">{clip.duration.toFixed(2)}s</span>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Position">
        <div className="inspector-transform-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="inspector-transform-label">Scale</span>
            <KeyframeButton clip={clip} property="scale" currentTime={currentTime} currentValue={currentScale} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />
          </div>
          <input className="inspector-transform-slider" type="range" min={10} max={300}
            value={Math.round(currentScale * 100)}
            onChange={e => {
              const val = parseInt(e.target.value) / 100;
              handlePropertyChange('scale', val, { transform: { ...tr, scale: val } });
            }} />
          <span className="inspector-transform-value">{currentScale.toFixed(2)}</span>
        </div>
        <div className="inspector-transform-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="inspector-transform-label">Position X</span>
            <KeyframeButton clip={clip} property="x" currentTime={currentTime} currentValue={currentX} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />
          </div>
          <input className="inspector-transform-slider" type="range" min={-960} max={960}
            value={currentX} onChange={e => {
              const val = parseInt(e.target.value);
              handlePropertyChange('x', val, { transform: { ...tr, x: val } });
            }} />
          <span className="inspector-transform-value">{currentX.toFixed(0)}</span>
        </div>
        <div className="inspector-transform-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="inspector-transform-label">Position Y</span>
            <KeyframeButton clip={clip} property="y" currentTime={currentTime} currentValue={currentY} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />
          </div>
          <input className="inspector-transform-slider" type="range" min={-540} max={540}
            value={currentY} onChange={e => {
              const val = parseInt(e.target.value);
              handlePropertyChange('y', val, { transform: { ...tr, y: val } });
            }} />
          <span className="inspector-transform-value">{currentY.toFixed(0)}</span>
        </div>
        <div className="inspector-transform-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="inspector-transform-label">Rotation</span>
            <KeyframeButton clip={clip} property="rotation" currentTime={currentTime} currentValue={currentRotation} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />
          </div>
          <input className="inspector-transform-slider" type="range" min={-180} max={180}
            value={currentRotation} onChange={e => {
              const val = parseInt(e.target.value);
              handlePropertyChange('rotation', val, { transform: { ...tr, rotation: val } });
            }} />
          <span className="inspector-transform-value">{currentRotation}°</span>
        </div>
        <div className="inspector-transform-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="inspector-transform-label">Opacity</span>
            <KeyframeButton clip={clip} property="opacity" currentTime={currentTime} currentValue={currentOpacity} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />
          </div>
          <input className="inspector-transform-slider" type="range" min={0} max={100}
            value={Math.round(currentOpacity)}
            onChange={e => {
              const val = parseInt(e.target.value);
              handlePropertyChange('opacity', val, { opacity: val });
            }} />
          <span className="inspector-transform-value">{currentOpacity}%</span>
        </div>
      </CollapsibleSection>
    </div>
  );
}

function DrawingInspector({ clip, update: _update }: { clip: Clip; update: (p: Partial<Clip>) => void }) {
  return (
    <div className="inspector-scroll">
      <div className="inspector-clip-header">
        <div className="inspector-clip-type">Selected · Drawing</div>
      </div>
      <CollapsibleSection title="Timing">
        <div className="inspector-timing-grid">
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Start</span>
            <span className="inspector-timing-value">{clip.startAt.toFixed(2)}s</span>
          </div>
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Duration</span>
            <span className="inspector-timing-value">{clip.duration.toFixed(2)}s</span>
          </div>
        </div>
      </CollapsibleSection>
      <p className="panel-hint" style={{ padding: '0 12px 12px' }}>Drawing clip — adjust position and opacity in the canvas</p>
    </div>
  );
}

function ElementInspector({ clip, update: _update }: { clip: Clip; update: (p: Partial<Clip>) => void }) {
  return (
    <div className="inspector-scroll">
      <div className="inspector-clip-header">
        <div className="inspector-clip-type">Selected · Element</div>
        {clip.elementOverlay && <div className="inspector-clip-name">{clip.elementOverlay.label}</div>}
      </div>
      <CollapsibleSection title="Timing">
        <div className="inspector-timing-grid">
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Start</span>
            <span className="inspector-timing-value">{clip.startAt.toFixed(2)}s</span>
          </div>
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Duration</span>
            <span className="inspector-timing-value">{clip.duration.toFixed(2)}s</span>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}

function TextToSpeechInspector({ clip, update: _update }: { clip: Clip; update: (p: Partial<Clip>) => void }) {
  return (
    <div className="inspector-scroll">
      <div className="inspector-clip-header">
        <div className="inspector-clip-type">Selected · TTS</div>
        {clip.ttsOverlay && (
          <div className="inspector-clip-name">{clip.ttsOverlay.text.slice(0, 40)}</div>
        )}
      </div>
      <CollapsibleSection title="Timing">
        <div className="inspector-timing-grid">
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Start</span>
            <span className="inspector-timing-value">{clip.startAt.toFixed(2)}s</span>
          </div>
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Duration</span>
            <span className="inspector-timing-value">{clip.duration.toFixed(2)}s</span>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}

function RecordInspector({ clip, update: _update }: { clip: Clip; update: (p: Partial<Clip>) => void }) {
  return (
    <div className="inspector-scroll">
      <div className="inspector-clip-header">
        <div className="inspector-clip-type">Selected · Recording</div>
        {clip.recordOverlay && <div className="inspector-clip-name">{clip.recordOverlay.deviceLabel}</div>}
      </div>
      <CollapsibleSection title="Timing">
        <div className="inspector-timing-grid">
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Start</span>
            <span className="inspector-timing-value">{clip.startAt.toFixed(2)}s</span>
          </div>
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Duration</span>
            <span className="inspector-timing-value">{clip.duration.toFixed(2)}s</span>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}

export default React.memo(function InspectorPanel() {
  const { activeClipId, getClip, updateClip, pushHistory, addKeyframe, removeKeyframe, currentTime, project } = useEditorStore();
  const clip = activeClipId ? getClip(activeClipId) : null;
  const update = (patch: Partial<Clip>) => { if (clip) { pushHistory(); updateClip(clip.id, patch); } };

  const getClipName = (c: Clip): string => {
    if (c.mediaId) {
      const mf = project.media.find(m => m.id === c.mediaId);
      if (mf) return mf.name.replace(/\.[^.]+$/, '');
    }
    return c.trackType.charAt(0).toUpperCase() + c.trackType.slice(1);
  };

  if (!clip) {
    return (
      <aside className="inspector-panel">
        <div className="inspector-empty" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="inspector-empty-card" style={{
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '24px 16px',
            margin: '0 16px',
            width: 'calc(100% - 32px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.01)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-dim)', marginBottom: 12 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l8.904-4.218M9.813 15.904L14.5 12.5M9.813 15.904l-4.218-.813M21 9.75c0-1.855-1.542-3.325-3.375-3.325-.56 0-1.077.14-1.53.385C15.19 5.093 13.565 4.5 11.875 4.5c-3.13 0-5.625 2.616-5.625 5.625 0 .235.014.47.043.7-.638.167-1.229.5-1.728.95C3.398 12.87 3 14.135 3 15.48c0 2.925 2.375 5.3 5.3 5.3h10.4c2.925 0 5.3-2.375 5.3-5.3 0-1.724-.82-3.256-2.1-4.23z" />
            </svg>
            <span className="inspector-empty-title" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>No Clip Selected</span>
            <span className="inspector-empty-text" style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.5, textAlign: 'center' }}>Select any clip on the timeline to edit properties</span>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="inspector-panel">
      {clip.trackType === 'audio' && <AudioInspector clip={clip} update={update} getClipName={getClipName} />}
      {clip.trackType === 'video' && <VideoInspector clip={clip} update={update} currentTime={currentTime} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} getClipName={getClipName} />}
      {clip.trackType === 'text' && <TextInspector clip={clip} update={update} currentTime={currentTime} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />}
      {clip.trackType === 'sticker' && <StickerInspector clip={clip} update={update} currentTime={currentTime} addKeyframe={addKeyframe} removeKeyframe={removeKeyframe} />}
      {clip.trackType === 'vfx' && <VFXInspector clip={clip} />}
      {clip.trackType === 'drawing' && <DrawingInspector clip={clip} update={update} />}
      {clip.trackType === 'element' && <ElementInspector clip={clip} update={update} />}
      {clip.trackType === 'tts' && <TextToSpeechInspector clip={clip} update={update} />}
      {clip.trackType === 'record' && <RecordInspector clip={clip} update={update} />}
    </aside>
  );
}
);
