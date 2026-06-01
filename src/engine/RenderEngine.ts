import { Clip, Track, TransitionType, DrawingOverlay, ElementOverlay } from '../types';
import { renderVideoFrame, renderImageFrame, renderTextOverlay, applyFilter, applyChromaKey, applyVignette } from '../utils/codec';
import { interpolateKeyframes } from '../utils/keyframeUtils';
import WebGLFilterPipeline from './GPUFilterPipeline';

export interface FrameRequest {
  time: number;
  tracks: Track[];
  getMediaUrl: (mediaId: string) => string | undefined;
}

interface LayeredClip {
  clip: Clip;
  trackIndex: number;
  transition?: {
    type: TransitionType;
    duration: number;
    progress: number;
    nextClip: Clip;
  };
}

export class RenderEngine {
  private output: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private offscreen: OffscreenCanvas | HTMLCanvasElement;
  private offCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  private width = 1920;
  private height = 1080;
  private mediaCache = new Map<string, HTMLVideoElement | HTMLImageElement>();
  private isPlaybackMode = false;
  private frameCount = 0;

  // GPU pipeline
  private gpu: WebGLFilterPipeline | null = null;
  private gpuEnabled = false;
  private layerCanvases: Map<string, OffscreenCanvas> = new Map();

  // Pooled transition canvases (avoid GC pressure)
  private transCanvasA: HTMLCanvasElement | null = null;
  private transCanvasB: HTMLCanvasElement | null = null;

