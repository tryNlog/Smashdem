/**
 * 시뮬레이션이 다루는 자료형 정의.
 *
 * 여기 있는 것 전부가 "직렬화 가능한 순수 데이터"여야 한다.
 * (S3 에서 스냅샷을 JSON 으로 주고받고, 롤백을 위해 통째로 복제한다.)
 * 함수·DOM 노드·Canvas 컨텍스트를 이 타입 안에 넣지 않는다.
 */

import type { RandomState } from '../engine/random';

/** 팽이 스탯 4종. 기준값은 balance.STAT_BASELINE(=50). */
export interface BeybladeStats {
  /** 가하는 충돌 데미지 */
  readonly attack: number;
  /** 충돌 시 밀림 저항 + 받는 데미지 감소 */
  readonly weight: number;
  /** 회전력 자연 감소 저항 */
  readonly stamina: number;
  /** 방향 입력에 대한 가속력 */
  readonly control: number;
}

/**
 * 파츠 특성이 건드릴 수 있는 밸런스 상수 4종에 대한 배율 묶음.
 *
 * 설계 제약(02_게임설계.md §3-3): 특성은 "기존 balance 상수 1개 × 배율 1개" 형태만 허용되고,
 * 특성을 가진 파츠는 12종 중 최대 4종이다. 그래서 여기 키도 4개뿐이다.
 * 전부 순수 숫자라 스냅샷 직렬화(S3)에 그대로 실린다.
 */
export interface BuildTuning {
  /** STRIKE_APPROACH_SPEED 배율. 1 미만이면 더 낮은 속도에서도 강타로 인정된다. */
  readonly strikeThresholdMultiplier: number;
  /** KNOCKBACK_IMPULSE_PER_POINT 배율. */
  readonly knockbackImpulseMultiplier: number;
  /** BURST_GAUGE_REGENERATION_PER_SECOND 배율. */
  readonly burstRegenerationMultiplier: number;
  /** BURST_IMPULSE_SPEED 배율. */
  readonly burstImpulseMultiplier: number;
  /**
   * 타격 시 이 팽이가 가하는 충돌 데미지(COLLISION_DAMAGE_PER_RELATIVE_SPEED)에 곱하는 배율.
   * STRIKE 세트 완성(공격형, §17-C R-SET1)이 이 값을 올린다 — 신규 효과가 아니라 기존 데미지 계수 × 배율(SET3).
   * 무세트·미완성은 1.0.
   */
  readonly damageDealtMultiplier: number;
}

/** 특성이 하나도 없는 상태(전부 배율 1.0). */
export const NEUTRAL_TUNING: BuildTuning = {
  strikeThresholdMultiplier: 1,
  knockbackImpulseMultiplier: 1,
  burstRegenerationMultiplier: 1,
  burstImpulseMultiplier: 1,
  damageDealtMultiplier: 1,
};

/** 넉백 합산 구간. 표시명과 열리는 레버가 다르다. */
export type KnockbackTier = 'none' | 'rimPressure' | 'ringBreaker';

/** 패배 사유. */
export type DefeatReason = 'none' | 'spinOut' | 'ringOut' | 'selfRingOut';

/** 한 대의 팽이. */
export interface Beyblade {
  readonly index: number;
  readonly name: string;
  readonly stats: BeybladeStats;

  /** 장착 파츠 3개의 넉백 합산(파생값). 레버 L1~L3 의 세기만 결정한다. */
  readonly knockback: number;
  /** 넉백 합산이 속한 구간. 어떤 레버가 열리는지를 결정한다. */
  readonly knockbackTier: KnockbackTier;
  /** 파츠 특성이 만든 밸런스 상수 배율. */
  readonly tuning: BuildTuning;

  /** L2 — 남은 경직 시간(초). 0 보다 크면 방향키 가속이 STUN_ACCELERATION_FACTOR 로 눌린다. */
  stunRemainingSeconds: number;
  /** L3 — 남은 턱 관통 시간(초). 0 보다 크면 테두리 턱 복원 가속이 감쇠된다. */
  lipPierceRemainingSeconds: number;
  /** L3 — 현재 걸려 있는 턱 감쇠 배율. 강타 등급(임계2 / 사고)에 따라 다르다. */
  lipPierceMultiplier: number;
  /** 마지막으로 피격당한 배틀 경과 시간(초). 자폭 링아웃 판별에 쓴다. 미피격이면 -Infinity. */
  lastStruckElapsedSeconds: number;

  /**
   * 이 팽이가 이 판에서 링 밖으로 나간 횟수(HUD 링아웃 카운터).
   * 2026-07-21 개정: 링아웃은 즉시 패배가 아니라 회전력 페널티 + 중앙 복귀이므로,
   * 한 판 안에서 여러 번 누적된다(02_게임설계.md §2-1b).
   */
  ringOutCount: number;
  /**
   * 이 팽이가 패배했을 때, 그 결착타가 링아웃 페널티였는가(= '링아웃 피니시').
   * defeatReason 은 'spinOut' 으로 두되(§2-1b: 결착 사유 spinOut + 원인 플래그 byRingOut),
   * 이 플래그로 링아웃 피니시를 집계·연출 구분한다.
   */
  defeatByRingOut: boolean;
  /** 위 링아웃 피니시가 자폭 이탈이었는가(직전 피격 없이 스스로 나감). */
  defeatSelfInflicted: boolean;

  positionX: number;
  positionY: number;
  velocityX: number;
  velocityY: number;

  /** 물리 반경. */
  radius: number;

