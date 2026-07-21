/**
 * 헤드리스 배틀 스모크 + 밸런스 목표치 측정 (①단계 — 링아웃 페널티 계수 N8·N9 확정용).
 *
 * ★ 2026-07-21 전면 개정. 옛 지표 T1~T8(링아웃 = 즉시 승리 전제)은 전량 무효(02_게임설계.md P-9).
 * 링아웃은 이제 결착이 아니라 회전력 페널티 + 중앙 복귀다(§2-1b). 그래서 링아웃 지표가
 * 이진 사건(결착 비율)에서 연속량(배틀당 발생 횟수)으로 바뀌었다. 본 하네스는 §2-6 개정판의
 * ①단계 지표만 측정한다: T1'·T3'·T3b·T4·T5·T7 + 결착 사유 분포 + 결정론 + 1,280판 실시간.
 *
 * 실행: npm run smoke
 * 주의: 출력은 관측값이다. 목표 구간 판정 표시는 참고이며, 밸런스 채택 판정은 사람(PM·디렉터)이 한다.
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
  STARTER_BUILD,
  type Build,
} from '../src/game/parts';
import { stepBattle } from '../src/game/simulation';
import type { BattleState, InputCommand } from '../src/game/types';

const MAXIMUM_STEPS = Math.ceil(
  (Balance.ROUND_TIME_LIMIT_SECONDS + Balance.READY_DURATION_SECONDS + Balance.SETTLE_DURATION_SECONDS + 5) /
    Balance.FIXED_DELTA_SECONDS,
);

/** 시드 고정 40개 × 좌우 교대 2회 = 매치업당 80판(디렉터 지정 표본, §2-6). */
const SEEDS: readonly number[] = Array.from({ length: 40 }, (_, index) => 1 + index * 7919);

// ─────────────────────────────────────────────────────────────
// 빌드 카탈로그 (①단계는 시작 빌드 · 링브레이커 중심. 세트·강화 0 고정)
// ─────────────────────────────────────────────────────────────

interface NamedBuild {
  readonly label: string;
  readonly build: Build;
}

const BUILDS = {
  starter: { label: '시작 빌드', build: STARTER_BUILD },
  ringBreaker: { label: 'A3 링브레이커', build: ARCHETYPE_BUILDS.ringBreaker },
  attack: { label: 'A1 어택', build: ARCHETYPE_BUILDS.attack },
  stamina: { label: 'A2 스태미나', build: ARCHETYPE_BUILDS.stamina },
} satisfies Record<string, NamedBuild>;

type BuildKey = keyof typeof BUILDS;

function definitionOf(key: BuildKey, name: string): BeybladeDefinition {
  return definitionFromBuild(name, BUILDS[key].build);
}

// ─────────────────────────────────────────────────────────────
// 결착 사유 카테고리 — 링아웃 피니시를 집계 가능하게 구분한다(과제 요구).
//   spinOut          : 순수 스핀아웃(회전력 자연 소진·충돌 누적)
//   ringOutFinish    : 링아웃 페널티로 회전력 0 → 결착(피격 유래)
//   selfRingOutFinish: 위와 같으나 자폭 이탈 유래
//   timeLimit        : 90초 판정승
//   draw             : 무승부
// ─────────────────────────────────────────────────────────────
type OutcomeCategory =
  | 'spinOut'
  | 'ringOutFinish'
  | 'selfRingOutFinish'
  | 'timeLimit'
  | 'draw';

function categorize(state: BattleState): OutcomeCategory {
  if (state.outcome === 'draw') return 'draw';
  if (state.outcome === 'timeLimit') return 'timeLimit';
  if (state.finishByRingOut) {
    return state.finishSelfInflicted ? 'selfRingOutFinish' : 'ringOutFinish';
  }
  return 'spinOut';
}

// ─────────────────────────────────────────────────────────────
// 한 판
// ─────────────────────────────────────────────────────────────

interface BattleReport {
  winnerIndex: number;
  category: OutcomeCategory;
  battleSeconds: number;
  /** 이 판에서 발생한 링아웃 이벤트 총수(양쪽 합, 페널티 포함). T1'·T3' 의 원자재. */
  ringOutEvents: number;
  /** 결착타가 링아웃 페널티였는가(= 링아웃 피니시). T3b 의 원자재. */
  finishByRingOut: boolean;
  collisionCount: number;
  firstCollisionSeconds: number;
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
  let ringOutEvents = 0;

