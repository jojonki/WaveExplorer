export interface WavMetadata {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  audioFormat: number;   // 1=PCM, 3=IEEE Float, 6=A-law, 7=μ-law, 65534=Extensible
  byteRate: number;
  blockAlign: number;
  durationSeconds: number;
  fileSizeBytes: number;
  encoding: string;      // human-readable: "PCM 16-bit", "IEEE Float 32-bit", etc.
  container?: string;    // file extension (e.g. "wav", "mp3"); wav-specific fields are N/A when not "wav"
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
  waveform: {
    color: string;
  };
  spectrogram: {
    colormap: ColormapName;
    useMel: boolean;
  };
  mel: MelConfig;
  keybindings: KeybindingsConfig;
}

// --- Message types (Extension Host <-> Webview) ---

export type ExtToWebviewMessage =
  | { type: 'init'; metadata: WavMetadata; audioBase64: string; config: VisConfig }
  | { type: 'config-update'; config: VisConfig }
  | { type: 'audio-chunk'; index: number; total: number; totalBytes: number; data: string };

export type WebviewToExtMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'update-use-mel'; value: boolean }
  | { type: 'update-colormap'; value: ColormapName };

// --- Worker message types ---

export type WorkerInMessage = {
  type: 'compute';
  samples: Float32Array;
  config: MelConfig;
  sampleRate: number;
};

export type WorkerOutMessage =
  | { type: 'result'; data: Float32Array; nFrames: number; nMels: number }
  | { type: 'progress'; percent: number };
