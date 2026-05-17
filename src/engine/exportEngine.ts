/**
 * exportEngine.ts — Uses @ffmpeg/ffmpeg (WebAssembly) to encode and mux video/audio.
 * Falls back to WebM via MediaRecorder if FFmpeg fails to load.
 */

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

  // Render all frames sequentially
  const rawFrames: ImageData[] = [];
  for (let fi = 0; fi < totalFrames; fi++) {
    if (signal?.aborted) { ffmpeg.terminate(); return { type: 'cancelled' }; }
    const time = fi * frameInterval;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    renderProjectFrame(ctx, canvas, tracks, mediaElMap, time);
    rawFrames.push(ctx.getImageData(0, 0, w, h));
    if (fi % 30 === 0) onProgress({ stage: `Rendering frame ${fi + 1}/${totalFrames}`, percent: Math.round(10 + (fi / totalFrames) * 50) });
  }

  // Write frames as PNG sequence to FFmpeg FS
  onProgress({ stage: 'Writing frames to encoder...', percent: 60 });
  for (let fi = 0; fi < rawFrames.length; fi++) {
    const imgCanvas = document.createElement('canvas');
    imgCanvas.width = w; imgCanvas.height = h;
    const imgCtx = imgCanvas.getContext('2d')!;
    imgCtx.putImageData(rawFrames[fi], 0, 0);
    const blob = await new Promise<Blob>(res => imgCanvas.toBlob(b => res(b!), 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    await ffmpeg.writeFile(`frame${String(fi).padStart(6, '0')}.png`, buf);
    if (fi % 60 === 0) onProgress({ stage: `Writing frame ${fi + 1}/${rawFrames.length}`, percent: Math.round(60 + (fi / rawFrames.length) * 20) });
  }

  if (signal?.aborted) { ffmpeg.terminate(); return { type: 'cancelled' }; }

  // Build FFmpeg command
  onProgress({ stage: 'Encoding video...', percent: 80 });
  const crf = { low: '35', medium: '23', high: '18' }[settings.quality] || '23';
  const outputFile = `output.${settings.format === 'webm' ? 'webm' : settings.format === 'mp3' ? 'mp3' : settings.format === 'wav' ? 'wav' : 'mp4'}`;

  const ffmpegArgs: string[] = [];
  ffmpegArgs.push('-framerate', String(fps), '-i', 'frame%06d.png');

  // Add audio inputs
  let hasAudio = false;
  for (const m of media) {
    if (m.type === 'audio' || m.type === 'video') {
      const ext = m.mimeType.split('/')[1]?.split(';')[0] || 'mp4';
      const fname = `input_${m.id}.${ext}`;
      ffmpegArgs.push('-i', fname);
      hasAudio = true;
      break;
    }
  }

  if (settings.format === 'mp4') {
    ffmpegArgs.push('-c:v', 'libx264', '-crf', crf, '-preset', 'fast', '-pix_fmt', 'yuv420p');
    if (hasAudio) ffmpegArgs.push('-c:a', 'aac', '-b:a', '128k');
  } else if (settings.format === 'webm') {
    ffmpegArgs.push('-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0');
    if (hasAudio) ffmpegArgs.push('-c:a', 'libopus');
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
  const layers: { clip: any; ti: number }[] = [];
  for (let ti = 0; ti < tracks.length; ti++) {
    const t = tracks[ti];
    if (!t.visible) continue;
    for (const c of t.clips) {
      if (time >= c.startAt && time < c.startAt + c.duration) layers.push({ clip: c, ti });
    }
  }
  layers.sort((a, b) => a.ti - b.ti);

  for (const { clip } of layers) {
    const tr = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
    const alpha = Math.max(0, Math.min(1, (clip.opacity ?? 100) / 100));
    const localTime = time - clip.startAt;
    const sourceTime = (clip.sourceStart || 0) + localTime * (clip.speed || 1);

    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = w; layerCanvas.height = h;
    const lCtx = layerCanvas.getContext('2d')!;

    if (clip.mediaId) {
      const el = mediaElMap.get(clip.mediaId);
      if (el instanceof HTMLVideoElement) {
        if (Math.abs(el.currentTime - sourceTime) > 0.08) el.currentTime = sourceTime;
        if (el.videoWidth > 0) {
          lCtx.fillStyle = '#000'; lCtx.fillRect(0, 0, w, h);
          const sw = el.videoWidth; const sh = el.videoHeight;
          const ratio = Math.min(w / sw, h / sh);
          const dx = (w - sw * ratio) / 2; const dy = (h - sh * ratio) / 2;
          lCtx.drawImage(el, dx, dy, sw * ratio, sh * ratio);
        }
      } else if (el instanceof HTMLImageElement && el.complete) {
        lCtx.fillStyle = '#000'; lCtx.fillRect(0, 0, w, h);
        const ratio = Math.min(w / el.naturalWidth, h / el.naturalHeight);
        const dx = (w - el.naturalWidth * ratio) / 2; const dy = (h - el.naturalHeight * ratio) / 2;
        lCtx.drawImage(el, dx, dy, el.naturalWidth * ratio, el.naturalHeight * ratio);
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
      lCtx.fillText(to.text || '', w / 2 + (tr.x || 0), h / 2 + (tr.y || 0));
      lCtx.restore();
    }

    if (clip.trackType === 'sticker' && clip.sticker) {
      lCtx.save(); lCtx.font = `${Math.round(h * 0.15)}px sans-serif`;
      lCtx.textAlign = 'center'; lCtx.textBaseline = 'middle';
      lCtx.fillText(clip.sticker, w / 2 + (tr.x || 0), h / 2 + (tr.y || 0));
      lCtx.restore();
    }

    if (clip.trackType === 'audio') continue;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (clip.blendMode && clip.blendMode !== 'normal') ctx.globalCompositeOperation = clip.blendMode;
    ctx.translate(w / 2 + tr.x, h / 2 + tr.y);
    ctx.scale(tr.scale || 1, tr.scale || 1);
    ctx.rotate(((tr.rotation || 0) * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(layerCanvas, 0, 0);
    ctx.restore();
  }
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
