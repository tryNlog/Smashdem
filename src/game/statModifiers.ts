/**
 * 스탯 → 물리 배율 변환.
 *
 * 스탯은 전부 기준값 50 이고, 기준값이면 배율이 정확히 1.0 이 되도록 맞춘다.
 * 배율 = 1 + (스탯 - 50) / 50 * 영향도
 *  → 스탯 0 이면 (1 - 영향도), 스탯 100 이면 (1 + 영향도).
 * 선형으로 두는 이유: 심사자가 소스를 읽고 수치를 암산할 수 있어야 한다(제약 C2).
 */

import * as Balance from './balance';
import type { BeybladeStats } from './types';

function linearMultiplier(statValue: number, influence: number): number {
  const normalized = (statValue - Balance.STAT_BASELINE) / Balance.STAT_BASELINE;
  return Math.max(0.1, 1 + normalized * influence);
}

/** attack → 가하는 충돌 데미지 배율. */
export function attackMultiplier(stats: BeybladeStats): number {
  return linearMultiplier(stats.attack, Balance.STAT_INFLUENCE.attack);
}

/**
 * weight → 충돌 질량. 임펄스 분배와 피격 데미지 감소에 함께 쓴다.
 * 무거울수록 덜 밀리고 덜 아프다.
 */
export function massMultiplier(stats: BeybladeStats): number {
  return linearMultiplier(stats.weight, Balance.STAT_INFLUENCE.weight);
}

/**
 * stamina → 회전력 감소 배율. 높을수록 1보다 작아져 오래 버틴다.
 * 다른 스탯과 방향이 반대라 부호를 뒤집는다.
 */
export function spinDecayMultiplier(stats: BeybladeStats): number {
  return linearMultiplier(stats.stamina, -Balance.STAT_INFLUENCE.stamina);
}

/** control → 방향 입력 가속 배율. */
export function controlMultiplier(stats: BeybladeStats): number {
  return linearMultiplier(stats.control, Balance.STAT_INFLUENCE.control);
}
