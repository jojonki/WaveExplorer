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
  spectrogram: { colormap: ColormapName };
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
};

export type WorkerOutMessage =
  | { type: 'result'; data: Float32Array; nFrames: number; nMels: number }
  | { type: 'progress'; percent: number };

