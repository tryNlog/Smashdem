/**
 * 파츠 테이블 (밸런스 상수 단일 소스의 데이터 테이블 파트).
 *
 * 설계 근거: 02_게임설계.md §3 (game-director 확정 프레임). 이 프레임은 여기서 바꾸지 않는다.
 *  - 슬롯 3개(레이어/디스크/드라이버) × 슬롯당 4종 = 총 12종
 *  - 신규 스탯 금지. 스탯은 attack/weight/stamina/control 4종뿐
 *  - 넉백(knockback)은 스탯이 아니라 파츠 3개의 합산으로만 생기는 파생값
 *  - 특성은 "기존 balance 상수 1개 × 배율 1개" 형태만, 12종 중 최대 4종 (여기서는 정확히 4종)
 *  - 등급·레어리티 없음. 전 파츠 동급이고 방향만 다르다
 *
 * 스칼라 튜닝 상수(임계·윈도우·배율)는 balance.ts 에 있다.
 * 이 파일에는 "어떤 파츠가 무엇을 얼마나 바꾸는가" 표만 둔다.
 */

import * as Balance from './balance';
import type {
  BeybladeStats,
  BuildTuning,
  KnockbackTier,
} from './types';
import { NEUTRAL_TUNING } from './types';

/** 파츠 슬롯 3종. */
export type PartSlot = 'layer' | 'disk' | 'driver';

/** 특성이 건드릴 수 있는 대상 = BuildTuning 의 키. 신규 대상 추가 금지. */
export type TraitTarget = keyof BuildTuning;

/** 스탯 델타. 기재하지 않은 스탯은 0. */
export type StatDelta = Partial<BeybladeStats>;

/** 파츠 1종. §3-3 데이터 형태 상한을 타입으로 강제한다. */
export interface Part {
  readonly id: string;
  readonly slot: PartSlot;
  readonly name: string;
  /** 기존 스탯 4종에 대한 델타만. 신규 스탯 없음. */
  readonly statDelta: StatDelta;
  /** 넉백 값(0 포함). 3슬롯 합산이 파생 스탯이 된다. */
  readonly knockback: number;
  /** 특성 — 없거나(undefined), balance 상수 1개에 대한 배율 1개. */
  readonly trait?: {
    readonly target: TraitTarget;
    readonly multiplier: number;
    /** 파츠 선택 화면(F1)에 그대로 띄울 한 줄 설명. */
    readonly description: string;
  };
  /** 파츠 선택 화면용 한 줄. 밸런스 계산에는 쓰이지 않는다. */
  readonly blurb: string;
}

// ─────────────────────────────────────────────────────────────
// 레이어 (공격면) — attack / 넉백 / 강타 판정 임계
// ─────────────────────────────────────────────────────────────

export const LAYER_PARTS: readonly Part[] = [
  {
    id: 'L01',
    slot: 'layer',
    name: '밸런스 레이어',
    statDelta: { attack: 4 },
    knockback: 0,
    blurb: '치우침 없는 기본 공격면. 런 시작 장착품.',
  },
  {
    id: 'L02',
    slot: 'layer',
    name: '스트라이크 레이어',
    statDelta: { attack: 16 },
    knockback: 0,
    blurb: '깎는 데 전부 투자. 밀어내지는 못한다.',
  },
  {
    id: 'L03',
    slot: 'layer',
    name: '크러시 레이어',
    statDelta: { attack: 2 },
    knockback: 6,
    trait: {
      target: 'strikeThresholdMultiplier',
      multiplier: 0.78,
      description: '강타 판정 접근속도 임계 ×0.78 (느린 충돌도 강타로 인정)',
    },
    blurb: '약한 충돌까지 강타로 만든다. 넉백 입문.',
  },
  {
    id: 'L04',
    slot: 'layer',
    name: '브레이커 레이어',
    statDelta: { attack: -12 },
    knockback: 9,
    blurb: '★ 링브레이커 코어. 공격력을 팔아 밀어내는 힘을 산다.',
  },
];

// ─────────────────────────────────────────────────────────────
// 디스크 (중량) — weight / stamina
// ─────────────────────────────────────────────────────────────

