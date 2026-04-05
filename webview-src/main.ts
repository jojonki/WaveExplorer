import { ExtToWebviewMessage, VisConfig, WavMetadata, MelConfig } from './types-webview';
import { AudioEngine } from './audioEngine';
import { renderWaveform, Region } from './waveformRenderer';
import { renderSpectrogram } from './spectrogramRenderer';
import { attachRegionSelector } from './ui/regionSelector';
import { Controls } from './ui/controls';
import { renderMetadata } from './ui/metadataPanel';
import { stft, makeWindow } from './dsp/stft';
import { buildMelFilterbank, applyMelFilterbank } from './dsp/melFilterbank';

declare const window: Window & {
  acquireVsCodeApi: () => { postMessage: (msg: unknown) => void };
};

// ---- State ----
const engine = new AudioEngine();
let config: VisConfig | null = null;
let metadata: WavMetadata | null = null;
let samples: Float32Array | null = null;

// Spectrogram state (mel or linear STFT)
let spectroData: Float32Array | null = null;
let spectroNFrames = 0;
let spectroNBins = 0; // nMels when useMel=true, nFFT/2+1 when useMel=false

// Chunked audio assembly
let chunkAccumulator: Uint8Array | null = null;
let chunkTotalBytes = 0;
let chunksReceived = 0;
let chunksTotal = 0;

// ---- DOM ----
const app = document.getElementById('app')!;
app.innerHTML = buildLayout();

const controlsEl   = document.getElementById('controls-bar')!;
const waveformEl   = document.getElementById('waveform-canvas') as HTMLCanvasElement;
const spectroEl    = document.getElementById('spectrogram-canvas') as HTMLCanvasElement;
const metaEl       = document.getElementById('metadata-panel')!;
const statusEl     = document.getElementById('status-bar')!;
const spectroWrap  = document.getElementById('spectrogram-wrap')!;

const controls = new Controls(controlsEl, engine, { play: 'Space', pause: 'p', stop: 's', loop: 'l' });

const regionDisplay = document.createElement('span');
regionDisplay.className = 'region-display';
regionDisplay.style.display = 'none';
controlsEl.appendChild(regionDisplay);

function formatRegionTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

function updateRegionDisplay(r: Region | null): void {
  if (!r) {
    regionDisplay.style.display = 'none';
    return;
  }
  const dur = r.endS - r.startS;
  regionDisplay.textContent = `sel: ${formatRegionTime(r.startS)} – ${formatRegionTime(r.endS)}  (${dur.toFixed(3)}s)`;
  regionDisplay.style.display = '';
}

// Axis layout constants — must match waveformRenderer.ts and spectrogramRenderer.ts
const AXIS_L = 44;
const AXIS_R = 4;

// Region selector (waveform)
let currentRegion: Region | null = null;
attachRegionSelector(
  waveformEl,
  () => engine.duration,
  (r) => {
    currentRegion = r;
    engine.setRegion(r.startS, r.endS);
    updateRegionDisplay(r);
    drawWaveform();
    drawSpectrogram();
  },
  () => {
    currentRegion = null;
    engine.clearRegion();
    updateRegionDisplay(null);
    drawWaveform();
    drawSpectrogram();
  },
  AXIS_L,
  AXIS_R
);

// Region selector (spectrogram)
attachRegionSelector(
  spectroEl,
  () => engine.duration,
  (r) => {
    currentRegion = r;
    engine.setRegion(r.startS, r.endS);
    updateRegionDisplay(r);
    drawWaveform();
    drawSpectrogram();
  },
  () => {
    currentRegion = null;
    engine.clearRegion();
    updateRegionDisplay(null);
    drawWaveform();
    drawSpectrogram();
  },
  AXIS_L,
  AXIS_R
);

// Playhead animation — chain onto the Controls callback already registered
let rafId: number | null = null;
const _controlsStateChange = engine.onStateChange;
engine.onStateChange = (state) => {
  _controlsStateChange?.(state);
  if (state === 'playing') {
    startPlayheadRaf();
  } else {
    stopPlayheadRaf();
    drawWaveform();
    drawSpectrogram();
  }
};

function startPlayheadRaf(): void {
  if (rafId !== null) { return; }
  const tick = () => {
    rafId = requestAnimationFrame(tick);
    drawWaveform();
    drawSpectrogram();
  };
  rafId = requestAnimationFrame(tick);
}

