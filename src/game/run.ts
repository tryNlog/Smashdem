/**
 * 12판 로그라이크 런 상태머신 (§1-2 / §12-3).
 *
 * ★ 이 파일의 규칙 — 시뮬레이션과 같은 결정론 규율을 따른다.
 *  - 부작용 금지: DOM / Date.now() / Math.random() 을 부르지 않는다.
 *  - 드랍 무작위·배틀 시드는 전부 시드 PRNG(engine/random) 로만 흐른다.
 *    (S3 PvP·리플레이가 런 진행까지 재현 가능해야 하므로 런도 결정론을 지킨다.)
 *  - 수치는 balance.ts 에서만 가져온다.
 *
 * localStorage·Canvas·입력 처리는 이 파일에 없다 — 그건 src/app / src/render 계층의 몫이다.
 */

import { nextRandomUnit, type RandomState } from '../engine/random';
import * as Balance from './balance';
import type { BeybladeStats } from './types';
import type { Build, BuildProfile, Part, PartSlot, SetTag } from './parts';
import { buildProfile, completedSet, STARTER_BUILD } from './parts';

/** 슬롯 하나의 장착 상태 = 파츠 1개 + 강화 레벨(0~상한). */
export interface SlotState {
  readonly part: Part;
  readonly level: number;
}

/** 런에서 굴리는 빌드. 슬롯 3개 각각이 파츠 + 강화 레벨을 갖는다. */
export interface RunBuild {
  readonly layer: SlotState;
  readonly disk: SlotState;
  readonly driver: SlotState;
}

/** 런 진행 위상. */
export type RunPhase = 'inRun' | 'won' | 'lost';

/** 런 전체 상태. */
export interface RunState {
  /** 현재 판 번호 1..RUN_TOTAL_BATTLES. */
  battleNumber: number;
  build: RunBuild;
  phase: RunPhase;
  /** 이번 런에서 이긴 판 수(HUD·격납고 표시용). */
  wins: number;
  /** 런 진행 난수. 드랍·배틀 시드가 여기서만 나온다(결정론). */
  random: RandomState;
}

/** 시작 빌드 = 시작 파츠 3종, 강화 0. */
export function starterRunBuild(): RunBuild {
  return {
    layer: { part: STARTER_BUILD.layer, level: 0 },
    disk: { part: STARTER_BUILD.disk, level: 0 },
    driver: { part: STARTER_BUILD.driver, level: 0 },
  };
}

/**
 * 새 런을 만든다. 전패 리셋도 이 함수로 처음부터 다시 시작한다(§12-3, M11).
 * 매번 시작 빌드 + 1판 + 1구간(약한 봇)이므로 "완전 리셋 + 1구간 승리 보장" 이 구조적으로 성립한다.
 */
export function createRun(random: RandomState): RunState {
  return {
    battleNumber: 1,
    build: starterRunBuild(),
    phase: 'inRun',
    wins: 0,
    random,
  };
}

/** RunBuild → 배틀 계산용 Build(파츠 3개). */
export function runBuildToBuild(build: RunBuild): Build {
  return { layer: build.layer.part, disk: build.disk.part, driver: build.driver.part };
}

/** 슬롯별 강화 레벨. buildProfile 옵션으로 넘긴다. */
export function runBuildLevels(build: RunBuild): { layer: number; disk: number; driver: number } {
  return { layer: build.layer.level, disk: build.disk.level, driver: build.driver.level };
}

/**
 * 런 빌드의 배틀용 프로파일. 게임 런타임이므로 세트 보너스를 적용한다(applySetBonus: true).
 * ③단계 측정(§14-7)은 세트 OFF 기준선이었고, 런 통합에서 세트를 켜는 것이 이 함수의 역할이다.
 */
export function runBuildProfile(build: RunBuild): BuildProfile {
  return buildProfile(runBuildToBuild(build), {
    levels: runBuildLevels(build),
    applySetBonus: true,
  });
}

/**
 * 현재 판이 속한 난이도 구간(1~4). 4구간 × 3판 계단형(§12-3).
 * 1~3판 → 1, 4~6판 → 2, 7~9판 → 3, 10~12판 → 4.
 */
