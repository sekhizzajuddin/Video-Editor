import React, { useRef, useEffect, useState } from "react";
import { useEngineStore } from "../../stores/engine-store";

interface FrameData {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

function extractPixelData(frame: { image: ImageBitmap; width: number; height: number }): FrameData | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(frame.image, 0, 0);
    const imageData = ctx.getImageData(0, 0, frame.width, frame.height);
    return { width: frame.width, height: frame.height, pixels: imageData.data };
  } catch {
    return null;
  }
}

export const WaveformMonitor: React.FC<{ width?: number; height?: number }> = ({
  width = 300,
  height = 200,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentFrame = useEngineStore((s) => s.currentFrame);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentFrame) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const frameData = extractPixelData(currentFrame as any);
    if (!frameData) return;

    const { width: fw, height: fh, pixels } = frameData;
    const sampleCols = Math.min(fw, 400);
    const colWidth = fw / sampleCols;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const drawChannel = (channel: number, color: string, alpha: number) => {
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c < sampleCols; c++) {
        const x = (c / sampleCols) * width;
        const colIdx = Math.floor(c * colWidth);
        let maxVal = 0;
        for (let r = 0; r < fh; r++) {
          const idx = (r * fw + colIdx) * 4 + channel;
          const val = pixels[idx] ?? 0;
          if (val > maxVal) maxVal = val;
        }
        const top = height - (maxVal / 255) * height;
        if (c === 0) ctx.moveTo(x, top);
        else ctx.lineTo(x, top);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    drawChannel(0, "#ff4444", 0.7);
    drawChannel(1, "#44ff44", 0.7);
    drawChannel(2, "#4444ff", 0.7);
  }, [currentFrame, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full h-full"
    />
  );
};

export const Vectorscope: React.FC<{ width?: number; height?: number }> = ({
  width = 300,
  height = 200,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentFrame = useEngineStore((s) => s.currentFrame);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentFrame) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const frameData = extractPixelData(currentFrame as any);
    if (!frameData) return;

    const { width: fw, pixels } = frameData;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 10;

    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    const targets = [
      { angle: (11 * Math.PI) / 6, color: "#ff0000" },
      { angle: Math.PI / 2, color: "#00ff00" },
      { angle: (7 * Math.PI) / 6, color: "#0000ff" },
      { angle: (5 * Math.PI) / 3, color: "#ffff00" },
      { angle: 0, color: "#ff00ff" },
      { angle: (2 * Math.PI) / 3, color: "#00ffff" },
    ];

    targets.forEach((t) => {
      const x = centerX + Math.cos(t.angle) * (radius - 5);
      const y = centerY + Math.sin(t.angle) * (radius - 5);
      ctx.fillStyle = t.color;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    });

    ctx.fillStyle = "#4ade80";
    ctx.globalAlpha = 0.3;
    const step = Math.max(1, Math.floor((fw * fw) / 20000));
    for (let i = 0; i < pixels.length; i += 4 * step) {
      const r = pixels[i] ?? 0;
      const g = pixels[i + 1] ?? 0;
      const b = pixels[i + 2] ?? 0;
      const yVal = 0.299 * r + 0.587 * g + 0.114 * b;
      const u = 0.492 * (b - yVal);
      const v = 0.877 * (r - yVal);
      const x = centerX + (v / 255) * radius;
      const yPos = centerY - (u / 255) * radius;
      ctx.fillRect(x, yPos, 1, 1);
    }
    ctx.globalAlpha = 1;
  }, [currentFrame, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full h-full"
    />
  );
};

export const RGBHistogram: React.FC<{ width?: number; height?: number }> = ({
  width = 300,
  height = 200,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentFrame = useEngineStore((s) => s.currentFrame);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentFrame) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const frameData = extractPixelData(currentFrame as any);
    if (!frameData) return;

    const { pixels } = frameData;

    const binsR = new Uint32Array(256);
    const binsG = new Uint32Array(256);
    const binsB = new Uint32Array(256);

    for (let i = 0; i < pixels.length; i += 4) {
      binsR[pixels[i] ?? 0]++;
      binsG[pixels[i + 1] ?? 0]++;
      binsB[pixels[i + 2] ?? 0]++;
    }

    const maxCount = Math.max(...Array.from(binsR), ...Array.from(binsG), ...Array.from(binsB));

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    const barWidth = width / 256;
    const drawChannel = (bins: Uint32Array, color: string) => {
      ctx.fillStyle = color;
      for (let i = 0; i < 256; i++) {
        const barHeight = (bins[i] / maxCount) * (height - 20);
        if (barHeight > 0) {
          ctx.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
        }
      }
    };

    ctx.globalAlpha = 0.6;
    drawChannel(binsR, "#ff4444");
    drawChannel(binsG, "#44ff44");
    drawChannel(binsB, "#4444ff");
    ctx.globalAlpha = 1;
  }, [currentFrame, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full h-full"
    />
  );
};

export const ScopePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"waveform" | "vectorscope" | "histogram">("waveform");

  return (
    <div className="w-full h-full flex flex-col bg-bg-1 text-fg">
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border bg-bg-2">
        {[
          { key: "waveform" as const, label: "WFM" },
          { key: "vectorscope" as const, label: "VS" },
          { key: "histogram" as const, label: "HS" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
              activeTab === t.key
                ? "bg-accent text-white"
                : "text-fg-3 hover:text-fg hover:bg-hover"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {activeTab === "waveform" && <WaveformMonitor />}
        {activeTab === "vectorscope" && <Vectorscope />}
        {activeTab === "histogram" && <RGBHistogram />}
      </div>
    </div>
  );
};