function stopPlayheadRaf(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// ---- Canvas sizing ----
function resizeCanvases(): void {
  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(waveformEl.clientWidth * dpr);
  const H = Math.round(waveformEl.clientHeight * dpr);
  if (W > 0 && (waveformEl.width !== W || waveformEl.height !== H)) {
    waveformEl.width = W;
    waveformEl.height = H;
    drawWaveform();
  }
}

const resizeObserver = new ResizeObserver(resizeCanvases);
resizeObserver.observe(waveformEl);

// ---- Drawing ----
function drawWaveform(): void {
  if (!samples || !config || !metadata) { return; }
  renderWaveform(
    waveformEl,
    samples,
    metadata.durationSeconds,
    config.waveform.color,
    currentRegion,
    engine.state === 'stopped' ? null : engine.getCurrentTime()
  );
}

function drawSpectrogram(): void {
  if (!spectroData || !config || !metadata) { return; }
  const fMax = config.mel.fMax ?? metadata.sampleRate / 2;
  renderSpectrogram(
    spectroEl, spectroData, spectroNFrames, spectroNBins,
    config.spectrogram.colormap,
    metadata.durationSeconds,
    config.mel.fMin,
    fMax,
    config.spectrogram.useMel,
    currentRegion,
    engine.state === 'stopped' ? null : engine.getCurrentTime()
  );
}

// ---- Spectrogram computation (inline, no worker) ----
async function computeSpectro(mel: MelConfig, sr: number, useMel: boolean): Promise<void> {
  if (!samples) { return; }
  setStatus(useMel ? 'Computing mel spectrogram...' : 'Computing spectrogram...');
  await new Promise<void>(resolve => setTimeout(resolve, 0)); // yield to UI

  try {
    const { nFFT, hopLength, nMels, fMin, windowType } = mel;
    const fMax = mel.fMax ?? sr / 2;

    const win = makeWindow(windowType, nFFT);
    const { data: stftData, nFrames, nBins } = stft(samples, nFFT, hopLength, win);

    if (useMel) {
      const filterbank = buildMelFilterbank(nMels, nFFT, sr, fMin, fMax);
      spectroData = applyMelFilterbank(stftData, nFrames, nBins, filterbank, nMels);
      spectroNBins = nMels;
    } else {
      // Log-magnitude STFT (linear frequency)
      const logData = new Float32Array(stftData.length);
      for (let i = 0; i < stftData.length; i++) {
        logData[i] = Math.log(stftData[i] * stftData[i] + 1e-9);
      }
      spectroData = logData;
      spectroNBins = nBins;
    }
    spectroNFrames = nFrames;
    drawSpectrogram();
    spectroWrap.style.display = '';
    setStatus('');
  } catch (err) {
    setStatus(`Spectrogram error: ${err}`);
  }
}

// ---- Audio loading ----
async function loadAudio(base64: string): Promise<void> {
  setStatus('Decoding audio...');
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(bytes.buffer);
    samples = new Float32Array(buf.getChannelData(0));
    await ctx.close();

    engine.loadBuffer(buf);

    resizeCanvases();
    drawWaveform();
    setStatus('');
  } catch (err) {
    setStatus(`Error decoding audio: ${err}`);
  }
}

// ---- VSCode messaging ----
const vscode = window.acquireVsCodeApi();

