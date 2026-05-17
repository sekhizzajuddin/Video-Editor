import { Clip, Track } from '../types';
import { renderVideoFrame, renderImageFrame, renderTextOverlay, applyFilter } from '../utils/codec';

export interface FrameRequest {
  time: number;
  tracks: Track[];
  getMediaUrl: (mediaId: string) => string | undefined;
}

interface LayeredClip { clip: Clip; trackIndex: number; }

export class RenderEngine {
  private output: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D | null;
  private width = 1920;
  private height = 1080;
  private mediaCache = new Map<string, HTMLVideoElement | HTMLImageElement>();
  /** When true, video elements play themselves — we never seek mid-playback */
  private isPlaybackMode = false;

  constructor(outputCanvas: HTMLCanvasElement) {
    this.output = outputCanvas;
    this.ctx = outputCanvas.getContext('2d', { willReadFrequently: true });
    this.offscreen = document.createElement('canvas');
    this.offCtx = this.offscreen.getContext('2d', { willReadFrequently: true });
    this.setSize(this.width, this.height);
  }

  setSize(w: number, h: number) {
    this.width = w; this.height = h;
    this.output.width = w; this.output.height = h;
    this.offscreen.width = w; this.offscreen.height = h;
    this.offCtx = this.offscreen.getContext('2d', { willReadFrequently: true });
  }

  /** Call this when playback starts/stops to control seek behaviour */
  setPlaybackMode(playing: boolean) {
    this.isPlaybackMode = playing;
    if (!playing) {
      // On pause: freeze every video at its current position
      for (const [, el] of this.mediaCache) {
        if (el instanceof HTMLVideoElement && !el.paused) el.pause();
      }
    }
  }

  /** Start playing all cached video clips from the correct source time */
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
    this.cleanMediaCache();
    offCtx.clearRect(0, 0, width, height);
    ctx.clearRect(0, 0, width, height);
    const layers = this.collectLayers(req.tracks, req.time);
    for (const { clip } of layers) {
      await this.renderLayer(clip, req, offCtx, width, height);
    }
    ctx.drawImage(this.offscreen, 0, 0);
  }

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
    layers.sort((a, b) => a.trackIndex - b.trackIndex);
    return layers;
  }

  private async renderLayer(
    clip: Clip, req: FrameRequest,
    ctx: CanvasRenderingContext2D, w: number, h: number,
  ): Promise<void> {
    const mediaUrl = clip.mediaId ? req.getMediaUrl(clip.mediaId) : undefined;
    const localTime = req.time - clip.startAt;
    const sourceTime = clip.sourceStart + localTime * clip.speed;

    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = w; layerCanvas.height = h;
    const layerCtx = layerCanvas.getContext('2d')!;
    layerCtx.clearRect(0, 0, w, h);

    if (mediaUrl && clip.mediaId) {
      const el = this.mediaCache.get(clip.mediaId);
      if (el instanceof HTMLVideoElement && el.readyState >= 2) {
        if (this.isPlaybackMode) {
          // Playing: only correct if drifted more than 0.5s — avoids flicker
          if (Math.abs(el.currentTime - sourceTime) > 0.5) el.currentTime = sourceTime;
          // Resume if paused due to an earlier pause call
          if (el.paused) el.play().catch(() => {});
        } else {
          // Paused / seeking: precise seek with small threshold
          if (Math.abs(el.currentTime - sourceTime) > 0.04) el.currentTime = sourceTime;
        }
        renderVideoFrame(layerCtx, layerCanvas, el);
      } else if (el instanceof HTMLImageElement && el.complete) {
        renderImageFrame(layerCtx, layerCanvas, el);
      } else {
        const elem = await this.getOrLoadMedia(clip.mediaId, mediaUrl, clip.trackType);
        if (elem instanceof HTMLVideoElement && elem.readyState >= 2) {
          if (!this.isPlaybackMode) elem.currentTime = sourceTime;
          renderVideoFrame(layerCtx, layerCanvas, elem);
        } else if (elem instanceof HTMLImageElement && elem.complete) {
          renderImageFrame(layerCtx, layerCanvas, elem);
        }
      }
    }

    if (clip.textOverlay) {
      renderTextOverlay(layerCtx, layerCanvas, clip.textOverlay.text, {
        fontSize: clip.textOverlay.fontSize, fontFamily: clip.textOverlay.fontFamily,
        color: clip.textOverlay.color, align: clip.textOverlay.textAlign,
      });
    }

    if (clip.trackType === 'sticker' && clip.sticker) {
      layerCtx.save();
      layerCtx.font = `${Math.round(h * 0.12)}px sans-serif`;
      layerCtx.textAlign = 'center'; layerCtx.textBaseline = 'middle';
      layerCtx.fillText(clip.sticker, w / 2 + clip.transform.x, h / 2 + clip.transform.y);
      layerCtx.restore();
    }

    if (clip.trackType === 'audio' && !mediaUrl) return;
    if (clip.filters && clip.filters.preset !== 'none') applyFilter(layerCtx, layerCanvas, clip.filters.preset);
    this.compositeLayer(layerCanvas, clip, ctx, w, h);
  }

  private compositeLayer(source: HTMLCanvasElement, clip: Clip, ctx: CanvasRenderingContext2D, w: number, h: number) {
    const tr = clip.transform;
    const alpha = Math.max(0, Math.min(1, (clip.opacity ?? 100) / 100));
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

  private async getOrLoadMedia(mediaId: string, url: string, trackType: string): Promise<HTMLVideoElement | HTMLImageElement | undefined> {
    const existing = this.mediaCache.get(mediaId);
    if (existing) return existing;
    if (trackType === 'video' || trackType === 'sticker') {
      const el = document.createElement('video');
      el.muted = true; el.crossOrigin = 'anonymous'; el.preload = 'auto'; el.src = url; el.load();
      await new Promise<void>(resolve => { if (el.readyState >= 2) resolve(); else el.oncanplay = () => resolve(); });
      this.mediaCache.set(mediaId, el);
      return el;
    }
    if (trackType === 'text') return undefined;
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url;
    try { await img.decode(); } catch {}
    this.mediaCache.set(mediaId, img);
    return img;
  }

  private cleanMediaCache() {
    if (this.mediaCache.size > 50) {
      const iter = this.mediaCache.keys();
      for (let i = 0; i < 10; i++) {
        const key = iter.next(); if (key.done) break;
        const el = this.mediaCache.get(key.value);
        if (el instanceof HTMLVideoElement) { el.pause(); el.removeAttribute('src'); el.load(); }
        this.mediaCache.delete(key.value);
      }
    }
  }

  destroy() {
    for (const [, el] of this.mediaCache) {
      if (el instanceof HTMLVideoElement) { el.pause(); el.removeAttribute('src'); el.load(); }
    }
    this.mediaCache.clear();
    this.ctx?.clearRect(0, 0, this.width, this.height);
  }
}
