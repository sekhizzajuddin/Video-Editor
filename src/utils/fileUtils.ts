import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Project, MediaFile } from '../types';

interface VideoEditorDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { 'by-updated': number };
  };
  media: {
    key: string;
    value: { id: string; projectId: string; blob: Blob; thumbnail?: string };
    indexes: { 'by-project': string };
  };
}

let db: IDBPDatabase<VideoEditorDB> | null = null;

export async function initDB(): Promise<IDBPDatabase<VideoEditorDB>> {
  if (db) return db;
  db = await openDB<VideoEditorDB>('vidcraft-db', 1, {
    upgrade(database) {
      const projectStore = database.createObjectStore('projects', { keyPath: 'id' });
      projectStore.createIndex('by-updated', 'updatedAt');

      const mediaStore = database.createObjectStore('media', { keyPath: 'id' });
      mediaStore.createIndex('by-project', 'projectId');
    },
  });
  return db;
}

export async function saveProject(project: Project): Promise<void> {
  const database = await initDB();
  await database.put('projects', project);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const database = await initDB();
  return database.get('projects', id);
}

export async function getAllProjects(): Promise<Project[]> {
  const database = await initDB();
  return database.getAllFromIndex('projects', 'by-updated');
}

export async function deleteProject(id: string): Promise<void> {
  const database = await initDB();
  await database.delete('projects', id);
  
  const tx = database.transaction('media', 'readwrite');
  const index = tx.store.index('by-project');
  const keys = await index.getAllKeys(id);
  for (const key of keys) {
    await tx.store.delete(key);
  }
  await tx.done;
}

export async function saveMedia(id: string, projectId: string, blob: Blob, thumbnail?: string): Promise<void> {
  const database = await initDB();
  await database.put('media', { id, projectId, blob, thumbnail });
}

export async function loadMedia(id: string): Promise<Blob | undefined> {
  const database = await initDB();
  const media = await database.get('media', id);
  return media?.blob;
}

export async function getProjectMedia(projectId: string): Promise<MediaFile[]> {
  const database = await initDB();
  const tx = database.transaction('media', 'readonly');
  const index = tx.store.index('by-project');
  const mediaRecords = await index.getAll(projectId);
  
  const project = await database.get('projects', projectId);
  if (!project) return [];
  
  return mediaRecords.map((m) => {
    const originalMedia = project.media.find((med) => med.id === m.id);
    return {
      ...originalMedia!,
      blob: m.blob,
      thumbnail: m.thumbnail,
    };
  }).filter(Boolean);
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getFileType(file: File): 'video' | 'audio' | 'image' {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  return 'video';
}

export async function generateThumbnail(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (file.type.startsWith('video/') || file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 160;
        canvas.width = size;
        canvas.height = size * (img.height / img.width);
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(undefined);
      };
      if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = url;
        video.muted = true;
        video.currentTime = 1;
        video.onloadeddata = () => {
          const canvas = document.createElement('canvas');
          const size = 160;
          canvas.width = size;
          canvas.height = size * (video.videoHeight / video.videoWidth);
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
      } else {
        img.src = url;
      }
    } else {
      resolve(undefined);
    }
  });
}

export async function extractVideoFrame(blob: Blob, time: number, width: number = 320): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (!blob.type.startsWith('video/')) { resolve(undefined); return; }
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.src = url;
    video.currentTime = Math.max(0.1, time);

    const onData = () => {
      const canvas = document.createElement('canvas');
      const aspect = video.videoWidth / video.videoHeight;
      canvas.width = width;
      canvas.height = width / aspect;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      video.remove();
      resolve(canvas.toDataURL('image/jpeg', 0.5));
    };

    const onError = () => {
      URL.revokeObjectURL(url);
      video.remove();
      resolve(undefined);
    };

    video.onloadeddata = onData;
    video.onseeked = onData;
    video.onerror = onError;

    setTimeout(() => { if (!video.ended) { onError(); } }, 5000);
  });
}

export async function getMediaDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      const url = URL.createObjectURL(file);
      const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
      el.preload = 'metadata';
      el.src = url;
      el.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(el.duration);
      };
      el.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(5);
      };
    } else {
      resolve(5);
    }
  });
}