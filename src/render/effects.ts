/**
 * 연출 효과 버퍼.
 *
 * 시뮬레이션이 뱉은 SimulationEvent[] 를 여기서 받아 화면 효과로 바꾼다.
 * 시뮬은 "무슨 일이 일어났는가"만 알고, "어떻게 보이는가"는 전부 이쪽 책임이다.
 *
 * 효과의 수명은 렌더 시간(가변 dt)으로 흘러도 된다. 게임플레이에 영향을 주지 않기 때문이다.
 *
 * ★ juice 강도 차등(02_게임설계.md PT-1-A): 일반 충돌 < 강타 < 링아웃 순으로
 *   히트스톱·화면흔들림·파티클·플래시가 커진다. 세기가 눈으로 구분돼야 "파츠를 강화하면 세진다"가 보인다.
 * ★ 파티클 난수는 renderRandom(렌더 전용) 만 쓴다 — 시뮬 시드에 영향 0.
 */

import type { SimulationEvent } from '../game/types';
import type { SoundCue } from './audio';
import { renderRandomRange, renderRandomUnit } from './renderRandom';

export interface ImpactRing {
  positionX: number;
  positionY: number;
  /** 0~1 충돌 세기. 반경·굵기·색 농도에 쓴다. */
  strength: number;
  /** 남은 수명(초). */
  remainingSeconds: number;
  totalSeconds: number;
  color: string;
}

/** 충돌 지점에서 튀는 짧은 선분 스파크. */
export interface Spark {
  positionX: number;
  positionY: number;
  velocityX: number;
  velocityY: number;
  remainingSeconds: number;
  totalSeconds: number;
  /** 선분 길이(px). 속도에 비례. */
  length: number;
  width: number;
  color: string;
}

/** 회전력 게이지가 크게 깎이는 순간의 강조(F3). beybladeIndex 별로 HUD 게이지를 번쩍인다. */
export interface SpinDropFlash {
  beybladeIndex: number;
  remainingSeconds: number;
  totalSeconds: number;
}

export interface EffectBuffer {
  impactRings: ImpactRing[];
  sparks: Spark[];
  spinDropFlashes: SpinDropFlash[];
  /** 화면 흔들림 남은 시간·세기. */
  shakeRemainingSeconds: number;
  shakeStrength: number;
  /** 히트스톱 — 남은 시간(초) 동안 렌더 표현(위치·회전·파티클·흔들림)이 정지한다. 시뮬 틱과 무관. */
  hitStopRemainingSeconds: number;
  /** 임팩트 플래시 — 화면 전체를 짧게 덧칠. */
  flashRemainingSeconds: number;
  flashTotalSeconds: number;
  flashStrength: number;
  flashColor: string;
}

const IMPACT_RING_LIFETIME_SECONDS = 0.32;
const BURST_RING_LIFETIME_SECONDS = 0.45;
const DEFEAT_RING_LIFETIME_SECONDS = 0.7;
const SHAKE_LIFETIME_SECONDS = 0.18;

// ── juice 강도 차등 상수 ────────────────────────────────────
/** 이 세기 이상이면 "강타"로 보고 히트스톱·플래시를 건다. */
const STRONG_HIT_STRENGTH = 0.5;
/** 프레임 = 1/60초. 히트스톱은 2~4프레임 범위(멀미 방지 상한). */
const FRAME_SECONDS = 1 / 60;
const HITSTOP_STRONG_FRAMES = 2;
const HITSTOP_RINGOUT_FRAMES = 3;
const HITSTOP_FINISH_FRAMES = 4;
/** 파티클 상한 — 초과분은 오래된 것부터 버린다(60fps 방어). 화면 흔들림 진폭 상한은 renderer.ts 참조. */
const MAX_SPARKS = 140;

export function createEffectBuffer(): EffectBuffer {
  return {
    impactRings: [],
    sparks: [],
    spinDropFlashes: [],
    shakeRemainingSeconds: 0,
    shakeStrength: 0,
    hitStopRemainingSeconds: 0,
    flashRemainingSeconds: 0,
    flashTotalSeconds: 0,
    flashStrength: 0,
    flashColor: '#ffffff',
  };
}

function pushShake(buffer: EffectBuffer, strength: number, lifetime: number): void {
  // 더 센 흔들림이 들어오면 갱신, 아니면 남은 시간만 늘린다(작은 흔들림이 큰 흔들림을 덮지 않게).
  if (strength >= buffer.shakeStrength || buffer.shakeRemainingSeconds <= 0) {
    buffer.shakeStrength = strength;
  }
  buffer.shakeRemainingSeconds = Math.max(buffer.shakeRemainingSeconds, lifetime);
}

