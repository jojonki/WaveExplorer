/**
 * In-place radix-2 Cooley-Tukey FFT.
 * re and im must be the same length, which must be a power of 2.
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const N = re.length;

  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }

  // Butterfly stages
  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wBaseRe = Math.cos(angle);
    const wBaseIm = Math.sin(angle);

    for (let i = 0; i < N; i += len) {
      let wRe = 1.0;
      let wIm = 0.0;
      for (let k = 0; k < halfLen; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + halfLen] * wRe - im[i + k + halfLen] * wIm;
        const vIm = re[i + k + halfLen] * wIm + im[i + k + halfLen] * wRe;

        re[i + k]           = uRe + vRe;
        im[i + k]           = uIm + vIm;
        re[i + k + halfLen] = uRe - vRe;
        im[i + k + halfLen] = uIm - vIm;

        const nextWRe = wRe * wBaseRe - wIm * wBaseIm;
        wIm = wRe * wBaseIm + wIm * wBaseRe;
        wRe = nextWRe;
      }
    }
  }
}
