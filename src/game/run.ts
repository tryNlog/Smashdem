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
import type { Build, BuildOptions, BuildProfile, Part, PartSlot, SetTag } from './parts';
import { ARCHETYPE_BUILDS, buildProfile, completedSet, STARTER_BUILD } from './parts';

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

/**
 * 구간(1~4) → 봇이 장착할 빌드(§12-3 하드 훅 3). game-ai-engineer 소관.
 *
 * ★ 현재 결정: 전 구간 시작 빌드 고정 = **빌드 스왑 레버 미사용.**
 *   빌드 스왑을 측정했다가 반려했다(ai-log "S2 봇 4구간" 기록):
 *     - tier3=어택 아키타입 → 기준(시작 빌드) 플레이어 승률 1.3%,
 *     - tier4=링브레이커 → 71.3%. 빌드 파워 격차가 실력 격차를 압도해 계단이 non-monotone 이 됐다.
 *   또한 디렉터 N6 는 "기존 5개 상수 조합만, 파라미터 커브로만"으로 난이도를 올리라 했고(§12-3),
 *   빌드 스왑은 난이도 설계 원칙("스탯 뻥튀기 금지")의 비판도 부른다.
 *   → 난이도 4구간은 **봇 스킬 파라미터(BOT_TIER_TUNINGS)만으로** 만든다. 이 함수는 훅만 남긴다.
 *   후반 구간 봇 빌드 부여는 본선 에이전트 설계서에서 재검토 대상(플레이어 빌드 성장과의 균형 측정 필요).
 */
export function botBuildForTier(tier: number): Build {
  void tier;
  void ARCHETYPE_BUILDS; // 반려된 스왑 경로의 후보. 현재 미사용(위 주석 참조).
  return STARTER_BUILD;
}

// ─────────────────────────────────────────────────────────────
// 미러 봇 (해결책 후보 a, §17-F-3 / §19) — 봇 빌드 부여 로직
//
// 문제(§18-2): 완성+강화 STRIKE 빌드가 4구간 봇(STARTER)마저 100% 압도해 최종 봇 접전(§17-A)이 붕괴.
// 스킬-only 로는 물리적 불충분 확정(이론상 최강 봇도 100% 패, tools/botTiers.ts 프로브).
//
// 미러 = 후반 구간 봇 빌드를 **플레이어의 실제 런 빌드에서 파생**한다(동적 대칭).
//
// ★ §16-4 반려(빌드 스왑)와의 결정적 차이 — 반드시 지킬 구분:
//   - 반려안: 봇에게 *고정된 다른 아키타입*(tier3=어택 / tier4=링브레이커)을 부여 → 봇 파워가
//     플레이어와 무관하게 고정 → 저투자 플레이어엔 1.3% 학살, 계단이 비단조(§16-4).
//   - 미러: 봇 파츠·강화를 *플레이어가 지금 든 빌드*에서 파생. 저투자(시작 빌드) 플레이어면
//     completedSet(STARTER)=null 이라 봇도 시작 빌드로 수렴(미러 무효) → 학살 구조적으로 불가.
//     완성+강화 플레이어면 봇도 대등한 세트·강화 → 파리티. 즉 미러 강도가 플레이어 파워에 반응한다.
//   런 빌드는 런 상태에서 결정론적으로 읽히므로 이 로직도 순수·결정론(부작용 0).
// ─────────────────────────────────────────────────────────────

/** 봇에게 부여할 빌드 + buildProfile 옵션(강화·세트). botBuildForTier 반환형의 확장. */
export interface BotBuildAssignment {
  readonly build: Build;
  readonly options: BuildOptions;
}

/**
 * 미러 강도 fraction(0~1)으로 봇 빌드를 플레이어 런 빌드에 맞춘다.
 *  - fraction 0: 미러 없음 → 시작 빌드(현행과 동일, 봇 약함).
 *  - fraction 1: 완전 대칭 → 플레이어와 같은 파츠·같은 강화(세트 완성 여부 자동 일치).
 *  - 0<f<1: 같은 파츠에 강화만 f 비율(반올림)로 축소 → 봇 파워가 플레이어 아래에서 추종.
 * 플레이어가 세트 미완성이면 봇도 미완성(파츠 복제) → 세트 보너스 미발동. 저투자 학살 방지의 축.
 */
export function mirrorBotAssignment(playerBuild: RunBuild, fraction: number): BotBuildAssignment {
  if (fraction <= 0) return { build: STARTER_BUILD, options: {} };
  const scaleLevel = (level: number): number => Math.round(level * fraction);
  return {
    build: runBuildToBuild(playerBuild),
    options: {
      applySetBonus: true,
      context: 'run',
      levels: {
        layer: scaleLevel(playerBuild.layer.level),
        disk: scaleLevel(playerBuild.disk.level),
        driver: scaleLevel(playerBuild.driver.level),
      },
    },
  };
}

/**
 * 구간(1~4)별 미러 강도. 1~2구간은 0(미러 없음=승리 보장·저난도 유지, §12-3 M11),
 * 후반(3·4)만 플레이어 파워를 추종한다. 4구간 값은 §19 파리티 스윕으로 확정한 값.
 * ★ 이 표는 봇 빌드 부여 파라미터이지 밸런스 상수가 아니다(balance.ts 불변).
 */
export const MIRROR_FRACTION_BY_TIER: readonly number[] = [0, 0, 0.5, 1];

/** 구간 기반 미러 봇 빌드 부여(session 배선·측정 공용). */
export function mirrorBotBuild(playerBuild: RunBuild, tier: number): BotBuildAssignment {
  const index = Math.max(0, Math.min(MIRROR_FRACTION_BY_TIER.length - 1, Math.floor(tier) - 1));
  return mirrorBotAssignment(playerBuild, MIRROR_FRACTION_BY_TIER[index]);
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
