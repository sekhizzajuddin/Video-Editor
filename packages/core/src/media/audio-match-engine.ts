import type { EQBand } from "../types/effects";
import type { Effect } from "../types/timeline";

export class AudioMatchEngine {
  private static instance: AudioMatchEngine;

  private constructor() {}

  static getInstance(): AudioMatchEngine {
    if (!this.instance) {
      this.instance = new AudioMatchEngine();
    }
    return this.instance;
  }

  /**
   * Generates matching EQ and Gain effects so that the targetAudio matches
   * the frequency response and loudness of the referenceAudio.
   */
  async matchAudio(
    referenceAudio: AudioBuffer,
    targetAudio: AudioBuffer
  ): Promise<{ eqEffect: Effect; gainEffect: Effect }> {
    
    // Analyze Reference Audio
    const refProfile = await this.analyzeAudio(referenceAudio);
    
    // Analyze Target Audio
    const targetProfile = await this.analyzeAudio(targetAudio);

    // 1. Match RMS Volume (Loudness)
    // RMS is linear amplitude, dB = 20 * log10(RMS)
    const refDb = 20 * Math.log10(refProfile.rms || 0.0001);
    const targetDb = 20 * Math.log10(targetProfile.rms || 0.0001);
    
    // targetDb + offset = refDb  => offsetDb = refDb - targetDb
    const offsetDb = refDb - targetDb;
    const gainMultiplier = Math.pow(10, offsetDb / 20);

    const gainEffect: Effect = {
      id: "match-gain-" + Math.random().toString(36).slice(2),
      type: "gain",
      enabled: true,
      params: { value: Math.min(Math.max(gainMultiplier, 0.1), 10) } // Clamp between 0.1x and 10x
    };

    // 2. Match Frequency Spectrum (EQ Match)
    const bands: EQBand[] = [];
    
    // We already extracted exactly 10 bands of energy in analyzeAudio
    for (let i = 0; i < refProfile.bandEnergies.length; i++) {
      const freq = refProfile.frequencies[i];
      
      const refEnergy = refProfile.bandEnergies[i];
      const targetEnergy = targetProfile.bandEnergies[i];

      const refEnergyDb = 20 * Math.log10(refEnergy || 0.0001);
      const targetEnergyDb = 20 * Math.log10(targetEnergy || 0.0001);
      
      let diffDb = refEnergyDb - targetEnergyDb;
      // Clamp EQ boosts to prevent terrible feedback/hissing
      diffDb = Math.min(Math.max(diffDb, -12), 12);

      bands.push({
        type: "peaking",
        frequency: freq,
        gain: diffDb,
        q: 1.0
      });
    }

    const eqEffect: Effect = {
      id: "match-eq-" + Math.random().toString(36).slice(2),
      type: "eq",
      enabled: true,
      params: { bands }
    };

    return { eqEffect, gainEffect };
  }

  private async analyzeAudio(
    audioBuffer: AudioBuffer
  ): Promise<{ bandEnergies: Float32Array; frequencies: number[]; rms: number }> {
    return new Promise((resolve) => {
      const channelData = audioBuffer.getChannelData(0);
      const length = channelData.length;
      
      // 1. Calculate RMS
      let sumSquares = 0;
      // Analyze every 4th sample to speed up calculation on large files
      for (let i = 0; i < length; i += 4) {
        sumSquares += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(sumSquares / (length / 4));

      // 2. 10-Band Spectral Analysis
      const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
      const bandEnergies = new Float32Array(frequencies.length);
      
      for (let b = 0; b < frequencies.length; b++) {
        const fc = frequencies[b] / audioBuffer.sampleRate;
        // Simple IIR Bandpass filter implementation
        let y1 = 0, y2 = 0, x1 = 0, x2 = 0;
        let sum = 0;
        
        // Q factor approx 1
        const R = 1 - (3 * fc);
        const cosTheta = Math.cos(2 * Math.PI * fc);
        const a1 = -2 * R * cosTheta;
        const a2 = R * R;
        const b0 = (1 - R * R) / 2;
        const b2 = -b0;
        
        for (let i = 0; i < length; i += 4) {
          const x = channelData[i];
          const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
          
          x2 = x1;
          x1 = x;
          y2 = y1;
          y1 = y;
          
          sum += y * y;
        }
        bandEnergies[b] = Math.sqrt(sum / (length / 4));
      }
      
      resolve({ bandEnergies, frequencies, rms });
    });
  }
}

export const audioMatchEngine = AudioMatchEngine.getInstance();
