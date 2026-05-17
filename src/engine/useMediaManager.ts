import { useCallback, useRef, useEffect } from 'react';
import { MediaFile } from '../types';
import { useEditorStore } from '../store/editorStore';

const MAX_CACHE_SIZE = 30;

class MediaCache {
  private urls = new Map<string, string>();
  private lru: string[] = [];

  get(id: string): string | undefined {
    return this.urls.get(id);
  }

  set(id: string, blob: Blob): string {
    const existing = this.urls.get(id);
    if (existing) {
      URL.revokeObjectURL(existing);
      this.lru = this.lru.filter((k) => k !== id);
    }
    const url = URL.createObjectURL(blob);
    this.urls.set(id, url);
    this.lru.push(id);
    if (this.lru.length > MAX_CACHE_SIZE) {
      const oldest = this.lru.shift();
      if (oldest) this.revoke(oldest);
    }
    return url;
  }

  revoke(id: string) {
    const url = this.urls.get(id);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(id);
    this.lru = this.lru.filter((k) => k !== id);
  }

  clear() {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.lru = [];
  }

  has(id: string): boolean {
    return this.urls.has(id);
  }
}

const globalCache = new MediaCache();

export function getMediaUrl(mediaId: string): string | undefined {
  const cached = globalCache.get(mediaId);
  if (cached) return cached;

  const media = useEditorStore.getState().project.media.find((m) => m.id === mediaId);
  if (!media) return undefined;
  return globalCache.set(mediaId, media.blob);
}

export function registerMediaUrl(mediaId: string, blob: Blob): string {
  return globalCache.set(mediaId, blob);
}

export function revokeMediaUrl(mediaId: string) {
  globalCache.revoke(mediaId);
}

export function clearMediaCache() {
  globalCache.clear();
}

export async function generateThumbnail(media: MediaFile, width = 320, height = 180): Promise<string | undefined> {
  if (media.type === 'audio') return undefined;

  const url = registerMediaUrl(media.id, media.blob);
  try {
    if (media.type === 'image') {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL('image/webp', 0.7);
    }

    if (media.type === 'video') {
      const video = document.createElement('video');
      video.src = url;
      video.crossOrigin = 'anonymous';
      await video.load();
      video.currentTime = Math.min(media.duration || 0, 1);
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.onseeked = null;
          video.oncanplay = null;
          resolve();
        };
        if (video.readyState >= 2) {
          video.onseeked = onSeeked;
        } else {
          video.oncanplay = () => {
            video.oncanplay = null;
            video.currentTime = Math.min(media.duration || 0, 1);
            video.onseeked = onSeeked;
          };
        }
      });
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, width, height);
      video.pause();
      video.removeAttribute('src');
      video.load();
      return canvas.toDataURL('image/webp', 0.7);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function generateWaveformData(media: MediaFile, buckets = 80): Promise<number[]> {
  // Works for BOTH audio AND video files
  if (media.type !== 'audio' && media.type !== 'video') return [];
  const audioCtx = new AudioContext();
  try {
    const arrayBuffer = await media.blob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    const samplesPerBucket = Math.floor(channel.length / buckets);
    const waveform: number[] = [];
    for (let i = 0; i < buckets; i++) {
      let sum = 0;
      for (let j = 0; j < samplesPerBucket; j++) sum += Math.abs(channel[i * samplesPerBucket + j]);
      waveform.push(sum / samplesPerBucket);
    }
    audioCtx.close();
    const max = waveform.reduce((a, b) => Math.max(a, b), 0.001);
    return waveform.map((v) => v / max);
  } catch {
    audioCtx.close();
    return [];
  }
}

/** Generate N evenly-spaced filmstrip frames from a video MediaFile */
export async function generateFilmstrip(media: MediaFile, numFrames = 8): Promise<string[]> {
  if (media.type !== 'video') return [];
  const url = registerMediaUrl(media.id, media.blob);
  return new Promise<string[]>(resolve => {
    const video = document.createElement('video');
    video.muted = true; video.crossOrigin = 'anonymous'; video.preload = 'metadata';
    const frames: string[] = [];
    let idx = 0;
    const timeout = setTimeout(() => resolve(frames), 12000);

    const captureFrame = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 80; canvas.height = 45;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, 80, 45);
      frames.push(canvas.toDataURL('image/jpeg', 0.55));
      idx++;
      if (idx >= numFrames) { clearTimeout(timeout); video.pause(); video.removeAttribute('src'); resolve(frames); }
      else video.currentTime = (idx / numFrames) * (video.duration || 10);
    };

    video.onseeked = captureFrame;
    video.onloadedmetadata = () => { video.currentTime = 0; };
    video.onerror = () => { clearTimeout(timeout); resolve(frames); };
    video.src = url;
  });
}


export function useMediaManager() {
  const cleanupRef = useRef(false);

  useEffect(() => {
    return () => {
      cleanupRef.current = true;
    };
  }, []);

  const getUrl = useCallback((mediaId: string): string | undefined => {
    return getMediaUrl(mediaId);
  }, []);

  const revoke = useCallback((mediaId: string) => {
    revokeMediaUrl(mediaId);
  }, []);

  const refreshMediaUrl = useCallback((mediaId: string): string | undefined => {
    revokeMediaUrl(mediaId);
    const media = useEditorStore.getState().project.media.find((m) => m.id === mediaId);
    if (!media) return undefined;
    return globalCache.set(mediaId, media.blob);
  }, []);

  return { getUrl, revoke, refreshMediaUrl, cache: globalCache };
}
