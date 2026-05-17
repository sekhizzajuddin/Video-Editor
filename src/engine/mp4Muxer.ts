/**
 * Minimal ISO BMFF (MP4) muxer.
 * Accepts H.264 NAL units + AAC packets, writes a valid MP4 file.
 */

export interface MuxerTrack {
  type: 'video' | 'audio';
  timescale: number;
  codec: string;
  width?: number;
  height?: number;
  sampleRate?: number;
  channelCount?: number;
}

export interface EncodedSample {
  data: Uint8Array;
  pts: number;       // in timescale units
  duration: number;   // in timescale units
  isKeyframe: boolean;
}

/** Write a 32-bit big-endian integer */
function u32(arr: Uint8Array, off: number, v: number) {
  arr[off] = (v >> 24) & 0xff;
  arr[off + 1] = (v >> 16) & 0xff;
  arr[off + 2] = (v >> 8) & 0xff;
  arr[off + 3] = v & 0xff;
}

/** Write four-character code */
function fcc(arr: Uint8Array, off: number, str: string) {
  for (let i = 0; i < 4; i++) arr[off + i] = str.charCodeAt(i);
}

function box(type: string, ...payloads: (Uint8Array | null)[]): Uint8Array {
  const parts = payloads.filter((p): p is Uint8Array => p !== null);
  const size = 8 + parts.reduce((s, p) => s + p.length, 0);
  const buf = new Uint8Array(size);
  u32(buf, 0, size);
  fcc(buf, 4, type);
  let off = 8;
  for (const p of parts) { buf.set(p, off); off += p.length; }
  return buf;
}

function ftyp(): Uint8Array {
  const major = new Uint8Array(8);
  fcc(major, 0, 'isom');
  u32(major, 4, 0x200);
  return box('ftyp', major, new Uint8Array([0x69, 0x73, 0x6f, 0x6d]), new Uint8Array([0x61, 0x76, 0x63, 0x31]));
}

function avcC(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  const len = 7 + sps.length + 2 + pps.length;
  const buf = new Uint8Array(len);
  buf[0] = 1; // version
  buf[1] = sps[1]; buf[2] = sps[2]; buf[3] = sps[3]; // profile, profile_compat, level
  buf[4] = 0xfc | 3; // lengthSizeMinusOne
  buf[5] = 0xe0 | 1; // numOfSequenceParameterSets
  u16(buf, 6, sps.length);
  buf.set(sps, 8);
  const off = 8 + sps.length;
  buf[off] = 1; // numOfPictureParameterSets
  u16(buf, off + 1, pps.length);
  buf.set(pps, off + 3);
  return box('avcC', buf);
}

function u16(arr: Uint8Array, off: number, v: number) {
  arr[off] = (v >> 8) & 0xff;
  arr[off + 1] = v & 0xff;
}

function stsdVideo(width: number, height: number, avcCBox: Uint8Array): Uint8Array {
  const visual = new Uint8Array(78 + avcCBox.length);
  u32(visual, 0, 0); u16(visual, 4, 0); u16(visual, 6, 1);
  fcc(visual, 8, 'avc1');
  visual[12] = 0; visual[13] = 0; visual[14] = 0; visual[15] = 0;
  u16(visual, 16, 0); u16(visual, 18, 0);
  u32(visual, 20, 0); u32(visual, 24, 0); u16(visual, 28, width); u16(visual, 30, height);
  u32(visual, 32, 0x00480000); u32(visual, 36, 0x00480000);
  u32(visual, 40, 0); u16(visual, 44, 1);
  visual[46] = 0; visual[47] = 0; visual[48] = 0; visual[49] = 0; visual[50] = 0; visual[51] = 0;
  u16(visual, 52, 24); u16(visual, 54, 0xffff);
  visual.set(avcCBox, 78);
  return box('stsd', new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]), visual);
}

function stsdAudio(sampleRate: number, channelCount: number, esds: Uint8Array): Uint8Array {
  const audio = new Uint8Array(28 + esds.length);
  u32(audio, 0, 0); u16(audio, 4, 0); u16(audio, 6, 1);
  fcc(audio, 8, 'mp4a');
  audio[12] = 0; audio[13] = 0; audio[14] = 0; audio[15] = 0;
  u16(audio, 16, 0); u16(audio, 18, channelCount);
  u16(audio, 20, 16); u16(audio, 22, 0);
  u16(audio, 24, 0);
  u32(audio, 26, sampleRate << 16);
  audio.set(esds, 28);
  return box('stsd', new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]), audio);
}

