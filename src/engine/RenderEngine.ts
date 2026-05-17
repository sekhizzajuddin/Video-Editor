import { Clip, Track } from '../types';
import { renderVideoFrame, renderImageFrame, renderTextOverlay, applyFilter } from '../utils/codec';

export interface FrameRequest {
  time: number;
  tracks: Track[];
  getMediaUrl: (mediaId: string) => string | undefined;
}

interface LayeredClip {
  clip: Clip;
  trackIndex: number;
}

export class RenderEngine {
  private output: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D | null;
  private width = 1920;
  private height = 1080;
  private mediaCache = new Map<string, HTMLVideoElement | HTMLImageElement>();

  constructor(outputCanvas: HTMLCanvasElement) {
    this.output = outputCanvas;
    this.ctx = outputCanvas.getContext('2d', { willReadFrequently: true });
    this.offscreen = document.createElement('canvas');
    this.offCtx = this.offscreen.getContext('2d', { willReadFrequently: true });
    this.setSize(this.width, this.height);
  }

  setSize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.output.width = w;
    this.output.height = h;
    this.offscreen.width = w;
    this.offscreen.height = h;
    this.offCtx = this.offscreen.getContext('2d', { willReadFrequently: true });
  }

  get canvas() { return this.output; }
  get context() { return this.ctx; }

  async renderFrame(req: FrameRequest): Promise<void> {
    const { ctx, offCtx, width, height } = this;
    if (!ctx || !offCtx) return;

    this.cleanMediaCache();

    // Clear with transparent — each layer composites on top
    offCtx.clearRect(0, 0, width, height);
    ctx.clearRect(0, 0, width, height);

    const layers = this.collectLayers(req.tracks, req.time);

    for (const { clip } of layers) {
      await this.renderLayer(clip, req, offCtx, width, height);
    }

    ctx.drawImage(this.offscreen, 0, 0);
  }

  /**
   * Collect all clips visible at `time`, sorted by track index ascending (bottom→top).
   * Lower track index = rendered first (background).
   * Video tracks render before text/sticker tracks per the track-type convention.
   */
  private collectLayers(tracks: Track[], time: number): LayeredClip[] {
    const layers: LayeredClip[] = [];
    for (let ti = 0; ti < tracks.length; ti++) {
      const t = tracks[ti];
      if (!t.visible) continue;
      for (const c of t.clips) {
        if (time >= c.startAt && time < c.startAt + c.duration) {
          layers.push({ clip: c, trackIndex: ti });
        }
      }
    }
    // Sort by track index ascending — bottom track renders first
    layers.sort((a, b) => a.trackIndex - b.trackIndex);
    return layers;
  }

  private async renderLayer(
    clip: Clip,
    req: FrameRequest,
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): Promise<void> {
    const mediaUrl = clip.mediaId ? req.getMediaUrl(clip.mediaId) : undefined;
    const localTime = req.time - clip.startAt;
    const sourceTime = clip.sourceStart + localTime * clip.speed;

    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = w;
    layerCanvas.height = h;
    const layerCtx = layerCanvas.getContext('2d')!;
    layerCtx.clearRect(0, 0, w, h);

    // --- Render media onto the layer canvas ---
    if (mediaUrl && clip.mediaId) {
      const el = this.mediaCache.get(clip.mediaId);
      if (el instanceof HTMLVideoElement && el.readyState >= 2) {
        if (Math.abs(el.currentTime - sourceTime) > 0.1) el.currentTime = sourceTime;
        renderVideoFrame(layerCtx, layerCanvas, el);
      } else if (el instanceof HTMLImageElement && el.complete) {
        renderImageFrame(layerCtx, layerCanvas, el);
      } else {
        const elem = await this.getOrLoadMedia(clip.mediaId, mediaUrl, clip.trackType);
        if (elem instanceof HTMLVideoElement && elem.readyState >= 2) {
          if (Math.abs(elem.currentTime - sourceTime) > 0.1) elem.currentTime = sourceTime;
          renderVideoFrame(layerCtx, layerCanvas, elem);
        } else if (elem instanceof HTMLImageElement && elem.complete) {
          renderImageFrame(layerCtx, layerCanvas, elem);
        }
      }
    }

    // --- Text overlay on the same layer ---
    if (clip.textOverlay) {
      renderTextOverlay(layerCtx, layerCanvas, clip.textOverlay.text, {
        fontSize: clip.textOverlay.fontSize,
        fontFamily: clip.textOverlay.fontFamily,
        color: clip.textOverlay.color,
        align: clip.textOverlay.textAlign,
      });
    }

    if (clip.trackType === 'audio' && !mediaUrl) return;

    // --- Apply filters to the layer ---
    if (clip.filters && clip.filters.preset !== 'none') {
      applyFilter(layerCtx, layerCanvas, clip.filters.preset);
    }

    // --- Composite this layer onto the main context with transform, alpha, blend ---
    this.compositeLayer(layerCanvas, clip, ctx, w, h);
  }

  /**
   * Composite a rendered layer onto the target context.
   * Applies transform (scale/x/y/rotation), opacity, and blend mode BEFORE drawImage.
   */
  private compositeLayer(
    source: HTMLCanvasElement,
    clip: Clip,
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ) {
    const tr = clip.transform;
    const alpha = Math.max(0, Math.min(1, (clip.opacity ?? 100) / 100));
    const mode = clip.blendMode && clip.blendMode !== 'normal'
      ? clip.blendMode as GlobalCompositeOperation
      : undefined;

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

  private async getOrLoadMedia(
    mediaId: string,
    url: string,
    trackType: string,
  ): Promise<HTMLVideoElement | HTMLImageElement | undefined> {
    const existing = this.mediaCache.get(mediaId);
    if (existing) return existing;

    if (trackType === 'video' || trackType === 'sticker') {
      const el = document.createElement('video');
      el.muted = true;
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      el.src = url;
      el.load();
      await new Promise<void>((resolve) => {
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
    try { await img.decode(); } catch { /* ignore */ }
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

  destroy() {
    for (const [, el] of this.mediaCache) {
      if (el instanceof HTMLVideoElement) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    }
    this.mediaCache.clear();
    this.ctx?.clearRect(0, 0, this.width, this.height);
  }
}
