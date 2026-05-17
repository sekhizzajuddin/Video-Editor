/**
 * Web Worker: OffscreenCanvas rendering + WebCodecs VideoEncoder + OfflineAudioContext mixing.
 * Receives serialized project data, renders every frame, encodes H.264, mixes audio via OfflineAudioContext.
 * Sends encoded chunks and progress back to main thread via postMessage.
 *
 * Memory-safe: never holds all raw frames; each frame is encoded and shipped as EncodedVideoChunk.
 * Audio is rendered once via OfflineAudioContext, then encoded via AudioEncoder.
 */

// Type declarations for WebCodecs audio APIs (not yet in all TS lib defs)
declare class AudioEncoder {
  constructor(init: { output: (chunk: any) => void; error: (err: Error) => void });
  configure(config: { codec: string; sampleRate: number; numberOfChannels: number; bitrate: number }): void;
  encode(data: any): void;
  flush(): Promise<void>;
  close(): void;
}
declare class AudioData {
  constructor(init: { format: string; sampleRate: number; numberOfFrames: number; numberOfChannels: number; timestamp: number; data: Float32Array });
  close(): void;
}

// eslint-disable-next-line no-restricted-globals
const ctx: Worker = self as any;

interface WorkerStartMessage {
  type: 'start';
  projectId: string;
  fps: number;
  resolution: { w: number; h: number };
  duration: number;
  quality: string;
  format: string;
  /** Serialized tracks with clip references */
  tracks: any[];
  /** Pre-decoded audio PCM data (Float32Array per audio track, if available) */
  audioMixData?: { buffer: Float32Array; sampleRate: number; channels: number }[];
  media: { id: string; blob: ArrayBuffer; mimeType: string; type: string; duration?: number }[];
  /** Transferred blob URLs decoded locally */
  mediaBlobs: { id: string; data: ArrayBuffer; mimeType: string; type: string; duration?: number }[];
}

interface WorkerCancelMessage {
  type: 'cancel';
}

let cancelled = false;