export function tierForBattle(battleNumber: number): number {
  const tier = Math.floor((battleNumber - 1) / Balance.RUN_BATTLES_PER_TIER) + 1;
  const maxTier = Math.ceil(Balance.RUN_TOTAL_BATTLES / Balance.RUN_BATTLES_PER_TIER);
  return Math.max(1, Math.min(maxTier, tier));
}

/** 이번 판에 쓸 배틀 시드. 런 난수를 전진시켜 뽑는다(같은 런 시드 → 같은 판 시퀀스). */
export function nextBattleSeed(run: RunState): number {
  return Math.floor(nextRandomUnit(run.random) * 0x7fffffff) + 1;
}

/**
 * 판 결과를 런에 반영한다.
 *  - 승리 & 마지막 판 → phase 'won'(런 완주).
 *  - 승리 & 중간 판 → 그대로(보상 화면은 세션이 띄운 뒤 advanceAfterReward 로 다음 판 진입).
 *  - 패배 → phase 'lost'(런 종료, 파츠 전부 소실).
 * @returns 승리 후 보상 화면을 띄워야 하면 true.
 */
export function recordBattleResult(run: RunState, playerWon: boolean): { showReward: boolean } {
  if (!playerWon) {
    run.phase = 'lost';
    return { showReward: false };
  }
  run.wins += 1;
  if (run.battleNumber >= Balance.RUN_TOTAL_BATTLES) {
    run.phase = 'won';
    return { showReward: false };
  }
  return { showReward: true };
}

/** 보상 선택을 빌드에 반영하고 다음 판으로 넘어간다. */
export function advanceAfterReward(run: RunState, build: RunBuild): void {
  run.build = build;
  run.battleNumber += 1;
}

// ─────────────────────────────────────────────────────────────
// 세트 진행 요약 (F1 세트 표시 / 배틀 HUD / 격납고 표시에 공용)
// ─────────────────────────────────────────────────────────────

/** 빌드에서 특정 세트 태그가 장착된 슬롯 수(0~3). */
export function setCount(build: RunBuild, tag: SetTag): number {
  let count = 0;
  if (build.layer.part.set === tag) count += 1;
  if (build.disk.part.set === tag) count += 1;
  if (build.driver.part.set === tag) count += 1;
  return count;
}

/** 강화 레벨 총합(격납고 표시 "+N"). */
export function enhanceTotal(build: RunBuild): number {
  return build.layer.level + build.disk.level + build.driver.level;
}

export interface SetSummary {
  /** 가장 많이 모인 세트 태그. 하나도 없으면 null. */
  readonly tag: SetTag | null;
  /** 그 태그의 장착 슬롯 수(0~3). */
  readonly count: number;
  /** 3/3 완성 여부. */
  readonly completed: boolean;
}

const SET_TAGS: readonly SetTag[] = ['STRIKE', 'GUARD', 'BREAK'];

/** 빌드의 대표 세트 진행 상태(가장 많이 모인 축). 동수면 STRIKE→GUARD→BREAK 순으로 고른다. */
export function buildSetSummary(build: RunBuild): SetSummary {
  let bestTag: SetTag | null = null;
  let bestCount = 0;
  for (const tag of SET_TAGS) {
    const count = setCount(build, tag);
    if (count > bestCount) {
      bestCount = count;
      bestTag = tag;
    }
  }
  const completed = completedSet(runBuildToBuild(build)) !== null;
  return { tag: bestTag, count: bestCount, completed };
}

/** 현재 빌드의 우세 세트 축(드랍 다양성 규칙의 기준). 없으면 null. */
export function dominantSetTag(build: RunBuild): SetTag | null {
  return buildSetSummary(build).tag;
}

/** 최종 스탯 스냅샷(격납고 저장·표시용). */
export function runBuildStats(build: RunBuild): BeybladeStats {
  return runBuildProfile(build).stats;
}

/** 슬롯 키 목록(반복용). */
export const SLOTS: readonly PartSlot[] = ['layer', 'disk', 'driver'];