export const DISK_PARTS: readonly Part[] = [
  {
    id: 'D01',
    slot: 'disk',
    name: '밸런스 디스크',
    statDelta: { weight: 4, stamina: 4 },
    knockback: 0,
    blurb: '무게와 지구력을 조금씩. 런 시작 장착품.',
  },
  {
    id: 'D02',
    slot: 'disk',
    name: '헤비 디스크',
    statDelta: { weight: 16, stamina: -6 },
    knockback: 0,
    blurb: '덜 밀리고 덜 아프다. 대신 빨리 지친다.',
  },
  {
    id: 'D03',
    slot: 'disk',
    name: '인듀어 디스크',
    statDelta: { stamina: 18, weight: 2 },
    knockback: 0,
    blurb: '★ 스태미나 코어. 상대가 먼저 마르기를 기다린다.',
  },
  {
    id: 'D04',
    slot: 'disk',
    name: '임팩트 디스크',
    statDelta: { weight: 8, stamina: -12 },
    knockback: 4,
    trait: {
      target: 'knockbackImpulseMultiplier',
      multiplier: 1.25,
      description: '넉백 임펄스 ×1.25',
    },
    blurb: '지구력을 태워 충돌 한 방의 밀림을 키운다.',
  },
];

// ─────────────────────────────────────────────────────────────
// 드라이버 (접지) — control / 버스트
// ─────────────────────────────────────────────────────────────

export const DRIVER_PARTS: readonly Part[] = [
  {
    id: 'R01',
    slot: 'driver',
    name: '스탠다드 드라이버',
    statDelta: { control: 4 },
    knockback: 0,
    blurb: '무난한 접지. 런 시작 장착품.',
  },
  {
    id: 'R02',
    slot: 'driver',
    name: '스파이크 드라이버',
    statDelta: { control: 16 },
    knockback: 0,
    blurb: '원하는 각도로 파고든다. 조작 성향 최대.',
  },
  {
    id: 'R03',
    slot: 'driver',
    name: '플로우 드라이버',
    statDelta: { control: 6 },
    knockback: 0,
    trait: {
      target: 'burstRegenerationMultiplier',
      multiplier: 1.4,
      description: '버스트 게이지 회복 ×1.4',
    },
    blurb: '버스트를 더 자주 쓴다.',
  },
  {
    id: 'R04',
    slot: 'driver',
    name: '클로 드라이버',
    statDelta: { control: -10 },
    knockback: 5,
    trait: {
      target: 'burstImpulseMultiplier',
      multiplier: 1.45,
      description: '버스트 임펄스 ×1.45',
    },
    blurb: '★ 링브레이커 보조. 조작을 팔아 돌진 속도를 산다.',
  },
];

/** 12종 전체. */
export const ALL_PARTS: readonly Part[] = [...LAYER_PARTS, ...DISK_PARTS, ...DRIVER_PARTS];

/** id → 파츠. */
export function findPart(id: string): Part | undefined {
  return ALL_PARTS.find((part) => part.id === id);
}

/** 슬롯별 목록. */
export function partsForSlot(slot: PartSlot): readonly Part[] {
  switch (slot) {
    case 'layer':
      return LAYER_PARTS;
    case 'disk':
      return DISK_PARTS;
    case 'driver':
      return DRIVER_PARTS;
  }
}

// ─────────────────────────────────────────────────────────────
// 빌드 = 슬롯 3개의 파츠 조합
// ─────────────────────────────────────────────────────────────

export interface Build {
  readonly layer: Part;
  readonly disk: Part;
  readonly driver: Part;
}

/** 빌드를 합산한 결과. 배틀 시작 시점의 스냅샷으로만 쓰인다(배틀 중 변경 없음). */
export interface BuildProfile {
  readonly stats: BeybladeStats;
  readonly knockback: number;
  readonly tier: KnockbackTier;
  readonly tuning: BuildTuning;
}

/** 런 시작 파츠 3종 — 넉백 합산 0. T1 의 기준 빌드다. */
export const STARTER_BUILD: Build = {
  layer: LAYER_PARTS[0],
  disk: DISK_PARTS[0],
  driver: DRIVER_PARTS[0],
};

/** 넉백 합산 → 구간. */
export function knockbackTier(total: number): KnockbackTier {
  if (total >= Balance.KNOCKBACK_THRESHOLD_RING_BREAKER) return 'ringBreaker';
  if (total >= Balance.KNOCKBACK_THRESHOLD_RIM_PRESSURE) return 'rimPressure';
  return 'none';
}