  /** 회전력(=HP). 0 이면 스핀아웃. */
  spin: number;

  /** 대시 버스트 게이지. */
  burstGauge: number;
  /** 남은 버스트 지속 시간(초). 0 보다 크면 버스트 중. */
  burstRemainingSeconds: number;

  /** 렌더 전용 — 팽이 몸체의 시각적 회전 각도(라디안). 물리에는 영향이 없다. */
  visualSpinAngle: number;

  alive: boolean;
  defeatReason: DefeatReason;
}

/** 배틀 상태머신. 준비 → 전투 → 결착 → 결과. */
export type BattlePhase = 'ready' | 'fighting' | 'settling' | 'finished';

/** 라운드 결과 사유. */
export type BattleOutcome =
  | 'none'
  | 'spinOut'
  | 'ringOut'
  /** 직전 피격 없이 스스로(버스트 추진 등) 이탈. PM 판정 2026-07-20 — 결함이 아니라 재미 요소이며,
   *  일반 링아웃 패배와 구분해 표시하고 즉시 재시작 동선으로 유도한다. */
  | 'selfRingOut'
  | 'timeLimit'
  | 'draw';

/** 한 스텝에 시뮬레이션이 뱉는 연출용 이벤트. 렌더 계층이 소비한다. */
export type SimulationEvent =
  | {
      readonly kind: 'collision';
      readonly positionX: number;
      readonly positionY: number;
      /** 0~1 로 정규화한 충돌 세기. 히트스톱·화면 흔들림 강도의 입력. */
      readonly strength: number;
      readonly attackerIndex: number;
      readonly defenderIndex: number;
    }
  | {
      readonly kind: 'burstActivated';
      readonly beybladeIndex: number;
      readonly positionX: number;
      readonly positionY: number;
    }
  | {
      readonly kind: 'ringOut';
      readonly beybladeIndex: number;
      readonly positionX: number;
      readonly positionY: number;
      /** 직전 피격 없이 스스로 나갔는가. 연출·문구를 가르는 값이다. */
      readonly selfInflicted: boolean;
      /**
       * 이 링아웃 페널티로 회전력이 0 이 되어 그대로 결착났는가(= '링아웃 피니시').
       * false 면 페널티 후 중앙 복귀·리셋 프리즈로 이어진다(§2-1b).
       * F3(컷 4) 연출은 finish 여부로 마지막 이탈을 강조한다.
       */
      readonly finish: boolean;
    }
  | {
      readonly kind: 'spinOut';
      readonly beybladeIndex: number;
      readonly positionX: number;
      readonly positionY: number;
    }
  | {
      readonly kind: 'battleFinished';
      /** 승자 인덱스. 무승부면 -1. */
      readonly winnerIndex: number;
      readonly outcome: BattleOutcome;
      /** 결착타가 링아웃 페널티였는가(= 링아웃 피니시). outcome 은 'spinOut' 으로 유지된다(§2-1b). */
      readonly byRingOut: boolean;
      /** 링아웃 피니시가 자폭 이탈이었는가. */
      readonly selfInflicted: boolean;
    };

/** 배틀 전체 상태. 이 객체 하나가 곧 세이브/스냅샷 단위다. */
export interface BattleState {
  phase: BattlePhase;
  /** 현재 phase 로 들어온 뒤 지난 시간(초). */
  phaseElapsedSeconds: number;
  /** 'fighting' 이 시작된 뒤 지난 시간(초). 제한 시간 판정용. */
  battleElapsedSeconds: number;
  /** 시뮬 스텝 카운터. S3 의 네트워크 틱 번호가 된다. */
  tick: number;

  /**
   * 링아웃 페널티 후 중앙 복귀 리셋 프리즈의 남은 시간(초). 0 보다 크면 프리즈 중이며
   * 입력·물리·충돌·판정이 정지한다. 시뮬 틱 기준으로만 감소한다(결정론·S3 전제, §2-1b 4번).
   * 라운드 제한 90초는 이 프리즈 시간을 포함한다(D13) — 시계를 멈추지 않는다.
   */
  resetFreezeRemainingSeconds: number;

  beyblades: Beyblade[];

  /** 시뮬 내부 난수 상태. */
  random: RandomState;

  /**
   * 팽이 쌍별 충돌 쿨다운(초). 인덱스는 pairKey(i, j) 로 계산.
   * 같은 접촉이 여러 스텝에 걸쳐 반복 판정되는 것을 막는다.
   */
  collisionCooldowns: number[];

  winnerIndex: number;
  outcome: BattleOutcome;
  /** 결착타가 링아웃 페널티였는가(= 링아웃 피니시). outcome='spinOut' 과 함께 읽는다(§2-1b). */
  finishByRingOut: boolean;
  /** 위 링아웃 피니시가 자폭 이탈이었는가. */
  finishSelfInflicted: boolean;

  /** 이번 스텝에 발생한 이벤트. 매 스텝 시작 시 비워진다. */
  events: SimulationEvent[];
}

/** 한 팽이에 대한 한 스텝치 입력 명령. */
export interface InputCommand {
  /** 이동 입력 X (-1 ~ 1). 화면 오른쪽이 +. */
  readonly moveX: number;
  /** 이동 입력 Y (-1 ~ 1). 화면 아래쪽이 +. */
  readonly moveY: number;
  /** 이번 스텝에 대시 버스트를 발동하려는가. */
  readonly burst: boolean;
}

export const NEUTRAL_INPUT: InputCommand = { moveX: 0, moveY: 0, burst: false };
