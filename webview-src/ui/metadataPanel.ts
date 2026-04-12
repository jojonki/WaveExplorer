import { WavMetadata } from '../types-webview';

function formatBytes(bytes: number): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function getFormatName(audioFormat: number): string {
  switch (audioFormat) {
    case 1:     return 'PCM';
    case 3:     return 'IEEE Float';
    case 6:     return 'A-law';
    case 7:     return 'μ-law';
    case 65534: return 'Extensible';
    default:    return `Unknown (${audioFormat})`;
  }
}

function getChannelLabel(n: number): string {
  if (n === 1) { return '1 (Mono)'; }
  if (n === 2) { return '2 (Stereo)'; }
  return `${n}`;
}

export function renderMetadata(container: HTMLElement, meta: WavMetadata): void {
  container.innerHTML = '';

  const isWav = !meta.container || meta.container === 'wav';
  const rows: [string, string][] = [
    ['Sample Rate',  meta.sampleRate > 0 ? `${meta.sampleRate.toLocaleString()} Hz` : '—'],
    ['Channels',     meta.numChannels > 0 ? getChannelLabel(meta.numChannels) : '—'],
    ...(isWav ? [
      ['Bit Depth',   `${meta.bitsPerSample} bit`] as [string, string],
      ['Format',      getFormatName(meta.audioFormat)] as [string, string],
      ['Encoding',    meta.encoding] as [string, string],
    ] : [
      ['Format',      meta.encoding] as [string, string],
    ]),
    ['Duration',     meta.durationSeconds > 0 ? formatDuration(meta.durationSeconds) : '—'],
    ...(isWav ? [
      ['Byte Rate',   `${(meta.byteRate / 1000).toFixed(1)} kB/s`] as [string, string],
      ['Block Align', `${meta.blockAlign} bytes`] as [string, string],
    ] : [
      ...(meta.bitrate != null ? [['Bitrate', `${meta.bitrate} kbps`] as [string, string]] : []),
    ]),
    ['File Size',    formatBytes(meta.fileSizeBytes)],
  ];

  const table = document.createElement('table');
  table.className = 'metadata-table';
  for (const [label, value] of rows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = label;
    const td = document.createElement('td');
    td.textContent = value;
    tr.append(th, td);
    table.appendChild(tr);
  }
  container.appendChild(table);
}
