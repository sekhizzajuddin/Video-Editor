import { Clip, Track, TransitionType } from '../types';
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

  // GPU pipeline
  private gpu: WebGLFilterPipeline | null = null;
  private gpuEnabled = false;
  private layerCanvases: Map<string, OffscreenCanvas> = new Map();

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

    this.setSize(this.width, this.height);
    this.initGPU();
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
    this.width = w;
    this.height = h;
    this.output.width = w;
    this.output.height = h;

    if (this.offscreen instanceof OffscreenCanvas) {
      this.offscreen.width = w;
      this.offscreen.height = h;
      this.offCtx = this.offscreen.getContext('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false,
      }) as OffscreenCanvasRenderingContext2D;
    } else {
      this.offscreen.width = w;
      this.offscreen.height = h;
      this.offCtx = this.offscreen.getContext('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false,
      });
    }

    // Resize GPU pipeline
    this.gpu?.resize(w, h);
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

    this.cleanMediaCache();

    // Clear with GPU-accelerated clearRect
    offCtx.clearRect(0, 0, width, height);
    ctx.clearRect(0, 0, width, height);

    const layers = this.collectLayers(req.tracks, req.time);

    if (this.gpuEnabled && this.gpu) {
      await this.renderFrameGPU(layers, req, ctx, width, height);
    } else {
      await this.renderFrameCPU(layers, req, offCtx, ctx, width, height);
    }
  }

  private async renderFrameGPU(
    layers: LayeredClip[],
    req: FrameRequest,
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): Promise<void> {
    if (!this.gpu) return;

    // Render all layers to GPU textures
    const layerTextures: { texture: WebGLTexture; clip: Clip }[] = [];

    for (const layer of layers) {
      if (layer.transition) {
        // GPU transition rendering
        const tex = await this.renderTransitionGPU(
          layer.clip,
          layer.transition.nextClip,
          layer.transition.type,
          layer.transition.progress,
          req,
          w,
          h
        );
        if (tex) layerTextures.push({ texture: tex, clip: layer.clip });
      } else {
        const tex = await this.renderLayerGPU(layer.clip, req, w, h);
        if (tex) layerTextures.push({ texture: tex, clip: layer.clip });
      }
    }

    // Composite all layers on GPU
    if (layerTextures.length === 0) return;

    // First layer goes to output directly
    const firstLayer = layerTextures[0];
    this.gpu.readToCanvas(this.output, 'fb_a');

    // Composite remaining layers
    for (let i = 1; i < layerTextures.length; i++) {
      const bgTex = this.gpu.getTexture('fb_a');
      const fgTex = layerTextures[i].texture;
      if (!bgTex || !fgTex) continue;

      const clip = layerTextures[i].clip;
      const opacity = Math.max(0, Math.min(1, (clip.opacity ?? 100) / 100));

      this.gpu.composite(bgTex, fgTex, opacity, clip.blendMode || 'normal', 'fb_a');
      this.gpu.readToCanvas(this.output, 'fb_a');
    }
  }

  private async renderLayerGPU(
    clip: Clip,
    req: FrameRequest,
    w: number,
    h: number
  ): Promise<WebGLTexture | null> {
    if (!this.gpu) return null;

    const mediaUrl = clip.mediaId ? req.getMediaUrl(clip.mediaId) : undefined;
    const localTime = req.time - clip.startAt;
    const rawSourceTime = clip.sourceStart + localTime * clip.speed;
    const sourceTime = clip.sourceEnd ? Math.min(rawSourceTime, clip.sourceEnd) : rawSourceTime;

    // Get or load media
    let el: HTMLVideoElement | HTMLImageElement | undefined;
    if (mediaUrl && clip.mediaId) {
      el = this.mediaCache.get(clip.mediaId);
      if (!el) {
        el = await this.getOrLoadMedia(clip.mediaId, mediaUrl, clip.trackType);
      }
    }

    // Create layer canvas for rendering
    const layerCanvas = this.getLayerCanvas(w, h);
    const layerCtx = layerCanvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!layerCtx) return null;

    layerCtx.clearRect(0, 0, w, h);

    // Render video/image to layer canvas
    if (el instanceof HTMLVideoElement && el.readyState >= 2) {
      if (this.isPlaybackMode) {
        if (Math.abs(el.currentTime - sourceTime) > 0.5) el.currentTime = sourceTime;
        if (el.paused) el.play().catch(() => {});
      } else {
        if (Math.abs(el.currentTime - sourceTime) > 0.04) el.currentTime = sourceTime;
      }
      layerCtx.drawImage(el, 0, 0, w, h);
    } else if (el instanceof HTMLImageElement && el.complete) {
      layerCtx.drawImage(el, 0, 0, w, h);
    }

    // Render text overlay
    if (clip.textOverlay) {
      const to = clip.textOverlay;
      renderTextOverlay(layerCtx, layerCanvas, clip.textOverlay.text, {
        fontSize: clip.textOverlay.fontSize,
        fontFamily: clip.textOverlay.fontFamily,
        color: clip.textOverlay.color,
        align: clip.textOverlay.textAlign,
        outlineColor: to.outlineColor,
        outlineWidth: to.outlineWidth || 0,
        backgroundColor: to.backgroundColor,
        backgroundOpacity: to.backgroundOpacity ?? 0.5,
      });
    }

    // Render sticker
    if (clip.trackType === 'sticker' && clip.sticker) {
      layerCtx.save();
      layerCtx.font = `${Math.round(h * 0.12)}px sans-serif`;
      layerCtx.textAlign = 'center';
      layerCtx.textBaseline = 'middle';
      layerCtx.fillText(clip.sticker, w / 2 + clip.transform.x, h / 2 + clip.transform.y);
      layerCtx.restore();
    }

    // Upload to GPU and apply filters
    if (clip.trackType === 'audio' && !mediaUrl) return null;

    const config = {
      preset: clip.filters?.preset || 'none',
      brightness: clip.filters?.brightness ?? 0,
      contrast: clip.filters?.contrast ?? 0,
      saturation: clip.filters?.saturation ?? 0,
      chromaKey: clip.filters?.chromaKey,
      vignette: clip.filters?.vignette,
      blur: clip.filters?.blur ?? 0,
    };

    // Create temp video element from canvas for GPU upload
    const tempVideo = document.createElement('video');
    tempVideo.srcObject = layerCanvas.captureStream(0) as MediaStream;
    await new Promise<void>(resolve => {
      tempVideo.onloadeddata = () => resolve();
      tempVideo.load();
    });

    this.gpu.applyFilters(tempVideo, config, 'fb_a');
    tempVideo.srcObject = null;

    return this.gpu.getTexture('fb_a') || null;
  }

  private async renderTransitionGPU(
    clipA: Clip,
    clipB: Clip,
    type: TransitionType,
    progress: number,
    req: FrameRequest,
    w: number,
    h: number
  ): Promise<WebGLTexture | null> {
    if (!this.gpu) return null;

    const texA = await this.renderLayerGPU(clipA, req, w, h);
    if (!texA) return null;

    const originalTime = req.time;
    const transOffset = progress * clipA.transition!.duration;
    req.time = clipB.startAt + transOffset;
    const texB = await this.renderLayerGPU(clipB, req, w, h);
    req.time = originalTime;

    if (!texB) return texA;

    this.gpu.applyTransition(texA, texB, type, progress, 'fb_a');
    return this.gpu.getTexture('fb_a') || null;
  }

  private async renderFrameCPU(
    layers: LayeredClip[],
    req: FrameRequest,
    offCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): Promise<void> {
    for (const layer of layers) {
      if (layer.transition) {
        await this.renderTransitionLayer(
          layer.clip,
          layer.transition.nextClip,
          layer.transition.type,
          layer.transition.progress,
          req,
          offCtx as CanvasRenderingContext2D,
          w,
          h
        );
      } else {
        await this.renderLayer(layer.clip, req, offCtx as CanvasRenderingContext2D, w, h);
      }
    }
    ctx.drawImage(this.offscreen as HTMLCanvasElement, 0, 0);
  }

  private getLayerCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
    const key = `${w}x${h}`;
    if (!this.layerCanvases.has(key)) {
      if (typeof OffscreenCanvas !== 'undefined') {
        this.layerCanvases.set(key, new OffscreenCanvas(w, h));
      } else {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
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
    const layerCtx = layerCanvas.getContext('2d', { alpha: false, desynchronized: true });
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
        renderVideoFrame(layerCtx as CanvasRenderingContext2D, layerCanvas as HTMLCanvasElement, el);
      } else if (el instanceof HTMLImageElement && el.complete) {
        renderImageFrame(layerCtx as CanvasRenderingContext2D, layerCanvas as HTMLCanvasElement, el);
      } else {
        const elem = await this.getOrLoadMedia(clip.mediaId, mediaUrl, clip.trackType);
        if (elem instanceof HTMLVideoElement && elem.readyState >= 2) {
          if (!this.isPlaybackMode) elem.currentTime = sourceTime;
          renderVideoFrame(layerCtx as CanvasRenderingContext2D, layerCanvas as HTMLCanvasElement, elem);
        } else if (elem instanceof HTMLImageElement && elem.complete) {
          renderImageFrame(layerCtx as CanvasRenderingContext2D, layerCanvas as HTMLCanvasElement, elem);
        }
      }
    }

    if (clip.textOverlay) {
      const to = clip.textOverlay;
      renderTextOverlay(layerCtx as CanvasRenderingContext2D, layerCanvas as HTMLCanvasElement, clip.textOverlay.text, {
        fontSize: clip.textOverlay.fontSize,
        fontFamily: clip.textOverlay.fontFamily,
        color: clip.textOverlay.color,
        align: clip.textOverlay.textAlign,
        outlineColor: to.outlineColor,
        outlineWidth: to.outlineWidth || 0,
        backgroundColor: to.backgroundColor,
        backgroundOpacity: to.backgroundOpacity ?? 0.5,
      });
    }

    if (clip.trackType === 'sticker' && clip.sticker) {
      layerCtx.save();
      layerCtx.font = `${Math.round(h * 0.12)}px sans-serif`;
      layerCtx.textAlign = 'center';
      layerCtx.textBaseline = 'middle';
      layerCtx.fillText(clip.sticker, w / 2 + clip.transform.x, h / 2 + clip.transform.y);
      layerCtx.restore();
    }

    if (clip.trackType === 'audio' && !mediaUrl) return;

    // Apply filters using GPU if available, otherwise CPU fallback
    if (clip.filters) {
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

    this.compositeLayer(layerCanvas as HTMLCanvasElement, clip, ctx, w, h, localTime);
  }

  private compositeLayer(source: HTMLCanvasElement, clip: Clip, ctx: CanvasRenderingContext2D, w: number, h: number, localTime: number) {
    const baseTr = clip.transform;
    const kfX = interpolateKeyframes(clip.keyframeTracks, localTime, 'x');
    const kfY = interpolateKeyframes(clip.keyframeTracks, localTime, 'y');
    const kfScale = interpolateKeyframes(clip.keyframeTracks, localTime, 'scale');
    const kfRotation = interpolateKeyframes(clip.keyframeTracks, localTime, 'rotation');
    const kfOpacity = interpolateKeyframes(clip.keyframeTracks, localTime, 'opacity');

    const tr = {
      x: baseTr.x + kfX,
      y: baseTr.y + kfY,
      scale: baseTr.scale + kfScale,
      rotation: baseTr.rotation + kfRotation,
    };

    const baseAlpha = Math.max(0, Math.min(1, (clip.opacity ?? 100) / 100));
    const alpha = baseAlpha * (1 - Math.max(0, Math.min(1, kfOpacity / 100)));
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
    const canvasA = document.createElement('canvas');
    canvasA.width = w;
    canvasA.height = h;
    const ctxA = canvasA.getContext('2d', { alpha: false, desynchronized: true })!;
    ctxA.clearRect(0, 0, w, h);
    await this.renderLayer(clipA, req, ctxA, w, h);

    const canvasB = document.createElement('canvas');
    canvasB.width = w;
    canvasB.height = h;
    const ctxB = canvasB.getContext('2d', { alpha: false, desynchronized: true })!;
    ctxB.clearRect(0, 0, w, h);

    const originalTime = req.time;
    const transOffset = progress * clipA.transition!.duration;
    req.time = clipB.startAt + transOffset;
    await this.renderLayer(clipB, req, ctxB, w, h);
    req.time = originalTime;

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
    this.ctx?.clearRect(0, 0, this.width, this.height);
  }
}
