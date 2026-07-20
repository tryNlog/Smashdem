/**
 * 헤드리스 배틀 스모크 + 밸런스 목표치 T1~T8 자동 측정.
 *
 * 시뮬레이션이 DOM 없이 순수하게 돌아간다는 것 자체가 구조 제약이므로,
 * 브라우저 없이 Node 에서 배틀을 끝까지 돌려 관찰한다.
 *  1) 배틀이 실제로 결착나는가 / 같은 시드로 두 번 돌리면 결과가 완전히 동일한가(결정론)
 *  2) 02_게임설계.md §2-6 의 목표치 T1~T6 을 빌드별 매치업으로 집계
 *
 * 실행: npm run smoke
 * 주의: 출력은 관측값이다. 목표 구간 판정은 표시하되, 밸런스 채택 판정은 사람이 한다.
 */

import * as Balance from '../src/game/balance';
import { botInput } from '../src/game/bot';
import {
  cloneBattleState,
  createBattleState,
  definitionFromBuild,
  type BeybladeDefinition,
} from '../src/game/battleState';
import {
  ARCHETYPE_BUILDS,
  buildProfile,
  knockbackTierLabel,
  RIM_PRESSURE_BUILD,
  STARTER_BUILD,
  type Build,
} from '../src/game/parts';
import { stepBattle } from '../src/game/simulation';
import type { BattleState, InputCommand } from '../src/game/types';

const MAXIMUM_STEPS = Math.ceil(
  (Balance.ROUND_TIME_LIMIT_SECONDS + Balance.READY_DURATION_SECONDS + Balance.SETTLE_DURATION_SECONDS + 5) /
    Balance.FIXED_DELTA_SECONDS,
);

/** 시드 고정 40개. 디렉터 지정 최소 표본 32판을 넘긴다(좌우 교대까지 하면 매치업당 80판). */
const SEEDS: readonly number[] = Array.from({ length: 40 }, (_, index) => 1 + index * 7919);

/**
 * 자폭 링아웃 집계는 시뮬레이션 자체의 분류(`outcome === 'selfRingOut'`)를 쓴다.
 * 기준값은 balance.SELF_RING_OUT_GRACE_SECONDS 이며 여기서 따로 정의하지 않는다.
 *
 * T4 판정 범위: **방향키만** 자력 이탈 프로브(PM 판정 2026-07-20).
 * 버스트를 쓴 자력 이탈은 게이지를 소모한 의도적 행동이므로 위반이 아니라 재미 요소로 수용됐다.
 */

// ─────────────────────────────────────────────────────────────
// 빌드 카탈로그
// ─────────────────────────────────────────────────────────────

interface NamedBuild {
  readonly label: string;
  readonly build: Build;
}

const BUILDS = {
  starter: { label: '시작 빌드', build: STARTER_BUILD },
  rimPressure: { label: 'RIM PRESSURE', build: RIM_PRESSURE_BUILD },
  ringBreaker: { label: 'A3 링브레이커', build: ARCHETYPE_BUILDS.ringBreaker },
  attack: { label: 'A1 어택', build: ARCHETYPE_BUILDS.attack },
  stamina: { label: 'A2 스태미나', build: ARCHETYPE_BUILDS.stamina },
} satisfies Record<string, NamedBuild>;

type BuildKey = keyof typeof BUILDS;

function definitionOf(key: BuildKey, name: string): BeybladeDefinition {
  return definitionFromBuild(name, BUILDS[key].build);
}

// ─────────────────────────────────────────────────────────────
// 한 판
// ─────────────────────────────────────────────────────────────

interface BattleReport {
  winnerIndex: number;
  outcome: string;
  battleSeconds: number;
  collisionCount: number;
  /** 배틀 시작부터 첫 충돌까지의 초. 충돌이 없었으면 -1. */
  firstCollisionSeconds: number;
  /** 링아웃으로 탈락한 팽이 인덱스. 없으면 -1. */
  ringOutIndex: number;
  /** 링아웃이 직전 피격 없이 발생했는가(= 자력 이탈). */
  selfEjectRingOut: boolean;
  maximumDistanceRatio: number;
  fingerprint: string;
}

