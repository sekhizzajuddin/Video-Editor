import { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import type { Clip } from '../types';

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

const VFX_LABELS: Record<string, string> = {
  'lens-flare': 'Lens Flare',
  'film-grain': 'Film Grain',
  'light-leak': 'Light Leak',
  'particles': 'Particles',
  'glitch': 'Glitch',
  'vhs': 'VHS',
  'chromatic': 'Chromatic Aberration',
  'bloom': 'Bloom',
  'sparkle': 'Sparkle',
  'smoke': 'Smoke',
};

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="inspector-section">
      <div className="inspector-section-header" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span style={{ transform: open ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 150ms' }}>▼</span>
      </div>
      {open && children}
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange, display }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; display?: string;
}) {
  return (
    <div className="inspector-row">
      <span className="inspector-row-label">{label}</span>
      <input type="range" className="inspector-range" min={min} max={max} step={step}
        value={value} onChange={e => onChange(parseFloat(e.target.value))} />
      <span className="inspector-row-value">{display ?? value.toFixed(2)}</span>
    </div>
  );
}

export default function VFXInspector({ clip }: { clip: Clip }) {
  const { updateClip } = useEditorStore();
  const vfx = clip.vfxOverlay;
  if (!vfx) return null;

  const update = (patch: Partial<typeof vfx>) => {
    updateClip(clip.id, { vfxOverlay: { ...vfx, ...patch } });
  };

  const updatePos = (patch: Partial<typeof vfx.position>) => {
    update({ position: { ...vfx.position, ...patch } });
  };

  return (
    <div className="inspector-scroll">
      <div className="inspector-clip-header">
        <div className="inspector-clip-type">Selected · VFX</div>
        <div className="inspector-clip-name">{VFX_LABELS[vfx.type] || vfx.type}</div>
      </div>

      <Section title="Timing">
        <div className="inspector-timing-grid">
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Start</span>
            <span className="inspector-timing-value">{formatTime(clip.startAt)}</span>
          </div>
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Duration</span>
            <span className="inspector-timing-value">{formatTime(clip.duration)}</span>
          </div>
        </div>
        <SliderRow label="Duration" value={clip.duration} min={0.3} max={60} step={0.1}
          onChange={val => updateClip(clip.id, { duration: val })}
          display={`${clip.duration.toFixed(1)}s`} />
      </Section>

      <Section title="Position">
        <SliderRow label="Position X" value={vfx.position.x} min={-1} max={1} step={0.01}
          onChange={v => updatePos({ x: v })} display={vfx.position.x.toFixed(2)} />
        <SliderRow label="Position Y" value={vfx.position.y} min={-1} max={1} step={0.01}
          onChange={v => updatePos({ y: v })} display={vfx.position.y.toFixed(2)} />
      </Section>

      <Section title="Transform">
        <SliderRow label="Scale" value={vfx.scale} min={0.1} max={3} step={0.01}
          onChange={v => update({ scale: v })} display={vfx.scale.toFixed(2)} />
        <SliderRow label="Rotation" value={vfx.rotation} min={-180} max={180} step={1}
          onChange={v => update({ rotation: v })} display={`${vfx.rotation.toFixed(0)}°`} />
        <SliderRow label="Opacity" value={vfx.opacity} min={0} max={1} step={0.01}
          onChange={v => update({ opacity: v })} display={`${Math.round(vfx.opacity * 100)}%`} />
      </Section>

      <Section title="Effect">
        <SliderRow label="Intensity" value={vfx.intensity} min={0} max={1} step={0.01}
          onChange={v => update({ intensity: v })} display={`${Math.round(vfx.intensity * 100)}%`} />
        <div className="inspector-row" style={{ marginTop: 8 }}>
          <span className="inspector-row-label">Type</span>
          <select className="inspector-select" value={vfx.type}
            onChange={e => update({ type: e.target.value as any })}>
            {Object.entries(VFX_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </Section>
    </div>
  );
}
