/**
 * exportEngine.ts — Uses @ffmpeg/ffmpeg (WebAssembly) to encode and mux video/audio.
 * Falls back to WebM via MediaRecorder if FFmpeg fails to load.
 */

import { applyChromaKey, applyVignette } from '../utils/codec';

export interface ExportProgress { stage: string; percent: number; }
export type ExportResult = { type: 'complete'; blob: Blob } | { type: 'cancelled' };

export async function startExport(
  project: {
    id: string; fps: number; resolution: { w: number; h: number };
    duration: number; tracks: any[];
    media: { id: string; blob: Blob; mimeType: string; type: string; duration?: number; waveform?: number[] }[];
  },
  settings: { format: string; quality: string },
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {

  if (signal?.aborted) return { type: 'cancelled' };

  onProgress({ stage: 'Loading encoder...', percent: 2 });

  // Try FFmpeg WASM first
  try {
    return await exportWithFFmpeg(project, settings, onProgress, signal);
  } catch (err) {
    console.warn('[Export] FFmpeg failed, falling back to WebM MediaRecorder:', err);
    onProgress({ stage: 'Using WebM fallback...', percent: 5 });
    return await exportWithMediaRecorder(project, settings, onProgress, signal);
  }
}

// ─── FFmpeg WASM Export ───────────────────────────────────────────

async function exportWithFFmpeg(
  project: Parameters<typeof startExport>[0],
  settings: { format: string; quality: string },
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { fetchFile } = await import('@ffmpeg/util');

  const ffmpeg = new FFmpeg();

  onProgress({ stage: 'Loading FFmpeg...', percent: 5 });
  await ffmpeg.load({
    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
    wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
  });

  if (signal?.aborted) { ffmpeg.terminate(); return { type: 'cancelled' }; }

  ffmpeg.on('progress', ({ progress }) => {
    onProgress({ stage: 'Encoding...', percent: Math.round(10 + progress * 85) });
  });

  const { fps, resolution, duration, tracks, media } = project;
  const w = resolution.w; const h = resolution.h;

  // Write input media files to FFmpeg virtual FS
  onProgress({ stage: 'Preparing media files...', percent: 8 });
  const writtenFiles: string[] = [];
  for (const m of media) {
    const ext = m.mimeType.split('/')[1]?.split(';')[0] || 'mp4';
    const fname = `input_${m.id}.${ext}`;
    const data = await fetchFile(m.blob);
    await ffmpeg.writeFile(fname, data);
    writtenFiles.push(fname);
  }

  if (signal?.aborted) { ffmpeg.terminate(); return { type: 'cancelled' }; }

  // Build a canvas-rendered video as input for FFmpeg
  // Render project to raw frames, then pipe through FFmpeg
  onProgress({ stage: 'Rendering frames...', percent: 10 });

  // Create an offscreen canvas and render frames
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const totalFrames = Math.ceil(duration * fps);
  const frameInterval = 1 / fps;

  // Pre-load media elements
  const mediaElMap = new Map<string, HTMLVideoElement | HTMLImageElement>();
  for (const m of media) {
    if (m.type === 'audio') continue;
    const url = URL.createObjectURL(m.blob);
    if (m.type === 'video') {
      const el = document.createElement('video');
      el.src = url; el.muted = true; el.preload = 'auto';
      await new Promise<void>(res => {
        if (el.readyState >= 2) { res(); return; }
        el.oncanplay = () => res();
        el.load();
      });
      mediaElMap.set(m.id, el);
    } else if (m.type === 'image') {
      const img = new Image(); img.src = url;
      try { await img.decode(); } catch {}
      mediaElMap.set(m.id, img);
    }
  }

  if (signal?.aborted) { ffmpeg.terminate(); return { type: 'cancelled' }; }

  // Render and write all frames sequentially directly to FFmpeg virtual FS
  const svgCache = new Map<string, HTMLImageElement>();
  for (let fi = 0; fi < totalFrames; fi++) {
    if (signal?.aborted) { svgCache.clear(); ffmpeg.terminate(); return { type: 'cancelled' }; }
    const time = fi * frameInterval;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    await renderProjectFrame(ctx, canvas, tracks, mediaElMap, time, svgCache);
    
    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    const frameFile = `frame${String(fi).padStart(6, '0')}.png`;
    await ffmpeg.writeFile(frameFile, buf);

    // Cleanup previous frame to avoid memory exhaustion
    if (fi > 0) {
      try { await ffmpeg.deleteFile(`frame${String(fi - 1).padStart(6, '0')}.png`); } catch {}
    }

    if (fi % 30 === 0) {
      onProgress({
        stage: `Rendering and writing frame ${fi + 1}/${totalFrames}`,
        percent: Math.round(10 + (fi / totalFrames) * 70),
      });
    }
  }

  if (signal?.aborted) { svgCache.clear(); ffmpeg.terminate(); return { type: 'cancelled' }; }

  // Build FFmpeg command
  onProgress({ stage: 'Encoding video...', percent: 80 });
  const crf = { low: '35', medium: '23', high: '18' }[settings.quality] || '23';
  const outputFile = `output.${settings.format === 'webm' ? 'webm' : settings.format === 'mp3' ? 'mp3' : settings.format === 'wav' ? 'wav' : 'mp4'}`;

  const ffmpegArgs: string[] = [];
  ffmpegArgs.push('-framerate', String(fps), '-i', 'frame%06d.png');

  // Find all active, non-muted clips on the timeline that have audio
  const audioClips: { clip: any; mediaFile: any }[] = [];
  for (const t of tracks) {
    if (!t.visible) continue;
    const isAudioTrack = t.type === 'audio' || t.type === 'video' || t.type === 'tts' || t.type === 'record';
    if (!isAudioTrack) continue;

    for (const c of t.clips) {
      if (c.muted) continue;
      const m = media.find(item => item.id === c.mediaId);
      if (!m) continue;

      let hasAudio = false;
      if (m.type === 'audio') {
        hasAudio = true;
      } else if (m.type === 'video') {
        if (c.trackType === 'record') {
          hasAudio = !!c.recordOverlay?.audioEnabled;
        } else {
          hasAudio = !!(m.waveform && m.waveform.length > 0);
        }
      }

      if (hasAudio) {
        audioClips.push({ clip: c, mediaFile: m });
      }
    }
  }

  // Push all audio input files to FFmpeg args
  for (const item of audioClips) {
    const { mediaFile } = item;
    const ext = mediaFile.mimeType.split('/')[1]?.split(';')[0] || 'mp4';
    const fname = `input_${mediaFile.id}.${ext}`;
    ffmpegArgs.push('-i', fname);
  }

  const hasAudio = audioClips.length > 0;

  // Build the filter_complex for audio alignment, speed, volume
  let filterComplex = '';
  const mixedLabels: string[] = [];
  for (let idx = 0; idx < audioClips.length; idx++) {
    const { clip } = audioClips[idx];
    const inputIdx = idx + 1; // Input 0 is frames
    const sourceDur = clip.duration * (clip.speed || 1);
    const speedFilters = getSpeedFilters(clip.speed || 1);
    const vol = (clip.volume ?? 100) / 100;
    const delayMs = Math.round(clip.startAt * 1000);

    let filterStr = `[${inputIdx}:a]atrim=start=${clip.sourceStart}:duration=${sourceDur},asetpts=PTS-STARTPTS`;
    if (speedFilters) {
      filterStr += `,${speedFilters}`;
    }
    filterStr += `,volume=${vol}`;
    if (delayMs > 0) {
      filterStr += `,adelay=${delayMs}|${delayMs}`;
    }

    if (audioClips.length === 1) {
      filterComplex += `${filterStr}[aout]`;
    } else {
      const outLabel = `[a${inputIdx}]`;
      filterComplex += `${filterStr}${outLabel};`;
      mixedLabels.push(outLabel);
    }
  }

  if (audioClips.length > 1) {
    filterComplex += `${mixedLabels.join('')}amix=inputs=${audioClips.length}:duration=longest[aout]`;
  }

  if (settings.format === 'mp4') {
    ffmpegArgs.push('-c:v', 'libx264', '-crf', crf, '-preset', 'fast', '-pix_fmt', 'yuv420p');
    ffmpegArgs.push('-map', '0:v');
    if (hasAudio) {
      ffmpegArgs.push('-filter_complex', filterComplex, '-map', '[aout]', '-c:a', 'aac', '-b:a', '128k');
    }
  } else if (settings.format === 'webm') {
    ffmpegArgs.push('-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0');
    ffmpegArgs.push('-map', '0:v');
    if (hasAudio) {
      ffmpegArgs.push('-filter_complex', filterComplex, '-map', '[aout]', '-c:a', 'libopus');
    }
  } else if (settings.format === 'mp3') {
    if (hasAudio) {
      ffmpegArgs.push('-filter_complex', filterComplex, '-map', '[aout]', '-c:a', 'libmp3lame', '-b:a', '192k');
    }
  } else if (settings.format === 'wav') {
    if (hasAudio) {
      ffmpegArgs.push('-filter_complex', filterComplex, '-map', '[aout]', '-c:a', 'pcm_s16le');
    }
  }
  
  ffmpegArgs.push('-t', String(duration), outputFile);

  await ffmpeg.exec(ffmpegArgs);

  onProgress({ stage: 'Packaging output...', percent: 97 });
  const outData = await ffmpeg.readFile(outputFile);
  const mimeMap: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav' };
  const blob = new Blob([outData], { type: mimeMap[settings.format] || 'video/mp4' });

  svgCache.clear();
  ffmpeg.terminate();
  // Cleanup object URLs
  for (const [, el] of mediaElMap) {
    const url = (el as HTMLVideoElement | HTMLImageElement).src;
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  onProgress({ stage: 'Done', percent: 100 });
  return { type: 'complete', blob };
}

// ─── Render project frame onto canvas ───────────────────────────
async function renderProjectFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  tracks: any[],
  mediaElMap: Map<string, HTMLVideoElement | HTMLImageElement>,
  time: number,
  svgCache: Map<string, HTMLImageElement>,
) {
  const w = canvas.width; const h = canvas.height;
  const layers: { clip: any; ti: number; transition?: any }[] = [];
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
              clip: c, ti,
              transition: { type: trans.type, progress: Math.min(1, Math.max(0, progress)), nextClip: next }
            });
            continue;
          }
        }
        layers.push({ clip: c, ti });
      }
    }
  }
  layers.sort((a, b) => a.ti - b.ti);

  for (const layer of layers) {
    if (layer.transition) {
      await renderTransitionLayer(ctx, canvas, layer.clip, layer.transition.nextClip, layer.transition.type, layer.transition.progress, mediaElMap, time, w, h, svgCache);
    } else {
      await renderClipLayer(ctx, canvas, layer.clip, mediaElMap, time, w, h, svgCache);
    }
  }
}

