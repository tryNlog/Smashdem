/**
 * 배틀 상태 생성·복제.
 *
 * 복제(cloneBattleState)는 S3 의 롤백/리플레이용이다.
 * 상태에 함수나 DOM 참조가 들어오면 여기서 깨지므로, 그 자체가 구조 제약의 검사 장치이기도 하다.
 */

import { cloneRandomState, createRandomState, nextRandomRange } from '../engine/random';
import * as Balance from './balance';
import type { Build } from './parts';
import { buildProfile, knockbackTier, STARTER_BUILD } from './parts';
import type { BattleState, Beyblade, BeybladeStats, BuildTuning, KnockbackTier } from './types';
import { NEUTRAL_TUNING } from './types';

/**
 * 팽이 한 대의 초기 정의(스폰 전 설정값).
 * 파츠는 배틀 시작 시점의 스냅샷으로만 들어온다 — 배틀 중 파츠 변경은 없다(§6-4 netcode 인계).
 */
export interface BeybladeDefinition {
  readonly name: string;
  readonly stats: BeybladeStats;
  /** 파츠 3개의 넉백 합산. 생략하면 0. */
  readonly knockback?: number;
  /** 파츠 특성이 만든 배율. 생략하면 전부 1.0. */
  readonly tuning?: BuildTuning;
}

/** 파츠 빌드에서 배틀용 정의를 만든다. */
export function definitionFromBuild(name: string, build: Build): BeybladeDefinition {
  const profile = buildProfile(build);
  return {
    name,
    stats: profile.stats,
    knockback: profile.knockback,
    tuning: profile.tuning,
  };
}

/** 런 시작 빌드. 넉백 합산 0 이며 T1 의 기준이 된다. */
export const DEFAULT_PLAYER_DEFINITION: BeybladeDefinition = definitionFromBuild(
  'PLAYER',
  STARTER_BUILD,
);

export const DEFAULT_BOT_DEFINITION: BeybladeDefinition = definitionFromBuild(
  'BOT',
  STARTER_BUILD,
);

/** 두 팽이 쌍의 쿨다운 배열 인덱스. */
export function pairKey(indexA: number, indexB: number): number {
  const low = Math.min(indexA, indexB);
  const high = Math.max(indexA, indexB);
  return low * 8 + high;
}

function createBeyblade(index: number, definition: BeybladeDefinition): Beyblade {
  const knockback = definition.knockback ?? 0;
  const tier: KnockbackTier = knockbackTier(knockback);
  return {
    index,
    name: definition.name,
    stats: definition.stats,
    knockback,
    knockbackTier: tier,
    tuning: definition.tuning ?? NEUTRAL_TUNING,
    stunRemainingSeconds: 0,
    lipPierceRemainingSeconds: 0,
    positionX: 0,
    positionY: 0,
    velocityX: 0,
    velocityY: 0,
    radius: Balance.BEYBLADE_RADIUS,
    spin: Balance.SPIN_MAXIMUM,
    burstGauge: 0,
    burstRemainingSeconds: 0,
    visualSpinAngle: 0,
    alive: true,
    defeatReason: 'none',
  };
}

/**
 * 라운드 시작 상태를 만든다.
 * seed 가 같으면 스폰 위치까지 완전히 동일하다(결정론 요건).
 */
export function createBattleState(
  definitions: readonly BeybladeDefinition[],
  seed: number,
): BattleState {
  const random = createRandomState(seed);
  const beyblades = definitions.map((definition, index) => createBeyblade(index, definition));

  // 스폰: 원 둘레에 등간격 배치 + 시드 기반 각도 흔들림.
  const baseAngle = nextRandomRange(random, 0, Math.PI * 2);
  const angleStep = (Math.PI * 2) / Math.max(1, beyblades.length);
  for (const beyblade of beyblades) {
    const jitter = nextRandomRange(
      random,
      -Balance.SPAWN_ANGLE_JITTER_RADIANS,
      Balance.SPAWN_ANGLE_JITTER_RADIANS,
    );
    const angle = baseAngle + angleStep * beyblade.index + jitter;
    beyblade.positionX = Math.cos(angle) * Balance.SPAWN_DISTANCE_FROM_CENTER;
    beyblade.positionY = Math.sin(angle) * Balance.SPAWN_DISTANCE_FROM_CENTER;
  }

  return {
    phase: 'ready',
    phaseElapsedSeconds: 0,
    battleElapsedSeconds: 0,
    tick: 0,
    beyblades,
    random,
    collisionCooldowns: new Array(64).fill(0),
    winnerIndex: -1,
    outcome: 'none',
    events: [],
  };
}

/** 상태 전체 깊은 복제. 롤백 스냅샷용. */
export function cloneBattleState(state: BattleState): BattleState {
  return {
    phase: state.phase,
    phaseElapsedSeconds: state.phaseElapsedSeconds,
    battleElapsedSeconds: state.battleElapsedSeconds,
    tick: state.tick,
    beyblades: state.beyblades.map((beyblade) => ({ ...beyblade })),
    random: cloneRandomState(state.random),
    collisionCooldowns: state.collisionCooldowns.slice(),
    winnerIndex: state.winnerIndex,
    outcome: state.outcome,
    events: state.events.slice(),
  };
}
