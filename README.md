# vis-audio

A VSCode extension that opens `.wav` files with a custom editor, providing waveform visualization, mel spectrogram display, and audio playback controls — all without leaving your editor.

---

## Features

- **Waveform display** — Renders audio as a min/max envelope on a canvas. Drag to select a playback region.
- **Mel spectrogram** — Computes STFT → mel filterbank → log compression asynchronously via a Web Worker, keeping the UI responsive.
- **Linear spectrogram** — Optionally switch to a standard linear-frequency STFT spectrogram.
- **Playback controls** — Play, Pause, Stop, and Loop buttons with `MM:SS.mmm` time display.
- **Region playback** — Drag on the waveform to select a region; playback (and loop) stays within that region.
- **File metadata** — Shows sample rate, channels, bit depth, encoding, duration, and file size.
- **Live settings** — Changes to colormap take effect instantly; changes to FFT/mel parameters trigger a re-computation.

---

## Usage

Simply open any `.wav` file in VSCode — vis-audio registers itself as the default editor for `.wav` files and opens automatically.

```
┌─────────────────────────────────────────────┐
│  ▶ Play  ⏸ Pause  ⏹ Stop  ↺ Loop  00:01.234 │
├─────────────────────────────────────────────┤
│  Waveform  (drag to select a region)        │
├─────────────────────────────────────────────┤
│  Mel Spectrogram                            │
├─────────────────────────────────────────────┤
│  Sample Rate: 44100 Hz │ Channels: 2 │ …   │
└─────────────────────────────────────────────┘
```

---

## Keyboard Shortcuts

When the vis-audio panel is focused, the following keys are active (all configurable):

| Key | Action |
|-----|--------|
| `Space` | Play / Resume / Stop toggle |
| `p` | Pause / Resume |
| `s` | Stop (return to start / region start) |
| `l` | Toggle loop mode |

---

## Settings

All settings are available under **Extensions → vis-audio** in the VSCode settings UI, or in `settings.json`.

### Display

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `visAudio.waveform.color` | string | `"#4fc3f7"` | Waveform stroke color (any CSS color) |
| `visAudio.spectrogram.useMel` | boolean | `true` | `true` = mel spectrogram, `false` = linear STFT |
| `visAudio.spectrogram.colormap` | enum | `"viridis"` | Colormap: `viridis`, `magma`, `inferno`, `plasma`, `grayscale` |

### FFT / Mel Filterbank

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `visAudio.mel.nFFT` | enum | `2048` | FFT window size: `256`, `512`, `1024`, `2048`, `4096` |
| `visAudio.mel.hopLength` | integer | `512` | Samples between STFT frames (min 64) |
| `visAudio.mel.windowType` | enum | `"hann"` | Window function: `hann`, `hamming`, `blackman`, `rectangular` |
| `visAudio.mel.fMin` | number | `0` | Minimum frequency for mel filterbank (Hz) |
| `visAudio.mel.fMax` | number\|null | `null` | Maximum frequency (Hz); `null` = Nyquist |
| `visAudio.mel.nMels` | integer | `128` | Number of mel bands (8–512; only when `useMel` is `true`) |

### Keybindings

| Setting | Default | Description |
|---------|---------|-------------|
| `visAudio.keybindings.play` | `"Space"` | Play / Resume / Stop toggle |
| `visAudio.keybindings.pause` | `"p"` | Pause / Resume |
| `visAudio.keybindings.stop` | `"s"` | Stop |
| `visAudio.keybindings.loop` | `"l"` | Toggle loop |

Key values follow [`KeyboardEvent.key`](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values). Use `"Space"` for the spacebar.

---

## Requirements

- VSCode 1.85 or later

---

## License

[MIT](LICENSE)
