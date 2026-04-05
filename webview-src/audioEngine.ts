export type PlaybackState = 'stopped' | 'playing' | 'paused';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;

  private startTime = 0;       // AudioContext.currentTime when play() was called
  private startOffset = 0;     // offset in seconds where playback began
  private _state: PlaybackState = 'stopped';

  public regionStart = 0;      // seconds
  public regionEnd: number | null = null;  // null = end of file

  public onStateChange: ((state: PlaybackState) => void) | null = null;
  public onEnded: (() => void) | null = null;

  get state(): PlaybackState { return this._state; }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  async load(arrayBuffer: ArrayBuffer): Promise<void> {
    const ctx = this.getCtx();
    this.buffer = await ctx.decodeAudioData(arrayBuffer);
    this.regionStart = 0;
    this.regionEnd = null;
    this.startOffset = 0;
    this._state = 'stopped';
  }

  loadBuffer(audioBuffer: AudioBuffer): void {
    this.buffer = audioBuffer;
    this.regionStart = 0;
    this.regionEnd = null;
    this.startOffset = 0;
    this._state = 'stopped';
  }

  play(loop = false): void {
    if (!this.buffer) { return; }
    this.stopSource();

    const ctx = this.getCtx();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(ctx.destination);

    const effectiveEnd = this.regionEnd ?? this.buffer.duration;
    const offset = Math.max(this.regionStart, Math.min(this.startOffset, effectiveEnd));

    if (loop) {
      src.loop = true;
      src.loopStart = this.regionStart;
      src.loopEnd = effectiveEnd;
      src.start(0, offset);
    } else {
      const remaining = effectiveEnd - offset;
      src.start(0, offset, remaining > 0 ? remaining : undefined);
    }

    src.onended = () => {
      if (this._state === 'playing') {
        this._state = 'stopped';
        this.startOffset = this.regionStart;
        this.onEnded?.();
        this.setState('stopped');
      }
    };

    this.source = src;
    this.startTime = ctx.currentTime;
    this.startOffset = offset;
    this.setState('playing');
  }

  pause(): void {
    if (this._state !== 'playing') { return; }
    this.startOffset = this.getCurrentTime();
    this.stopSource();
    this.setState('paused');
  }

  resume(): void {
    if (this._state !== 'paused') { return; }
    this.play(false);
  }

  stop(): void {
    this.stopSource();
    this.startOffset = this.regionStart;
    this.setState('stopped');
  }

  getCurrentTime(): number {
    if (!this.ctx || !this.source) { return this.startOffset; }
    const effectiveEnd = this.regionEnd ?? (this.buffer?.duration ?? 0);
    const elapsed = this.ctx.currentTime - this.startTime;
    return Math.min(this.startOffset + elapsed, effectiveEnd);
  }

  setRegion(startS: number, endS: number | null): void {
    this.regionStart = startS;
    this.regionEnd = endS;
    if (this._state === 'stopped') {
      this.startOffset = startS;
    }
  }

  clearRegion(): void {
    this.regionStart = 0;
    this.regionEnd = null;
    if (this._state === 'stopped') {
      this.startOffset = 0;
    }
  }

  private stopSource(): void {
    if (this.source) {
      this.source.onended = null;
      try { this.source.stop(); } catch { /* already stopped */ }
      this.source = null;
    }
  }

  private setState(s: PlaybackState): void {
    this._state = s;
    this.onStateChange?.(s);
  }

  dispose(): void {
    this.stopSource();
    void this.ctx?.close();
    this.ctx = null;
    this.buffer = null;
  }
}
