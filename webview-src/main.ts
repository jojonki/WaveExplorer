import { ExtToWebviewMessage, VisConfig, WavMetadata, MelConfig, WorkerInMessage, WorkerOutMessage } from './types-webview';
import { AudioEngine } from './audioEngine';
import { renderWaveform, Region } from './waveformRenderer';
import { renderSpectrogram } from './spectrogramRenderer';
import { attachRegionSelector } from './ui/regionSelector';
import { Controls } from './ui/controls';
import { renderMetadata } from './ui/metadataPanel';

declare const window: Window & {
  acquireVsCodeApi: () => { postMessage: (msg: unknown) => void };
  WORKER_URL: string;
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

// Worker state
let melWorker: Worker | null = null;
let melWorkerReject: ((e: Error) => void) | null = null;

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

// ---- Spectrogram loading indicator ----
function drawComputingIndicator(percent: number): void {
  const canvas = spectroEl;
  const ctx = canvas.getContext('2d');
  if (!ctx) { return; }
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (w <= 0 || h <= 0) { return; }
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.clearRect(0, 0, w, h);

  const label = `Computing... ${percent}%`;
  const barW = Math.round(w * 0.5);
  const barH = Math.round(h * 0.04);
  const barX = Math.round((w - barW) / 2);
  const barY = Math.round(h / 2) - Math.round(barH / 2);

  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#4fc3f7';
  ctx.fillRect(barX, barY, Math.round(barW * percent / 100), barH);

  ctx.font = `${Math.round(11 * dpr)}px monospace`;
  ctx.fillStyle = '#aaa';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, w / 2, barY - Math.round(4 * dpr));
}

// ---- Spectrogram computation (via Worker) ----
async function computeSpectro(mel: MelConfig, sr: number, useMel: boolean): Promise<void> {
  if (!samples) { return; }

  // 前回の計算をキャンセル
  if (melWorker) {
    melWorker.terminate();
    melWorker = null;
    melWorkerReject?.(new Error('cancelled'));
    melWorkerReject = null;
  }

  spectroWrap.style.display = '';
  drawComputingIndicator(0);
  setStatus(useMel ? 'Computing mel spectrogram...' : 'Computing spectrogram...');

  try {
    const res = await fetch(window.WORKER_URL);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    melWorker = new Worker(blobUrl);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    const msg = `Worker creation failed: ${err}`;
    console.error('[vis-audio]', msg, 'WORKER_URL=', window.WORKER_URL);
    setStatus(msg);
    return;
  }

  const worker = melWorker;
  return new Promise<void>((resolve, reject) => {
    melWorkerReject = reject;

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        drawComputingIndicator(msg.percent);
        setStatus(`Computing... ${msg.percent}%`);
      } else if (msg.type === 'result') {
        spectroData = msg.data;
        spectroNFrames = msg.nFrames;
        spectroNBins = msg.nBins;
        drawSpectrogram();
        setStatus('');
        melWorker = null;
        melWorkerReject = null;
        resolve();
      }
    };

    worker.onerror = (e) => {
      const errMsg = `Spectrogram error: ${e.message || '(no message)'}`;
      console.error('[vis-audio] Worker error:', e);
      setStatus(errMsg);
      melWorker = null;
      melWorkerReject = null;
      reject(new Error(errMsg));
    };

    const samplesForWorker = samples!.slice();
    worker.postMessage({
      type: 'compute',
      samples: samplesForWorker,
      config: mel,
      sampleRate: sr,
      useMel,
    } satisfies WorkerInMessage, [samplesForWorker.buffer]);
  });
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

    // Update metadata with values from the decoded AudioBuffer (needed for non-WAV formats).
    if (metadata) {
      metadata.sampleRate = buf.sampleRate;
      metadata.numChannels = buf.numberOfChannels;
      metadata.durationSeconds = buf.duration;
      if (buf.duration > 0) {
        metadata.bitrate = Math.round((metadata.fileSizeBytes * 8) / (buf.duration * 1000));
      }
      renderMetadata(metaEl, metadata);
    }

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
