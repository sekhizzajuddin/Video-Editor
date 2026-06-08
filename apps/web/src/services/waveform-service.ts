/**
 * WaveformService — extracts real audio peak data from a media file blob
 * using the browser Web Audio API (AudioContext.decodeAudioData).
 *
 * This is a pure-browser implementation that works for:
 *  - Audio files (.mp3, .wav, .aac, .ogg, .flac, .m4a …)
 *  - Video files with audio tracks (.mp4, .mov, .webm …)
 *
 * ## Audacity-style multi-resolution waveform
 *
 * Instead of extracting a fixed number of peaks (which scatter on zoom),
 * we store a high-resolution overview of **min/max pairs** at a dense
 * resolution (~8000 pairs). When rendering, the component down-samples
 * on the fly to match the current pixel width → zooming in reveals more
 * detail without any re-extraction.
 *
 * The result is an object containing:
 *  - `peaks`: Float32Array of peak values (legacy compat, max envelope)
 *  - `minPeaks`: Float32Array of per-bucket minimum amplitudes
 *  - `maxPeaks`: Float32Array of per-bucket maximum amplitudes
 *  - `sampleRate`: original audio sample rate
 *  - `totalSamples`: total decoded sample count
 */

/** How many min/max buckets to store — dense enough for deep zooming */
const HIGH_RES_BUCKETS = 8000;

export interface WaveformPeakData {
  /** Legacy single-value peaks (absolute max per bucket, normalised 0-1) */
  peaks: Float32Array;
  /** Per-bucket minimum amplitude (signed, normalised to [-1, 1]) */
  minPeaks: Float32Array;
  /** Per-bucket maximum amplitude (signed, normalised to [-1, 1]) */
  maxPeaks: Float32Array;
  /** Original sample rate of the decoded audio */
  sampleRate: number;
  /** Total number of decoded samples (mono-mixed) */
  totalSamples: number;
}

/**
 * Decode the audio content of a Blob and return high-resolution
 * min/max peak data suitable for Audacity-style waveform rendering.
 */
export async function extractWaveformPeaks(
  blob: Blob,
  numBars: number = HIGH_RES_BUCKETS,
): Promise<Float32Array | null> {
  const result = await extractWaveformPeaksHiRes(blob, numBars);
  if (!result) return null;
  return result.peaks;
}

/**
 * Full hi-res extraction — returns the complete WaveformPeakData object.
 */
export async function extractWaveformPeaksHiRes(
  blob: Blob,
  numBuckets: number = HIGH_RES_BUCKETS,
): Promise<WaveformPeakData | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();

    const audioCtx = new AudioContext();
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch {
      await audioCtx.close();
      return null;
    }
    await audioCtx.close();

    const numChannels = audioBuffer.numberOfChannels;
    const totalSamples = audioBuffer.length;
    const samplesPerBucket = Math.max(1, Math.floor(totalSamples / numBuckets));
    const actualBuckets = Math.min(numBuckets, totalSamples);

    const peaks = new Float32Array(actualBuckets);
    const minPeaks = new Float32Array(actualBuckets);
    const maxPeaks = new Float32Array(actualBuckets);

    // Pre-fetch all channel data arrays
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      channels.push(audioBuffer.getChannelData(ch));
    }

    for (let bucket = 0; bucket < actualBuckets; bucket++) {
      const start = bucket * samplesPerBucket;
      const end = Math.min(start + samplesPerBucket, totalSamples);
      let bucketMin = Infinity;
      let bucketMax = -Infinity;
      let bucketAbsMax = 0;

      for (let ch = 0; ch < numChannels; ch++) {
        const channelData = channels[ch];
        for (let i = start; i < end; i++) {
          const sample = channelData[i];
          if (sample < bucketMin) bucketMin = sample;
          if (sample > bucketMax) bucketMax = sample;
          const abs = Math.abs(sample);
          if (abs > bucketAbsMax) bucketAbsMax = abs;
        }
      }

      minPeaks[bucket] = bucketMin === Infinity ? 0 : bucketMin;
      maxPeaks[bucket] = bucketMax === -Infinity ? 0 : bucketMax;
      peaks[bucket] = bucketAbsMax;
    }

    // Normalise peaks so the loudest absolute peak = 1.0
    let globalMax = 0;
    for (let i = 0; i < peaks.length; i++) {
      if (peaks[i] > globalMax) globalMax = peaks[i];
    }
    if (globalMax > 0) {
      for (let i = 0; i < peaks.length; i++) {
        peaks[i] = peaks[i] / globalMax;
        minPeaks[i] = minPeaks[i] / globalMax;
        maxPeaks[i] = maxPeaks[i] / globalMax;
      }
    }

    return {
      peaks,
      minPeaks,
      maxPeaks,
      sampleRate: audioBuffer.sampleRate,
      totalSamples,
    };
  } catch (err) {
    console.warn("[WaveformService] Failed to extract waveform:", err);
    return null;
  }
}

