import { WavMetadata } from './types';

interface FmtChunk {
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
}

function parseFmtChunk(buf: Buffer, offset: number, chunkSize: number): FmtChunk {
  const audioFormat = buf.readUInt16LE(offset);
  const numChannels = buf.readUInt16LE(offset + 2);
  const sampleRate = buf.readUInt32LE(offset + 4);
  const byteRate = buf.readUInt32LE(offset + 8);
  const blockAlign = buf.readUInt16LE(offset + 12);
  const bitsPerSample = buf.readUInt16LE(offset + 14);

  // For WAVE_FORMAT_EXTENSIBLE (0xFFFE), the actual sub-format GUID is at offset+24
  // The first two bytes of the GUID are the actual format code
  let resolvedFormat = audioFormat;
  if (audioFormat === 0xfffe && chunkSize >= 40) {
    resolvedFormat = buf.readUInt16LE(offset + 24);
  }

  return { audioFormat: resolvedFormat, numChannels, sampleRate, byteRate, blockAlign, bitsPerSample };
}

function getEncodingString(audioFormat: number, bitsPerSample: number): string {
  switch (audioFormat) {
    case 1:   return `PCM ${bitsPerSample}-bit`;
    case 3:   return `IEEE Float ${bitsPerSample}-bit`;
    case 6:   return 'A-law 8-bit';
    case 7:   return 'μ-law 8-bit';
    default:  return `Unknown (format ${audioFormat})`;
  }
}

export function parseWav(buf: Buffer): WavMetadata {
  if (buf.length < 44) {
    throw new Error('File too small to be a valid WAV');
  }
  if (buf.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Not a RIFF file');
  }
  if (buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a WAVE file');
  }

  let offset = 12;
  let fmt: FmtChunk | null = null;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ') {
      fmt = parseFmtChunk(buf, offset + 8, chunkSize);
    } else if (chunkId === 'data') {
      // If dataSize is 0xFFFFFFFF (RF64), use the actual file length
      dataSize = chunkSize === 0xffffffff
        ? buf.length - offset - 8
        : chunkSize;
      break;
    }

    // Advance past this chunk (word-aligned)
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (!fmt) {
    throw new Error('No fmt chunk found in WAV file');
  }
  if (dataSize === 0 && buf.length > 44) {
    // Fallback: estimate from file size
    dataSize = buf.length - 44;
  }

  const durationSeconds = fmt.byteRate > 0 ? dataSize / fmt.byteRate : 0;

  return {
    sampleRate: fmt.sampleRate,
    numChannels: fmt.numChannels,
    bitsPerSample: fmt.bitsPerSample,
    audioFormat: fmt.audioFormat,
    byteRate: fmt.byteRate,
    blockAlign: fmt.blockAlign,
    durationSeconds,
    fileSizeBytes: buf.length,
    encoding: getEncodingString(fmt.audioFormat, fmt.bitsPerSample),
  };
}