async function renderClipLayer(
  ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement, clip: any,
  mediaElMap: Map<string, HTMLVideoElement | HTMLImageElement>, time: number, w: number, h: number,
  svgCache: Map<string, HTMLImageElement>,
): Promise<void> {
  const tr = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
  const alpha = Math.max(0, Math.min(1, (clip.opacity ?? 100) / 100));
  const localTime = time - clip.startAt;
  const rawSourceTime = (clip.sourceStart || 0) + localTime * (clip.speed || 1);
  const sourceTime = clip.sourceEnd ? Math.min(rawSourceTime, clip.sourceEnd) : rawSourceTime;

  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = w; layerCanvas.height = h;
  const lCtx = layerCanvas.getContext('2d')!;

  if (clip.mediaId) {
    const el = mediaElMap.get(clip.mediaId);
    if (el instanceof HTMLVideoElement) {
      // Await seek to correct frame to prevent black/wrong frames
      if (Math.abs(el.currentTime - sourceTime) > 0.04) {
        el.currentTime = sourceTime;
        await new Promise<void>(res => { el.onseeked = () => res(); });
      }
      if (el.videoWidth > 0) {
        lCtx.fillStyle = '#000'; lCtx.fillRect(0, 0, w, h);
        const crop = clip.crop;
        const sx = crop ? crop.x * el.videoWidth : 0;
        const sy = crop ? crop.y * el.videoHeight : 0;
        const sw = crop ? crop.width * el.videoWidth : el.videoWidth;
        const sh = crop ? crop.height * el.videoHeight : el.videoHeight;
        const ratio = Math.min(w / sw, h / sh);
        const dx = (w - sw * ratio) / 2; const dy = (h - sh * ratio) / 2;
        lCtx.drawImage(el, sx, sy, sw, sh, dx, dy, sw * ratio, sh * ratio);
      }
    } else if (el instanceof HTMLImageElement && el.complete) {
      lCtx.fillStyle = '#000'; lCtx.fillRect(0, 0, w, h);
      const crop = clip.crop;
      const sx = crop ? crop.x * el.naturalWidth : 0;
      const sy = crop ? crop.y * el.naturalHeight : 0;
      const sw = crop ? crop.width * el.naturalWidth : el.naturalWidth;
      const sh = crop ? crop.height * el.naturalHeight : el.naturalHeight;
      const ratio = Math.min(w / sw, h / sh);
      const dx = (w - sw * ratio) / 2; const dy = (h - sh * ratio) / 2;
      lCtx.drawImage(el, sx, sy, sw, sh, dx, dy, sw * ratio, sh * ratio);
    }
  }

  if (clip.textOverlay) {
    const to = clip.textOverlay;
    lCtx.save();
    lCtx.font = `${to.fontWeight || 700} ${to.fontSize || 48}px ${to.fontFamily || 'Inter, sans-serif'}`;
    lCtx.textAlign = to.textAlign || 'center';
    lCtx.textBaseline = 'middle';
    lCtx.fillStyle = to.color || '#ffffff';
    lCtx.shadowColor = 'rgba(0,0,0,0.5)'; lCtx.shadowBlur = 4;
    if (to.outlineColor && to.outlineWidth) {
      lCtx.strokeStyle = to.outlineColor;
      lCtx.lineWidth = to.outlineWidth;
      lCtx.lineJoin = 'round';
      lCtx.strokeText(to.text || '', w / 2 + (tr.x || 0), h / 2 + (tr.y || 0));
    }
    lCtx.fillText(to.text || '', w / 2 + (tr.x || 0), h / 2 + (tr.y || 0));
    lCtx.restore();
  }

  if (clip.trackType === 'sticker' && clip.sticker) {
    lCtx.save(); lCtx.font = `${Math.round(h * 0.12)}px sans-serif`;
    lCtx.textAlign = 'center'; lCtx.textBaseline = 'middle';
    lCtx.fillText(clip.sticker, w / 2 + (tr.x || 0), h / 2 + (tr.y || 0));
    lCtx.restore();
  }

  if (clip.trackType === 'vfx' && clip.vfxOverlay) {
    renderVFXOverlay(lCtx, w, h, clip.vfxOverlay, localTime);
  }

  if (clip.trackType === 'drawing' && clip.drawingOverlay) {
    renderDrawingOverlay(lCtx, w, h, clip.drawingOverlay);
  }

  if (clip.trackType === 'element' && clip.elementOverlay) {
    await renderElementOverlay(lCtx, w, h, clip.elementOverlay, svgCache);
  }

  if (clip.trackType === 'audio') return;

  // Apply filters
  if (clip.filters && clip.filters.preset !== 'none') {
    applyFilterToCanvas(lCtx, layerCanvas, clip.filters.preset);
  }
  if (clip.filters?.chromaKey?.enabled) {
    const ck = clip.filters.chromaKey;
    applyChromaKey(lCtx, layerCanvas, ck.color, ck.similarity, ck.smoothness);
  }
  if (clip.filters?.vignette?.enabled) {
    applyVignette(lCtx, layerCanvas, clip.filters.vignette.intensity);
  }
  if (clip.filters?.blur && clip.filters.blur > 0) {
    lCtx.filter = `blur(${clip.filters.blur}px)`;
    lCtx.drawImage(layerCanvas, 0, 0);
    lCtx.filter = 'none';
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  if (clip.blendMode && clip.blendMode !== 'normal') ctx.globalCompositeOperation = clip.blendMode;
  ctx.translate(w / 2 + (tr.x || 0), h / 2 + (tr.y || 0));
  ctx.scale(tr.scale || 1, tr.scale || 1);
  ctx.rotate(((tr.rotation || 0) * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);
  ctx.drawImage(layerCanvas, 0, 0);
  ctx.restore();
}

async function renderTransitionLayer(
  ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement,
  clipA: any, clipB: any, type: string, progress: number,
  mediaElMap: Map<string, HTMLVideoElement | HTMLImageElement>, time: number,
  w: number, h: number,
  svgCache: Map<string, HTMLImageElement>,
) {
  const canvasA = document.createElement('canvas');
  canvasA.width = w; canvasA.height = h;
  const ctxA = canvasA.getContext('2d')!;
  await renderClipLayer(ctxA, canvasA, clipA, mediaElMap, time, w, h, svgCache);

  const canvasB = document.createElement('canvas');
  canvasB.width = w; canvasB.height = h;
  const ctxB = canvasB.getContext('2d')!;
  const transOffset = progress * (clipA.transition?.duration || 0.3);
  await renderClipLayer(ctxB, canvasB, clipB, mediaElMap, clipB.startAt + transOffset, w, h, svgCache);

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
      ctx.save(); ctx.translate(w / 2, h / 2);
      ctx.scale(1 + progress * 0.5, 1 + progress * 0.5);
      ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(canvasA, 0, 0); ctx.restore();
      ctx.globalAlpha = progress;
      ctx.save(); ctx.translate(w / 2, h / 2);
      ctx.scale(0.5 + progress * 0.5, 0.5 + progress * 0.5);
      ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(canvasB, 0, 0); ctx.restore();
      break;
    }
    case 'spin': {
      ctx.globalAlpha = 1 - progress;
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(progress * Math.PI);
      ctx.scale(1 - progress, 1 - progress); ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(canvasA, 0, 0); ctx.restore();
      ctx.globalAlpha = progress;
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate((progress - 1) * Math.PI);
      ctx.scale(progress, progress); ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(canvasB, 0, 0); ctx.restore();
      break;
    }
    case 'blur': {
      ctx.filter = `blur(${Math.sin(progress * Math.PI) * 20}px)`;
      ctx.globalAlpha = 1 - progress; ctx.drawImage(canvasA, 0, 0);
      ctx.globalAlpha = progress; ctx.drawImage(canvasB, 0, 0);
      break;
    }
    case 'flash': {
      ctx.drawImage(canvasA, 0, 0);
      ctx.globalAlpha = progress; ctx.drawImage(canvasB, 0, 0);
      ctx.globalAlpha = Math.sin(progress * Math.PI);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      break;
    }
    default: ctx.drawImage(canvasA, 0, 0); break;
  }
  ctx.restore();
}

function applyFilterToCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, filterName: string): void {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  switch (filterName) {
    case 'bw':
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = data[i + 1] = data[i + 2] = gray;
      }
      break;
    case 'sepia':
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      }
      break;
    case 'invert':
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i]; data[i + 1] = 255 - data[i + 1]; data[i + 2] = 255 - data[i + 2];
      }
      break;
    case 'warm':
      for (let i = 0; i < data.length; i += 4) { data[i] = Math.min(255, data[i] * 1.1); data[i + 2] = Math.min(255, data[i + 2] * 0.9); }
      break;
    case 'cool':
      for (let i = 0; i < data.length; i += 4) { data[i] = Math.min(255, data[i] * 0.9); data[i + 2] = Math.min(255, data[i + 2] * 1.1); }
      break;
    case 'contrast': {
      const factor = (259 * (1.5 * 255 + 255)) / (255 * (259 - 1.5));
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
        data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
        data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
      }
      break;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

// ─── WebM MediaRecorder Fallback ─────────────────────────────────

async function exportWithMediaRecorder(
  project: Parameters<typeof startExport>[0],
  settings: { format: string; quality: string },
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const { fps, resolution, duration, tracks, media } = project;
  const w = resolution.w; const h = resolution.h;

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const mediaElMap = new Map<string, HTMLVideoElement | HTMLImageElement>();
  for (const m of media) {
    if (m.type === 'audio') continue;
    const url = URL.createObjectURL(m.blob);
    if (m.type === 'video') {
      const el = document.createElement('video');
      el.src = url; el.muted = true;
      await new Promise<void>(res => { el.oncanplay = () => res(); el.load(); });
      mediaElMap.set(m.id, el);
    } else {
      const img = new Image(); img.src = url;
      try { await img.decode(); } catch {}
      mediaElMap.set(m.id, img);
    }
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const chunks: Blob[] = [];
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: { low: 2_000_000, medium: 8_000_000, high: 20_000_000 }[settings.quality] || 8_000_000,
  });
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  recorder.start(100);
  const totalFrames = Math.ceil(duration * fps);

  const svgCache = new Map<string, HTMLImageElement>();
  for (let fi = 0; fi < totalFrames; fi++) {
    if (signal?.aborted) { svgCache.clear(); recorder.stop(); return { type: 'cancelled' }; }
    const time = fi / fps;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    await renderProjectFrame(ctx, canvas, tracks, mediaElMap, time, svgCache);
    onProgress({ stage: `Rendering frame ${fi + 1}/${totalFrames}`, percent: Math.round(5 + (fi / totalFrames) * 90) });
    // Throttle: yield to allow MediaRecorder to process
    if (fi % 5 === 0) await new Promise(r => setTimeout(r, 0));
  }
  svgCache.clear();

  await new Promise<void>(res => {
    recorder.onstop = () => res();
    recorder.stop();
  });

  for (const [, el] of mediaElMap) {
    const src = (el as HTMLVideoElement | HTMLImageElement).src;
    if (src.startsWith('blob:')) URL.revokeObjectURL(src);
  }

  const blob = new Blob(chunks, { type: mimeType });
  onProgress({ stage: 'Done', percent: 100 });
  return { type: 'complete', blob };
}

