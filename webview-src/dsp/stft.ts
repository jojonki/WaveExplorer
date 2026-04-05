import { fft } from './fft';
import { WindowType } from '../types-webview';

export function makeWindow(type: WindowType, n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    switch (type) {
      case 'hann':
        w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
        break;
      case 'hamming':
        w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
        break;
      case 'blackman':
        w[i] =
          0.42 -
          0.5 * Math.cos((2 * Math.PI * i) / (n - 1)) +
          0.08 * Math.cos((4 * Math.PI * i) / (n - 1));
        break;
      case 'rectangular':
        w[i] = 1.0;
        break;
    }
  }
  return w;
}

/**
 * Compute STFT magnitude spectra.
 * Returns a flat Float32Array of shape [nFrames * (nFFT/2+1)],
 * along with the number of frames.
 */
export function stft(
  samples: Float32Array,
  nFFT: number,
  hopLength: number,
  window: Float32Array
): { data: Float32Array; nFrames: number; nBins: number } {
  const nBins = nFFT / 2 + 1;
  const nFrames = Math.max(0, Math.floor((samples.length - nFFT) / hopLength) + 1);

  const data = new Float32Array(nFrames * nBins);
  const re = new Float32Array(nFFT);
  const im = new Float32Array(nFFT);

  for (let frame = 0; frame < nFrames; frame++) {
    const start = frame * hopLength;
    re.fill(0);
    im.fill(0);

    for (let k = 0; k < nFFT; k++) {
      re[k] = (samples[start + k] ?? 0) * window[k];
    }

    fft(re, im);

    const frameOffset = frame * nBins;
    for (let k = 0; k < nBins; k++) {
      data[frameOffset + k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
  }

  return { data, nFrames, nBins };
}
