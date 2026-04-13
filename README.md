# vis-audio

A VSCode extension that opens audio files with a custom editor, providing waveform visualization, mel/linear spectrogram display, and audio playback controls — all without leaving your editor.

Supported formats: `.wav`, `.mp3`, `.ogg`, `.flac`, `.aac`, `.m4a`, `.aiff`, `.opus`

---

## Features

- **Waveform display** — Renders audio as a min/max envelope. Drag to select a playback region.
- **Mel spectrogram** — Computes STFT → mel filterbank → log compression asynchronously via a Web Worker, keeping the UI responsive.
- **Linear spectrogram** — Switch to a standard linear-frequency STFT spectrogram with one click.
- **Zoom & pan** — Scroll to zoom in/out, Shift+Scroll to pan. Both the waveform and spectrogram always stay in sync.
- **Playback controls** — Play, Pause, Stop, and Loop with `MM:SS.mmm` time display.
- **Region playback** — Drag on the waveform or spectrogram to select a time region; playback and loop stay within it.
- **File metadata** — Shows sample rate, channels, bit depth, encoding, duration, and file size.
- **Live settings** — Colormap changes apply instantly; FFT/mel parameter changes trigger a background re-computation.

---

## Usage

Open any supported audio file in VSCode — vis-audio registers itself as the default editor and opens automatically.

```
┌──────────────────────────────────────────────────────┐
│  ▶ Play  ⏸ Pause  ⏹ Stop  ↺ Loop   00:01.234 / 00:03.500  │
│  Scroll: zoom  |  Shift+Scroll: pan  |  +/- keys  [Fit]   │
├──────────────────────────────────────────────────────┤
│  WAVEFORM                                            │
│  (drag to select region)                            │
├──────────────────────────────────────────────────────┤
│  MEL SPECTROGRAM          [Mel] [Linear]             │
│  (drag to select region)                            │
├──────────────────────────────────────────────────────┤
│  FILE INFO                                           │
│  Sample Rate: 44100 Hz  |  Channels: 2  |  …        │
└──────────────────────────────────────────────────────┘
```

### Zoom & Pan

Both the waveform and spectrogram share the same time axis and zoom together.

| Operation | Action |
|-----------|--------|
| Scroll wheel (on canvas) | Zoom in/out centered on the cursor position |
| Shift + Scroll (on canvas) | Pan left/right |
| `+` or `=` key | Zoom in (centered on the current view) |
| `-` key | Zoom out |
| `0` key | Fit full view (reset zoom) |
| `f` key | Fit to selection (only when a region is active) |
| **Fit** button | Fit full view (reset zoom) |

The current zoom level (e.g. `4.2×`) is shown next to the Fit button when zoomed in.

### Region Selection

Drag horizontally on the waveform or spectrogram canvas to select a time range.  
The selection is shown as a highlighted area with start/end markers, and the duration is displayed in the controls bar.  
Click without dragging to clear the selection.  
When a region is active, playback and loop are confined to that region.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Resume / Stop toggle |
| `p` | Pause / Resume |
| `s` | Stop (return to start or region start) |
| `l` | Toggle loop mode |
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `0` | Fit full view (reset zoom) |
| `f` | Fit to selection (only when a region is active) |

All playback keys are configurable via settings (see below). Zoom keys are fixed.

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
