import { AudioEngine, PlaybackState } from '../audioEngine';
import { KeybindingsConfig } from '../types-webview';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

export class Controls {
  private playBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private stopBtn: HTMLButtonElement;
  private loopBtn: HTMLButtonElement;
  private timeDisplay: HTMLSpanElement;
  private loopEnabled = false;
  private rafId: number | null = null;
  private keybindings: KeybindingsConfig;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(
    container: HTMLElement,
    private readonly engine: AudioEngine,
    keybindings: KeybindingsConfig
  ) {
    this.keybindings = keybindings;

    this.playBtn  = this.makeButton('▶ Play',  'play-btn');
    this.pauseBtn = this.makeButton('⏸ Pause', 'pause-btn');
    this.stopBtn  = this.makeButton('⏹ Stop',  'stop-btn');
    this.loopBtn  = this.makeButton('↺ Loop',  'loop-btn');
    this.timeDisplay = document.createElement('span');
    this.timeDisplay.className = 'time-display';
    this.timeDisplay.textContent = '00:00.000 / 00:00.000';

    container.append(
      this.playBtn,
      this.pauseBtn,
      this.stopBtn,
      this.loopBtn,
      this.timeDisplay
    );

    this.playBtn.addEventListener('click', () => {
      if (this.engine.state === 'paused') {
        this.engine.resume();
      } else {
        this.engine.play(this.loopEnabled);
      }
    });
    this.pauseBtn.addEventListener('click', () => this.engine.pause());
    this.stopBtn.addEventListener('click', () => this.engine.stop());
    this.loopBtn.addEventListener('click', () => {
      this.loopEnabled = !this.loopEnabled;
      this.loopBtn.classList.toggle('active', this.loopEnabled);
    });

    this.engine.onStateChange = (state) => this.updateButtons(state);
    this.updateButtons(this.engine.state);
    this.startRaf();

    this.keyHandler = (e: KeyboardEvent) => this.handleKey(e);
    document.addEventListener('keydown', this.keyHandler);
  }

  updateKeybindings(kb: KeybindingsConfig): void {
    this.keybindings = kb;
  }

  private matchesKey(event: KeyboardEvent, setting: string): boolean {
    const normalized = setting === 'Space' ? ' ' : setting;
    return event.key === normalized || event.key.toLowerCase() === normalized.toLowerCase();
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) { return; }
    if (e.ctrlKey || e.metaKey || e.altKey) { return; }

    const { play, pause, stop, loop } = this.keybindings;

    if (this.matchesKey(e, play)) {
      e.preventDefault();
      if (this.engine.state === 'playing') {
        this.engine.stop();
      } else if (this.engine.state === 'paused') {
        this.engine.resume();
      } else {
        this.engine.play(this.loopEnabled);
      }
    } else if (this.matchesKey(e, pause)) {
      e.preventDefault();
      if (this.engine.state === 'paused') {
        this.engine.resume();
      } else {
        this.engine.pause();
      }
    } else if (this.matchesKey(e, stop)) {
      e.preventDefault();
      this.engine.stop();
    } else if (this.matchesKey(e, loop)) {
      e.preventDefault();
      this.loopEnabled = !this.loopEnabled;
      this.loopBtn.classList.toggle('active', this.loopEnabled);
    }
  }

  private makeButton(label: string, className: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = `control-btn ${className}`;
    return btn;
  }

  private updateButtons(state: PlaybackState): void {
    this.playBtn.disabled  = state === 'playing';
    this.pauseBtn.disabled = state !== 'playing';
    this.stopBtn.disabled  = state === 'stopped';
  }

  private startRaf(): void {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      const cur = this.engine.getCurrentTime();
      const dur = this.engine.duration;
      this.timeDisplay.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    };
    this.rafId = requestAnimationFrame(tick);
  }

  dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    document.removeEventListener('keydown', this.keyHandler);
  }
}
