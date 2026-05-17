import { openDB, IDBPDatabase } from 'idb';
import type { Project, MediaFile } from '../types';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB('VidCraftStudio', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('media')) {
          db.createObjectStore('media', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDB();
  await db.put('projects', project);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const db = await getDB();
  return db.get('projects', id);
}

export async function getAllProjects(): Promise<Project[]> {
  const db = await getDB();
  return db.getAll('projects');
}

export async function deleteProjectFromDB(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('projects', id);
}

export async function saveMedia(media: MediaFile): Promise<void> {
  const db = await getDB();
  await db.put('media', media);
}

export async function loadMedia(id: string): Promise<MediaFile | undefined> {
  const db = await getDB();
  return db.get('media', id);
}

export async function deleteMediaFromDB(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('media', id);
}

export async function loadMediaForProject(mediaIds: string[]): Promise<MediaFile[]> {
  const db = await getDB();
  const results: MediaFile[] = [];
  for (const id of mediaIds) {
    const m = await db.get('media', id);
    if (m) results.push(m);
  }
  return results;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export function getMediaDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(media.duration || 0);
    };
    media.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load media'));
    };
    media.src = url;
  });
}

export async function generateThumbnail(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('No ctx')); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Thumbnail error')); };
    video.src = url;
  });
}

export async function extractVideoFrame(
  _mediaId: string,
  time: number,
  mediaBlobUrl: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(time, video.duration - 0.1);
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      const scale = 0.3;
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No ctx')); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.5));
    };
    video.onerror = () => reject(new Error('extractVideoFrame error'));
    video.src = mediaBlobUrl;
  });
}

export async function extractAudioWaveform(blob: Blob): Promise<number[]> {
  const audioCtx = new AudioContext();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const samples = 200;
    const blockSize = Math.floor(channelData.length / samples);
    const waveform: number[] = [];
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(channelData[i * blockSize + j] || 0);
      }
      waveform.push(sum / blockSize);
    }
    audioCtx.close();
    const max = waveform.reduce((a, b) => Math.max(a, b), 0.01);
    return waveform.map((v) => v / max);
  } catch {
    audioCtx.close();
    return [];
  }
}