  for (let step = 0; step < MAXIMUM_STEPS; step += 1) {
    inputs[0] = botInput(state, 0);
    inputs[1] = botInput(state, 1);
    stepBattle(state, inputs, Balance.FIXED_DELTA_SECONDS);

    for (const event of state.events) {
      if (event.kind === 'collision') {
        collisionCount += 1;
        if (firstCollisionSeconds < 0) firstCollisionSeconds = state.battleElapsedSeconds;
      } else if (event.kind === 'ringOut') {
        ringOutEvents += 1;
      }
    }
    if (state.phase === 'finished') break;
  }

  return {
    winnerIndex: state.winnerIndex,
    category: categorize(state),
    battleSeconds: Number(state.battleElapsedSeconds.toFixed(2)),
    ringOutEvents,
    finishByRingOut: state.finishByRingOut,
    collisionCount,
    firstCollisionSeconds: Number(firstCollisionSeconds.toFixed(2)),
    fingerprint: makeFingerprint(state),
  };
}

function makeFingerprint(state: BattleState): string {
  const snapshot = cloneBattleState(state);
  return snapshot.beyblades
    .map(
      (beyblade) =>
        `${beyblade.index}:${beyblade.positionX.toFixed(6)},${beyblade.positionY.toFixed(6)},${beyblade.spin.toFixed(6)},${beyblade.defeatReason},${beyblade.ringOutCount}`,
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
  categories: Record<string, number>;
  /** 배틀당 링아웃 발생 횟수 평균 (T1'·T3'). */
  ringOutsPerBattle: number;
  /** 링아웃 피니시 비율 (T3b). */
  ringOutFinishRatio: number;
  drawRatio: number;
  winRateA: number;
  averageSeconds: number;
  minimumSeconds: number;
  maximumSeconds: number;
  averageFirstCollisionSeconds: number;
}

function runMatchup(label: string, keyA: BuildKey, keyB: BuildKey): MatchupResult {
  const categories: Record<string, number> = {};
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let ringOutEventsTotal = 0;
  let ringOutFinishes = 0;
  let totalSeconds = 0;
  let totalFirstCollision = 0;
  let firstCollisionSamples = 0;
  let minimumSeconds = Infinity;
  let maximumSeconds = 0;
  let battles = 0;

  for (const seed of SEEDS) {
    for (const aFirst of [true, false]) {
      const defA = definitionOf(keyA, 'A');
      const defB = definitionOf(keyB, 'B');
      const report = aFirst ? runBattle(defA, defB, seed) : runBattle(defB, defA, seed);
      const indexOfA = aFirst ? 0 : 1;

      battles += 1;
      categories[report.category] = (categories[report.category] ?? 0) + 1;
      totalSeconds += report.battleSeconds;
      minimumSeconds = Math.min(minimumSeconds, report.battleSeconds);
      maximumSeconds = Math.max(maximumSeconds, report.battleSeconds);
      ringOutEventsTotal += report.ringOutEvents;
      if (report.finishByRingOut) ringOutFinishes += 1;
      if (report.firstCollisionSeconds >= 0) {
        totalFirstCollision += report.firstCollisionSeconds;
        firstCollisionSamples += 1;
      }

      if (report.category === 'draw') draws += 1;
      else if (report.winnerIndex === indexOfA) winsA += 1;
      else winsB += 1;
    }
  }

  return {
    label,
    battles,
    winsA,
    winsB,
    draws,
    categories,
    ringOutsPerBattle: ringOutEventsTotal / battles,
    ringOutFinishRatio: ringOutFinishes / battles,
    drawRatio: draws / battles,
    winRateA: winsA / battles,
    averageSeconds: totalSeconds / battles,
    minimumSeconds,
    maximumSeconds,
    averageFirstCollisionSeconds:
      firstCollisionSamples > 0 ? totalFirstCollision / firstCollisionSamples : -1,
  };
}

// ─────────────────────────────────────────────────────────────
// T4 — 자력 이탈 회귀 프로브 (전 빌드, 방향키만이 판정 범위)
// ─────────────────────────────────────────────────────────────

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
    maximumDistanceRatio = Math.max(
      maximumDistanceRatio,
      Math.hypot(self.positionX, self.positionY) / Balance.ARENA_RADIUS,
    );
    if (state.phase === 'finished') break;
  }

  return { ringOut, maximumDistanceRatio: Number(maximumDistanceRatio.toFixed(3)) };
}

