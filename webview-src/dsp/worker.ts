import { WorkerInMessage, WorkerOutMessage } from '../types-webview';
import { stft, makeWindow } from './stft';
import { buildMelFilterbank, applyMelFilterbank } from './melFilterbank';

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const { samples, config, sampleRate } = event.data;
  const { nFFT, hopLength, nMels, fMin, windowType } = config;
  const fMax = config.fMax ?? sampleRate / 2;

  // Progress: STFT
  const progressMsg: WorkerOutMessage = { type: 'progress', percent: 10 };
  (self as unknown as Worker).postMessage(progressMsg);

  const window = makeWindow(windowType, nFFT);
  const { data: stftData, nFrames, nBins } = stft(samples, nFFT, hopLength, window);

  const prog2: WorkerOutMessage = { type: 'progress', percent: 60 };
  (self as unknown as Worker).postMessage(prog2);

  const filterbank = buildMelFilterbank(nMels, nFFT, sampleRate, fMin, fMax);
  const melData = applyMelFilterbank(stftData, nFrames, nBins, filterbank, nMels);

  const prog3: WorkerOutMessage = { type: 'progress', percent: 100 };
  (self as unknown as Worker).postMessage(prog3);

  const resultMsg: WorkerOutMessage = {
    type: 'result',
    data: melData,
    nFrames,
    nMels,
  };
  (self as unknown as Worker).postMessage(resultMsg, [melData.buffer]);
};