function esdsAAC(aacConfig: Uint8Array): Uint8Array {
  const configLen = aacConfig.length;
  const desc = new Uint8Array(50);
  let off = 0;
  desc[off++] = 0x03;                            // ES_DescrTag
  const esLenOff = off++;
  u16(desc, off, 0x0002); off += 2;              // ES_ID
  desc[off++] = 0;                                // flags + streamPriority
  desc[off++] = 0x04;                             // DecoderConfigDescrTag
  const dcLenOff = off++;
  desc[off++] = 0x40;                             // objectType: AAC
  desc[off++] = 0x15;                             // streamType: Audio
  u24(desc, off, 0); off += 3;                    // bufferSizeDB
  u32(desc, off, 0); off += 4;                    // maxBitrate
  u32(desc, off, 0); off += 4;                    // avgBitrate
  desc[off++] = 0x05;                             // DecSpecificInfoTag
  desc[off++] = configLen;                        // DSI length
  desc.set(aacConfig, off); off += configLen;
  desc[off++] = 0x06;                             // SLConfigDescrTag
  const slLenOff = off++;
  desc[off++] = 0x02;                             // SLConfig value

  // Fill in lengths
  const dcLen = off - dcLenOff - 1;
  desc[dcLenOff] = dcLen;
  const esPayloadLen = off - esLenOff - 1;
  desc[esLenOff] = esPayloadLen;
  const slLen = off - slLenOff - 1;
  desc[slLenOff] = slLen;

  const totalLen = off;
  const buf = new Uint8Array(8 + totalLen);
  u32(buf, 0, 8 + totalLen);
  fcc(buf, 4, 'esds');
  buf.set(desc.subarray(0, totalLen), 8);
  return buf;
}

function u24(arr: Uint8Array, off: number, v: number) {
  arr[off] = (v >> 16) & 0xff;
  arr[off + 1] = (v >> 8) & 0xff;
  arr[off + 2] = v & 0xff;
}

function makeStblSamples(samples: EncodedSample[], _timescale: number, width: number, height: number, avcCBox: Uint8Array): Uint8Array {
  const sampleCount = samples.length;
  const offsets = new Uint8Array(4 + sampleCount * 4);
  const sizes = new Uint8Array(4 + sampleCount * 4);
  const keyframes = new Uint8Array(4 + sampleCount * 4); // flag per sample
  let totalDataLen = 0;
  for (let i = 0; i < sampleCount; i++) {
    u32(offsets, 4 + i * 4, totalDataLen);
    u32(sizes, 4 + i * 4, samples[i].data.length);
    u32(keyframes, 4 + i * 4, samples[i].isKeyframe ? 0 : 0xffffffff);
    totalDataLen += samples[i].data.length;
  }
  u32(offsets, 0, sampleCount);
  u32(sizes, 0, sampleCount);
  u32(keyframes, 0, sampleCount);

  // ctts: decode time = composition time (no B-frames)
  const ctts = new Uint8Array(16);
  u32(ctts, 0, 0); // version+flags
  u32(ctts, 4, 1); // entry count
  u32(ctts, 8, sampleCount); // sample count
  u32(ctts, 12, 0); // sample offset = 0

  // stss: sync sample table
  const syncSamples: number[] = [];
  for (let i = 0; i < sampleCount; i++) if (samples[i].isKeyframe) syncSamples.push(i + 1);
  const stss = new Uint8Array(8 + syncSamples.length * 4);
  u32(stss, 0, 0);
  u32(stss, 4, syncSamples.length);
  for (let i = 0; i < syncSamples.length; i++) u32(stss, 8 + i * 4, syncSamples[i]);

  // stts: time-to-sample (constant duration)
  const stts = new Uint8Array(16);
  u32(stts, 0, 0);
  u32(stts, 4, 1);
  u32(stts, 8, sampleCount);
  const firstSampleDur = samples.length > 0 ? samples[0].duration : 0;
  u32(stts, 12, firstSampleDur);

  // stsc: sample-to-chunk (all in one chunk)
  const stsc = new Uint8Array(20);
  u32(stsc, 0, 0);
  u32(stsc, 4, 1);
  u32(stsc, 8, 1);
  u32(stsc, 12, sampleCount);
  u32(stsc, 16, 1);

  // stco: chunk offset (single chunk at start of mdat)
  const stco = new Uint8Array(12);
  u32(stco, 0, 0);
  u32(stco, 4, 1);
  u32(stco, 8, 0); // will be patched

  return box('stbl',
    stsdVideo(width, height, avcCBox),
    box('stts', stts),
    box('stsc', stsc),
    box('stsz', sizes),
    box('stco', stco),
    box('stss', stss),
    box('ctts', ctts),
  );
}

