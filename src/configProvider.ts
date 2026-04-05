import * as vscode from 'vscode';
import { VisConfig, ColormapName, WindowType } from './types';

export function getConfig(resourceUri?: vscode.Uri): VisConfig {
  const cfg = vscode.workspace.getConfiguration('visAudio', resourceUri);
  return {
    waveform: {
      color: cfg.get<string>('waveform.color', '#4fc3f7'),
    },
    spectrogram: {
      colormap: cfg.get<ColormapName>('spectrogram.colormap', 'viridis'),
    },
    mel: {
      nMels: cfg.get<number>('mel.nMels', 128),
      nFFT: cfg.get<number>('mel.nFFT', 2048),
      hopLength: cfg.get<number>('mel.hopLength', 512),
      fMin: cfg.get<number>('mel.fMin', 0),
      fMax: cfg.get<number | null>('mel.fMax', null),
      windowType: cfg.get<WindowType>('mel.windowType', 'hann'),
    },
    keybindings: {
      play:  cfg.get<string>('keybindings.play',  'Space'),
      pause: cfg.get<string>('keybindings.pause', 'p'),
      stop:  cfg.get<string>('keybindings.stop',  's'),
      loop:  cfg.get<string>('keybindings.loop',  'l'),
    },
  };
}