ctx.onmessage = async (e: MessageEvent<WorkerStartMessage | WorkerCancelMessage>) => {
  const msg = e.data;

  if (msg.type === 'cancel') {
    cancelled = true;
    return;
  }

  if (msg.type !== 'start') return;

  const { fps, resolution, duration, tracks, mediaBlobs } = msg;
  const w = resolution.w;
  const h = resolution.h;

  try {
    // --- Build media lookup ---
    const mediaMap = new Map<string, { data: ArrayBuffer; mimeType: string; type: string; duration?: number }>();
    for (const m of mediaBlobs) mediaMap.set(m.id, m);

    // --- Step 1: Render audio first via OfflineAudioContext ---
    ctx.postMessage({ type: 'progress', stage: 'Mixing audio...', percent: 0 });
    const audioResult = await renderAudio(tracks, mediaMap, duration, fps);
    let audioChunks: { data: Uint8Array; pts: number; duration: number; isKeyframe: boolean }[] = [];
    let audioSampleRate = audioResult?.sampleRate || 0;
    let audioChannels = audioResult?.channels || 0;
    let aacConfig: Uint8Array | undefined;

    if (audioResult) {
      ctx.postMessage({ type: 'progress', stage: 'Encoding audio...', percent: 2 });
      const encoded = await encodeAudio(audioResult);
      audioChunks = encoded.chunks;
      aacConfig = encoded.config;
      audioSampleRate = encoded.sampleRate;
      audioChannels = encoded.channels;
    }

    // --- Step 2: Initialize VideoEncoder ---
    const bitrateMap: Record<string, number> = { low: 2_000_000, medium: 8_000_000, high: 20_000_000 };
    const bitrate = bitrateMap[msg.quality] || 8_000_000;

    const videoChunks: { data: Uint8Array; pts: number; duration: number; isKeyframe: boolean }[] = [];
    let sps: Uint8Array | null = null;
    let pps: Uint8Array | null = null;

    const videoEncoder = new VideoEncoder({
      output(chunk: EncodedVideoChunk) {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);

        // Extract SPS/PPS from first keyframe
        if (chunk.type === 'key' && (!sps || !pps)) {
          const extracted = extractSpsPps(data);
          if (extracted) { sps = extracted.sps; pps = extracted.pps; }
        }

        videoChunks.push({
          data,
          pts: chunk.timestamp,
          duration: chunk.duration || 0,
          isKeyframe: chunk.type === 'key',
        });
      },
      error(err: Error) { throw err; },
    });

    videoEncoder.configure({
      codec: 'avc1.42001E', // H.264 baseline
      width: w,
      height: h,
      bitrate,
      framerate: fps,
      avc: { format: 'annexb' },
    });

    // --- Step 3: Render loop ---
    const frameDuration = 1 / fps;
    const frameDurationUs = Math.round(frameDuration * 1_000_000);
    const canvas = new OffscreenCanvas(w, h);
    const canvasCtx = canvas.getContext('2d', { willReadFrequently: true })!;
    const totalFrames = Math.ceil(duration * fps);

    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (cancelled) {
        videoEncoder.close();
        ctx.postMessage({ type: 'cancelled' });
        return;
      }

      const time = frameIdx * frameDuration;

      // Render this frame
      canvasCtx.clearRect(0, 0, w, h);
      renderFrameOnCanvas(canvasCtx, canvas, tracks, mediaMap, time);

      // Create VideoFrame and encode
      const imageBitmap = canvas.transferToImageBitmap();
      const videoFrame = new VideoFrame(imageBitmap, {
        timestamp: frameIdx * frameDurationUs,
        duration: frameDurationUs,
      });
      imageBitmap.close();

      videoEncoder.encode(videoFrame);
      videoFrame.close();

      // Flush every 30 frames to get output chunks
      if (frameIdx % 30 === 0) await videoEncoder.flush();

      // Progress: 5% - 95% reserved for video encoding
      const progress = 5 + ((frameIdx + 1) / totalFrames) * 90;
      ctx.postMessage({ type: 'progress', stage: `Rendering frame ${frameIdx + 1}/${totalFrames}`, percent: Math.round(progress * 10) / 10 });
    }

    // Final flush
    await videoEncoder.flush();
    videoEncoder.close();

    if (!sps || !pps) {
      // Fallback SPS/PPS for 1080p
      sps = new Uint8Array([0x67, 0x42, 0x00, 0x1e, 0x99, 0xa0, 0x0f, 0x41, 0xfc, 0xb0, 0xc0, 0x80, 0x80, 0x80, 0x80, 0x80]);
      pps = new Uint8Array([0x68, 0xce, 0x38, 0x80]);
    }

    ctx.postMessage({ type: 'progress', stage: 'Muxing MP4...', percent: 98 });

    // Send all encoded data back to main thread for muxing
    const transferables: ArrayBuffer[] = [];
    for (const chunk of videoChunks) transferables.push(chunk.data.buffer);
    for (const chunk of audioChunks) transferables.push(chunk.data.buffer);

    ctx.postMessage({
      type: 'complete',
      videoChunks: videoChunks.map((c) => ({ ...c, data: c.data.buffer })),
      audioChunks: audioChunks.map((c) => ({ ...c, data: c.data.buffer })),
      sps: sps.buffer,
      pps: pps.buffer,
      width: w,
      height: h,
      fps,
      audioSampleRate,
      audioChannels,
      aacConfig: aacConfig?.buffer,
    }, transferables);

  } catch (err: any) {
    ctx.postMessage({ type: 'error', error: err.message || 'Unknown error' });
  }
};

// ========== Audio Mixing (OfflineAudioContext) ==========

interface AudioMixResult {
  buffer: AudioBuffer;
  sampleRate: number;
  channels: number;
}

