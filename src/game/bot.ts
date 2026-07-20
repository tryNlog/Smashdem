/**
 * 봇 조작.
 *
 * S0 단계의 봇은 의도적으로 약하다(1스테이지 수준). 고도화는 game-ai-engineer 역할이 맡는다.
 * 여기서 지켜야 할 것은 강함이 아니라 **인터페이스와 결정론**이다.
 *
 *  - 시그니처는 botInput(state, index) → InputCommand 로 고정한다.
 *    사람 입력과 봇 입력이 같은 타입이어야 S3 에서 "봇 자리에 원격 플레이어 입력을 꽂는" 교체가 가능하다.
 *  - 상태를 읽기만 하고 절대 바꾸지 않는다. 난수도 상태를 전진시키지 않는 해시(noiseFromSeed)를 쓴다.
 *    (봇이 state.random 을 소비하면 호출 순서에 따라 시뮬 결과가 달라져 결정론이 깨진다.)
 *
 * 현재 행동: 상대 방향으로 밀기 + 조준 오차 + 근거리에서 가끔 버스트.
 */

import { noiseFromSeed } from '../engine/random';
import * as Balance from './balance';
import type { BattleState, InputCommand } from './types';
import { NEUTRAL_INPUT } from './types';

/** 한 번의 판단이 유지되는 시뮬 스텝 수. */
const TICKS_PER_DECISION = Math.max(
  1,
  Math.round(Balance.BOT_DECISION_INTERVAL_SECONDS / Balance.FIXED_DELTA_SECONDS),
);

/**
 * 주어진 팽이가 이번 스텝에 넣을 입력을 계산한다.
 * 순수 함수 — 같은 (state, index) 면 항상 같은 결과.
 */
export function botInput(state: BattleState, index: number): InputCommand {
  const self = state.beyblades[index];
  if (!self || !self.alive || state.phase !== 'fighting') return NEUTRAL_INPUT;

  const target = findNearestOpponent(state, index);
  if (!target) return NEUTRAL_INPUT;

  // 판단 구간(bucket) 단위로 조준을 갱신한다. 구간 안에서는 같은 방향을 유지해 손맛이 사람 비슷해진다.
  const decisionBucket = Math.floor(state.tick / TICKS_PER_DECISION);
  const isFirstTickOfDecision = state.tick % TICKS_PER_DECISION === 0;

  const aimNoise = noiseFromSeed(state.random.seed, decisionBucket, index);
  const burstNoise = noiseFromSeed(state.random.seed, decisionBucket, index + 1000);

  const baseAngle = Math.atan2(
    target.positionY - self.positionY,
    target.positionX - self.positionX,
  );
  // aimNoise 0~1 을 -1~1 로 펴서 조준 오차로 쓴다. 오차가 클수록 약한 봇.
  const aimError = (aimNoise * 2 - 1) * Balance.BOT_AIM_ERROR_RADIANS;
  const aimAngle = baseAngle + aimError;

  const distance = Math.hypot(
    target.positionX - self.positionX,
    target.positionY - self.positionY,
  );

  const wantsBurst =
    isFirstTickOfDecision &&
    distance <= Balance.BOT_BURST_DISTANCE &&
    self.burstGauge >= Balance.BURST_GAUGE_COST &&
    burstNoise < Balance.BOT_BURST_PROBABILITY;

  return {
    moveX: Math.cos(aimAngle) * Balance.BOT_THROTTLE,
    moveY: Math.sin(aimAngle) * Balance.BOT_THROTTLE,
    burst: wantsBurst,
  };
}

function findNearestOpponent(state: BattleState, index: number) {
  const self = state.beyblades[index];
  let nearest = null as (typeof state.beyblades)[number] | null;
  let nearestDistance = Infinity;

  for (const other of state.beyblades) {
    if (other.index === index || !other.alive) continue;
    const distance = Math.hypot(other.positionX - self.positionX, other.positionY - self.positionY);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = other;
    }
  }
  return nearest;
}
