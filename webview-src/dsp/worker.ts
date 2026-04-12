import { WorkerInMessage, WorkerOutMessage } from '../types-webview';
import { stft, makeWindow } from './stft';
import { buildMelFilterbank, applyMelFilterbank } from './melFilterbank';

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const { samples, config, sampleRate, useMel } = event.data;
  const { nFFT, hopLength, nMels, fMin, windowType } = config;
  const fMax = config.fMax ?? sampleRate / 2;

  const prog1: WorkerOutMessage = { type: 'progress', percent: 10 };
  (self as unknown as Worker).postMessage(prog1);

  const win = makeWindow(windowType, nFFT);
  const { data: stftData, nFrames, nBins } = stft(samples, nFFT, hopLength, win);

  const prog2: WorkerOutMessage = { type: 'progress', percent: 60 };
  (self as unknown as Worker).postMessage(prog2);

  let resultData: Float32Array;
  let outBins: number;

  if (useMel) {
    const filterbank = buildMelFilterbank(nMels, nFFT, sampleRate, fMin, fMax);
    resultData = applyMelFilterbank(stftData, nFrames, nBins, filterbank, nMels);
    outBins = nMels;
  } else {
    const logData = new Float32Array(stftData.length);
    for (let i = 0; i < stftData.length; i++) {
      logData[i] = Math.log(stftData[i] * stftData[i] + 1e-9);
    }
    resultData = logData;
    outBins = nBins;
  }

  const prog3: WorkerOutMessage = { type: 'progress', percent: 100 };
  (self as unknown as Worker).postMessage(prog3);

  const resultMsg: WorkerOutMessage = {
    type: 'result',
    data: resultData,
    nFrames,
    nBins: outBins,
  };
  (self as unknown as Worker).postMessage(resultMsg, [resultData.buffer]);
};
