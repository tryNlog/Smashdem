/**
 * WebAudio 합성 SFX.
 *
 * 외부 오디오 파일을 쓰지 않는다(제출 규율: 도형·합성만). AudioContext 로 짧은 파형을 그때그때 만든다.
 * 브라우저 자동재생 정책상 AudioContext 는 사용자 제스처 이후에만 소리가 난다 — main.ts 가 첫
 * pointerdown/keydown 에서 resume() 을 부른다.
 *
 * 음소거 상태는 localStorage 에 저장해 새로고침 후에도 유지한다. 시뮬레이션과 무관한 렌더/연출 계층이다.
 */

export type SoundCue =
  | 'collision'
  | 'strongHit'
  | 'ringOut'
  | 'ringOutFinish'
  | 'burst'
  | 'setComplete'
  | 'rewardSelect'
  | 'win'
  | 'lose';

export interface AudioController {
  /** 효과음 재생. strength(0~1)는 충돌 세기 등 크기 변조에 쓴다. */
  play(cue: SoundCue, strength?: number): void;
  /** 사용자 제스처 시 호출 — suspended 상태의 컨텍스트를 깨운다. */
  resume(): void;
  toggleMute(): boolean;
  isMuted(): boolean;
}

const MUTE_STORAGE_KEY = 'nan2026.audio.muted';

/** 소리가 안 나는 더미(오디오 미지원 환경 폴백). */
function createSilentController(): AudioController {
  let muted = true;
  return {
    play() {},
    resume() {},
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}

export function createAudioController(): AudioController {
  const AudioContextClass =
    typeof window !== 'undefined'
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AudioContextClass) return createSilentController();
  const AudioContextCtor: typeof AudioContext = AudioContextClass;

  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let muted = readMutePreference();

  function ensureContext(): AudioContext | null {
    if (context) return context;
    try {
      context = new AudioContextCtor();
      masterGain = context.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(context.destination);
      noiseBuffer = createNoiseBuffer(context);
    } catch {
      context = null;
    }
    return context;
  }

  function now(): number {
    return context ? context.currentTime : 0;
  }

  /** 감쇠 엔벨로프를 가진 오실레이터 1개. */
  function tone(
    type: OscillatorType,
    startHz: number,
    endHz: number,
    duration: number,
    peakGain: number,
    delay = 0,
  ): void {
    if (!context || !masterGain) return;
    const startAt = now() + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startHz, startAt);
    if (endHz !== startHz) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endHz), startAt + duration);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peakGain), startAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  /** 화이트노이즈 버스트(충돌 파열음·휘슬). */
  function noise(duration: number, peakGain: number, highpassHz: number, delay = 0): void {
    if (!context || !masterGain || !noiseBuffer) return;
    const startAt = now() + delay;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpassHz;
    const gain = context.createGain();
    gain.gain.setValueAtTime(peakGain, startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(startAt);
    source.stop(startAt + duration + 0.02);
  }

  function play(cue: SoundCue, strength = 0.5): void {
    if (muted) return;
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const s = Math.max(0, Math.min(1, strength));

    switch (cue) {
      case 'collision':
        // 가벼운 딱/틱 — 세기에 비례한 저역 쿵 + 짧은 노이즈.
        tone('triangle', 200 + s * 120, 90, 0.09, 0.05 + s * 0.10);
        noise(0.05, 0.03 + s * 0.06, 1800);
        break;
      case 'strongHit':
        // 강타 — 더 낮고 묵직한 쿵 + 넓은 노이즈.
        tone('sawtooth', 160, 60, 0.16, 0.10 + s * 0.12);
        tone('sine', 90, 46, 0.20, 0.10 + s * 0.10);
        noise(0.10, 0.10, 900);
        break;
      case 'ringOut':
        // 링아웃 — 밀려 날아가는 하강 휘슬 + 저역 임팩트.
        tone('sawtooth', 520, 120, 0.30, 0.16);
        tone('sine', 120, 55, 0.26, 0.14);
        noise(0.22, 0.12, 700);
        break;
      case 'ringOutFinish':
        tone('sawtooth', 540, 90, 0.42, 0.18);
        tone('sine', 130, 48, 0.40, 0.16);
        noise(0.30, 0.14, 600);
        break;
      case 'burst':
        // 버스트 발동 — 상승 처프.
        tone('square', 320, 760, 0.16, 0.09);
        tone('sine', 480, 900, 0.14, 0.06);
        break;
      case 'setComplete': {
        // 세트 완성 — 밝은 3음 상행 아르페지오(도-미-솔).
        const chord = [523.25, 659.25, 783.99];
        chord.forEach((hz, i) => tone('triangle', hz, hz, 0.5, 0.11, i * 0.07));
        tone('sine', 261.63, 261.63, 0.6, 0.06);
        break;
      }
      case 'rewardSelect':
        tone('square', 440, 660, 0.10, 0.07);
        break;
      case 'win': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((hz, i) => tone('triangle', hz, hz, 0.32, 0.12, i * 0.10));
        break;
      }
      case 'lose': {
        const notes = [392.0, 329.63, 261.63];
        notes.forEach((hz, i) => tone('sawtooth', hz, hz * 0.98, 0.34, 0.10, i * 0.12));
        break;
      }
    }
  }

  return {
    play,
    resume() {
      const ctx = ensureContext();
      if (ctx && ctx.state === 'suspended') void ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      writeMutePreference(muted);
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}

function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * 0.4);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function readMutePreference(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMutePreference(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    /* localStorage 불가 환경 — 무시 */
  }
}
