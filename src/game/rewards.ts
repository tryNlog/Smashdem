/**
 * 3택 1 보상 드랍 (§1-2 보상 형식 / §3-4 드랍 규칙 / §12-2 R13 중복 강화).
 *
 * 결정론 규율(run.ts 와 동일): 무작위는 시드 PRNG 로만. Math.random() 금지.
 *
 * 규칙 요약
 *  - 매 승리(1~11판) 후 12파츠 중 서로 다른 3장을 뽑는다. 리롤 없음.
 *  - 드랍 규칙(§3-4): 3장 중 최소 1장은 현재 빌드의 우세 세트 축과 다른 축을 제시한다.
 *  - 중복 흡수(R13): 뽑힌 파츠가 그 슬롯에 이미 장착돼 있으면 '강화 카드'(+1, 상한 §11)로 표시.
 *    다른 파츠면 '교체 카드'(그 파츠를 level 0 으로 장착, 기존 파츠 소실).
 */

import { nextRandomUnit, type RandomState } from '../engine/random';
import * as Balance from './balance';
import type { Part, SetTag } from './parts';
import { ALL_PARTS } from './parts';
import type { RunBuild } from './run';
import { dominantSetTag, setCount } from './run';

/** 3택 1 카드 1장. */
export interface RewardCard {
  readonly part: Part;
  /** 이 카드를 고르면 강화(이미 그 슬롯에 같은 파츠)인가, 교체인가. */
  readonly kind: 'enhance' | 'swap';
  /** 이 카드를 고른 뒤 그 슬롯의 강화 레벨(표시용). enhance 면 현재+1(상한), swap 이면 0. */
  readonly resultLevel: number;
  /** enhance 인데 이미 상한이라 더 못 올리는 경우 true. */
  readonly atCap: boolean;
}

/** 시드 기반 Fisher-Yates 셔플. 원본을 건드리지 않고 새 배열을 반환한다. */
function seededShuffle<T>(items: readonly T[], random: RandomState): T[] {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandomUnit(random) * (index + 1));
    const temporary = result[index];
    result[index] = result[swapIndex];
    result[swapIndex] = temporary;
  }
  return result;
}

/** 뽑힌 파츠 1개를 현재 빌드 기준으로 카드로 변환한다. */
function toCard(part: Part, build: RunBuild): RewardCard {
  const equipped = build[part.slot];
  if (equipped.part.id === part.id) {
    const atCap = equipped.level >= Balance.ENHANCE_LEVEL_CAP;
    return {
      part,
      kind: 'enhance',
      resultLevel: Math.min(Balance.ENHANCE_LEVEL_CAP, equipped.level + 1),
      atCap,
    };
  }
  return { part, kind: 'swap', resultLevel: 0, atCap: false };
}

/**
 * 3택 1 카드 3장을 만든다.
 *
 * 우세 세트 축(dominant)이 있으면, 3장 중 최소 1장은 그 축과 다른 세트 태그(무소속 포함)가 되도록
 * 보장한다 — "매번 같은 축만 나오면 빌드 선택이 아니라 자동 진행이 된다"(§3-4)를 막는다.
 */
export function generateRewards(build: RunBuild, random: RandomState): RewardCard[] {
  const shuffled = seededShuffle(ALL_PARTS, random);
  const dominant = dominantSetTag(build);

  let chosen: Part[];
  if (dominant === null) {
    // 우세 축이 없으면 다양성 제약이 자동 충족 — 앞에서 3장.
    chosen = shuffled.slice(0, 3);
  } else {
    // 우세 축과 다른 축 1장을 먼저 확보하고, 나머지 2장을 순서대로 채운다.
    const different = shuffled.find((part) => part.set !== dominant);
    const seed = different ? [different] : [];
    for (const part of shuffled) {
      if (chosenIncludes(seed, part)) continue;
      seed.push(part);
      if (seed.length >= 3) break;
    }
    chosen = seed.slice(0, 3);
  }

  return chosen.map((part) => toCard(part, build));
}

function chosenIncludes(parts: readonly Part[], part: Part): boolean {
  return parts.some((candidate) => candidate.id === part.id);
}

/**
 * 보상 카드 선택을 빌드에 반영한 새 빌드를 반환한다(원본 불변).
 *  - enhance: 그 슬롯의 강화 레벨 +1(상한 clamp).
 *  - swap: 그 슬롯의 파츠를 교체(level 0). 기존 파츠는 소실된다(로그라이크).
 */
export function applyReward(build: RunBuild, card: RewardCard): RunBuild {
  const slot = card.part.slot;
  const equipped = build[slot];

  const nextSlotState =
    card.kind === 'enhance'
      ? { part: equipped.part, level: Math.min(Balance.ENHANCE_LEVEL_CAP, equipped.level + 1) }
      : { part: card.part, level: 0 };

  return { ...build, [slot]: nextSlotState };
}

// ─────────────────────────────────────────────────────────────
// F1 — 세트 진행 미리보기 (카드를 고르기 "전에" 세트 완성 여부가 보이게)
// ─────────────────────────────────────────────────────────────

export interface SetPreview {
  readonly tag: SetTag;
  readonly from: number;
  readonly to: number;
  readonly completes: boolean;
}

/**
 * 카드를 고르면 그 세트가 몇/3 이 되는지(§2-5 F1). 무소속(세트 없는) 파츠면 null.
 * enhance 카드는 이미 장착된 파츠라 세트 수가 안 변하므로 from==to.
 */
export function setPreviewForCard(build: RunBuild, card: RewardCard): SetPreview | null {
  const tag = card.part.set;
  if (!tag) return null;

  const from = setCount(build, tag);
  const next = applyReward(build, card);
  const to = setCount(next, tag);
  return { tag, from, to, completes: to >= 3 && from < 3 };
}