function makeStblAudio(samples: EncodedSample[], _timescale: number, sampleRate: number, channels: number, aacConfig: Uint8Array): Uint8Array {
  const sampleCount = samples.length;
  const offsets = new Uint8Array(4 + sampleCount * 4);
  const sizes = new Uint8Array(4 + sampleCount * 4);
  let totalDataLen = 0;
  for (let i = 0; i < sampleCount; i++) {
    u32(offsets, 4 + i * 4, totalDataLen);
    u32(sizes, 4 + i * 4, samples[i].data.length);
    totalDataLen += samples[i].data.length;
  }
  u32(offsets, 0, sampleCount);
  u32(sizes, 0, sampleCount);

  const dur = samples.length > 0 ? samples[0].duration : 1024;

  const stts = new Uint8Array(16);
  u32(stts, 0, 0);
  u32(stts, 4, 1);
  u32(stts, 8, sampleCount);
  u32(stts, 12, dur);

  const stsc = new Uint8Array(20);
  u32(stsc, 0, 0);
  u32(stsc, 4, 1);
  u32(stsc, 8, 1);
  u32(stsc, 12, sampleCount);
  u32(stsc, 16, 1);

  const stco = new Uint8Array(12);
  u32(stco, 0, 0);
  u32(stco, 4, 1);
  u32(stco, 8, 0);

  return box('stbl',
    stsdAudio(sampleRate, channels, esdsAAC(aacConfig)),
    box('stts', stts),
    box('stsc', stsc),
    box('stsz', sizes),
    box('stco', stco),
  );
}

function minfVideo(width: number, height: number, avcCBox: Uint8Array, samples: EncodedSample[], timescale: number): Uint8Array {
  return box('minf',
    box('vmhd', new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0])),
    box('dinf', box('dref', new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0x0c, 0x75, 0x72, 0x6c, 0x20, 0, 0, 0, 1]))),
    makeStblSamples(samples, timescale, width, height, avcCBox),
  );
}

function minfAudio(samples: EncodedSample[], timescale: number, sampleRate: number, channels: number, aacConfig: Uint8Array): Uint8Array {
  return box('minf',
    box('smhd', new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0])),
    box('dinf', box('dref', new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0x0c, 0x75, 0x72, 0x6c, 0x20, 0, 0, 0, 1]))),
    makeStblAudio(samples, timescale, sampleRate, channels, aacConfig),
  );
}

