import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { ExportSettings, Project, MediaFile, Clip } from '../types';

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

  const resolutionMap: Record<string, string> = {
    '4k': '3840x2160',
    '1080p': '1920x1080',
    '720p': '1280x720',
  };
  const resolution = resolutionMap[settings.resolution] || '1920x1080';
  const [width, height] = resolution.split('x').map(Number);

  const videoTrack = project.tracks.find(t => t.type === 'video');
  const audioTrack = project.tracks.find(t => t.type === 'audio');

  if (!videoTrack || videoTrack.clips.length === 0) {
    throw new Error('No video clips to export');
  }

  const sortedVideoClips = [...videoTrack.clips].sort((a, b) => a.startTime - b.startTime);
  const tempFiles: string[] = [];

  async function processClip(clip: Clip, index: number): Promise<string> {
    const media = mediaFiles.find(m => m.id === clip.mediaId);
    if (!media) return '';

    const isImage = media.type === 'image';
    const ext = isImage ? '.png' : '.mp4';
    const inputName = `input${index}${ext}`;
    tempFiles.push(inputName);

    await ffmpeg.writeFile(inputName, await fetchFile(media.blob));

    const processedName = `proc${index}.mp4`;
    tempFiles.push(processedName);

    const filterParts: string[] = [];

    if (isImage) {
      const dur = clip.duration / clip.speed;
      filterParts.push(
        `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=duration=${dur},setpts=PTS-STARTPTS`
      );
    } else {
      let videoFilter = `[0:v]trim=start=${clip.trimStart}:end=${clip.trimEnd},setpts=PTS-STARTPTS`;
      if (clip.speed !== 1) {
        const pts = 1 / clip.speed;
        videoFilter += `,setpts=${pts}*PTS`;
      }
      videoFilter += `,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;

      if (clip.filters) {
        const { brightness, contrast, saturation } = clip.filters;
        if (brightness !== 0 || contrast !== 0 || saturation !== 0) {
          const b = brightness / 100;
          const c = 1 + contrast / 100;
          const s = 1 + saturation / 100;
          videoFilter += `,eq=brightness=${b}:contrast=${c}:saturation=${s}`;
        }
      }

      if (clip.filters?.preset === 'vintage') videoFilter += ',curves=vintage';
      else if (clip.filters?.preset === 'cool') videoFilter += ',colorbalance=rs=.1:gs=.1:bs=.3';
      else if (clip.filters?.preset === 'warm') videoFilter += ',colorbalance=rs=.3:gs=.1:bs=-.1';
      else if (clip.filters?.preset === 'bw') videoFilter += ',hue=s=0';

      filterParts.push(videoFilter);
    }

    const audioFilters: string[] = [];
    if (!isImage && clip.volume !== undefined && clip.volume !== 100) {
      const vol = clip.volume / 100;
      audioFilters.push(`volume=${vol}`);
    }
    if (!isImage && clip.speed !== 1) {
      audioFilters.push(`atempo=${clip.speed}`);
    }

    const vf = filterParts.join(',');
    const af = audioFilters.join(',');

    let codecArgs: string[];
    if (settings.format === 'webm') {
      codecArgs = ['-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-deadline', 'realtime'];
    } else {
      const crf = settings.quality === 'high' ? '18' : settings.quality === 'medium' ? '23' : '28';
      codecArgs = ['-c:v', 'libx264', '-preset', 'fast', '-crf', crf, '-pix_fmt', 'yuv420p'];
    }

    const cmd: string[] = ['-i', inputName];

    if (isImage) {
      cmd.push('-vf', vf, '-an', ...codecArgs, '-y', processedName);
    } else {
      if (af) {
        cmd.push('-vf', vf, '-af', af, ...codecArgs, '-c:a', settings.format === 'webm' ? 'libopus' : 'aac', '-b:a', '192k', '-y', processedName);
      } else {
        cmd.push('-vf', vf, ...codecArgs, '-c:a', settings.format === 'webm' ? 'libopus' : 'aac', '-b:a', '192k', '-y', processedName);
      }
    }

    await ffmpeg.exec(cmd);
    return processedName;
  }

  const processedFiles: string[] = [];
  for (let i = 0; i < sortedVideoClips.length; i++) {
    const result = await processClip(sortedVideoClips[i], i);
    if (result) processedFiles.push(result);
  }

  if (processedFiles.length === 0) {
    throw new Error('No processable clips found');
  }

  if (processedFiles.length === 1) {
    // single clip - use as is
  } else {
    const concatFileName = 'concat.txt';
    const lines = processedFiles.map(f => `file '${f}'`).join('\n');
    ffmpeg.writeFile(concatFileName, new TextEncoder().encode(lines));
    tempFiles.push(concatFileName);

    const concatName = 'merged.mp4';
    tempFiles.push(concatName);

    await ffmpeg.exec([
      '-f', 'concat', '-safe', '0', '-i', concatFileName,
      '-c', 'copy', '-y', concatName
    ]);
    processedFiles.length = 0;
    processedFiles.push(concatName);
  }

  const outputExt = settings.format === 'webm' ? 'webm' : 'mp4';
  const outputName = `output.${outputExt}`;
  tempFiles.push(outputName);

  if (audioTrack && audioTrack.clips.length > 0 && processedFiles.length > 0) {
    const sortedAudioClips = [...audioTrack.clips].sort((a, b) => a.startTime - b.startTime);
    let audioMixInputs = '';
    const audioMixFilters: string[] = [];

    for (let i = 0; i < sortedAudioClips.length; i++) {
      const clip = sortedAudioClips[i];
      const media = mediaFiles.find(m => m.id === clip.mediaId);
      if (!media) continue;

      const audioInputName = `audio_input${i}.mp3`;
      tempFiles.push(audioInputName);
      await ffmpeg.writeFile(audioInputName, await fetchFile(media.blob));

      const audioProcName = `audio_proc${i}.mp3`;
      tempFiles.push(audioProcName);

      const audioFilter = clip.speed !== 1 ? ['-af', `atempo=${clip.speed}`] : [];
      await ffmpeg.exec([
        '-i', audioInputName,
        ...audioFilter,
        '-y', audioProcName
      ]);

      audioMixInputs += ` -i ${audioProcName}`;
      const vol = (clip.volume || 100) / 100;
      const mute = clip.muted ? 0 : vol;
      audioMixFilters.push(`[${i}:a]volume=${mute}[a${i}]`);
      audioMixInputs = audioMixInputs.trim();
    }

    if (audioMixFilters.length > 0) {
      const allAudioInputs = sortedAudioClips.map((_, i) => `[a${i}]`).join('');
      const mixLabel = audioMixFilters.length > 1 ? `amix=inputs=${audioMixFilters.length}:duration=first[outa]` : `[0:a]acopy[outa]`;

      const cmd = [
        '-i', processedFiles[0],
        ...audioMixInputs.split(' ').filter(Boolean),
        '-filter_complex', `${audioMixFilters.join(';')};${allAudioInputs}${mixLabel}`,
        '-map', '0:v', '-map', '[outa]',
        ...(settings.format === 'webm'
          ? ['-c:v', 'copy', '-c:a', 'libopus', '-b:a', '192k']
          : ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k']),
        '-y', outputName
      ];

      await ffmpeg.exec(cmd);
    } else {
      if (processedFiles.length > 0) {
        await ffmpeg.exec([
          '-i', processedFiles[0],
          ...(settings.format === 'webm'
            ? ['-c:v', 'copy', '-c:a', 'libopus']
            : ['-c:v', 'copy', '-c:a', 'aac']),
          '-y', outputName
        ]);
      }
    }
  } else {
    if (processedFiles.length > 0) {
      await ffmpeg.exec([
        '-i', processedFiles[0],
        ...(settings.format === 'webm'
          ? ['-c:v', 'copy', '-c:a', 'libopus']
          : ['-c:v', 'copy', '-c:a', 'aac']),
        '-y', outputName
      ]);
    }
  }

  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data], { type: `video/${outputExt}` });

  for (const f of tempFiles) {
    try { await ffmpeg.deleteFile(f); } catch { /* ignore */ }
  }

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