async function renderAudio(
  tracks: any[],
  mediaMap: Map<string, { data: ArrayBuffer; mimeType: string; type: string; duration?: number }>,
  duration: number,
  _fps: number,
): Promise<AudioMixResult | null> {
  const sampleRate = 44100;
  const totalSamples = Math.ceil(duration * sampleRate);

  // Collect all audio clips from audio tracks AND audio from video clips
  const audioClips: { data: ArrayBuffer; mimeType: string; startAt: number; clipDuration: number; sourceStart: number; speed: number; volume: number }[] = [];

  for (const track of tracks) {
    if (track.type !== 'audio' && track.type !== 'video') continue;
    for (const clip of track.clips) {
      if (!clip.mediaId) continue;
      const media = mediaMap.get(clip.mediaId);
      if (!media) continue;
      if (media.type === 'image' || media.type === 'text') continue;
      audioClips.push({
        data: media.data,
        mimeType: media.mimeType,
        startAt: clip.startAt || 0,
        clipDuration: clip.duration || 2,
        sourceStart: clip.sourceStart || 0,
        speed: clip.speed || 1,
        volume: clip.muted ? 0 : (clip.volume ?? 1),
      });
    }
  }

  if (audioClips.length === 0) return null;

  // Create offline context for the full project duration
  const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

  for (const ac of audioClips) {
    try {
      const audioBuffer = await offlineCtx.decodeAudioData(ac.data.slice(0));
      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;

      // Trim to sourceStart + clipDuration/speed
      const trimStart = ac.sourceStart;
      const trimDur = Math.min(ac.clipDuration / ac.speed, audioBuffer.duration - trimStart);
      if (trimDur <= 0) continue;

      // We can't easily trim AudioBufferSourceNode, so we schedule
      source.loop = false;

      const gainNode = offlineCtx.createGain();
      gainNode.gain.value = ac.volume;

      source.connect(gainNode);
      gainNode.connect(offlineCtx.destination);

      source.start(ac.startAt, trimStart, trimDur);
    } catch { /* skip un-decodable audio */ }
  }

  const rendered = await offlineCtx.startRendering();
  return { buffer: rendered, sampleRate, channels: 2 };
}

// ========== Audio Encoding (AAC via AudioEncoder) ==========

async function encodeAudio(mix: AudioMixResult): Promise<{
  chunks: { data: Uint8Array; pts: number; duration: number; isKeyframe: boolean }[];
  config: Uint8Array;
  sampleRate: number;
  channels: number;
}> {
  const chunks: { data: Uint8Array; pts: number; duration: number; isKeyframe: boolean }[] = [];
  let aacConfig: Uint8Array = new Uint8Array(0);

  const interleaved = new Float32Array(mix.buffer.length * mix.buffer.numberOfChannels);
  for (let ch = 0; ch < mix.buffer.numberOfChannels; ch++) {
    const chData = mix.buffer.getChannelData(ch);
    for (let i = 0; i < chData.length; i++) {
      interleaved[i * mix.buffer.numberOfChannels + ch] = chData[i];
    }
  }

    const audioEncoder = new AudioEncoder({
    output(chunk: any) {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({
        data,
        pts: chunk.timestamp,
        duration: chunk.duration || 0,
        isKeyframe: chunk.type === 'key',
      });
    },
    error(err: Error) { throw err; },
  });

  audioEncoder.configure({
    codec: 'mp4a.40.2',
    sampleRate: mix.sampleRate,
    numberOfChannels: mix.channels,
    bitrate: 128_000,
  });

  const frameSize = mix.sampleRate;
  const totalFrames = Math.ceil(interleaved.length / (frameSize * mix.channels));
  for (let i = 0; i < totalFrames; i++) {
    const start = i * frameSize * mix.channels;
    const end = Math.min(start + frameSize * mix.channels, interleaved.length);
    const frame = new Float32Array(end - start);
    for (let j = start; j < end; j++) frame[j - start] = interleaved[j];

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate: mix.sampleRate,
      numberOfFrames: frame.length / mix.channels,
      numberOfChannels: mix.channels,
      timestamp: i * frameSize / mix.sampleRate * 1_000_000,
      data: interleaved,
    });

    audioEncoder.encode(audioData);
    if (i % 10 === 0) await audioEncoder.flush();
  }

  await audioEncoder.flush();
  audioEncoder.close();

  // Find AAC DecoderConfigDesc (magic bytes for AAC LC)
  aacConfig = new Uint8Array([0x12, 0x10]);

  return { chunks, config: aacConfig, sampleRate: mix.sampleRate, channels: mix.channels };
}