/**
 * Down-sample high-resolution peak data to a specific number of visual columns.
 * This is the key function that makes zoom work without re-extraction.
 *
 * For each output column, we find the range of source buckets that map to it
 * and compute the min/max envelope across those buckets.
 *
 * @param minPeaks  - high-res minimum peaks array
 * @param maxPeaks  - high-res maximum peaks array
 * @param peaks     - high-res absolute peaks array (legacy fallback)
 * @param numColumns - how many visual columns to output (typically = pixel width)
 * @returns {{ min: Float32Array, max: Float32Array }} down-sampled envelope
 */
export function downsamplePeaks(
  minPeaks: Float32Array | null,
  maxPeaks: Float32Array | null,
  peaks: Float32Array | number[] | null,
  numColumns: number,
): { min: Float32Array; max: Float32Array } {
  const sourceLen = peaks?.length ?? 0;
  if (sourceLen === 0 || numColumns <= 0) {
    return { min: new Float32Array(0), max: new Float32Array(0) };
  }

  const cols = Math.max(1, Math.round(numColumns));
  const outMin = new Float32Array(cols);
  const outMax = new Float32Array(cols);

  const hasMinMax = minPeaks && maxPeaks && minPeaks.length === sourceLen;

  for (let col = 0; col < cols; col++) {
    const srcStart = (col / cols) * sourceLen;
    const srcEnd = ((col + 1) / cols) * sourceLen;
    const iStart = Math.floor(srcStart);
    const iEnd = Math.min(Math.ceil(srcEnd), sourceLen);

    if (iStart >= iEnd) {
      // Single sample
      const idx = Math.min(iStart, sourceLen - 1);
      if (hasMinMax) {
        outMin[col] = minPeaks[idx];
        outMax[col] = maxPeaks[idx];
      } else {
        const v = peaks![idx] as number;
        outMin[col] = -Math.abs(v);
        outMax[col] = Math.abs(v);
      }
      continue;
    }

    let colMin = Infinity;
    let colMax = -Infinity;

    if (hasMinMax) {
      for (let i = iStart; i < iEnd; i++) {
        if (minPeaks[i] < colMin) colMin = minPeaks[i];
        if (maxPeaks[i] > colMax) colMax = maxPeaks[i];
      }
    } else {
      // Legacy fallback: absolute peaks → symmetric
      for (let i = iStart; i < iEnd; i++) {
        const v = Math.abs(peaks![i] as number);
        if (-v < colMin) colMin = -v;
        if (v > colMax) colMax = v;
      }
    }

    outMin[col] = colMin === Infinity ? 0 : colMin;
    outMax[col] = colMax === -Infinity ? 0 : colMax;
  }

  return { min: outMin, max: outMax };
}

/**
 * Check whether a blob contains a decodable audio track.
 * Returns true for audio files and video files that have an audio stream.
 */
export async function blobHasAudio(blob: Blob): Promise<boolean> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContext();
    try {
      await audioCtx.decodeAudioData(arrayBuffer);
      await audioCtx.close();
      return true;
    } catch {
      await audioCtx.close();
      return false;
    }
  } catch {
    return false;
  }
}
