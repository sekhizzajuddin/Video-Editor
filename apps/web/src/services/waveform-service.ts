/**
 * WaveformService — extracts real audio peak data from a media file blob
 * using the browser Web Audio API (AudioContext.decodeAudioData).
 *
 * This is a pure-browser implementation that works for:
 *  - Audio files (.mp3, .wav, .aac, .ogg, .flac, .m4a …)
 *  - Video files with audio tracks (.mp4, .mov, .webm …)
 *
 * The result is a Float32Array of normalised peak values in [0, 1].
 */

const PEAK_SAMPLE_COUNT = 400; // bars we generate; more = higher resolution waveform

/**
 * Decode the audio content of a Blob and return an array of
 * normalised amplitude peaks (one per bar).
 */
export async function extractWaveformPeaks(
  blob: Blob,
  numBars: number = PEAK_SAMPLE_COUNT,
): Promise<Float32Array | null> {
  try {
    // Read the blob into an ArrayBuffer
    const arrayBuffer = await blob.arrayBuffer();

    // Decode with the Web Audio API
    const audioCtx = new AudioContext();
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch {
      // File has no decodable audio track (e.g. silent video)
      await audioCtx.close();
      return null;
    }
    await audioCtx.close();

    // Mix all channels down to mono for the waveform
    const numChannels = audioBuffer.numberOfChannels;
    const totalSamples = audioBuffer.length;
    const samplesPerBar = Math.max(1, Math.floor(totalSamples / numBars));

    const peaks = new Float32Array(numBars);

    for (let bar = 0; bar < numBars; bar++) {
      const start = bar * samplesPerBar;
      const end = Math.min(start + samplesPerBar, totalSamples);
      let maxAmp = 0;

      for (let ch = 0; ch < numChannels; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        for (let i = start; i < end; i++) {
          const amp = Math.abs(channelData[i]);
          if (amp > maxAmp) maxAmp = amp;
        }
      }

      peaks[bar] = maxAmp;
    }

    // Normalise so the loudest peak = 1.0
    let maxPeak = 0;
    for (let i = 0; i < peaks.length; i++) {
      if (peaks[i] > maxPeak) maxPeak = peaks[i];
    }
    if (maxPeak > 0) {
      for (let i = 0; i < peaks.length; i++) {
        peaks[i] = peaks[i] / maxPeak;
      }
    }

    return peaks;
  } catch (err) {
    console.warn("[WaveformService] Failed to extract waveform:", err);
    return null;
  }
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