/** 구간 표시명. 화면(F1/F2)과 리포트가 같은 문자열을 쓴다. */
export function knockbackTierLabel(tier: KnockbackTier): string {
  switch (tier) {
    case 'ringBreaker':
      return 'RING BREAKER';
    case 'rimPressure':
      return 'RIM PRESSURE';
    case 'none':
      return '—';
  }
}

function clampStat(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * 파츠 3개를 합산해 배틀에 들어갈 프로파일을 만든다.
 * 스탯은 기준값 STAT_BASELINE 에서 각 파츠 델타를 더하고 0~100 으로 자른다.
 */
export function buildProfile(build: Build): BuildProfile {
  const parts = [build.layer, build.disk, build.driver];

  let attack = Balance.STAT_BASELINE;
  let weight = Balance.STAT_BASELINE;
  let stamina = Balance.STAT_BASELINE;
  let control = Balance.STAT_BASELINE;
  let knockback = 0;

  let strikeThresholdMultiplier = NEUTRAL_TUNING.strikeThresholdMultiplier;
  let knockbackImpulseMultiplier = NEUTRAL_TUNING.knockbackImpulseMultiplier;
  let burstRegenerationMultiplier = NEUTRAL_TUNING.burstRegenerationMultiplier;
  let burstImpulseMultiplier = NEUTRAL_TUNING.burstImpulseMultiplier;

  for (const part of parts) {
    attack += part.statDelta.attack ?? 0;
    weight += part.statDelta.weight ?? 0;
    stamina += part.statDelta.stamina ?? 0;
    control += part.statDelta.control ?? 0;
    knockback += part.knockback;

    if (!part.trait) continue;
    switch (part.trait.target) {
      case 'strikeThresholdMultiplier':
        strikeThresholdMultiplier *= part.trait.multiplier;
        break;
      case 'knockbackImpulseMultiplier':
        knockbackImpulseMultiplier *= part.trait.multiplier;
        break;
      case 'burstRegenerationMultiplier':
        burstRegenerationMultiplier *= part.trait.multiplier;
        break;
      case 'burstImpulseMultiplier':
        burstImpulseMultiplier *= part.trait.multiplier;
        break;
    }
  }

  return {
    stats: {
      attack: clampStat(attack),
      weight: clampStat(weight),
      stamina: clampStat(stamina),
      control: clampStat(control),
    },
    knockback,
    tier: knockbackTier(knockback),
    tuning: {
      strikeThresholdMultiplier,
      knockbackImpulseMultiplier,
      burstRegenerationMultiplier,
      burstImpulseMultiplier,
    },
  };
}

/** id 3개로 빌드를 만든다(테스트·저장 복원용). 없는 id 면 예외. */
export function buildFromIds(layerId: string, diskId: string, driverId: string): Build {
  const layer = findPart(layerId);
  const disk = findPart(diskId);
  const driver = findPart(driverId);
  if (!layer || layer.slot !== 'layer') throw new Error(`레이어 파츠 없음: ${layerId}`);
  if (!disk || disk.slot !== 'disk') throw new Error(`디스크 파츠 없음: ${diskId}`);
  if (!driver || driver.slot !== 'driver') throw new Error(`드라이버 파츠 없음: ${driverId}`);
  return { layer, disk, driver };
}

/**
 * 아키타입 3종의 대표 빌드. 검증(T6)과 봇 프리셋이 같은 정의를 쓴다.
 * 02_게임설계.md §3-4 의 A1/A2/A3 에 대응한다.
 */
export const ARCHETYPE_BUILDS = {
  /** A1 어택 — 속공 스핀아웃. */
  attack: buildFromIds('L02', 'D02', 'R02'),
  /** A2 스태미나 — 지구전·판정승. */
  stamina: buildFromIds('L01', 'D03', 'R03'),
  /** A3 링브레이커 — 넉백 편중. attack·stamina 를 판 대가로 링아웃을 산다. */
  ringBreaker: buildFromIds('L04', 'D04', 'R04'),
} as const;

/** 임계1(RIM PRESSURE)에 막 도달한 검증용 빌드. T2 의 공격측. */
export const RIM_PRESSURE_BUILD: Build = buildFromIds('L03', 'D01', 'R01');