function pushHitStop(buffer: EffectBuffer, seconds: number): void {
  buffer.hitStopRemainingSeconds = Math.max(buffer.hitStopRemainingSeconds, seconds);
}

function pushFlash(buffer: EffectBuffer, strength: number, seconds: number, color: string): void {
  if (strength >= buffer.flashStrength || buffer.flashRemainingSeconds <= 0) {
    buffer.flashStrength = strength;
    buffer.flashColor = color;
    buffer.flashTotalSeconds = seconds;
  }
  buffer.flashRemainingSeconds = Math.max(buffer.flashRemainingSeconds, seconds);
}

/** 스파크 다발을 충돌 지점에 뿌린다. count·속도·수명은 세기에 비례. */
function spawnSparks(
  buffer: EffectBuffer,
  x: number,
  y: number,
  strength: number,
  count: number,
  baseColor: string,
  speedScale: number,
): void {
  for (let i = 0; i < count; i += 1) {
    const angle = renderRandomUnit() * Math.PI * 2;
    const speed = renderRandomRange(60, 90 + strength * 260) * speedScale;
    const life = renderRandomRange(0.18, 0.36 + strength * 0.2);
    buffer.sparks.push({
      positionX: x,
      positionY: y,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      remainingSeconds: life,
      totalSeconds: life,
      length: renderRandomRange(4, 8 + strength * 10),
      width: renderRandomRange(1, 2 + strength * 1.5),
      color: baseColor,
    });
  }
  // 상한 초과분은 오래된 것부터 제거.
  if (buffer.sparks.length > MAX_SPARKS) {
    buffer.sparks.splice(0, buffer.sparks.length - MAX_SPARKS);
  }
}

function pushSpinDropFlash(buffer: EffectBuffer, beybladeIndex: number): void {
  buffer.spinDropFlashes.push({ beybladeIndex, remainingSeconds: 0.5, totalSeconds: 0.5 });
}

/**
 * 시뮬 이벤트를 화면 효과로 변환해 버퍼에 넣는다.
 * @param onCue 있으면 효과음 큐를 던진다(audio 계층). 없으면 소리 없이 시각 효과만.
 */
export function consumeSimulationEvents(
  buffer: EffectBuffer,
  events: readonly SimulationEvent[],
  onCue?: (cue: SoundCue, strength: number) => void,
): void {
  for (const event of events) {
    switch (event.kind) {
      case 'collision': {
        const strong = event.strength >= STRONG_HIT_STRENGTH;
        buffer.impactRings.push({
          positionX: event.positionX,
          positionY: event.positionY,
          strength: event.strength,
          remainingSeconds: IMPACT_RING_LIFETIME_SECONDS,
          totalSeconds: IMPACT_RING_LIFETIME_SECONDS,
          color: strong ? '#ffe08a' : '#ffffff',
        });
        const sparkCount = Math.round(3 + event.strength * 9);
        spawnSparks(buffer, event.positionX, event.positionY, event.strength, sparkCount, strong ? '#ffd27a' : '#cfe6ff', 1);
        pushShake(buffer, event.strength, SHAKE_LIFETIME_SECONDS);
        if (strong) {
          pushHitStop(buffer, HITSTOP_STRONG_FRAMES * FRAME_SECONDS);
          pushFlash(buffer, (event.strength - STRONG_HIT_STRENGTH) / (1 - STRONG_HIT_STRENGTH) * 0.35, 0.1, '#fff2c4');
        }
        onCue?.(strong ? 'strongHit' : 'collision', event.strength);
        break;
      }

      case 'burstActivated':
        buffer.impactRings.push({
          positionX: event.positionX,
          positionY: event.positionY,
          strength: 0.7,
          remainingSeconds: BURST_RING_LIFETIME_SECONDS,
          totalSeconds: BURST_RING_LIFETIME_SECONDS,
          color: '#ffd166',
        });
        spawnSparks(buffer, event.positionX, event.positionY, 0.6, 10, '#ffe08a', 1.1);
        onCue?.('burst', 0.7);
        break;

      case 'ringOut': {
        // F3 — 링아웃: 큰 히트스톱 + 강한 흔들림 + 스파크 폭발 + 게이지 급감 강조 + 카운터.
        buffer.impactRings.push({
          positionX: event.positionX,
          positionY: event.positionY,
          strength: 1,
          remainingSeconds: DEFEAT_RING_LIFETIME_SECONDS,
          totalSeconds: DEFEAT_RING_LIFETIME_SECONDS,
          color: event.finish ? '#ff5d5d' : '#ff9a3c',
        });
        spawnSparks(buffer, event.positionX, event.positionY, 1, 20, '#ffb14e', 1.3);
        pushShake(buffer, 1, SHAKE_LIFETIME_SECONDS * 2);
        pushHitStop(buffer, (event.finish ? HITSTOP_FINISH_FRAMES : HITSTOP_RINGOUT_FRAMES) * FRAME_SECONDS);
        pushFlash(buffer, event.finish ? 0.6 : 0.4, 0.14, '#ffb14e');
        pushSpinDropFlash(buffer, event.beybladeIndex);
        onCue?.(event.finish ? 'ringOutFinish' : 'ringOut', 1);
        break;
      }

      case 'spinOut':
        buffer.impactRings.push({
          positionX: event.positionX,
          positionY: event.positionY,
          strength: 1,
          remainingSeconds: DEFEAT_RING_LIFETIME_SECONDS,
          totalSeconds: DEFEAT_RING_LIFETIME_SECONDS,
          color: '#ff6b6b',
        });
        spawnSparks(buffer, event.positionX, event.positionY, 1, 16, '#ff8a8a', 1.2);
        pushShake(buffer, 1, SHAKE_LIFETIME_SECONDS * 2);
        pushHitStop(buffer, HITSTOP_FINISH_FRAMES * FRAME_SECONDS);
        pushFlash(buffer, 0.5, 0.16, '#ff6b6b');
        break;

      case 'battleFinished':
        break;
    }
  }
}

