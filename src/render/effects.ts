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
import { SET_COLORS } from './palette';

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

/** 회전력 게이지가 깎이는 순간의 강조(F3 / PD-4). beybladeIndex 별로 HUD 게이지를 번쩍인다. */
export interface SpinDropFlash {
  beybladeIndex: number;
  remainingSeconds: number;
  totalSeconds: number;
  /** 0~1 강도 — 이번 감소량에 비례. 게이지 번쩍임 밝기·테두리 굵기를 정한다. */
  peak: number;
  /** STRIKE 세트 타격이면 게이지 강조를 세트 색으로 물들인다(일반 타격과 구분). */
  strike: boolean;
}

/**
 * 타격당 회전력 감소량 숫자 팝업(PD-4). 감소량에 비례해 크기·상승·색이 달라진다.
 * STRIKE 세트 타격은 전용 색 + 더 큰 글씨로 일반 타격과 구분된다.
 */
export interface DamagePopup {
  positionX: number;
  positionY: number;
  /** 표시 숫자(정수 반올림한 회전력 감소량). */
  amount: number;
  /** 정규화 세기 0~1(감소량 / SPIN_LOSS_REFERENCE). 글씨 크기·불투명도에 쓴다. */
  intensity: number;
  strike: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  /** 위로 떠오르는 속도(px/초, 화면 좌표). */
  riseSpeed: number;
}