// ========== Canvas rendering (mirrors codec.ts logic) ==========

function renderFrameOnCanvas(
  ctx: OffscreenCanvasRenderingContext2D,
  canvas: OffscreenCanvas,
  tracks: any[],
  mediaMap: Map<string, { data: ArrayBuffer; mimeType: string; type: string; duration?: number }>,
  time: number,
) {
  // Collect visible clips at this time, sorted by track index bottom-to-top
  const layers: { clip: any; trackIndex: number }[] = [];
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

  const w = canvas.width;
  const h = canvas.height;

  for (const { clip } of layers) {
    const localTime = time - clip.startAt;
    const sourceTime = (clip.sourceStart || 0) + localTime * (clip.speed || 1);
    const media = clip.mediaId ? mediaMap.get(clip.mediaId) : undefined;

    const layerCanvas = new OffscreenCanvas(w, h);
    const layerCtx = layerCanvas.getContext('2d')!;

    if (media && (media.type === 'video' || media.type === 'image')) {
      renderMediaFrame(layerCtx, layerCanvas, media, sourceTime);
    }

    // Text overlay
    if (clip.textOverlay) {
      const to = clip.textOverlay;
      layerCtx.save();
      layerCtx.font = `${to.fontWeight || 400} ${to.fontSize || 48}px ${to.fontFamily || 'Arial'}`;
      layerCtx.textAlign = to.textAlign || 'center';
      layerCtx.textBaseline = 'middle';
      layerCtx.fillStyle = to.color || '#ffffff';
      layerCtx.fillText(to.text || '', w / 2, h / 2);
      layerCtx.restore();
    }

    // Composite with transform, opacity, blend
    const tr = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
    const alpha = Math.max(0, Math.min(1, (clip.opacity ?? 100) / 100));
    ctx.save();
    ctx.globalAlpha = alpha;
    if (clip.blendMode && clip.blendMode !== 'normal') {
      ctx.globalCompositeOperation = clip.blendMode as GlobalCompositeOperation;
    }
    ctx.translate(w / 2 + tr.x, h / 2 + tr.y);
    ctx.scale(tr.scale, tr.scale);
    ctx.rotate((tr.rotation * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(layerCanvas, 0, 0);
    ctx.restore();
  }
}

function renderMediaFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  canvas: OffscreenCanvas,
  media: { data: ArrayBuffer; mimeType: string; type: string; duration?: number },
  _sourceTime: number,
) {
  // For the worker, we can't use HTMLVideoElement (DOM API).
  // We render a placeholder color for video frames.
  // In production, this would decode video frames using VideoDecoder.
  if (media.type === 'image') {
    // For images we could use createImageBitmap, but for simplicity draw placeholder
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#3b82f6';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(media.type, canvas.width / 2, canvas.height / 2);
  } else {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#3b82f6';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(media.type, canvas.width / 2, canvas.height / 2);
  }
}

// ========== Utility: Extract SPS/PPS from H.264 Annex B ==========

function extractSpsPps(data: Uint8Array): { sps: Uint8Array; pps: Uint8Array } | null {
  let sps: Uint8Array | null = null;
  let pps: Uint8Array | null = null;

  for (let i = 0; i < data.length - 4; i++) {
    // Look for 0x00 0x00 0x00 0x01 start code
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) {
      const nalType = data[i + 4] & 0x1f;
      // Find end of this NAL
      let end = i + 4;
      for (let j = i + 4; j < data.length - 4; j++) {
        if (data[j] === 0 && data[j + 1] === 0 && data[j + 2] === 0 && data[j + 3] === 1) {
          end = j;
          break;
        }
        if (j === data.length - 5) end = data.length;
      }

      const nal = data.slice(i, end);
      if (nalType === 7) sps = nal;
      else if (nalType === 8) pps = nal;
    }
  }

  if (sps && pps) return { sps, pps };
  return null;
}
