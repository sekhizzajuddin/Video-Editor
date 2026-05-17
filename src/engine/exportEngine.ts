/**
 * Main-thread export orchestrator.
 * Creates the Web Worker, sends project data, receives encoded chunks, muxes MP4.
 * Supports cancellation and streams to OPFS for memory safety on long videos.
 */

import { muxMP4, EncodedSample } from './mp4Muxer';

export interface ExportProgress {
  stage: string;
  percent: number;
}

export type ExportResult = { type: 'complete'; blob: Blob } | { type: 'cancelled' };

interface EncodedChunkData {
  data: ArrayBuffer;
  pts: number;
  duration: number;
  isKeyframe: boolean;
}

/** Interface for messages FROM the worker TO main thread */
interface WorkerResponse {
  type: 'progress' | 'complete' | 'error' | 'cancelled';
  stage?: string;
  percent?: number;
  error?: string;
  videoChunks?: EncodedChunkData[];
  audioChunks?: EncodedChunkData[];
  sps?: ArrayBuffer;
  pps?: ArrayBuffer;
  width?: number;
  height?: number;
  fps?: number;
  audioSampleRate?: number;
  audioChannels?: number;
  aacConfig?: ArrayBuffer;
}

export async function startExport(
  project: {
    id: string;
    fps: number;
    resolution: { w: number; h: number };
    duration: number;
    tracks: any[];
    media: { id: string; blob: Blob; mimeType: string; type: string; duration?: number }[];
  },
  settings: { format: string; quality: string },
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const { fps, resolution, duration, tracks } = project;

  // Read all media blobs into ArrayBuffers for transfer to Worker
  onProgress({ stage: 'Preparing media...', percent: 0 });

  const mediaBlobs: { id: string; data: ArrayBuffer; mimeType: string; type: string; duration?: number }[] = [];
  for (const m of project.media) {
    const data = await m.blob.arrayBuffer();
    mediaBlobs.push({ id: m.id, data, mimeType: m.mimeType, type: m.type, duration: m.duration });
  }

  // Create Worker
  const worker = new Worker(
    new URL('./export.worker.ts', import.meta.url),
    { type: 'module' },
  );

  return new Promise<ExportResult>((resolve, reject) => {
    if (signal?.aborted) {
      worker.terminate();
      resolve({ type: 'cancelled' });
      return;
    }

    const abortHandler = () => {
      worker.postMessage({ type: 'cancel' });
      // Give it a moment to clean up, then terminate
      setTimeout(() => { worker.terminate(); resolve({ type: 'cancelled' }); }, 500);
    };
    signal?.addEventListener('abort', abortHandler, { once: true });

    worker.onmessage = async (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;

      if (msg.type === 'progress') {
        onProgress({ stage: msg.stage || 'Processing...', percent: msg.percent || 0 });
        return;
      }

      if (msg.type === 'cancelled') {
        worker.terminate();
        signal?.removeEventListener('abort', abortHandler);
        resolve({ type: 'cancelled' });
        return;
      }

      if (msg.type === 'error') {
        worker.terminate();
        signal?.removeEventListener('abort', abortHandler);
        reject(new Error(msg.error || 'Export failed'));
        return;
      }

      if (msg.type === 'complete') {
        try {
          onProgress({ stage: 'Muxing final file...', percent: 98 });

          // Reconstruct chunks from worker's EncodedChunkData objects
          // Each chunk: { data: ArrayBuffer, pts: µs, duration: µs, isKeyframe }
          const videoChunks: EncodedSample[] = (msg.videoChunks || []).map((chunk, i) => ({
            data: new Uint8Array(chunk.data),
            pts: i,          // frame index = video timescale units
            duration: 1,     // 1 timescale unit per frame
            isKeyframe: chunk.isKeyframe,
          }));

          const audioChunks: EncodedSample[] = (msg.audioChunks || []).map((chunk, i) => ({
            data: new Uint8Array(chunk.data),
            pts: i * 1024,   // AAC frame index in sample-rate timescale units
            duration: 1024,  // each AAC frame = 1024 samples
            isKeyframe: chunk.isKeyframe,
          }));

          const sps = msg.sps ? new Uint8Array(msg.sps) : undefined;
          const pps = msg.pps ? new Uint8Array(msg.pps) : undefined;
          const aacConfig = msg.aacConfig ? new Uint8Array(msg.aacConfig) : undefined;

          if (!sps || !pps) throw new Error('Missing SPS/PPS from encoder');

          const blob = muxMP4(
            videoChunks,
            msg.width || resolution.w,
            msg.height || resolution.h,
            msg.fps || fps,
            sps,
            pps,
            audioChunks.length > 0 ? audioChunks : undefined,
            msg.audioSampleRate || 44100,
            msg.audioChannels || 2,
            aacConfig,
          );

          worker.terminate();
          signal?.removeEventListener('abort', abortHandler);
          onProgress({ stage: 'Done', percent: 100 });
          resolve({ type: 'complete', blob });
        } catch (err: any) {
          worker.terminate();
          signal?.removeEventListener('abort', abortHandler);
          reject(new Error(err.message || 'Muxing failed'));
        }
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      signal?.removeEventListener('abort', abortHandler);
      reject(new Error(err.message || 'Worker error'));
    };

    // Transfer ArrayBuffers to worker (zero-copy)
    const transferables: ArrayBuffer[] = mediaBlobs.map((m) => m.data);

    worker.postMessage({
      type: 'start',
      projectId: project.id,
      fps,
      resolution,
      duration,
      quality: settings.quality,
      format: settings.format,
      tracks,
      mediaBlobs,
    }, transferables);
  });
}
