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
    media: { id: string; blob: Blob; mimeType: string; type: string; duration?: number }[];
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
      await new Promise<void>(res => { el.oncanplay = () => res(); el.load(); });
      mediaElMap.set(m.id, el);
    } else if (m.type === 'image') {
      const img = new Image(); img.src = url;
      try { await img.decode(); } catch {}
      mediaElMap.set(m.id, img);
    }
  }

  if (signal?.aborted) { ffmpeg.terminate(); return { type: 'cancelled' }; }

  // Render and write all frames sequentially directly to FFmpeg virtual FS
  for (let fi = 0; fi < totalFrames; fi++) {
    if (signal?.aborted) { ffmpeg.terminate(); return { type: 'cancelled' }; }
    const time = fi * frameInterval;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    renderProjectFrame(ctx, canvas, tracks, mediaElMap, time);
    
    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    await ffmpeg.writeFile(`frame${String(fi).padStart(6, '0')}.png`, buf);

    if (fi % 30 === 0) {
      onProgress({
        stage: `Rendering and writing frame ${fi + 1}/${totalFrames}`,
        percent: Math.round(10 + (fi / totalFrames) * 70),
      });
    }
  }

  if (signal?.aborted) { ffmpeg.terminate(); return { type: 'cancelled' }; }

  // Build FFmpeg command
  onProgress({ stage: 'Encoding video...', percent: 80 });
  const crf = { low: '35', medium: '23', high: '18' }[settings.quality] || '23';
  const outputFile = `output.${settings.format === 'webm' ? 'webm' : settings.format === 'mp3' ? 'mp3' : settings.format === 'wav' ? 'wav' : 'mp4'}`;

  const ffmpegArgs: string[] = [];
  ffmpegArgs.push('-framerate', String(fps), '-i', 'frame%06d.png');

  // Add audio inputs
  let audioInputCount = 0;
  const audioInputs: string[] = [];
  for (const m of media) {
    if (m.type === 'audio' || m.type === 'video') {
      const ext = m.mimeType.split('/')[1]?.split(';')[0] || 'mp4';
      const fname = `input_${m.id}.${ext}`;
      ffmpegArgs.push('-i', fname);
      audioInputs.push(`[${audioInputCount + 1}:a]`);
      audioInputCount++;
    }
  }
  const hasAudio = audioInputCount > 0;

  if (settings.format === 'mp4') {
    ffmpegArgs.push('-c:v', 'libx264', '-crf', crf, '-preset', 'fast', '-pix_fmt', 'yuv420p');
    if (hasAudio) {
      if (audioInputCount > 1) {
        const amixFilter = audioInputs.join('') + `amix=inputs=${audioInputCount}:duration=longest[aout]`;
        ffmpegArgs.push('-filter_complex', amixFilter, '-map', '[aout]', '-c:a', 'aac', '-b:a', '128k');
      } else {
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '128k');
      }
    }
  } else if (settings.format === 'webm') {
    ffmpegArgs.push('-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0');
    if (hasAudio) {
      if (audioInputCount > 1) {
        const amixFilter = audioInputs.join('') + `amix=inputs=${audioInputCount}:duration=longest[aout]`;
        ffmpegArgs.push('-filter_complex', amixFilter, '-map', '[aout]', '-c:a', 'libopus');
      } else {
        ffmpegArgs.push('-c:a', 'libopus');
      }
    }
  } else if (settings.format === 'mp3' || settings.format === 'wav') {
    ffmpegArgs.splice(0, ffmpegArgs.length, '-i', `input_${media.find(m => m.type === 'audio')?.id}.mp3`);
  }
  ffmpegArgs.push('-t', String(duration), outputFile);

  await ffmpeg.exec(ffmpegArgs);

  onProgress({ stage: 'Packaging output...', percent: 97 });
  const outData = await ffmpeg.readFile(outputFile);
  const mimeMap: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav' };
  const blob = new Blob([outData], { type: mimeMap[settings.format] || 'video/mp4' });

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
function renderProjectFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  tracks: any[],
  mediaElMap: Map<string, HTMLVideoElement | HTMLImageElement>,
  time: number,
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
      renderTransitionLayer(ctx, canvas, layer.clip, layer.transition.nextClip, layer.transition.type, layer.transition.progress, mediaElMap, time, w, h);
    } else {
      renderClipLayer(ctx, canvas, layer.clip, mediaElMap, time, w, h);
    }
  }
}

function renderClipLayer(
  ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement, clip: any,
  mediaElMap: Map<string, HTMLVideoElement | HTMLImageElement>, time: number, w: number, h: number,
) {
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
      if (Math.abs(el.currentTime - sourceTime) > 0.08) el.currentTime = sourceTime;
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

function renderTransitionLayer(
  ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement,
  clipA: any, clipB: any, type: string, progress: number,
  mediaElMap: Map<string, HTMLVideoElement | HTMLImageElement>, time: number,
  w: number, h: number,
) {
  const canvasA = document.createElement('canvas');
  canvasA.width = w; canvasA.height = h;
  const ctxA = canvasA.getContext('2d')!;
  renderClipLayer(ctxA, canvasA, clipA, mediaElMap, time, w, h);

  const canvasB = document.createElement('canvas');
  canvasB.width = w; canvasB.height = h;
  const ctxB = canvasB.getContext('2d')!;
  const transOffset = progress * (clipA.transition?.duration || 0.3);
  renderClipLayer(ctxB, canvasB, clipB, mediaElMap, clipB.startAt + transOffset, w, h);

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

  for (let fi = 0; fi < totalFrames; fi++) {
    if (signal?.aborted) { recorder.stop(); return { type: 'cancelled' }; }
    const time = fi / fps;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    renderProjectFrame(ctx, canvas, tracks, mediaElMap, time);
    onProgress({ stage: `Rendering frame ${fi + 1}/${totalFrames}`, percent: Math.round(5 + (fi / totalFrames) * 90) });
    // Throttle: yield to allow MediaRecorder to process
    if (fi % 5 === 0) await new Promise(r => setTimeout(r, 0));
  }

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
