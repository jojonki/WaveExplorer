import { ColormapName } from './types-webview';
import { COLORMAPS } from './colormaps';

const L = 44;  // left margin (Hz labels) — must match waveformRenderer.ts
const B = 18;  // bottom margin (time labels)
const T = 2;   // top padding
const R = 4;   // right padding

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

/**
 * Render a mel spectrogram with axis labels.
 * melData: flat Float32Array [nFrames * nMels], log-mel energy values.
 */
export interface SpectroRegion {
  startS: number;
  endS: number;
}

export function renderSpectrogram(
  canvas: HTMLCanvasElement,
  spectroData: Float32Array,
  nFrames: number,
  nFreqBins: number,
  colormap: ColormapName,
  duration: number,
  fMin: number,
  fMax: number,
  useMel: boolean,
  region: SpectroRegion | null = null,
  playheadS: number | null = null,
  viewStart = 0,
  viewEnd?: number
): void {
  if (nFrames === 0 || nFreqBins === 0) { return; }

  const vs = viewStart;
  const ve = viewEnd ?? duration;
  const viewSpan = ve - vs;
  if (viewSpan <= 0) { return; }

  const dpr = window.devicePixelRatio || 1;

  // Set canvas pixel size to CSS display size × dpr
  const cssW = canvas.clientWidth || 600;
  const cssH = canvas.clientHeight || 220;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const W = canvas.width;
  const H = canvas.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) { return; }

  const x0 = L * dpr;
  const y0 = T * dpr;
  const drawW = W - x0 - R * dpr;
  const drawH = H - y0 - B * dpr;

  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, W, H);

  if (drawW <= 0 || drawH <= 0) { return; }

  // ---- Render spectrogram into offscreen ImageData ----
  let globalMin = Infinity;
  let globalMax = -Infinity;
  for (let i = 0; i < spectroData.length; i++) {
    const v = spectroData[i];
    if (v < globalMin) { globalMin = v; }
    if (v > globalMax) { globalMax = v; }
  }
  const range = globalMax - globalMin || 1;
  const lut = COLORMAPS[colormap];

  // Draw into an offscreen canvas at nFrames×nFreqBins, then scale to drawW×drawH
  const offscreen = new OffscreenCanvas(nFrames, nFreqBins);
  const offCtx = offscreen.getContext('2d')!;
  const imageData = offCtx.createImageData(nFrames, nFreqBins);
  const pixels = imageData.data;

  for (let t = 0; t < nFrames; t++) {
    for (let m = 0; m < nFreqBins; m++) {
      const value = spectroData[t * nFreqBins + m];
      const norm = (value - globalMin) / range;
      const idx = Math.max(0, Math.min(255, Math.floor(norm * 255)));
      const [r, g, b] = lut[idx];
      const row = nFreqBins - 1 - m; // low freq at bottom
      const pixelIdx = (row * nFrames + t) * 4;
      pixels[pixelIdx]     = r;
      pixels[pixelIdx + 1] = g;
      pixels[pixelIdx + 2] = b;
      pixels[pixelIdx + 3] = 255;
    }
  }
  offCtx.putImageData(imageData, 0, 0);

  // Scale-draw onto main canvas (crop to view range)
  const srcX = (vs / duration) * nFrames;
  const srcW = Math.max(1, (viewSpan / duration) * nFrames);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offscreen, srcX, 0, srcW, nFreqBins, x0, y0, drawW, drawH);

  // ---- Y-axis (frequency in Hz) ----
  const melMin = hzToMel(fMin === 0 ? 20 : fMin);
  const melMax = hzToMel(fMax);

  function freqToYPos(hz: number): number {
    if (useMel) {
      return (hzToMel(hz) - melMin) / (melMax - melMin);
    } else {
      return (hz - fMin) / (fMax - fMin);
    }
  }

  const { labeled: freqLabeled, unlabeled: freqMinor } = niceFreqTicks(fMin, fMax, melMin, melMax, drawH, dpr, useMel);

  ctx.font = `${10 * dpr}px monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  // Minor grid lines (no label)
  for (const hz of freqMinor) {
    const y = y0 + (1 - freqToYPos(hz)) * drawH;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = dpr;
    ctx.setLineDash([2 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + drawW, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Major grid lines (with label)
  for (const hz of freqLabeled) {
    const y = y0 + (1 - freqToYPos(hz)) * drawH;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + drawW, y);
    ctx.stroke();
    ctx.fillStyle = '#888';
    ctx.fillText(formatHz(hz), (L - 4) * dpr, y);
  }

  // ---- X-axis (time) ----
  const { major: timeMajor, minor: timeMinor } = niceTimeTicks(vs, ve);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (const t of timeMinor) {
    const x = x0 + ((t - vs) / viewSpan) * drawW;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = dpr;
    ctx.setLineDash([2 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + drawH);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const t of timeMajor) {
    const x = x0 + ((t - vs) / viewSpan) * drawW;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + drawH);
    ctx.stroke();
    ctx.fillStyle = '#888';
    ctx.fillText(formatTime(t), x, y0 + drawH + 3 * dpr);
  }

  // Axis border
  ctx.strokeStyle = '#444';
  ctx.lineWidth = dpr;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y0 + drawH);
  ctx.lineTo(x0 + drawW, y0 + drawH);
  ctx.stroke();

  // Region overlay
  if (region) {
    const rx0 = x0 + ((region.startS - vs) / viewSpan) * drawW;
    const rx1 = x0 + ((region.endS - vs) / viewSpan) * drawW;
    const clampedRx0 = Math.max(x0, rx0);
    const clampedRx1 = Math.min(x0 + drawW, rx1);
    if (clampedRx1 > clampedRx0) {
      ctx.fillStyle = 'rgba(79, 195, 247, 0.15)';
      ctx.fillRect(clampedRx0, y0, clampedRx1 - clampedRx0, drawH);
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.6)';
      ctx.lineWidth = dpr;
      ctx.beginPath();
      if (rx0 >= x0 && rx0 <= x0 + drawW) {
        ctx.moveTo(rx0 + 0.5, y0); ctx.lineTo(rx0 + 0.5, y0 + drawH);
      }
      if (rx1 >= x0 && rx1 <= x0 + drawW) {
        ctx.moveTo(rx1 + 0.5, y0); ctx.lineTo(rx1 + 0.5, y0 + drawH);
      }
      ctx.stroke();
    }
  }

  // Playhead
  if (playheadS !== null) {
    const px = x0 + ((playheadS - vs) / viewSpan) * drawW;
    if (px >= x0 && px <= x0 + drawW) {
      ctx.strokeStyle = '#f44336';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(px + 0.5, y0);
      ctx.lineTo(px + 0.5, y0 + drawH);
      ctx.stroke();
    }
  }
}

function niceFreqTicks(
  fMin: number, fMax: number,
  melMin: number, melMax: number,
  drawH: number, dpr: number,
  useMel: boolean
): { labeled: number[]; unlabeled: number[] } {
  // Candidate ticks at perceptually meaningful Hz values
  const allCandidates = [
    20, 30, 50, 70, 100, 150, 200, 300, 500, 700,
    1000, 1500, 2000, 3000, 4000, 6000, 8000, 10000, 12000, 16000, 20000
  ];
  const labeledSet = new Set([100, 200, 500, 1000, 2000, 4000, 8000, 12000, 16000, 20000]);

  const inRange = allCandidates.filter(f => f > Math.max(fMin, 0) && f < fMax);

  // Filter labeled ticks to avoid pixel overlap (min 14px apart)
  const minPxGap = 14 * dpr;
  const labeled: number[] = [];
  let lastY = -Infinity;

  // Process from top (high freq) to bottom (low freq) to prioritize high-freq labels
  const inRangeLabeled = inRange.filter(f => labeledSet.has(f)).reverse();
  for (const hz of inRangeLabeled) {
    const pos = useMel
      ? (hzToMel(hz) - melMin) / (melMax - melMin)
      : (hz - fMin) / (fMax - fMin);
    const y = (1 - pos) * drawH;
    if (Math.abs(y - lastY) >= minPxGap) {
      labeled.push(hz);
      lastY = y;
    }
  }

  const labeledSetFinal = new Set(labeled);
  const unlabeled = inRange.filter(f => !labeledSetFinal.has(f));

  return { labeled, unlabeled };
}

function formatHz(hz: number): string {
  if (hz >= 1000) { return `${hz / 1000}k`; }
  return `${hz}`;
}

function niceTimeTicks(viewStart: number, viewEnd: number): { major: number[]; minor: number[] } {
  const viewSpan = viewEnd - viewStart;
  const majorSteps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300];
  const majorStep = majorSteps.find(s => viewSpan / s <= 8) ?? 300;
  const minorStep = majorStep / 4;

  const major: number[] = [];
  const minor: number[] = [];
  const eps = minorStep * 0.01;

  const firstT = Math.ceil(viewStart / minorStep) * minorStep;
  for (let t = firstT; t < viewEnd - eps; t += minorStep) {
    const rounded = parseFloat(t.toFixed(10));
    const isMajor = Math.abs(rounded % majorStep) < eps || Math.abs(rounded % majorStep - majorStep) < eps;
    if (isMajor) {
      major.push(rounded);
    } else {
      minor.push(rounded);
    }
  }
  return { major, minor };
}

function formatTime(s: number): string {
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(Math.round(sec)).padStart(2, '0')}`;
  }
  if (s < 0.1) { return `${(s * 1000).toFixed(1)}ms`; }
  if (s < 1) { return `${(s * 1000).toFixed(0)}ms`; }
  if (s < 10) { return `${s.toFixed(2)}s`; }
  return `${s.toFixed(1)}s`;
}
