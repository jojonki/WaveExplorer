export interface Region {
  startS: number;
  endS: number;
}

const L = 44;  // left margin (Y-axis labels)
const B = 18;  // bottom margin (time labels)
const T = 2;   // top padding
const R = 4;   // right padding

export function renderWaveform(
  canvas: HTMLCanvasElement,
  samples: Float32Array,
  duration: number,
  color: string,
  region: Region | null,
  playheadS: number | null,
  viewStart = 0,
  viewEnd?: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) { return; }

  const vs = viewStart;
  const ve = viewEnd ?? duration;
  const viewSpan = ve - vs;

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width;
  const H = canvas.height;

  // Drawing area (inside margins)
  const x0 = L * dpr;
  const y0 = T * dpr;
  const drawW = W - x0 - R * dpr;
  const drawH = H - y0 - B * dpr;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, W, H);

  if (samples.length === 0 || drawW <= 0 || drawH <= 0 || viewSpan <= 0) { return; }

  // ---- Y-axis (amplitude) ----
  // Major ticks every 0.5, minor ticks every 0.25
  const yMajor = new Set([-1, -0.5, 0, 0.5, 1]);
  const yTicks = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  ctx.font = `${10 * dpr}px monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (const v of yTicks) {
    const y = y0 + ((1 - v) / 2) * drawH;
    const isMajor = yMajor.has(v);
    ctx.strokeStyle = v === 0 ? '#3a3a3a' : isMajor ? '#2c2c2c' : '#252525';
    ctx.lineWidth = dpr;
    ctx.setLineDash(isMajor ? [] : [2 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + drawW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (isMajor) {
      ctx.fillStyle = '#666';
      ctx.fillText(v === 0 ? '0' : v.toFixed(1), (L - 4) * dpr, y);
    }
  }

  // ---- X-axis (time) ----
  const { major: timeMajor, minor: timeMinor } = niceTimeTicks(vs, ve);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (const t of timeMinor) {
    const x = x0 + ((t - vs) / viewSpan) * drawW;
    ctx.strokeStyle = '#252525';
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
    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + drawH);
    ctx.stroke();
    ctx.fillStyle = '#666';
    ctx.fillText(formatTime(t), x, y0 + drawH + 3 * dpr);
  }

  // Axis lines
  ctx.strokeStyle = '#444';
  ctx.lineWidth = dpr;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y0 + drawH);
  ctx.lineTo(x0 + drawW, y0 + drawH);
  ctx.stroke();

  // Region highlight
  if (region) {
    const rx0 = x0 + ((region.startS - vs) / viewSpan) * drawW;
    const rx1 = x0 + ((region.endS - vs) / viewSpan) * drawW;
    const clampedRx0 = Math.max(x0, rx0);
    const clampedRx1 = Math.min(x0 + drawW, rx1);
    if (clampedRx1 > clampedRx0) {
      ctx.fillStyle = 'rgba(79, 195, 247, 0.15)';
      ctx.fillRect(clampedRx0, y0, clampedRx1 - clampedRx0, drawH);
      if (rx0 >= x0 && rx0 <= x0 + drawW) {
        ctx.strokeStyle = 'rgba(79, 195, 247, 0.6)';
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(rx0 + 0.5, y0);
        ctx.lineTo(rx0 + 0.5, y0 + drawH);
        ctx.stroke();
      }
      if (rx1 >= x0 && rx1 <= x0 + drawW) {
        ctx.strokeStyle = 'rgba(79, 195, 247, 0.6)';
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(rx1 + 0.5, y0);
        ctx.lineTo(rx1 + 0.5, y0 + drawH);
        ctx.stroke();
      }
    }
  }

  // Waveform envelope (min/max per pixel column) within view range
  const startSample = Math.floor((vs / duration) * samples.length);
  const endSample = Math.ceil((ve / duration) * samples.length);
  const visibleSamples = Math.max(1, endSample - startSample);
  const samplesPerPixel = visibleSamples / drawW;

  ctx.strokeStyle = color;
  ctx.lineWidth = dpr;

  for (let px = 0; px < Math.floor(drawW); px++) {
    const si = startSample + Math.floor(px * samplesPerPixel);
    const ei = Math.min(startSample + Math.ceil((px + 1) * samplesPerPixel), endSample);
    let min = 1.0;
    let max = -1.0;
    for (let i = si; i < ei; i++) {
      const v = samples[i];
      if (v < min) { min = v; }
      if (v > max) { max = v; }
    }
    min = Math.max(-1, Math.min(1, min));
    max = Math.max(-1, Math.min(1, max));

    const yMin = y0 + ((1 - max) / 2) * drawH;
    const yMax = y0 + ((1 - min) / 2) * drawH;
    const screenX = x0 + px + 0.5;

    ctx.beginPath();
    ctx.moveTo(screenX, yMin);
    ctx.lineTo(screenX, Math.max(yMax, yMin + dpr));
    ctx.stroke();
  }

  // Playhead
  if (playheadS !== null && viewSpan > 0) {
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