/** 효과 수명 감소. 렌더 프레임의 실제 경과 시간으로 호출한다. */
export function advanceEffects(buffer: EffectBuffer, deltaSeconds: number): void {
  // 히트스톱 중에는 위치·회전·파티클·흔들림 모두 정지. 히트스톱 자체 타이머만 흐른다.
  if (buffer.hitStopRemainingSeconds > 0) {
    buffer.hitStopRemainingSeconds -= deltaSeconds;
    return;
  }

  for (let index = buffer.impactRings.length - 1; index >= 0; index -= 1) {
    const ring = buffer.impactRings[index];
    ring.remainingSeconds -= deltaSeconds;
    if (ring.remainingSeconds <= 0) buffer.impactRings.splice(index, 1);
  }

  for (let index = buffer.sparks.length - 1; index >= 0; index -= 1) {
    const spark = buffer.sparks[index];
    spark.remainingSeconds -= deltaSeconds;
    if (spark.remainingSeconds <= 0) {
      buffer.sparks.splice(index, 1);
      continue;
    }
    spark.positionX += spark.velocityX * deltaSeconds;
    spark.positionY += spark.velocityY * deltaSeconds;
    // 감속(공기저항 느낌).
    spark.velocityX *= 0.88;
    spark.velocityY *= 0.88;
  }

  for (let index = buffer.spinDropFlashes.length - 1; index >= 0; index -= 1) {
    const flash = buffer.spinDropFlashes[index];
    flash.remainingSeconds -= deltaSeconds;
    if (flash.remainingSeconds <= 0) buffer.spinDropFlashes.splice(index, 1);
  }

  buffer.shakeRemainingSeconds = Math.max(0, buffer.shakeRemainingSeconds - deltaSeconds);
  buffer.flashRemainingSeconds = Math.max(0, buffer.flashRemainingSeconds - deltaSeconds);
}

/** 특정 팽이의 게이지가 지금 F3 강조 중인지(0~1). HUD 게이지 번쩍임에 쓴다. */
export function spinDropIntensity(buffer: EffectBuffer, beybladeIndex: number): number {
  let intensity = 0;
  for (const flash of buffer.spinDropFlashes) {
    if (flash.beybladeIndex !== beybladeIndex) continue;
    intensity = Math.max(intensity, flash.remainingSeconds / flash.totalSeconds);
  }
  return intensity;
}

export function clearEffects(buffer: EffectBuffer): void {
  buffer.impactRings.length = 0;
  buffer.sparks.length = 0;
  buffer.spinDropFlashes.length = 0;
  buffer.shakeRemainingSeconds = 0;
  buffer.shakeStrength = 0;
  buffer.hitStopRemainingSeconds = 0;
  buffer.flashRemainingSeconds = 0;
  buffer.flashStrength = 0;
}