function trakVideo(
  samples: EncodedSample[], timescale: number,
  width: number, height: number, duration: number,
  avcCBox: Uint8Array, trackId: number,
): Uint8Array {
  const hdlr = new Uint8Array(33);
  u32(hdlr, 0, 0); u32(hdlr, 4, 0); fcc(hdlr, 8, 'vide'); hdlr[12] = 0; hdlr[13] = 0; hdlr[14] = 0; hdlr[15] = 0;
  fcc(hdlr, 16, 'appl'); for (let i = 20; i < 33; i++) hdlr[i] = 0;

  return box('trak',
    box('tkhd', new Uint8Array([
      0, 0, 0, 0x07, // version+flags (track_enabled|track_in_movie|track_in_preview)
      0, 0, 0, 0, 0, 0, 0, 0, // creation time
      0, 0, 0, 0, 0, 0, 0, 0, // modification time
      (trackId >> 24) & 0xff, (trackId >> 16) & 0xff, (trackId >> 8) & 0xff, trackId & 0xff, // track ID
      0, 0, 0, 0, // reserved
      (duration >> 24) & 0xff, (duration >> 16) & 0xff, (duration >> 8) & 0xff, duration & 0xff, // duration
      0, 0, 0, 0, 0, 0, 0, 0, // reserved
      0, // layer
      0, // alternate group
      0, 0, // volume
      0, 0, // reserved
      // matrix (identity)
      0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00,
      (width >> 8) & 0xff, width & 0xff, 0, 0,
      (height >> 8) & 0xff, height & 0xff, 0, 0,
    ])),
    box('mdia',
      box('mdhd', new Uint8Array([
        0, 0, 0, 0, // version+flags
        0, 0, 0, 0, 0, 0, 0, 0, // creation
        0, 0, 0, 0, 0, 0, 0, 0, // modification
        (timescale >> 24) & 0xff, (timescale >> 16) & 0xff, (timescale >> 8) & 0xff, timescale & 0xff,
        (duration >> 24) & 0xff, (duration >> 16) & 0xff, (duration >> 8) & 0xff, duration & 0xff,
        0, 0, 0, 0, // pad
      ])),
      box('hdlr', hdlr),
      minfVideo(width, height, avcCBox, samples, timescale),
    ),
  );
}

function trakAudio(
  samples: EncodedSample[], timescale: number,
  sampleRate: number, channels: number, duration: number,
  aacConfig: Uint8Array, trackId: number,
): Uint8Array {
  const hdlr = new Uint8Array(33);
  u32(hdlr, 0, 0); u32(hdlr, 4, 0); fcc(hdlr, 8, 'soun'); hdlr[12] = 0; hdlr[13] = 0; hdlr[14] = 0; hdlr[15] = 0;
  fcc(hdlr, 16, 'appl'); for (let i = 20; i < 33; i++) hdlr[i] = 0;

  return box('trak',
    box('tkhd', new Uint8Array([
      0, 0, 0, 0x07,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      (trackId >> 24) & 0xff, (trackId >> 16) & 0xff, (trackId >> 8) & 0xff, trackId & 0xff,
      0, 0, 0, 0,
      (duration >> 24) & 0xff, (duration >> 16) & 0xff, (duration >> 8) & 0xff, duration & 0xff,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, // layer
      0, // alternate
      1, 0, // volume = 1
      0, 0,
      0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00,
      0, 0, 0, 0, 0, 0, 0, 0,
    ])),
    box('mdia',
      box('mdhd', new Uint8Array([
        0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        (timescale >> 24) & 0xff, (timescale >> 16) & 0xff, (timescale >> 8) & 0xff, timescale & 0xff,
        (duration >> 24) & 0xff, (duration >> 16) & 0xff, (duration >> 8) & 0xff, duration & 0xff,
        0, 0, 0, 0,
      ])),
      box('hdlr', hdlr),
      minfAudio(samples, timescale, sampleRate, channels, aacConfig),
    ),
  );
}

function moov(
  videoSamples: EncodedSample[], videoTimescale: number,
  width: number, height: number, avcCBox: Uint8Array, mvhdDuration: number,
  audioSamples: EncodedSample[], audioTimescale: number,
  sampleRate: number, channels: number, aacConfig: Uint8Array | null,
): Uint8Array {
  const tracks: Uint8Array[] = [];

  const vdur = videoSamples.reduce((s, x) => s + x.duration, 0);
  tracks.push(trakVideo(videoSamples, videoTimescale, width, height, vdur, avcCBox, 1));

  let audioTrackId = 2;
  if (audioSamples.length > 0 && aacConfig) {
    const adur = audioSamples.reduce((s, x) => s + x.duration, 0);
    tracks.push(trakAudio(audioSamples, audioTimescale, sampleRate, channels, adur, aacConfig, audioTrackId));
  }

  // Build mvhd (version 0)
  const mvhd = new Uint8Array(108);
  u32(mvhd, 0, 0); // version=0, flags=0
  u32(mvhd, 4, 0); // creation time
  u32(mvhd, 8, 0); // modification time
  u32(mvhd, 12, 1000); // timescale
  u32(mvhd, 16, Math.round(mvhdDuration * 1000)); // duration
  u32(mvhd, 20, 0x00010000); // rate (1.0 fixed-point 16.16)
  mvhd[24] = 0x01; mvhd[25] = 0x00; // volume (1.0 fixed-point 8.8)
  // reserved 10 bytes (indices 26-35): already zero
  // matrix (indices 36-71): identity
  u32(mvhd, 36, 0x00010000); // a
  u32(mvhd, 40, 0); mvhd[44] = 0; mvhd[45] = 0; mvhd[46] = 0; mvhd[47] = 0; // b
  u32(mvhd, 48, 0); mvhd[52] = 0; mvhd[53] = 0; mvhd[54] = 0; mvhd[55] = 0; // u
  u32(mvhd, 56, 0x00010000); // c
  u32(mvhd, 60, 0); mvhd[64] = 0; mvhd[65] = 0; mvhd[66] = 0; mvhd[67] = 0; // v
  u32(mvhd, 68, 0x40000000); // w
  // pre-defined (indices 72-95): already zero
  u32(mvhd, 96, tracks.length + 1); // next track ID

  return box('moov', box('mvhd', mvhd), ...tracks);
}

