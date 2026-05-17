import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { Track, ExportSettings, ExportFormat } from '../types';

let ffmpeg: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
  }
  return ffmpeg;
}

export interface ExportProgress {
  stage: string;
  percent: number;
}

function getFileExt(mimeType: string, format?: ExportFormat): string {
  if (format === 'mp3') return 'mp3';
  if (format === 'wav') return 'wav';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('aac')) return 'aac';
  return 'mp4';
}

export async function exportVideo(
  tracks: Track[],
  _duration: number,
  settings: ExportSettings,
  mediaBlobMap: Map<string, { blob: Blob; url: string }>,
  onProgress?: (p: ExportProgress) => void
): Promise<Blob> {
  const ff = await getFFmpeg();
  ff.on('progress', ({ progress }: { progress: number }) => {
    onProgress?.({ stage: 'Encoding...', percent: Math.min(Math.round(progress * 100), 99) });
  });

  const audioOnly = settings.format === 'mp3' || settings.format === 'wav';
  const resolutionMap: Record<string, string> = { '720p': '1280:720', '1080p': '1920:1080', '4k': '3840:2160' };
  const res = resolutionMap[settings.resolution] || '1920:1080';
  const qualityMap: Record<string, string> = { low: '28', medium: '23', high: '18' };
  const crf = qualityMap[settings.quality] || '23';

  const codecMap: Record<ExportFormat, { vcodec?: string; acodec: string; ext: string }> = {
    mp4: { vcodec: 'libx264', acodec: 'aac', ext: 'mp4' },
    webm: { vcodec: 'libvpx-vp9', acodec: 'libopus', ext: 'webm' },
    mp3: { acodec: 'libmp3lame', ext: 'mp3' },
    wav: { acodec: 'pcm_s16le', ext: 'wav' },
  };
  const codec = codecMap[settings.format];

  // Write all input files to FFmpeg virtual FS
  const videoClips: { name: string; trackIdx: number; clip: any }[] = [];
  const audioClips: { name: string; trackIdx: number; clip: any }[] = [];
  let fileIdx = 0;

  const visibleVideo = tracks.filter((t) => t.type === 'video' && t.visible && t.clips.length > 0);
  const visibleAudio = tracks.filter((t) => t.type === 'audio' && t.visible && t.clips.length > 0);

  for (const track of visibleVideo) {
    for (const clip of track.clips) {
      const mb = mediaBlobMap.get(clip.mediaId || '');
      if (!mb) continue;
      const data = await fetchFile(mb.url);
      const ext = getFileExt(mb.blob.type);
      const name = `f_${fileIdx}.${ext}`;
      await ff.writeFile(name, data);
      videoClips.push({ name, trackIdx: videoClips.length, clip });
      fileIdx++;
    }
  }
  for (const track of visibleAudio) {
    for (const clip of track.clips) {
      const mb = mediaBlobMap.get(clip.mediaId || '');
      if (!mb) continue;
      const data = await fetchFile(mb.url);
      const ext = getFileExt(mb.blob.type);
      const name = `f_${fileIdx}.${ext}`;
      await ff.writeFile(name, data);
      audioClips.push({ name, trackIdx: audioClips.length, clip });
      fileIdx++;
    }
  }

  if (videoClips.length === 0 && audioClips.length === 0) throw new Error('No clips to export');

  // ======== AUDIO-ONLY PATH ========
  if (audioOnly) {
    const allAudio = [...audioClips];
    for (const vc of videoClips) {
      allAudio.push({ name: vc.name, trackIdx: allAudio.length, clip: vc.clip });
    }
    if (allAudio.length === 0) throw new Error('No audio clips');

    const args: string[] = [];
    // Add -i for each input file
    for (const a of allAudio) args.push('-i', a.name);
    // Build amix filter
    const inputLabels = allAudio.map((_, i) => `[${i}:a]`).join('');
    const amixFilter = `${inputLabels}amix=inputs=${allAudio.length}:duration=longest:dropout_transition=2[aout]`;
    args.push('-filter_complex', amixFilter);
    args.push('-map', '[aout]');
    args.push('-c:a', codec.acodec);
    args.push(`out.${codec.ext}`);
    await ff.exec(args);
    const data = await ff.readFile(`out.${codec.ext}`);
    return new Blob([data], { type: codec.ext === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
  }

  // ======== VIDEO PATH ========
  // Build filter_complex to trim, filter, overlay, and mix audio
  const filterParts: string[] = [];
  let vOut: string | null = null;
  let aOut: string | null = null;

  // Process each video clip: trim + filter + scale
  for (let i = 0; i < videoClips.length; i++) {
    const { clip } = videoClips[i];
    const dur = clip.duration || 2;
    const sourceStart = clip.sourceStart || 0;
    const speed = clip.speed || 1;
    const hasFilter = clip.filters && (clip.filters.brightness !== 0 || clip.filters.contrast !== 0 || clip.filters.saturation !== 0 || clip.filters.preset !== 'none');

    // Trim and scale
    let vf = `[${i}:v]trim=start=${sourceStart}:duration=${dur},setpts=PTS-STARTPTS`;
    if (speed !== 1) vf += `,setpts=${1 / speed}*PTS`;
    vf += `,scale=${res}:force_original_aspect_ratio=decrease,pad=${res}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
    // Brightness/Contrast/Saturation
    if (hasFilter) {
      const b = (clip.filters!.brightness || 0) / 100;
      const c = 1 + (clip.filters!.contrast || 0) / 100;
      const s = 1 + (clip.filters!.saturation || 0) / 100;
      vf += `,eq=brightness=${b}:contrast=${c}:saturation=${s}`;
    }
    // Filter presets
    const presetFilters: Record<string, string> = {
      vintage: ',colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,curves=r="0/0 0.5/0.3 1/1":g="0/0 0.5/0.4 1/1":b="0/0 0.4/0.6 1/1"',
      cool: ',colorbalance=rs=-0.1:gs=-0.05:bs=0.15',
      warm: ',colorbalance=rs=0.1:gs=0.05:bs=-0.1',
      bw: ',colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3:0',
    };
    if (clip.filters?.preset && clip.filters.preset !== 'none' && presetFilters[clip.filters.preset]) {
      vf += presetFilters[clip.filters.preset];
    }
    // Transition
    if (clip.transition && clip.transition.type === 'fadein' && clip.transition.duration > 0) {
      vf += `,fade=t=in:st=0:d=${Math.min(clip.transition.duration, dur)}`;
    }
    if (clip.transition && clip.transition.type === 'fadeout' && clip.transition.duration > 0) {
      vf += `,fade=t=out:st=${dur - Math.min(clip.transition.duration, dur)}:d=${Math.min(clip.transition.duration, dur)}`;
    }
    const label = `v${i}`;
    filterParts.push(`${vf}[${label}]`);
  }

  // Overlay all video streams onto single output
  if (videoClips.length > 0) {
    let chain = `[v0]`;
    for (let i = 1; i < videoClips.length; i++) {
      const lbl = `ovl${i}`;
      filterParts.push(`${chain}[v${i}]overlay=format=auto:shortest=1[${lbl}]`);
      chain = `[${lbl}]`;
    }
    vOut = chain;
  }

  // Process audio clips
  let audioInputIdx = videoClips.length; // audio inputs start after video inputs
  for (let i = 0; i < audioClips.length; i++) {
    const { clip } = audioClips[i];
    const dur = clip.duration || 2;
    const sourceStart = clip.sourceStart || 0;
    const speed = clip.speed || 1;
    const vol = clip.volume || 1;
    let af = `[${audioInputIdx}:a]atrim=start=${sourceStart}:duration=${dur},asetpts=PTS-STARTPTS`;
    if (speed !== 1) af += `,atempo=${Math.min(2, Math.max(0.5, speed))}`;
    if (vol !== 1) af += `,volume=${vol}`;
    const lbl = `a${i}`;
    filterParts.push(`${af}[${lbl}]`);
    audioInputIdx++;
  }

  // Also extract audio from video clips
  const allAudioInputs: string[] = [];
  for (let i = 0; i < videoClips.length; i++) {
    const { clip } = videoClips[i];
    const dur = clip.duration || 2;
    const sourceStart = clip.sourceStart || 0;
    const speed = clip.speed || 1;
    const vol = clip.volume || 1;
    let af = `[${i}:a]atrim=start=${sourceStart}:duration=${dur},asetpts=PTS-STARTPTS`;
    if (speed !== 1) af += `,atempo=${Math.min(2, Math.max(0.5, speed))}`;
    if (vol !== 1) af += `,volume=${vol}`;
    const lbl = `ava${i}`;
    filterParts.push(`${af}[${lbl}]`);
    allAudioInputs.push(`[${lbl}]`);
  }

  // Add dedicated audio track inputs
  for (let i = 0; i < audioClips.length; i++) {
    allAudioInputs.push(`[a${i}]`);
  }

  // Mix all audio
  if (allAudioInputs.length > 0) {
    const mixInputs = allAudioInputs.join('');
    const mixLabel = 'amixout';
    filterParts.push(`${mixInputs}amix=inputs=${allAudioInputs.length}:duration=longest:dropout_transition=2[${mixLabel}]`);
    aOut = `[${mixLabel}]`;
  }

  if (!vOut && !aOut) throw new Error('No output streams');

  // Build final ffmpeg exec arguments
  const args: string[] = [];
  // Add all input files
  const allInputs = [...videoClips, ...audioClips];
  for (const inp of allInputs) args.push('-i', inp.name);
  // Filter complex
  args.push('-filter_complex', filterParts.join('; '));
  // Map outputs
  if (vOut) args.push('-map', vOut);
  if (aOut) args.push('-map', aOut);
  // Codec settings
  if (vOut) {
    args.push('-c:v', codec.vcodec || 'libx264');
    args.push('-crf', crf);
    args.push('-preset', 'medium');
  }
  if (aOut) args.push('-c:a', codec.acodec);
  args.push('-shortest');
  args.push(`out.${codec.ext}`);

  await ff.exec(args);
  const data = await ff.readFile(`out.${codec.ext}`);
  const mimeMap: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav' };
  return new Blob([data], { type: mimeMap[codec.ext] || 'video/mp4' });
}