function runBattle(
  first: BeybladeDefinition,
  second: BeybladeDefinition,
  seed: number,
): BattleReport {
  const state = createBattleState([first, second], seed);
  const inputs: InputCommand[] = [];
  let collisionCount = 0;
  let firstCollisionSeconds = -1;
  let maximumDistanceRatio = 0;
  let ringOutIndex = -1;
  let selfEjectRingOut = false;

  for (let step = 0; step < MAXIMUM_STEPS; step += 1) {
    inputs[0] = botInput(state, 0);
    inputs[1] = botInput(state, 1);
    stepBattle(state, inputs, Balance.FIXED_DELTA_SECONDS);

    for (const event of state.events) {
      if (event.kind === 'collision') {
        collisionCount += 1;
        if (firstCollisionSeconds < 0) firstCollisionSeconds = state.battleElapsedSeconds;
      }
      if (event.kind === 'ringOut') {
        ringOutIndex = event.beybladeIndex;
        if (event.selfInflicted) selfEjectRingOut = true;
      }
    }
    for (const beyblade of state.beyblades) {
      if (!beyblade.alive) continue;
      maximumDistanceRatio = Math.max(
        maximumDistanceRatio,
        Math.hypot(beyblade.positionX, beyblade.positionY) / Balance.ARENA_RADIUS,
      );
    }
    if (state.phase === 'finished') break;
  }

  return {
    winnerIndex: state.winnerIndex,
    outcome: state.outcome,
    battleSeconds: Number(state.battleElapsedSeconds.toFixed(2)),
    collisionCount,
    firstCollisionSeconds: Number(firstCollisionSeconds.toFixed(2)),
    ringOutIndex,
    selfEjectRingOut,
    maximumDistanceRatio: Number(maximumDistanceRatio.toFixed(3)),
    fingerprint: makeFingerprint(state),
  };
}

function makeFingerprint(state: BattleState): string {
  const snapshot = cloneBattleState(state);
  return snapshot.beyblades
    .map(
      (beyblade) =>
        `${beyblade.index}:${beyblade.positionX.toFixed(6)},${beyblade.positionY.toFixed(6)},${beyblade.spin.toFixed(6)},${beyblade.defeatReason}`,
    )
    .join('|');
}

// ─────────────────────────────────────────────────────────────
// 매치업 집계 (좌우 교대로 스폰 위치 편향 제거)
// ─────────────────────────────────────────────────────────────

interface MatchupResult {
  label: string;
  battles: number;
  winsA: number;
  winsB: number;
  draws: number;
  outcomes: Record<string, number>;
  ringOutRatio: number;
  drawRatio: number;
  winRateA: number;
  /** A 가 상대를 링아웃시킨 판 수 / B 가 A 를 링아웃시킨 판 수 */
  ringOutByA: number;
  ringOutByB: number;
  selfEjectCount: number;
  averageSeconds: number;
  averageFirstCollisionSeconds: number;
  minimumSeconds: number;
  maximumSeconds: number;
}