export function muxMP4(
  videoSamples: EncodedSample[],
  width: number,
  height: number,
  fps: number,
  sps: Uint8Array,
  pps: Uint8Array,
  audioSamples?: EncodedSample[],
  sampleRate?: number,
  channelCount?: number,
  aacConfig?: Uint8Array,
): Blob {
  const videoTimescale = Math.max(fps, 1);
  const videoSamplesNorm = videoSamples.map((s, i) => ({
    ...s,
    pts: i,        // frame index in video timescale units
    duration: 1,   // 1 timescale unit per frame
  }));

  const audioTimescale = sampleRate || 44100;
  const audioSamplesNorm = (audioSamples || []).map((s, i) => ({
    ...s,
    pts: i * 1024, // AAC frames in sample-rate timescale units
    duration: 1024,
  }));

  const avcCBox = avcC(sps, pps);

  const mvhdDuration = Math.max(
    videoSamplesNorm.length > 0 ? videoSamplesNorm.length / fps : 0,
    audioSamplesNorm.length > 0 ? audioSamplesNorm.length * 1024 / (sampleRate || 44100) : 0,
  );

  const moovBox = moov(
    videoSamplesNorm, videoTimescale,
    width, height, avcCBox, mvhdDuration,
    audioSamplesNorm, audioTimescale,
    sampleRate || 44100, channelCount || 2,
    aacConfig || null,
  );

  // Build mdat
  const mdatPayloads: Uint8Array[] = [];
  let mdatSize = 8;
  for (const s of videoSamplesNorm) { mdatSize += s.data.length; mdatPayloads.push(s.data); }
  for (const s of audioSamplesNorm) { mdatSize += s.data.length; mdatPayloads.push(s.data); }

  const mdat = new Uint8Array(mdatSize);
  u32(mdat, 0, mdatSize);
  fcc(mdat, 4, 'mdat');
  let off = 8;
  for (const p of mdatPayloads) { mdat.set(p, off); off += p.length; }

  // Patch stco in moov to point after ftyp+moov
  const ftypBox = ftyp();
  const moovStart = ftypBox.length;
  const mdatStart = moovStart + moovBox.length;
  const patchedMoov = new Uint8Array(moovBox);
  // Find all stco boxes (video + audio) and patch chunk_offset at i+16
  // stco box layout: size(4) + 'stco'(4) + version+flags(4) + entry_count(4) + chunk_offset(4)
  for (let i = 0; i < patchedMoov.length - 16; i++) {
    if (patchedMoov[i + 4] === 0x73 && patchedMoov[i + 5] === 0x74 &&
        patchedMoov[i + 6] === 0x63 && patchedMoov[i + 7] === 0x6f) {
      u32(patchedMoov, i + 16, mdatStart);
    }
  }

  const all = new Uint8Array(mdatStart + mdat.length);
  all.set(ftypBox, 0);
  all.set(patchedMoov, ftypBox.length);
  all.set(mdat, moovStart + moovBox.length);

  return new Blob([all], { type: 'video/mp4' });
}
