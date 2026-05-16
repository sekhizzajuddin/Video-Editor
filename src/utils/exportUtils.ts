import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { ExportSettings, Project, MediaFile } from '../types';

let ffmpeg: FFmpeg | null = null;
let loaded = false;

export async function loadFFmpeg(onProgress?: (progress: number) => void): Promise<FFmpeg> {
  if (ffmpeg && loaded) return ffmpeg;
  
  ffmpeg = new FFmpeg();
  
  ffmpeg.on('progress', ({ progress }) => {
    onProgress?.(progress * 100);
  });
  
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  
  loaded = true;
  return ffmpeg;
}

export async function exportVideo(
  project: Project,
  mediaFiles: MediaFile[],
  settings: ExportSettings,
  onProgress: (progress: number) => void
): Promise<Blob> {
  const ffmpeg = await loadFFmpeg(onProgress);
  
  const resolution = settings.resolution === '4k' ? '3840x2160' : 
                     settings.resolution === '1080p' ? '1920x1080' : '1280x720';
  
  const [width, height] = resolution.split('x').map(Number);
  
  const videoClips = project.tracks
    .find(t => t.type === 'video')?.clips || [];
  
  if (videoClips.length === 0) {
    throw new Error('No video clips to export');
  }
  
  const inputPaths: string[] = [];
  const filterParts: string[] = [];
  let concatInputs = '';
  
  for (let i = 0; i < videoClips.length; i++) {
    const clip = videoClips[i];
    const media = mediaFiles.find(m => m.id === clip.mediaId);
    
    if (!media) continue;
    
    const inputName = `input${i}.mp4`;
    inputPaths.push(inputName);
    
    await ffmpeg.writeFile(inputName, await fetchFile(media.blob));
    
    let filters = '';
    
    if (clip.filters) {
      const { brightness, contrast, saturation } = clip.filters;
      if (brightness !== 0 || contrast !== 0 || saturation !== 0) {
        const eq = `brightness=${brightness/100}:contrast=${1+contrast/100}:saturation=${1+saturation/100}`;
        filters += `,eq=${eq}`;
      }
    }
    
    const speed = clip.speed !== 1 ? `,setpts=${1/clip.speed}PTS` : '';
    const trim = `[0:v]trim=start=${clip.trimStart}:end=${clip.trimEnd},setpts=PTS-STARTPTS${speed},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2${filters}[v${i}]`;
    
    filterParts.push(trim);
    concatInputs += `[v${i}]`;
  }
  
  if (videoClips.length === 1) {
    filterParts.push(`${concatInputs}concat=n=1:v=1:a=0[v]`);
  } else {
    filterParts.push(`${concatInputs}concat=n=${videoClips.length}:v=1:a=0[v]`);
  }
  
  const outputName = settings.format === 'webm' ? 'output.webm' : 'output.mp4';
  const codec = settings.format === 'webm' 
    ? ['-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0']
    : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23'];
  
  const command = [
    '-filter_complex', filterParts.join(';'),
    '-map', '[v]',
    ...codec,
    '-y',
    outputName
  ];
  
  await ffmpeg.exec(command);
  
  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data], { type: settings.format === 'webm' ? 'video/webm' : 'video/mp4' });
  
  for (const path of inputPaths) {
    await ffmpeg.deleteFile(path);
  }
  await ffmpeg.deleteFile(outputName);
  
  return blob;
}

export async function exportAudioOnly(
  project: Project,
  mediaFiles: MediaFile[],
  onProgress: (progress: number) => void
): Promise<Blob> {
  const ffmpeg = await loadFFmpeg(onProgress);
  
  const audioClips = project.tracks
    .find(t => t.type === 'audio')?.clips || [];
  
  if (audioClips.length === 0) {
    throw new Error('No audio clips to export');
  }
  
  const inputPaths: string[] = [];
  
  for (let i = 0; i < audioClips.length; i++) {
    const clip = audioClips[i];
    const media = mediaFiles.find(m => m.id === clip.mediaId);
    
    if (!media) continue;
    
    const inputName = `input${i}.mp3`;
    inputPaths.push(inputName);
    await ffmpeg.writeFile(inputName, await fetchFile(media.blob));
  }
  
  await ffmpeg.exec([
    '-i', inputPaths[0],
    '-acodec', 'libmp3lame',
    '-y',
    'output.mp3'
  ]);
  
  const data = await ffmpeg.readFile('output.mp3');
  const blob = new Blob([data], { type: 'audio/mp3' });
  
  for (const path of inputPaths) {
    await ffmpeg.deleteFile(path);
  }
  await ffmpeg.deleteFile('output.mp3');
  
  return blob;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}