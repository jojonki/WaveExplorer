// Shared types for the webview bundle (browser context).
// Mirrors src/types.ts but without Node.js dependencies.

export interface WavMetadata {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  audioFormat: number;
  byteRate: number;
  blockAlign: number;
  durationSeconds: number;
  fileSizeBytes: number;
  encoding: string;
  container?: string;    // file extension (e.g. "wav", "mp3"); wav-specific fields are N/A when not "wav"
  bitrate?: number;      // average bitrate in kbps (computed in webview after decoding)
}

export type ColormapName = 'viridis' | 'magma' | 'inferno' | 'plasma' | 'grayscale';
export type WindowType = 'hann' | 'hamming' | 'blackman' | 'rectangular';

export interface MelConfig {
  nMels: number;
  nFFT: number;
  hopLength: number;
  fMin: number;
  fMax: number | null;
  windowType: WindowType;
}

export interface KeybindingsConfig {
  play: string;
  pause: string;
  stop: string;
  loop: string;
}

export interface VisConfig {
  waveform: { color: string };
  spectrogram: { colormap: ColormapName; useMel: boolean };
  mel: MelConfig;
  keybindings: KeybindingsConfig;
}

export type ExtToWebviewMessage =
  | { type: 'init'; metadata: WavMetadata; audioBase64: string; config: VisConfig }
  | { type: 'config-update'; config: VisConfig }
  | { type: 'audio-chunk'; index: number; total: number; totalBytes: number; data: string };

export type WorkerInMessage = {
  type: 'compute';
  samples: Float32Array;
  config: MelConfig;
  sampleRate: number;
  useMel: boolean;
};

export type WorkerOutMessage =
  | { type: 'result'; data: Float32Array; nFrames: number; nBins: number }
  | { type: 'progress'; percent: number };