// ─── Helper functions for clip layer overlays and audio speed filters ───────────────────────────

function getSpeedFilters(speed: number): string {
  if (Math.abs(speed - 1.0) < 0.01) return '';
  const filters: string[] = [];
  let remaining = speed;
  if (remaining <= 0.01) remaining = 1.0;
  while (remaining > 2.0) {
    filters.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  if (Math.abs(remaining - 1.0) > 0.01) {
    filters.push(`atempo=${remaining.toFixed(3)}`);
  }
  return filters.join(',');
}

function renderDrawingOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, overlay: any) {
  ctx.save();
  for (const path of overlay.paths) {
    if (path.points.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = path.color;
    ctx.lineWidth = path.width * Math.min(w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
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

async function renderElementOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  overlay: any,
  svgCache: Map<string, HTMLImageElement>,
): Promise<void> {
  if (!overlay.svgContent) return;
  const cacheKey = overlay.svgContent;
  let img = svgCache.get(cacheKey);
  if (!img) {
    const svgBlob = new Blob([overlay.svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img!.onload = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      img!.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
    });
    svgCache.set(cacheKey, img);
  }

  const size = Math.min(w, h) * 0.3;
  const x = (w - size) / 2;
  const y = (h - size) / 2;
  ctx.drawImage(img, x, y, size, size);
}

function renderVFXOverlay(
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
      for (let y = -h / 2; y < h / 2; y += 3) {
        ctx.fillStyle = `rgba(0, 0, 0, ${0.15 * intensity})`;
        ctx.fillRect(-w / 2, y, w, 1);
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const vhsImageData = ctx.getImageData(0, 0, w, h);
      const vhsData = vhsImageData.data;
      const shift = Math.floor(3 * intensity);
      for (let i = 0; i < vhsData.length - shift * 4; i += 4) {
        vhsData[i] = vhsData[i + shift * 4];
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
        chrData[i] = chrCopy[i + chrOffset * 4];
        chrData[i + 2] = chrCopy[Math.max(0, i - chrOffset * 4) + 2];
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
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      break;
    }
    default:
      break;
  }

  ctx.restore();
}