function runMatchup(label: string, keyA: BuildKey, keyB: BuildKey): MatchupResult {
  const outcomes: Record<string, number> = {};
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let ringOuts = 0;
  let ringOutByA = 0;
  let ringOutByB = 0;
  let selfEjectCount = 0;
  let totalSeconds = 0;
  let totalFirstCollision = 0;
  let firstCollisionSamples = 0;
  let minimumSeconds = Infinity;
  let maximumSeconds = 0;
  let battles = 0;

  for (const seed of SEEDS) {
    // aFirst=true 면 A 가 인덱스 0. 좌우를 바꿔 스폰 위치 편향을 상쇄한다.
    for (const aFirst of [true, false]) {
      const defA = definitionOf(keyA, 'A');
      const defB = definitionOf(keyB, 'B');
      const report = aFirst ? runBattle(defA, defB, seed) : runBattle(defB, defA, seed);
      const indexOfA = aFirst ? 0 : 1;

      battles += 1;
      outcomes[report.outcome] = (outcomes[report.outcome] ?? 0) + 1;
      totalSeconds += report.battleSeconds;
      minimumSeconds = Math.min(minimumSeconds, report.battleSeconds);
      maximumSeconds = Math.max(maximumSeconds, report.battleSeconds);
      if (report.firstCollisionSeconds >= 0) {
        totalFirstCollision += report.firstCollisionSeconds;
        firstCollisionSamples += 1;
      }
      if (report.selfEjectRingOut) selfEjectCount += 1;

      if (report.outcome === 'draw') draws += 1;
      else if (report.winnerIndex === indexOfA) winsA += 1;
      else winsB += 1;

      if (report.outcome === 'ringOut' || report.outcome === 'selfRingOut') {
        ringOuts += 1;
        if (report.ringOutIndex === indexOfA) ringOutByB += 1;
        else ringOutByA += 1;
      }
    }
  }

  return {
    label,
    battles,
    winsA,
    winsB,
    draws,
    outcomes,
    ringOutRatio: ringOuts / battles,
    drawRatio: draws / battles,
    winRateA: winsA / battles,
    ringOutByA,
    ringOutByB,
    selfEjectCount,
    averageSeconds: totalSeconds / battles,
    averageFirstCollisionSeconds:
      firstCollisionSamples > 0 ? totalFirstCollision / firstCollisionSamples : -1,
    minimumSeconds,
    maximumSeconds,
  };
}

// ─────────────────────────────────────────────────────────────
// T4 — 자력 이탈 회귀 프로브 (전 빌드)
// ─────────────────────────────────────────────────────────────

/**
 * 한 팽이를 계속 바깥으로 밀면서 스스로 나가지는지 관찰한다.
 * 레버 L1~L3 은 "강타를 맞은 쪽"에만 걸리므로 자기 입력만으로는 열리지 않아야 한다.
 */
function runSelfEjectProbe(
  key: BuildKey,
  seconds: number,
  useBurst: boolean,
): { ringOut: boolean; maximumDistanceRatio: number } {
  const state = createBattleState([definitionOf(key, 'SELF'), definitionOf('starter', 'IDLE')], 1);
  const steps = Math.ceil(seconds / Balance.FIXED_DELTA_SECONDS);
  let maximumDistanceRatio = 0;
  let ringOut = false;

  for (let step = 0; step < steps; step += 1) {
    const self = state.beyblades[0];
    const distance = Math.hypot(self.positionX, self.positionY) || 1;
    const inputs: InputCommand[] = [
      {
        moveX: self.positionX / distance,
        moveY: self.positionY / distance,
        burst: useBurst && self.burstGauge >= Balance.BURST_GAUGE_COST,
      },
      { moveX: 0, moveY: 0, burst: false },
    ];
    stepBattle(state, inputs, Balance.FIXED_DELTA_SECONDS);

    for (const event of state.events) {
      if (event.kind === 'ringOut' && event.beybladeIndex === 0) ringOut = true;
    }
    if (self.alive) {
      maximumDistanceRatio = Math.max(
        maximumDistanceRatio,
        Math.hypot(self.positionX, self.positionY) / Balance.ARENA_RADIUS,
      );
    }
    if (state.phase === 'finished') break;
  }

  return { ringOut, maximumDistanceRatio: Number(maximumDistanceRatio.toFixed(3)) };
}

// ─────────────────────────────────────────────────────────────
// 출력
// ─────────────────────────────────────────────────────────────

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function rangeVerdict(value: number, low: number, high: number): string {
  return value >= low && value <= high ? '목표구간 내' : '★ 목표구간 밖';
}