// ─────────────────────────────────────────────────────────────
// 1,280판 실시간 소요 실측 (디렉터 명시 요구, §12-7)
//   1회분 재측정 총량이 1,280판이다. 후퇴선 발동 시점 산정을 위해 벽시계를 잰다.
//   측정 방법: 대표 매치업을 순환하며 1,280판을 실제로 돌리고 performance.now() 로 감싼다.
//   (이 파일은 src/game 밖이므로 performance.now() 사용이 결정론 규칙에 저촉되지 않는다.)
// ─────────────────────────────────────────────────────────────

function measureWallClock(totalBattles: number): { totalMs: number; perBattleMs: number } {
  const rotation: Array<[BuildKey, BuildKey]> = [
    ['starter', 'starter'],
    ['ringBreaker', 'starter'],
    ['ringBreaker', 'attack'],
    ['ringBreaker', 'stamina'],
    ['attack', 'stamina'],
    ['attack', 'starter'],
    ['stamina', 'starter'],
  ];
  // 이 파일은 src/game 밖이므로 Date.now() 사용이 결정론 규칙에 저촉되지 않는다(벽시계 측정 전용).
  const start = Date.now();
  for (let index = 0; index < totalBattles; index += 1) {
    const [keyA, keyB] = rotation[index % rotation.length];
    const seed = 1 + index * 7919;
    runBattle(definitionOf(keyA, 'A'), definitionOf(keyB, 'B'), seed);
  }
  const totalMs = Date.now() - start;
  return { totalMs, perBattleMs: totalMs / totalBattles };
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
    `  ${result.label.padEnd(24)} 판수 ${result.battles}  ` +
      `링아웃/판 ${result.ringOutsPerBattle.toFixed(2)}  ` +
      `링아웃피니시 ${percent(result.ringOutFinishRatio)}  ` +
      `무승부 ${percent(result.drawRatio)}  A승률 ${percent(result.winRateA)}  ` +
      `길이 ${result.averageSeconds.toFixed(1)}s(${result.minimumSeconds.toFixed(1)}~${result.maximumSeconds.toFixed(1)})  ` +
      `${JSON.stringify(result.categories)}`,
  );
}

