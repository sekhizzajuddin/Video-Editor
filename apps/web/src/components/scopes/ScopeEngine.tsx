import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";

interface FrameData {
  r: number;
  g: number;
  b: number;
}

export class ScopeEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData | null = null;

  constructor(width: number = 256, height: number = 128) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d")!;
  }

  updateFrame(bitmap: ImageBitmap) {
    // Draw bitmap to internal canvas and extract pixel data
    this.ctx.drawImage(bitmap, 0, 0, this.canvas.width, this.canvas.height);
    this.imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  getWaveformData(): Float32Array {
    if (!this.imageData) return new Float32Array();
    const pixels = this.imageData.data;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const waveform = new Float32Array(width * 3);

    for (let x = 0; x < width; x++) {
      let rSum = 0, gSum = 0, bSum = 0;
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        rSum += pixels[idx];
        gSum += pixels[idx + 1];
        bSum += pixels[idx + 2];
      }
      waveform[x * 3] = rSum / (height * 255);
      waveform[x * 3 + 1] = gSum / (height * 255);
      waveform[x * 3 + 2] = bSum / (height * 255);
    }

    return waveform;
  }

  getVectorscopeData(): { u: Float32Array; v: Float32Array } {
    if (!this.imageData) return { u: new Float32Array(), v: new Float32Array() };
    const pixels = this.imageData.data;
    const count = pixels.length / 4;
    const u = new Float32Array(count);
    const v = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = pixels[i * 4] / 255;
      const g = pixels[i * 4 + 1] / 255;
      const b = pixels[i * 4 + 2] / 255;
      // Convert RGB to YUV color space for vectorscope
      u[i] = -0.14713 * r - 0.28886 * g + 0.436 * b;
      v[i] = 0.615 * r - 0.51499 * g - 0.10001 * b;
    }

    return { u, v };
  }

  getHistogramData(bins: number = 256): { r: Float32Array; g: Float32Array; b: Float32Array } {
    if (!this.imageData) return { r: new Float32Array(bins), g: new Float32Array(bins), b: new Float32Array(bins) };
    const pixels = this.imageData.data;
    const r = new Float32Array(bins);
    const g = new Float32Array(bins);
    const b = new Float32Array(bins);

    for (let i = 0; i < pixels.length; i += 4) {
      r[Math.floor(pixels[i] / 256 * bins)]++;
      g[Math.floor(pixels[i + 1] / 256 * bins)]++;
      b[Math.floor(pixels[i + 2] / 256 * bins)]++;
    }

    return { r, g, b };
  }

  dispose() {
    this.imageData = null;
  }
}

// Reusable scope canvas component
interface ScopeCanvasProps {
  width: number;
  height: number;
  drawFn: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  className?: string;
}

export const ScopeCanvas: React.FC<ScopeCanvasProps> = ({ width, height, drawFn, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawFn(ctx, width, height);
  }, [width, height, drawFn]);

  return <canvas ref={canvasRef} width={width} height={height} className={className} />;
};

// Waveform Monitor
export const WaveformMonitor: React.FC<{ engine: ScopeEngine; width: number; height: number }> = ({
  engine,
  width,
  height,
}) => {
  const drawWaveform = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const data = engine.getWaveformData();
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);

      ctx.lineWidth = 0.5;
      const drawChannel = (offset: number, color: string, index: number) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        for (let x = 0; x < w && x * 3 < data.length; x++) {
          const y = h - (data[x * 3 + index] || 0) * h;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };

      drawChannel(0, "#ff0000", 0);
      drawChannel(0, "#00ff00", 1);
      drawChannel(0, "#0000ff", 2);
    },
    [engine]
  );

  return <ScopeCanvas width={width} height={height} drawFn={drawWaveform} className="w-full h-full" />;
};

// Vectorscope
export const VectorscopeMonitor: React.FC<{ engine: ScopeEngine; width: number; height: number }> = ({
  engine,
  width,
  height,
}) => {
  const drawVectorscope = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const { u, v } = engine.getVectorscopeData();
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);

      // Draw grid lines
      ctx.strokeStyle = "#333333";
      ctx.lineWidth = 0.5;
      const centerX = w / 2;
      const centerY = h / 2;
      const scale = Math.min(w, h) / 2.2;

      ctx.beginPath();
      ctx.arc(centerX, centerY, scale, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(w, centerY);
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, h);
      ctx.stroke();

      // Draw pixels
      ctx.fillStyle = "#44ff88";
      for (let i = 0; i < u.length; i += 4) {
        const x = centerX + u[i] * scale;
        const y = centerY - v[i] * scale;
        ctx.fillRect(x, y, 1, 1);
      }
    },
    [engine]
  );

  return <ScopeCanvas width={width} height={height} drawFn={drawVectorscope} className="w-full h-full" />;
};

// RGB Histogram
export const HistogramMonitor: React.FC<{ engine: ScopeEngine; width: number; height: number }> = ({
  engine,
  width,
  height,
}) => {
  const drawHistogram = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const data = engine.getHistogramData();
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, w, h);

      const maxValue = Math.max(
        ...data.r,
        ...data.g,
        ...data.b
      );
      const scale = (maxValue > 0 ? h / maxValue : 0) * 0.9;
      const barWidth = w / data.r.length;

      const drawBars = (channelData: Float32Array, color: string, offset: number) => {
        ctx.fillStyle = color;
        for (let i = 0; i < channelData.length; i++) {
          const barHeight = Math.min(channelData[i] * scale, h - 2);
          ctx.fillRect(i * barWidth, h - barHeight - 1, barWidth - 0.5, barHeight);
        }
      };

      drawBars(data.r, "rgba(255, 0, 0, 0.5)", 0);
      drawBars(data.g, "rgba(0, 255, 0, 0.5)", 0);
      drawBars(data.b, "rgba(0, 0, 255, 0Call TOOL with ACTUAL text.5)", 0);
    },
    [engine]
  );

  return <ScopeCanvas width={width} height={height} drawFn={drawHistogram} className="w-full h-full" />;
};

export default ScopeEngine;