export interface EffectBuffer {
  impactRings: ImpactRing[];
  sparks: Spark[];
  spinDropFlashes: SpinDropFlash[];
  damagePopups: DamagePopup[];
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

// ── 타격당 회전력 감소 가시화(PD-4) ─────────────────────────────
/**
 * 단일 타격 회전력 감소량의 정규화 기준(=1.0 으로 치는 감소량, spin 단위).
 * 팝업 크기·게이지 번쩍임 세기를 이 값으로 나눠 0~1 로 만든다.
 * 근거: STRIKE 세트+버스트 정타의 관측 상한이 대략 이 부근(SPIN_MAXIMUM 100 대비, 02_게임설계.md 데미지 계수).
 */
const SPIN_LOSS_REFERENCE = 6;
/** 이 미만의 감소는 팝업을 만들지 않는다(잔접촉 잡음 방지). */
const DAMAGE_POPUP_MIN_SPIN = 0.5;
/** 데미지 팝업 상한(오래된 것부터 버림). */
const MAX_DAMAGE_POPUPS = 14;
const DAMAGE_POPUP_LIFETIME_SECONDS = 0.7;
/** STRIKE 타격 전용 색 — 색만이 아니라 팝업·게이지·링에 공통 적용해 판독 이중화. */
const STRIKE_COLOR = SET_COLORS.STRIKE;
/** 게이지 번쩍임 수명. */
const SPIN_DROP_FLASH_SECONDS = 0.42;

export function createEffectBuffer(): EffectBuffer {
  return {
    impactRings: [],
    sparks: [],
    spinDropFlashes: [],
    damagePopups: [],
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

/**
 * 방어자 게이지 번쩍임을 갱신한다(팽이당 1개로 upsert — 밀집 타격에서 배열이 불어나지 않게).
 * peak 는 감소량 비례 강도, strike 는 STRIKE 타격 여부. 더 센 강조가 들어오면 갱신한다.
 */
function pushSpinDropFlash(
  buffer: EffectBuffer,
  beybladeIndex: number,
  peak: number,
  strike: boolean,
): void {
  const existing = buffer.spinDropFlashes.find((flash) => flash.beybladeIndex === beybladeIndex);
  if (existing) {
    existing.peak = Math.max(existing.peak, peak);
    existing.strike = existing.strike || strike;
    existing.remainingSeconds = SPIN_DROP_FLASH_SECONDS;
    existing.totalSeconds = SPIN_DROP_FLASH_SECONDS;
    return;
  }
  buffer.spinDropFlashes.push({
    beybladeIndex,
    remainingSeconds: SPIN_DROP_FLASH_SECONDS,
    totalSeconds: SPIN_DROP_FLASH_SECONDS,
    peak,
    strike,
  });
}

/** 타격 위치에 데미지 숫자 팝업을 띄운다. 감소량 비례 크기·상승·색. */
function spawnDamagePopup(
  buffer: EffectBuffer,
  x: number,
  y: number,
  spinLoss: number,
  strike: boolean,
): void {
  if (spinLoss < DAMAGE_POPUP_MIN_SPIN) return;
  const intensity = clamp01(spinLoss / SPIN_LOSS_REFERENCE);
  buffer.damagePopups.push({
    positionX: x,
    positionY: y,
    amount: Math.max(1, Math.round(spinLoss)),
    intensity,
    strike,
    remainingSeconds: DAMAGE_POPUP_LIFETIME_SECONDS,
    totalSeconds: DAMAGE_POPUP_LIFETIME_SECONDS,
    // 큰 타격일수록 더 힘차게 솟구친다.
    riseSpeed: 34 + intensity * 30,
  });
  if (buffer.damagePopups.length > MAX_DAMAGE_POPUPS) {
    buffer.damagePopups.splice(0, buffer.damagePopups.length - MAX_DAMAGE_POPUPS);
  }
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
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
        const strike = event.attackerStrikeBoost;
        // 감소량 비례 세기(0~1). strength(접근속도)와 달리 STRIKE ×1.25·버스트·스탯이 전부 반영된 실측이다.
        const lossIntensity = clamp01(event.defenderSpinLoss / SPIN_LOSS_REFERENCE);

        buffer.impactRings.push({
          positionX: event.positionX,
          positionY: event.positionY,
          strength: event.strength,
          remainingSeconds: IMPACT_RING_LIFETIME_SECONDS,
          totalSeconds: IMPACT_RING_LIFETIME_SECONDS,
          color: strike ? STRIKE_COLOR : strong ? '#ffe08a' : '#ffffff',
        });
        // STRIKE 타격은 이중 링(바깥에 한 겹 더)으로 일반 타격과 형태까지 구분한다.
        if (strike) {
          buffer.impactRings.push({
            positionX: event.positionX,
            positionY: event.positionY,
            strength: Math.min(1, event.strength + 0.35),
            remainingSeconds: IMPACT_RING_LIFETIME_SECONDS * 1.2,
            totalSeconds: IMPACT_RING_LIFETIME_SECONDS * 1.2,
            color: STRIKE_COLOR,
          });
        }

        // 스파크 수는 감소량 비례로도 붇는다(STRIKE 타격이 더 크게 튄다). 상한은 spawnSparks 가 지킨다.
        const sparkCount = Math.round(3 + event.strength * 9 + lossIntensity * 6);
        const sparkColor = strike ? STRIKE_COLOR : strong ? '#ffd27a' : '#cfe6ff';
        spawnSparks(buffer, event.positionX, event.positionY, event.strength, sparkCount, sparkColor, strike ? 1.2 : 1);

        pushShake(buffer, event.strength, SHAKE_LIFETIME_SECONDS);
        if (strong) {
          pushHitStop(buffer, HITSTOP_STRONG_FRAMES * FRAME_SECONDS);
          const flashBase = ((event.strength - STRONG_HIT_STRENGTH) / (1 - STRONG_HIT_STRENGTH)) * 0.35;
          pushFlash(buffer, flashBase + (strike ? 0.12 : 0), 0.1, strike ? '#ffd0d0' : '#fff2c4');
        }

        // ★ PD-4 — 타격당 회전력 감소를 게이지·숫자로 노출. 방어자 게이지가 감소량 비례로 번쩍이고,
        //   타격 지점에 감소량 숫자가 뜬다. STRIKE 타격은 전용 색으로 구분된다.
        pushSpinDropFlash(buffer, event.defenderIndex, lossIntensity, strike);
        spawnDamagePopup(buffer, event.positionX, event.positionY, event.defenderSpinLoss, strike);

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
        // 링아웃 페널티는 회전력을 크게 깎으므로 게이지 강조를 최대 세기로.
        pushSpinDropFlash(buffer, event.beybladeIndex, 1, false);
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

  for (let index = buffer.damagePopups.length - 1; index >= 0; index -= 1) {
    const popup = buffer.damagePopups[index];
    popup.remainingSeconds -= deltaSeconds;
    if (popup.remainingSeconds <= 0) {
      buffer.damagePopups.splice(index, 1);
      continue;
    }
    popup.positionY -= popup.riseSpeed * deltaSeconds; // 위로 떠오른다.
    popup.riseSpeed *= 0.9; // 점점 느려진다.
  }

  buffer.shakeRemainingSeconds = Math.max(0, buffer.shakeRemainingSeconds - deltaSeconds);
  buffer.flashRemainingSeconds = Math.max(0, buffer.flashRemainingSeconds - deltaSeconds);
}

/**
 * 특정 팽이의 게이지 강조 세기(0~1). HUD 게이지 번쩍임 밝기에 쓴다.
 * 시간 감쇠 × peak(감소량 비례) 로, 큰 타격일수록 더 밝게 오래 남는다.
 */
export function spinDropIntensity(buffer: EffectBuffer, beybladeIndex: number): number {
  let intensity = 0;
  for (const flash of buffer.spinDropFlashes) {
    if (flash.beybladeIndex !== beybladeIndex) continue;
    intensity = Math.max(intensity, (flash.remainingSeconds / flash.totalSeconds) * flash.peak);
  }
  return intensity;
}

/** 현재 게이지 강조가 STRIKE 타격에서 온 것인지. HUD 강조 색을 세트 색으로 가른다. */
export function spinDropIsStrike(buffer: EffectBuffer, beybladeIndex: number): boolean {
  return buffer.spinDropFlashes.some((flash) => flash.beybladeIndex === beybladeIndex && flash.strike);
}

export function clearEffects(buffer: EffectBuffer): void {
  buffer.impactRings.length = 0;
  buffer.sparks.length = 0;
  buffer.spinDropFlashes.length = 0;
  buffer.damagePopups.length = 0;
  buffer.shakeRemainingSeconds = 0;
  buffer.shakeStrength = 0;
  buffer.hitStopRemainingSeconds = 0;
  buffer.flashRemainingSeconds = 0;
  buffer.flashStrength = 0;
}