window.addEventListener('message', async (event: MessageEvent<ExtToWebviewMessage>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    config = msg.config;
    metadata = msg.metadata;
    controls.updateKeybindings(config.keybindings);
    renderMetadata(metaEl, metadata);

    if (msg.audioBase64) {
      await loadAudio(msg.audioBase64);
      if (config && metadata) {
        void computeSpectro(config.mel, metadata.sampleRate, config.spectrogram.useMel);
      }
    } else {
      spectroWrap.style.display = 'none';
      setStatus('Receiving audio data...');
    }
  } else if (msg.type === 'audio-chunk') {
    if (chunkAccumulator === null || chunksTotal !== msg.total) {
      chunkTotalBytes = msg.totalBytes;
      chunksTotal = msg.total;
      chunksReceived = 0;
      chunkAccumulator = new Uint8Array(msg.totalBytes);
    }
    const chunkBytes = atob(msg.data);
    const offset = msg.index * (4 * 1024 * 1024);
    for (let i = 0; i < chunkBytes.length; i++) {
      chunkAccumulator![offset + i] = chunkBytes.charCodeAt(i);
    }
    chunksReceived++;
    setStatus(`Receiving audio... ${chunksReceived}/${chunksTotal}`);

    if (chunksReceived === chunksTotal) {
      const b64 = uint8ToBase64(chunkAccumulator!);
      chunkAccumulator = null;
      await loadAudio(b64);
      if (config && metadata) {
        void computeSpectro(config.mel, metadata.sampleRate, config.spectrogram.useMel);
      }
    }
  } else if (msg.type === 'config-update') {
    const oldConfig = config;
    config = msg.config;
    controls.updateKeybindings(config.keybindings);

    if (samples) { drawWaveform(); }

    if (spectroData && config && metadata) {
      const spectroChanged =
        !oldConfig ||
        oldConfig.spectrogram.useMel !== config.spectrogram.useMel ||
        oldConfig.mel.nFFT !== config.mel.nFFT ||
        oldConfig.mel.hopLength !== config.mel.hopLength ||
        oldConfig.mel.nMels !== config.mel.nMels ||
        oldConfig.mel.fMin !== config.mel.fMin ||
        oldConfig.mel.fMax !== config.mel.fMax ||
        oldConfig.mel.windowType !== config.mel.windowType;

      if (spectroChanged) {
        void computeSpectro(config.mel, metadata.sampleRate, config.spectrogram.useMel);
      } else {
        drawSpectrogram();
      }
    }
  }
});

vscode.postMessage({ type: 'ready' });

// ---- Helpers ----
function setStatus(msg: string): void {
  statusEl.textContent = msg;
  statusEl.style.display = msg ? '' : 'none';
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function buildLayout(): string {
  return `
<div class="vis-audio-root">
  <div id="controls-bar" class="controls-bar"></div>
  <div class="section-label">Waveform</div>
  <div class="canvas-wrap">
    <canvas id="waveform-canvas" class="waveform-canvas" height="120"></canvas>
  </div>
  <div id="spectrogram-wrap" class="section">
    <div class="section-label">Mel Spectrogram</div>
    <div class="canvas-wrap spectrogram-wrap-inner">
      <canvas id="spectrogram-canvas" class="spectrogram-canvas"></canvas>
    </div>
  </div>
  <div class="section">
    <div class="section-label">File Info</div>
    <div id="metadata-panel" class="metadata-panel"></div>
  </div>
  <div id="status-bar" class="status-bar" style="display:none"></div>
</div>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #1e1e1e; color: #ccc; font-family: var(--vscode-font-family, monospace); font-size: 13px; }
  .vis-audio-root { display: flex; flex-direction: column; gap: 0; padding: 8px; }
  .controls-bar { display: flex; align-items: center; gap: 6px; padding: 6px 0; flex-wrap: wrap; }
  .control-btn {
    background: #2d2d2d; color: #ccc; border: 1px solid #444; border-radius: 3px;
    padding: 4px 10px; cursor: pointer; font-size: 12px;
  }
  .control-btn:hover:not(:disabled) { background: #3a3a3a; }
  .control-btn:disabled { opacity: 0.4; cursor: default; }
  .control-btn.active { background: #1a6496; border-color: #4fc3f7; color: #fff; }
  .time-display { margin-left: 8px; color: #4fc3f7; font-family: monospace; font-size: 12px; }
  .region-display { margin-left: 12px; color: #80cbc4; font-family: monospace; font-size: 12px; border-left: 1px solid #444; padding-left: 12px; }
  .section-label { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 0 4px; }
  .section { display: flex; flex-direction: column; }
  .canvas-wrap { width: 100%; overflow: hidden; background: #1e1e1e; border: 1px solid #333; border-radius: 3px; }
  .waveform-canvas { width: 100%; height: 120px; display: block; cursor: crosshair; }
  .spectrogram-wrap-inner { width: 100%; overflow: hidden; }
  .spectrogram-canvas { width: 100%; height: 220px; display: block; cursor: crosshair; }
  .metadata-panel { padding: 4px 0; }
  .metadata-table { border-collapse: collapse; width: 100%; max-width: 500px; }
  .metadata-table th { text-align: left; color: #888; font-weight: normal; padding: 2px 12px 2px 0; width: 120px; }
  .metadata-table td { color: #ccc; padding: 2px 0; }
  .status-bar { padding: 4px 8px; background: #252526; color: #4fc3f7; font-size: 12px; border-radius: 3px; margin-top: 8px; }
</style>
`;
}
