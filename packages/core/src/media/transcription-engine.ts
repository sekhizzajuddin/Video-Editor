import { pipeline, env, AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import Sanscript from '@indic-transliteration/sanscript';

// Configure transformers to use the local WebGPU/WASM environment
env.allowLocalModels = false;
env.useBrowserCache = true;

export interface TranscriptionWord {
  text: string;
  start: number;
  end: number;
}

export class TranscriptionEngine {
  private static instance: TranscriptionEngine;
  private transcriber: AutomaticSpeechRecognitionPipeline | null = null;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): TranscriptionEngine {
    if (!this.instance) {
      this.instance = new TranscriptionEngine();
    }
    return this.instance;
  }

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    if (this.transcriber) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        // Use the multilingual tiny model to support Hindi/Hinglish
        this.transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
          device: 'webgpu',
          progress_callback: (data: any) => {
            if (data.status === 'progress' && onProgress) {
              // Usually returns a percentage 0-100
              onProgress(data.progress);
            }
          }
        });
      } catch (e) {
        console.warn("WebGPU not available or model failed to load, falling back to WebAssembly CPU:", e);
        this.transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
          device: 'wasm',
          progress_callback: (data: any) => {
            if (data.status === 'progress' && onProgress) {
              onProgress(data.progress);
            }
          }
        });
      }
    })();

    return this.initPromise;
  }

  /**
   * Transcribes an AudioBuffer using the offline Whisper model.
   * Note: The AudioBuffer must ideally be resampled to 16kHz before passing here.
   */
  async transcribe(audioBuffer: AudioBuffer): Promise<TranscriptionWord[]> {
    if (!this.transcriber) {
      await this.initialize();
    }
    if (!this.transcriber) throw new Error("Transcriber failed to initialize");

    // Convert AudioBuffer to Float32Array (Transformers.js expects 16kHz mono audio)
    // We assume the caller provides mono audio. If stereo, we just take channel 0.
    const audioData = audioBuffer.getChannelData(0);

    const result = await this.transcriber(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: 'word'
    });

    const processChunks = (chunks: any[]) => {
      return chunks.map((chunk: any) => ({
        // Transliterate Devanagari (Hindi script) to Latin (Hinglish)
        text: Sanscript.t(chunk.text, 'devanagari', 'itrans'),
        start: chunk.timestamp[0],
        end: chunk.timestamp[1]
      }));
    };

    if (Array.isArray(result) && result.length > 0 && result[0].chunks) {
       return processChunks(result[0].chunks);
    } else if ((result as any).chunks) {
       return processChunks((result as any).chunks);
    }

    return [];
  }
}

export const transcriptionEngine = TranscriptionEngine.getInstance();