function main(): void {
  console.log('=== 헤드리스 배틀 스모크 + ①단계 밸런스 측정 (링아웃 페널티 N8·N9) ===');
  console.log(`고정 스텝: ${Balance.FIXED_DELTA_SECONDS} 초 / 최대 ${MAXIMUM_STEPS} 스텝`);
  console.log(`시드 ${SEEDS.length}개 × 좌우 교대 2회 = 매치업당 ${SEEDS.length * 2} 판`);
  console.log(
    `N8 피격 페널티 계수 ${Balance.RING_OUT_PENALTY_COEFFICIENT} / 자폭 계수 ${Balance.SELF_RING_OUT_PENALTY_COEFFICIENT} / ` +
      `N9 리셋 프리즈 ${Balance.RING_OUT_RESET_FREEZE_SECONDS}s`,
  );
  console.log('');

  console.log('--- 검증 빌드 (세트·강화 0 고정) ---');
  (Object.keys(BUILDS) as BuildKey[]).forEach(printBuild);
  console.log(`  RING BREAKER 임계 넉백 ≥ ${Balance.KNOCKBACK_THRESHOLD_RING_BREAKER} / 강타 임계 접근속도 ${Balance.STRIKE_APPROACH_SPEED}`);
  console.log('');

  // 결정론 — 동일 시드 2회 실행 지문 일치
  let deterministicCount = 0;
  const detSeeds = SEEDS.slice(0, 8);
  for (const seed of detSeeds) {
    const first = runBattle(definitionOf('ringBreaker', 'A'), definitionOf('starter', 'B'), seed);
    const second = runBattle(definitionOf('ringBreaker', 'A'), definitionOf('starter', 'B'), seed);
    if (first.fingerprint === second.fingerprint) deterministicCount += 1;
  }
  console.log(`동일 시드 재현(링브레이커 vs 시작, 링아웃·리셋 다수 경로 포함): ${deterministicCount}/${detSeeds.length} 일치`);
  console.log('');

  // ①단계 매치업 — 시작vs시작 / RBvs시작 (160판). RB vs 어택·스태미나는 T7 감시용 참고.
  console.log('--- ①단계 매치업 집계 ---');
  const t1p = runMatchup('T1\' 시작 vs 시작', 'starter', 'starter');
  const t3p = runMatchup('T3\'/T3b RB vs 시작', 'ringBreaker', 'starter');
  const refRbAtk = runMatchup('(참고) RB vs 어택', 'ringBreaker', 'attack');
  const refRbSta = runMatchup('(참고) RB vs 스태미나', 'ringBreaker', 'stamina');
  const core = [t1p, t3p];
  const all = [t1p, t3p, refRbAtk, refRbSta];
  all.forEach(printMatchup);
  console.log('');

  // T4 — 자력 이탈 프로브
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
  console.log('  ※ T4 판정 범위는 "방향키만" 프로브다(PM 판정 2026-07-20). 버스트 이탈은 수용 항목.');
  console.log('');

  // 집계 — 핵심 지표
  const coreBattles = core.reduce((sum, r) => sum + r.battles, 0);
  const coreDraws = core.reduce((sum, r) => sum + r.draws, 0);
  const coreDrawRatio = coreDraws / coreBattles;
  const coreAvgSeconds =
    core.reduce((sum, r) => sum + r.averageSeconds * r.battles, 0) / coreBattles;
  const coreFirstCollision =
    core.reduce((sum, r) => sum + r.averageFirstCollisionSeconds * r.battles, 0) / coreBattles;

  // 결착 사유 분포(핵심 매치업)
  const dist: Record<string, number> = {};
  for (const r of core) {
    for (const [key, value] of Object.entries(r.categories)) {
      dist[key] = (dist[key] ?? 0) + value;
    }
  }

  console.log('--- ①단계 목표치 판정 (02_게임설계.md §2-6 개정판) ---');
  console.log(
    `  T1' 시작빌드 배틀당 링아웃 ${t1p.ringOutsPerBattle.toFixed(2)}회  목표 0.1~0.6  ${rangeVerdict(t1p.ringOutsPerBattle, 0.1, 0.6)}`,
  );
  console.log(
    `  T3' RB 배틀당 링아웃       ${t3p.ringOutsPerBattle.toFixed(2)}회  목표 2.0~4.5  ${rangeVerdict(t3p.ringOutsPerBattle, 2.0, 4.5)}`,
  );
  console.log(
    `  T3b RB 링아웃 피니시 비율  ${percent(t3p.ringOutFinishRatio)}  목표 ≥40%    ${t3p.ringOutFinishRatio >= 0.4 ? '목표구간 내' : '★ 목표구간 밖'}`,
  );
  console.log(
    `  T4 자력 링아웃(방향키만)   ${thrustOnlyEjects}건  목표 0건     ${thrustOnlyEjects === 0 ? '목표구간 내' : '★ 목표구간 밖'}`,
  );
  console.log(
    `  T5 무승부 비율(핵심)       ${percent(coreDrawRatio)}  목표 ≤5%     ${rangeVerdict(coreDrawRatio, 0, 0.05)}`,
  );
  console.log(
    `  T7 한 판 길이 평균(핵심)   ${coreAvgSeconds.toFixed(1)}s  목표 25~50s  ${rangeVerdict(coreAvgSeconds, 25, 50)}`,
  );
  console.log(
    `  T8 첫 충돌까지 평균(핵심)  ${coreFirstCollision.toFixed(2)}s  목표 ≤3s     ${rangeVerdict(coreFirstCollision, 0, 3)}`,
  );
  console.log(`  결착 사유 분포(핵심 160판): ${JSON.stringify(dist)}`);
  console.log('');

  // 1,280판 실시간 실측
  console.log('--- 1,280판 / 1회분 실시간 소요 실측 (디렉터 요구, §12-7) ---');
  measureWallClock(128); // 워밍업(JIT)
  const warm = measureWallClock(1280);
  console.log(
    `  1,280판 벽시계 ${warm.totalMs.toFixed(0)}ms (판당 ${warm.perBattleMs.toFixed(2)}ms). ` +
      `측정: Date.now() 감쌈, 대표 매치업 7종 순환(seed 고정)`,
  );
  console.log(
    `  ※ 위는 시뮬 순수 소요다. 실제 1회분은 여기에 vite --ssr 빌드(고정 오버헤드) + 결과 판독 시간이 더해진다.`,
  );
  console.log('');
  console.log('※ 위 수치는 관측값이다. 밸런스 채택 여부 판정은 사람(PM·디렉터)이 한다.');
}

main();