  constructor(outputCanvas: HTMLCanvasElement) {
    this.output = outputCanvas;
    // GPU-accelerated context: desynchronized for lower latency, alpha false for performance
    this.ctx = outputCanvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
      willReadFrequently: false,
    });

    // Use OffscreenCanvas for offscreen rendering when available
    if (typeof OffscreenCanvas !== 'undefined') {
      this.offscreen = new OffscreenCanvas(this.width, this.height);
      this.offCtx = this.offscreen.getContext('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false,
      }) as OffscreenCanvasRenderingContext2D;
    } else {
      this.offscreen = document.createElement('canvas');
      this.offscreen.width = this.width;
      this.offscreen.height = this.height;
      this.offCtx = this.offscreen.getContext('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false,
      });
    }

    this.initGPU();
    this.setSize(this.width, this.height);
  }

  private initGPU(): void {
    // Try to initialize WebGL pipeline
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 1;
    testCanvas.height = 1;
    this.gpu = new WebGLFilterPipeline();
    this.gpuEnabled = this.gpu.init(testCanvas);
    if (this.gpuEnabled) {
      console.log('[RenderEngine] GPU acceleration enabled (WebGL)');
    } else {
      console.log('[RenderEngine] GPU acceleration unavailable, using CPU fallback');
      this.gpu?.destroy();
      this.gpu = null;
    }
  }

  setSize(w: number, h: number) {
    this.width = Math.max(1, Math.round(w));
    this.height = Math.max(1, Math.round(h));
    this.output.width = this.width;
    this.output.height = this.height;

    if (this.offscreen instanceof OffscreenCanvas) {
      this.offscreen.width = this.width;
      this.offscreen.height = this.height;
      this.offCtx = this.offscreen.getContext('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false,
      }) as OffscreenCanvasRenderingContext2D;
    } else {
      this.offscreen.width = this.width;
      this.offscreen.height = this.height;
      this.offCtx = this.offscreen.getContext('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false,
      });
    }

    // Resize GPU pipeline
    this.gpu?.resize(this.width, this.height);
  }

  setPlaybackMode(playing: boolean) {
    this.isPlaybackMode = playing;
    if (!playing) {
      for (const [, el] of this.mediaCache) {
        if (el instanceof HTMLVideoElement && !el.paused) el.pause();
      }
    }
  }

  async startLivePlayback(clips: Clip[], _getUrl: (id: string) => string | undefined) {
    for (const clip of clips) {
      if (!clip.mediaId) continue;
      const el = this.mediaCache.get(clip.mediaId);
      if (el instanceof HTMLVideoElement) {
        el.playbackRate = Math.max(0.1, clip.speed || 1);
        if (el.paused && el.readyState >= 3) el.play().catch(() => {});
      }
    }
  }

  get canvas() { return this.output; }
  get context() { return this.ctx; }

  async renderFrame(req: FrameRequest): Promise<void> {
    const { ctx, offCtx, width, height } = this;
    if (!ctx || !offCtx) return;

    this.frameCount++;
    if (this.frameCount % 60 === 0) this.cleanMediaCache();

    // Clear with GPU-accelerated clearRect
    offCtx.clearRect(0, 0, width, height);
    ctx.clearRect(0, 0, width, height);

    const layers = this.collectLayers(req.tracks, req.time);

    for (const layer of layers) {
      if (layer.transition) {
        await this.renderTransitionLayer(
          layer.clip,
          layer.transition.nextClip,
          layer.transition.type,
          layer.transition.progress,
          req,
          offCtx as CanvasRenderingContext2D,
          width,
          height
        );
      } else {
        await this.renderLayer(layer.clip, req, offCtx as CanvasRenderingContext2D, width, height);
      }
    }
    ctx.drawImage(this.offscreen as HTMLCanvasElement, 0, 0);
  }

  private getLayerCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
    const rw = Math.max(1, Math.round(w));
    const rh = Math.max(1, Math.round(h));
    const key = `${rw}x${rh}`;
    if (!this.layerCanvases.has(key)) {
      if (typeof OffscreenCanvas !== 'undefined') {
        this.layerCanvases.set(key, new OffscreenCanvas(rw, rh));
      } else {
        const c = document.createElement('canvas');
        c.width = rw;
        c.height = rh;
        this.layerCanvases.set(key, c as unknown as OffscreenCanvas);
      }
    }
    return this.layerCanvases.get(key)!;
  }

  private collectLayers(tracks: Track[], time: number): LayeredClip[] {
    const layers: LayeredClip[] = [];
    for (let ti = 0; ti < tracks.length; ti++) {
      const t = tracks[ti];
      if (!t.visible) continue;

      const sortedClips = [...t.clips].sort((a, b) => a.startAt - b.startAt);
      for (let ci = 0; ci < sortedClips.length; ci++) {
        const c = sortedClips[ci];
        const next = sortedClips[ci + 1];

        if (time >= c.startAt && time < c.startAt + c.duration) {
          const trans = c.transition;
          if (trans && trans.type !== 'none' && trans.duration > 0 && next) {
            const transStart = c.startAt + c.duration - trans.duration;
            if (time >= transStart) {
              const progress = (time - transStart) / trans.duration;
              layers.push({
                clip: c,
                trackIndex: ti,
                transition: {
                  type: trans.type,
                  duration: trans.duration,
                  progress: Math.min(1, Math.max(0, progress)),
                  nextClip: next,
                },
              });
              continue;
            }
          }
          layers.push({ clip: c, trackIndex: ti });
        }
      }
    }
    layers.sort((a, b) => a.trackIndex - b.trackIndex);
    return layers;
  }

  private async renderLayer(
    clip: Clip,
    req: FrameRequest,
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): Promise<void> {
    const mediaUrl = clip.mediaId ? req.getMediaUrl(clip.mediaId) : undefined;
    const localTime = req.time - clip.startAt;
    const rawSourceTime = clip.sourceStart + localTime * clip.speed;
    const sourceTime = clip.sourceEnd ? Math.min(rawSourceTime, clip.sourceEnd) : rawSourceTime;

    const layerCanvas = this.getLayerCanvas(w, h);
    const layerCtx = layerCanvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!layerCtx) return;

    layerCtx.clearRect(0, 0, w, h);

    if (mediaUrl && clip.mediaId) {
      const el = this.mediaCache.get(clip.mediaId);
      if (el instanceof HTMLVideoElement && el.readyState >= 2) {
        if (this.isPlaybackMode) {
          if (Math.abs(el.currentTime - sourceTime) > 0.5) el.currentTime = sourceTime;
          if (el.paused) el.play().catch(() => {});
        } else {
          if (Math.abs(el.currentTime - sourceTime) > 0.04) el.currentTime = sourceTime;
        }
        renderVideoFrame(layerCtx as CanvasRenderingContext2D, layerCanvas as HTMLCanvasElement, el, clip.crop);
      } else if (el instanceof HTMLImageElement && el.complete) {
        renderImageFrame(layerCtx as CanvasRenderingContext2D, layerCanvas as HTMLCanvasElement, el, clip.crop);
      } else {
        const elem = await this.getOrLoadMedia(clip.mediaId, mediaUrl, clip.trackType);
        if (elem instanceof HTMLVideoElement && elem.readyState >= 2) {
          if (!this.isPlaybackMode) elem.currentTime = sourceTime;
          renderVideoFrame(layerCtx as CanvasRenderingContext2D, layerCanvas as HTMLCanvasElement, elem, clip.crop);
        } else if (elem instanceof HTMLImageElement && elem.complete) {
          renderImageFrame(layerCtx as CanvasRenderingContext2D, layerCanvas as HTMLCanvasElement, elem, clip.crop);
        }
      }
    }

    if (clip.textOverlay) {
      const to = clip.textOverlay;
      const scaledFontSize = clip.textOverlay.fontSize * (w / 1920);
      renderTextOverlay(layerCtx as CanvasRenderingContext2D, layerCanvas as HTMLCanvasElement, clip.textOverlay.text, {
        fontSize: scaledFontSize,
        fontFamily: clip.textOverlay.fontFamily,
        color: clip.textOverlay.color,
        align: clip.textOverlay.textAlign,
        outlineColor: to.outlineColor,
        outlineWidth: to.outlineWidth || 0,
        backgroundColor: to.backgroundColor,
        backgroundOpacity: to.backgroundOpacity ?? 0.5,
        animation: clip.textAnimation,
        localTime: localTime,
        duration: clip.duration,
      });
    }

    if (clip.trackType === 'sticker' && clip.sticker) {
      layerCtx.save();
      const stickerFontSize = 300 * (w / 1920);
      layerCtx.font = `${Math.round(stickerFontSize)}px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`;
      layerCtx.textAlign = 'center';
      layerCtx.textBaseline = 'middle';
      layerCtx.fillStyle = '#ffffff';
      layerCtx.fillText(clip.sticker, w / 2, h / 2);
      layerCtx.restore();
    }

    if (clip.trackType === 'vfx' && clip.vfxOverlay) {
      this.renderVFXOverlay(layerCtx as CanvasRenderingContext2D, w, h, clip.vfxOverlay, localTime);
    }

    if (clip.trackType === 'drawing' && clip.drawingOverlay) {
      this.renderDrawingOverlay(layerCtx as CanvasRenderingContext2D, w, h, clip.drawingOverlay);
    }

    if (clip.trackType === 'element' && clip.elementOverlay) {
      this.renderElementOverlay(layerCtx as CanvasRenderingContext2D, w, h, clip.elementOverlay);
    }

    if (clip.trackType === 'audio' && !mediaUrl) return;

    let sourceCanvas: HTMLCanvasElement | OffscreenCanvas = layerCanvas;

    const hasFilters = clip.filters && (
      clip.filters.preset !== 'none' ||
      clip.filters.brightness !== 0 ||
      clip.filters.contrast !== 0 ||
      clip.filters.saturation !== 0 ||
      clip.filters.chromaKey?.enabled ||
      clip.filters.vignette?.enabled ||
      (clip.filters.blur && clip.filters.blur > 0)
    );

    if (hasFilters) {
      if (this.gpuEnabled && this.gpu) {
        const config = {
          preset: clip.filters?.preset || 'none',
          brightness: clip.filters?.brightness ?? 0,
          contrast: clip.filters?.contrast ?? 0,
          saturation: clip.filters?.saturation ?? 0,
          chromaKey: clip.filters?.chromaKey,
          vignette: clip.filters?.vignette,
          blur: clip.filters?.blur ?? 0,
        };
        this.gpu.resize(w, h);
        this.gpu.applyFilters(layerCanvas as HTMLCanvasElement, config, 'screen');
        const gpuCanvas = this.gpu.canvas;
        if (gpuCanvas) {
          sourceCanvas = gpuCanvas;
        }
      } else if (clip.filters) {
        if (clip.filters.preset !== 'none') applyFilter(layerCtx as CanvasRenderingContext2D, layerCanvas as HTMLCanvasElement, clip.filters.preset);
        if (clip.filters.chromaKey?.enabled) {
          const ck = clip.filters.chromaKey;
          applyChromaKey(layerCtx as CanvasRenderingContext2D, layerCanvas as HTMLCanvasElement, ck.color, ck.similarity, ck.smoothness);
        }
        if (clip.filters.vignette?.enabled) {
          applyVignette(layerCtx as CanvasRenderingContext2D, layerCanvas as HTMLCanvasElement, clip.filters.vignette.intensity);
        }
        if (clip.filters.blur && clip.filters.blur > 0) {
          layerCtx.filter = `blur(${clip.filters.blur}px)`;
          layerCtx.drawImage(layerCanvas as HTMLCanvasElement, 0, 0);
          layerCtx.filter = 'none';
        }
      }
    }

    this.compositeLayer(sourceCanvas as HTMLCanvasElement, clip, ctx, w, h, localTime);
  }

  private compositeLayer(source: HTMLCanvasElement, clip: Clip, ctx: CanvasRenderingContext2D, w: number, h: number, localTime: number) {
    const baseTr = clip.transform;
    const kfX = interpolateKeyframes(clip.keyframeTracks, localTime, 'x');
    const kfY = interpolateKeyframes(clip.keyframeTracks, localTime, 'y');
    const kfScale = interpolateKeyframes(clip.keyframeTracks, localTime, 'scale');
    const kfRotation = interpolateKeyframes(clip.keyframeTracks, localTime, 'rotation');
    const kfOpacity = interpolateKeyframes(clip.keyframeTracks, localTime, 'opacity');

    // Keyframes use neutral defaults (scale=1, opacity=100) via interpolateKeyframes.
    // Scale is multiplicative, others are additive.
    const scaleFactor = w / 1920;

    const tr = {
      x: (baseTr.x + kfX) * scaleFactor,
      y: (baseTr.y + kfY) * scaleFactor,
      scale: baseTr.scale * kfScale,
      rotation: baseTr.rotation + kfRotation,
    };

    const baseAlpha = Math.max(0, Math.min(1, (clip.opacity ?? 100) / 100));
    const alpha = baseAlpha * Math.max(0, Math.min(1, kfOpacity / 100));
    const mode = clip.blendMode && clip.blendMode !== 'normal' ? clip.blendMode as GlobalCompositeOperation : undefined;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (mode) ctx.globalCompositeOperation = mode;
    ctx.translate(w / 2 + tr.x, h / 2 + tr.y);
    ctx.scale(tr.scale, tr.scale);
    ctx.rotate((tr.rotation * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  }

  /** Get or create a pooled transition canvas at the given size */
  private getTransCanvas(slot: 'A' | 'B', w: number, h: number): HTMLCanvasElement {
    const field = slot === 'A' ? 'transCanvasA' : 'transCanvasB';
    let canvas = this[field];
    if (!canvas || canvas.width !== w || canvas.height !== h) {
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      this[field] = canvas;
    }
    return canvas;
  }

  private async renderTransitionLayer(
    clipA: Clip,
    clipB: Clip,
    type: TransitionType,
    progress: number,
    req: FrameRequest,
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): Promise<void> {
    // Reuse pooled canvases instead of creating new ones every frame
    const canvasA = this.getTransCanvas('A', w, h);
    const ctxA = canvasA.getContext('2d', { alpha: true, desynchronized: true })!;
    ctxA.clearRect(0, 0, w, h);
    await this.renderLayer(clipA, req, ctxA, w, h);

    const canvasB = this.getTransCanvas('B', w, h);
    const ctxB = canvasB.getContext('2d', { alpha: true, desynchronized: true })!;
    ctxB.clearRect(0, 0, w, h);

    // Use a safe copy of req instead of mutating the shared object
    const transOffset = progress * clipA.transition!.duration;
    const safeReq: FrameRequest = { ...req, time: clipB.startAt + transOffset };
    await this.renderLayer(clipB, safeReq, ctxB, w, h);

    if (this.gpuEnabled && this.gpu) {
      this.gpu.resize(w, h);
      this.gpu.uploadTexture('tex_a', canvasA);
      this.gpu.uploadTexture('tex_b', canvasB);
      const texA = this.gpu.getTexture('tex_a')!;
      const texB = this.gpu.getTexture('tex_b')!;
      this.gpu.applyTransition(texA, texB, type, progress, 'screen');
      const gpuCanvas = this.gpu.canvas;
      if (gpuCanvas) {
        ctx.drawImage(gpuCanvas, 0, 0);
        return;
      }
    }

    ctx.save();
    switch (type) {
      case 'fade':
      case 'dissolve': {
        ctx.globalAlpha = 1 - progress;
        ctx.drawImage(canvasA, 0, 0);
        ctx.globalAlpha = progress;
        ctx.drawImage(canvasB, 0, 0);
        break;
      }
      case 'wipe-left': {
        const boundary = w * (1 - progress);
        ctx.drawImage(canvasA, 0, 0, boundary, h, 0, 0, boundary, h);
        ctx.drawImage(canvasB, boundary, 0, w - boundary, h, boundary, 0, w - boundary, h);
        break;
      }
      case 'wipe-right': {
        const boundary = w * progress;
        ctx.drawImage(canvasB, 0, 0, boundary, h, 0, 0, boundary, h);
        ctx.drawImage(canvasA, boundary, 0, w - boundary, h, boundary, 0, w - boundary, h);
        break;
      }
      case 'slide-left': {
        const offsetX = -w * progress;
        ctx.drawImage(canvasA, offsetX, 0);
        ctx.drawImage(canvasB, offsetX + w, 0);
        break;
      }
      case 'slide-right': {
        const offsetX = w * progress;
        ctx.drawImage(canvasA, offsetX, 0);
        ctx.drawImage(canvasB, offsetX - w, 0);
        break;
      }
      case 'zoom': {
        ctx.globalAlpha = 1 - progress;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        const scaleA = 1 + progress * 0.5;
        ctx.scale(scaleA, scaleA);
        ctx.translate(-w / 2, -h / 2);
        ctx.drawImage(canvasA, 0, 0);
        ctx.restore();
        ctx.globalAlpha = progress;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        const scaleB = 0.5 + progress * 0.5;
        ctx.scale(scaleB, scaleB);
        ctx.translate(-w / 2, -h / 2);
        ctx.drawImage(canvasB, 0, 0);
        ctx.restore();
        break;
      }
      case 'spin': {
        ctx.globalAlpha = 1 - progress;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(progress * Math.PI);
        const scaleA = 1 - progress;
        ctx.scale(scaleA, scaleA);
        ctx.translate(-w / 2, -h / 2);
        ctx.drawImage(canvasA, 0, 0);
        ctx.restore();
        ctx.globalAlpha = progress;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate((progress - 1) * Math.PI);
        const scaleB = progress;
        ctx.scale(scaleB, scaleB);
        ctx.translate(-w / 2, -h / 2);
        ctx.drawImage(canvasB, 0, 0);
        ctx.restore();
        break;
      }
      case 'blur': {
        const blurAmt = Math.sin(progress * Math.PI) * 20;
        ctx.filter = `blur(${blurAmt}px)`;
        ctx.globalAlpha = 1 - progress;
        ctx.drawImage(canvasA, 0, 0);
        ctx.globalAlpha = progress;
        ctx.drawImage(canvasB, 0, 0);
        break;
      }
      case 'flash': {
        ctx.drawImage(canvasA, 0, 0);
        ctx.globalAlpha = progress;
        ctx.drawImage(canvasB, 0, 0);
        const flashAlpha = Math.sin(progress * Math.PI);
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        break;
      }
      default: {
        ctx.drawImage(canvasA, 0, 0);
        break;
      }
    }
    ctx.restore();
  }

  private async getOrLoadMedia(mediaId: string, url: string, trackType: string): Promise<HTMLVideoElement | HTMLImageElement | undefined> {
    const existing = this.mediaCache.get(mediaId);
    if (existing) return existing;

    if (trackType === 'video' || trackType === 'sticker') {
      const el = document.createElement('video');
      el.muted = true;
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      // GPU-accelerated video decoding hint
      (el as any).disableRemotePlayback = true;
      el.src = url;
      el.load();
      await new Promise<void>(resolve => {
        if (el.readyState >= 2) resolve();
        else el.oncanplay = () => resolve();
      });
      this.mediaCache.set(mediaId, el);
      return el;
    }

    if (trackType === 'text') return undefined;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    try {
      await img.decode();
    } catch {}
    this.mediaCache.set(mediaId, img);
    return img;
  }

  private cleanMediaCache() {
    if (this.mediaCache.size > 50) {
      const iter = this.mediaCache.keys();
      for (let i = 0; i < 10; i++) {
        const key = iter.next();
        if (key.done) break;
        const el = this.mediaCache.get(key.value);
        if (el instanceof HTMLVideoElement) {
          el.pause();
          el.removeAttribute('src');
          el.load();
        }
        this.mediaCache.delete(key.value);
      }
    }
  }

  private renderVFXOverlay(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    vfx: { type: string; intensity: number; position: { x: number; y: number }; scale: number; rotation: number; opacity: number },
    time: number
  ): void {
    ctx.save();
    ctx.globalAlpha = vfx.opacity;

    const cx = w / 2 + vfx.position.x * w / 2;
    const cy = h / 2 + vfx.position.y * h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((vfx.rotation * Math.PI) / 180);
    ctx.scale(vfx.scale, vfx.scale);

    const intensity = vfx.intensity;

    switch (vfx.type) {
      case 'lens-flare': {
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.min(w, h) * 0.4);
        grad.addColorStop(0, `rgba(255, 240, 200, ${intensity})`);
        grad.addColorStop(0.3, `rgba(255, 200, 100, ${intensity * 0.5})`);
        grad.addColorStop(1, 'rgba(255, 200, 100, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        // Rays
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3 + time * 0.2;
          ctx.save();
          ctx.rotate(angle);
          ctx.fillStyle = `rgba(255, 230, 180, ${intensity * 0.3})`;
          ctx.fillRect(0, -2, Math.min(w, h) * 0.5, 4);
          ctx.restore();
        }
        break;
      }
      case 'film-grain': {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const noise = (Math.random() - 0.5) * 50 * intensity;
          data[i] = Math.max(0, Math.min(255, data[i] + noise));
          data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
          data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        }
        ctx.putImageData(imageData, 0, 0);
        ctx.restore();
        break;
      }
      case 'light-leak': {
        const grad = ctx.createRadialGradient(w * 0.3, -h * 0.2, 0, w * 0.3, -h * 0.2, Math.min(w, h) * 0.6);
        grad.addColorStop(0, `rgba(255, 100, 50, ${intensity * 0.6})`);
        grad.addColorStop(0.5, `rgba(255, 150, 80, ${intensity * 0.3})`);
        grad.addColorStop(1, 'rgba(255, 100, 50, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        break;
      }
      case 'particles': {
        for (let i = 0; i < 30 * intensity; i++) {
          const x = (Math.sin(time * 2 + i * 1.7) * 0.5 + 0.5) * w - w / 2;
          const y = (Math.cos(time * 1.5 + i * 2.3) * 0.5 + 0.5) * h - h / 2;
          const size = 1 + Math.random() * 3 * intensity;
          const alpha = 0.3 + Math.random() * 0.7 * intensity;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200, 180, 255, ${alpha})`;
          ctx.fill();
        }
        break;
      }
      case 'glitch': {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const slices = Math.floor(10 * intensity);
        for (let i = 0; i < slices; i++) {
          const y = Math.floor(Math.random() * h);
          const sliceH = Math.max(1, Math.floor(2 + Math.random() * 8));
          const offset = Math.floor((Math.random() - 0.5) * 40 * intensity);
          if (y + sliceH <= h) {
            const slice = ctx.getImageData(0, y, w, sliceH);
            ctx.putImageData(slice, offset, y);
          }
          ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,0,0' : '0,0,255'}, ${intensity * 0.3})`;
          ctx.fillRect(offset, y, w, sliceH);
        }
        ctx.restore();
        break;
      }
      case 'vhs': {
        // Scanlines
        for (let y = -h / 2; y < h / 2; y += 3) {
          ctx.fillStyle = `rgba(0, 0, 0, ${0.15 * intensity})`;
          ctx.fillRect(-w / 2, y, w, 1);
        }
        // Color shift
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const vhsImageData = ctx.getImageData(0, 0, w, h);
        const vhsData = vhsImageData.data;
        const shift = Math.floor(3 * intensity);
        for (let i = 0; i < vhsData.length - shift * 4; i += 4) {
          vhsData[i] = vhsData[i + shift * 4]; // Red channel shift
        }
        ctx.putImageData(vhsImageData, 0, 0);
        ctx.restore();
        break;
      }
      case 'chromatic': {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const chrOffset = Math.floor(4 * intensity);
        const chrImageData = ctx.getImageData(0, 0, w, h);
        const chrData = chrImageData.data;
        const chrCopy = new Uint8ClampedArray(chrData);
        for (let i = 0; i < chrData.length - chrOffset * 4; i += 4) {
          chrData[i] = chrCopy[i + chrOffset * 4];       // Red shifted right
          chrData[i + 2] = chrCopy[Math.max(0, i - chrOffset * 4) + 2]; // Blue shifted left
        }
        ctx.putImageData(chrImageData, 0, 0);
        ctx.restore();
        break;
      }
      case 'bloom': {
        ctx.shadowColor = `rgba(255, 220, 150, ${intensity})`;
        ctx.shadowBlur = 20 * intensity;
        ctx.fillStyle = `rgba(255, 230, 180, ${intensity * 0.3})`;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        break;
      }
      case 'sparkle': {
        for (let i = 0; i < 15 * intensity; i++) {
          const x = (Math.sin(time * 3 + i * 2.1) * 0.5 + 0.5) * w - w / 2;
          const y = (Math.cos(time * 2.5 + i * 1.9) * 0.5 + 0.5) * h - h / 2;
          const size = 2 + Math.sin(time * 5 + i) * 2;
          const alpha = 0.5 + Math.sin(time * 4 + i * 1.3) * 0.5;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(time + i);
          ctx.fillStyle = `rgba(255, 240, 150, ${alpha * intensity})`;
          ctx.fillRect(-size, -0.5, size * 2, 1);
          ctx.fillRect(-0.5, -size, 1, size * 2);
          ctx.restore();
        }
        break;
      }
      case 'smoke': {
        for (let i = 0; i < 8 * intensity; i++) {
          const x = Math.sin(time * 0.5 + i * 1.3) * w * 0.3;
          const y = Math.cos(time * 0.3 + i * 0.9) * h * 0.3 - h * 0.2;
          const size = 30 + i * 10;
          const grad = ctx.createRadialGradient(x, y, 0, x, y, size);
          grad.addColorStop(0, `rgba(150, 150, 160, ${0.15 * intensity})`);
          grad.addColorStop(1, 'rgba(150, 150, 160, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(x - size, y - size, size * 2, size * 2);
        }
        break;
      }
    }

    ctx.restore();
  }

  private renderDrawingOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, overlay: DrawingOverlay) {
    if (!overlay.paths || overlay.paths.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const scale = w / 1920;
    for (const path of overlay.paths) {
      if (path.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = path.tool === 'eraser' ? 'rgba(0,0,0,1)' : path.color;
      ctx.lineWidth = path.width * scale;
      ctx.globalAlpha = path.tool === 'highlighter' ? 0.4 : 1;
      ctx.globalCompositeOperation = path.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.moveTo(path.points[0].x * w, path.points[0].y * h);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x * w, path.points[i].y * h);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderElementOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, overlay: ElementOverlay) {
    if (!overlay.svgContent) return;
    const svgBlob = new Blob([overlay.svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.src = url;
    const size = Math.min(w, h) * 0.3;
    const x = (w - size) / 2;
    const y = (h - size) / 2;
    if (img.complete) {
      ctx.drawImage(img, x, y, size, size);
      URL.revokeObjectURL(url);
    } else {
      img.onload = () => {
        ctx.drawImage(img, x, y, size, size);
        URL.revokeObjectURL(url);
      };
    }
  }

  destroy() {
    this.gpu?.destroy();
    this.gpu = null;

    for (const [, el] of this.mediaCache) {
      if (el instanceof HTMLVideoElement) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    }
    this.mediaCache.clear();
    this.layerCanvases.clear();
    this.transCanvasA = null;
    this.transCanvasB = null;
    this.ctx?.clearRect(0, 0, this.width, this.height);
  }
}
