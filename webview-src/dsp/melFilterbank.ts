function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

/**
 * Build a mel filterbank as a flat Float32Array.
 * Shape: [nMels * nBins] where nBins = nFFT/2+1.
 * Each row m contains the triangular filter weights for mel band m.
 */
export function buildMelFilterbank(
  nMels: number,
  nFFT: number,
  sampleRate: number,
  fMin: number,
  fMax: number
): Float32Array {
  const nBins = nFFT / 2 + 1;
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(fMax);

  // nMels+2 equally-spaced mel points → convert back to Hz
  const melPoints = Array.from(
    { length: nMels + 2 },
    (_, i) => melToHz(melMin + (i / (nMels + 1)) * (melMax - melMin))
  );

  // Convert Hz center frequencies to FFT bin indices
  const binIndices = melPoints.map((f) =>
    Math.floor(((nFFT + 1) * f) / sampleRate)
  );

  const filterbank = new Float32Array(nMels * nBins);

  for (let m = 0; m < nMels; m++) {
    const lo = binIndices[m];
    const center = binIndices[m + 1];
    const hi = binIndices[m + 2];
    const row = m * nBins;

    for (let k = lo; k < center; k++) {
      if (k >= 0 && k < nBins && center > lo) {
        filterbank[row + k] = (k - lo) / (center - lo);
      }
    }
    for (let k = center; k <= hi; k++) {
      if (k >= 0 && k < nBins && hi > center) {
        filterbank[row + k] = (hi - k) / (hi - center);
      }
    }
  }

  return filterbank;
}

/**
 * Apply mel filterbank to STFT magnitude spectra.
 * stftData: flat [nFrames * nBins]
 * filterbank: flat [nMels * nBins]
 * Returns flat Float32Array [nFrames * nMels] (log-mel energy).
 */
export function applyMelFilterbank(
  stftData: Float32Array,
  nFrames: number,
  nBins: number,
  filterbank: Float32Array,
  nMels: number
): Float32Array {
  const result = new Float32Array(nFrames * nMels);

  for (let t = 0; t < nFrames; t++) {
    const frameOffset = t * nBins;
    const outOffset = t * nMels;
    for (let m = 0; m < nMels; m++) {
      let energy = 0;
      const filterRow = m * nBins;
      for (let k = 0; k < nBins; k++) {
        const mag = stftData[frameOffset + k];
        energy += mag * mag * filterbank[filterRow + k]; // power spectrum × filter
      }
      result[outOffset + m] = Math.log(energy + 1e-9);
    }
  }

  return result;
}