function printBuild(key: BuildKey): void {
  const named = BUILDS[key];
  const profile = buildProfile(named.build);
  const parts = [named.build.layer, named.build.disk, named.build.driver];
  console.log(
    `  ${named.label.padEnd(14)} ${parts.map((part) => part.id).join('/')}  ` +
      `atk ${profile.stats.attack} / wgt ${profile.stats.weight} / sta ${profile.stats.stamina} / ctl ${profile.stats.control}  ` +
      `넉백 ${profile.knockback} (${knockbackTierLabel(profile.tier)})`,
  );
}

function printMatchup(result: MatchupResult): void {
  console.log(
    `  ${result.label.padEnd(30)} 판수 ${result.battles}  ` +
      `링아웃 ${percent(result.ringOutRatio)}(A ${result.ringOutByA}/B ${result.ringOutByB})  ` +
      `무승부 ${percent(result.drawRatio)}  A승률 ${percent(result.winRateA)}  ` +
      `길이 ${result.averageSeconds.toFixed(1)}s(${result.minimumSeconds.toFixed(1)}~${result.maximumSeconds.toFixed(1)})  ` +
      `${JSON.stringify(result.outcomes)}`,
  );
}

function main(): void {
  console.log('=== 헤드리스 배틀 스모크 + 밸런스 목표치 측정 ===');
  console.log(`고정 스텝: ${Balance.FIXED_DELTA_SECONDS} 초 / 최대 ${MAXIMUM_STEPS} 스텝`);
  console.log(`시드 ${SEEDS.length}개 × 좌우 교대 2회 = 매치업당 ${SEEDS.length * 2} 판`);
  console.log('');

  console.log('--- 검증 빌드 ---');
  (Object.keys(BUILDS) as BuildKey[]).forEach(printBuild);
  console.log(
    `  넉백 임계: RIM PRESSURE ≥ ${Balance.KNOCKBACK_THRESHOLD_RIM_PRESSURE} / RING BREAKER ≥ ${Balance.KNOCKBACK_THRESHOLD_RING_BREAKER}` +
      ` / 강타 임계 접근속도 ${Balance.STRIKE_APPROACH_SPEED}`,
  );
  console.log('');

  let deterministicCount = 0;
  for (const seed of SEEDS.slice(0, 8)) {
    const first = runBattle(definitionOf('starter', 'A'), definitionOf('starter', 'B'), seed);
    const second = runBattle(definitionOf('starter', 'A'), definitionOf('starter', 'B'), seed);
    if (first.fingerprint === second.fingerprint) deterministicCount += 1;
  }
  console.log(`동일 시드 재현: ${deterministicCount}/8 일치`);
  console.log('');

  console.log('--- 매치업 집계 ---');
  const t1 = runMatchup('T1 시작 vs 시작', 'starter', 'starter');
  const t2 = runMatchup('T2 RIM PRESSURE vs 시작', 'rimPressure', 'starter');
  const t3 = runMatchup('T3 RING BREAKER vs 시작', 'ringBreaker', 'starter');
  const rbVsAttack = runMatchup('T6 링브레이커 vs 어택', 'ringBreaker', 'attack');
  const rbVsStamina = runMatchup('T6 링브레이커 vs 스태미나', 'ringBreaker', 'stamina');
  const attackVsStamina = runMatchup('(참고) 어택 vs 스태미나', 'attack', 'stamina');
  const all = [t1, t2, t3, rbVsAttack, rbVsStamina, attackVsStamina];
  all.forEach(printMatchup);
  console.log('');

  console.log('--- T4 자력 이탈 프로브 (방향키만 15초 / 방향키+버스트 15초) ---');
  let thrustOnlyEjects = 0;
  for (const key of Object.keys(BUILDS) as BuildKey[]) {
    const thrust = runSelfEjectProbe(key, 15, false);
    const withBurst = runSelfEjectProbe(key, 15, true);
    if (thrust.ringOut) thrustOnlyEjects += 1;
    console.log(
      `  ${BUILDS[key].label.padEnd(14)} 방향키만: ${thrust.ringOut ? '★이탈발생' : '이탈없음'}(최대거리비 ${thrust.maximumDistanceRatio})  ` +
        `버스트포함: ${withBurst.ringOut ? '이탈발생' : '이탈없음'}(최대거리비 ${withBurst.maximumDistanceRatio})`,
    );
  }
  const inMatchSelfEjects = all.reduce((sum, result) => sum + result.selfEjectCount, 0);
  const totalBattles = all.reduce((sum, result) => sum + result.battles, 0);
  console.log(
    `  대전 중 자폭 링아웃(outcome=selfRingOut): ${inMatchSelfEjects} / ${totalBattles} 판`,
  );
  console.log(
    '  ※ T4 판정 범위는 위 "방향키만" 프로브다(PM 판정 2026-07-20). 버스트 이탈은 수용 항목.',
  );
  console.log('');

  const totalDraws = all.reduce((sum, result) => sum + result.draws, 0);
  const drawRatio = totalDraws / totalBattles;
  const ringBreakerWinRate =
    (rbVsAttack.winsA + rbVsStamina.winsA) / (rbVsAttack.battles + rbVsStamina.battles);
  const attackWinRate =
    (rbVsAttack.winsB + attackVsStamina.winsA) / (rbVsAttack.battles + attackVsStamina.battles);
  const staminaWinRate =
    (rbVsStamina.winsB + attackVsStamina.winsB) / (rbVsStamina.battles + attackVsStamina.battles);
  const averageSeconds =
    all.reduce((sum, result) => sum + result.averageSeconds * result.battles, 0) / totalBattles;
  const firstCollision =
    all.reduce((sum, result) => sum + result.averageFirstCollisionSeconds * result.battles, 0) /
    totalBattles;

  console.log('--- 목표치 판정 (02_게임설계.md §2-6) ---');
  console.log(
    `  T1 시작빌드 링아웃 비율      ${percent(t1.ringOutRatio).padStart(6)}  목표 1~8%    ${rangeVerdict(t1.ringOutRatio, 0.01, 0.08)}`,
  );
  console.log(
    `  T2 임계1 링아웃 비율         ${percent(t2.ringOutRatio).padStart(6)}  목표 15~25%  ${rangeVerdict(t2.ringOutRatio, 0.15, 0.25)}`,
  );
  console.log(
    `  T3 RING BREAKER 링아웃 비율  ${percent(t3.ringOutRatio).padStart(6)}  목표 45~65%  ${rangeVerdict(t3.ringOutRatio, 0.45, 0.65)}`,
  );
  console.log(
    `  T4 자력 링아웃(방향키만/최우선) ${String(thrustOnlyEjects).padStart(4)}건  목표 0건     ${thrustOnlyEjects === 0 ? '목표구간 내' : '★ 목표구간 밖'}` +
      `   [참고] 대전 중 자폭 링아웃 ${inMatchSelfEjects}건`,
  );
  console.log(
    `  T5 무승부 비율               ${percent(drawRatio).padStart(6)}  목표 ≤5%     ${rangeVerdict(drawRatio, 0, 0.05)}`,
  );
  console.log(
    `  T6 링브레이커 승률           ${percent(ringBreakerWinRate).padStart(6)}  목표 45~60%  ${rangeVerdict(ringBreakerWinRate, 0.45, 0.6)}`,
  );
  console.log(
    `     (참고) 어택 승률 ${percent(attackWinRate)} / 스태미나 승률 ${percent(staminaWinRate)}`,
  );
  console.log(
    `  T7 한 판 길이 평균           ${averageSeconds.toFixed(1)}s  목표 25~50s  ${rangeVerdict(averageSeconds, 25, 50)}`,
  );
  console.log(
    `  T8 첫 충돌까지 평균          ${firstCollision.toFixed(2)}s  목표 ≤3s     ${rangeVerdict(firstCollision, 0, 3)}`,
  );
  console.log('');
  console.log('※ 위 수치는 관측값이다. 밸런스 채택 여부 판정은 사람이 한다.');
}

main();
