/**
 * 연출 효과 버퍼.
 *
 * 시뮬레이션이 뱉은 SimulationEvent[] 를 여기서 받아 화면 효과로 바꾼다.
 * 시뮬은 "무슨 일이 일어났는가"만 알고, "어떻게 보이는가"는 전부 이쪽 책임이다.
 * technical-artist 역할이 히트스톱·파티클·화면 흔들림을 붙일 지점이 이 파일이다.
 *
 * 효과의 수명은 렌더 시간(가변 dt)으로 흘러도 된다. 게임플레이에 영향을 주지 않기 때문이다.
 */

import type { SimulationEvent } from '../game/types';

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

export interface EffectBuffer {
  impactRings: ImpactRing[];
  /** 화면 흔들림 남은 시간·세기. */
  shakeRemainingSeconds: number;
  shakeStrength: number;
}

const IMPACT_RING_LIFETIME_SECONDS = 0.32;
const BURST_RING_LIFETIME_SECONDS = 0.45;
const DEFEAT_RING_LIFETIME_SECONDS = 0.7;
const SHAKE_LIFETIME_SECONDS = 0.18;

export function createEffectBuffer(): EffectBuffer {
  return { impactRings: [], shakeRemainingSeconds: 0, shakeStrength: 0 };
}

/** 시뮬 이벤트를 화면 효과로 변환해 버퍼에 넣는다. */
export function consumeSimulationEvents(
  buffer: EffectBuffer,
  events: readonly SimulationEvent[],
): void {
  for (const event of events) {
    switch (event.kind) {
      case 'collision':
        buffer.impactRings.push({
          positionX: event.positionX,
          positionY: event.positionY,
          strength: event.strength,
          remainingSeconds: IMPACT_RING_LIFETIME_SECONDS,
          totalSeconds: IMPACT_RING_LIFETIME_SECONDS,
          color: '#ffffff',
        });
        if (event.strength > buffer.shakeStrength || buffer.shakeRemainingSeconds <= 0) {
          buffer.shakeStrength = event.strength;
          buffer.shakeRemainingSeconds = SHAKE_LIFETIME_SECONDS;
        }
        break;

      case 'burstActivated':
        buffer.impactRings.push({
          positionX: event.positionX,
          positionY: event.positionY,
          strength: 0.7,
          remainingSeconds: BURST_RING_LIFETIME_SECONDS,
          totalSeconds: BURST_RING_LIFETIME_SECONDS,
          color: '#ffd166',
        });
        break;

      case 'ringOut':
      case 'spinOut':
        buffer.impactRings.push({
          positionX: event.positionX,
          positionY: event.positionY,
          strength: 1,
          remainingSeconds: DEFEAT_RING_LIFETIME_SECONDS,
          totalSeconds: DEFEAT_RING_LIFETIME_SECONDS,
          color: '#ff6b6b',
        });
        buffer.shakeStrength = 1;
        buffer.shakeRemainingSeconds = SHAKE_LIFETIME_SECONDS * 2;
        break;

      case 'battleFinished':
        break;
    }
  }
}

/** 효과 수명 감소. 렌더 프레임의 실제 경과 시간으로 호출한다. */
export function advanceEffects(buffer: EffectBuffer, deltaSeconds: number): void {
  for (let index = buffer.impactRings.length - 1; index >= 0; index -= 1) {
    const ring = buffer.impactRings[index];
    ring.remainingSeconds -= deltaSeconds;
    if (ring.remainingSeconds <= 0) buffer.impactRings.splice(index, 1);
  }
  buffer.shakeRemainingSeconds = Math.max(0, buffer.shakeRemainingSeconds - deltaSeconds);
}

export function clearEffects(buffer: EffectBuffer): void {
  buffer.impactRings.length = 0;
  buffer.shakeRemainingSeconds = 0;
  buffer.shakeStrength = 0;
}
