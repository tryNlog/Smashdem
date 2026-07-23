/**
 * 난이도 4구간 봇 강도 측정 (N6 / T12·T13) — game-ai-engineer.
 *
 * 목적: 12판 런의 4구간 계단형 난이도가 실제로 "갈수록 어려워지는" 커브를 그리는지 헤드리스로 확인한다.
 *  - T12: 구간별 봇 vs 기준빌드. 고정 실력·고정 빌드의 "기준 플레이어"가 각 구간 봇을 상대할 때의
 *         승률이 1구간→4구간으로 단조 감소하는가(§12-3 / §8 T12). 매치업당 80판(시드 40×좌우).
 *  - T13: 12판 완주율. 기준 플레이어가 런을 처음부터 끝까지 구동해 완주(phase 'won')하는 비율(40~70% 목표, T13).
 *
 * 실행: npm run smoke:tiers
 * 주의: 출력은 관측값이다. 목표 구간 판정 표시는 참고이며, 채택 판정은 사람(PM·디렉터)이 한다(§0 원칙).
 *
 * ★ 기준 플레이어 실력은 설계 문서에 수치가 없다(T13 "중간 난이도 조작 가정"은 정성 기술).
 *   아래 REFERENCE_PLAYER 는 game-ai-engineer 가 정한 잠정 정의이며 `[UNSUPPORTED]` 다.
 *   PERFECT_PLAYER(조준오차 0)도 병기해 상·하한을 함께 본다.
 */

import * as Balance from '../src/game/balance';
import { botInput, botTuningForTier, type BotTuning } from '../src/game/bot';
import { createBattleState, definitionFromBuild } from '../src/game/battleState';
import { botBuildForTier } from '../src/game/run';
import { STARTER_BUILD, type Build } from '../src/game/parts';
import { stepBattle } from '../src/game/simulation';
import type { InputCommand } from '../src/game/types';
import { createSession } from '../src/app/session';

const PLAYER_INDEX = 0;
const BOT_INDEX = 1;

/** 시드 고정 40개 × 좌우 교대 2회 = 매치업당 80판(기존 하네스와 동일 관례). */
const SEEDS: readonly number[] = Array.from({ length: 40 }, (_, index) => 1 + index * 7919);

const MAXIMUM_STEPS = Math.ceil(
  (Balance.ROUND_TIME_LIMIT_SECONDS + Balance.READY_DURATION_SECONDS + Balance.SETTLE_DURATION_SECONDS + 5) /
    Balance.FIXED_DELTA_SECONDS,
);

/**
 * 기준 플레이어(중간 난이도 조작 가정) — `[UNSUPPORTED]` 잠정 정의.
 * 사람은 스틱을 끝까지 밀고(throttle 1) 거의 매 프레임 판단하지만, 조준·타이밍에 오차가 있다.
 * 조준 오차 0.18rad(≈10°)·버스트는 근~중거리에서 자주. 4구간 봇(오차 0.15)보다 약간 무딘 조준이다.
 */
const REFERENCE_PLAYER: BotTuning = {
  decisionIntervalSeconds: 0.1,
  aimErrorRadians: 0.18,
  throttle: 1,
  burstDistance: 160,
  burstProbability: 0.6,
};

/** 상한 대조군 — 거의 완벽한 플레이어(조준 오차 0). runFlow 와 동일. */
const PERFECT_PLAYER: BotTuning = {
  decisionIntervalSeconds: Balance.FIXED_DELTA_SECONDS,
  aimErrorRadians: 0,
  throttle: 1,
  burstDistance: 400,
  burstProbability: 1,
};

// ─────────────────────────────────────────────────────────────
// T12 — 한 판: index 0 = 플레이어(고정 실력·빌드), index 1 = 구간 봇
// ─────────────────────────────────────────────────────────────

/** @returns 플레이어(index 0)가 이겼으면 true. 무승부는 false(플레이어 미승). */
function runDuel(
  playerTuning: BotTuning,
  playerBuild: Build,
  botTuning: BotTuning,
  botBuild: Build,
  seed: number,
): boolean {
  const state = createBattleState(
    [definitionFromBuild('P', playerBuild), definitionFromBuild('B', botBuild)],
    seed,
  );
  const inputs: InputCommand[] = [];
  for (let step = 0; step < MAXIMUM_STEPS; step += 1) {
    inputs[PLAYER_INDEX] = botInput(state, PLAYER_INDEX, playerTuning);
    inputs[BOT_INDEX] = botInput(state, BOT_INDEX, botTuning);
    stepBattle(state, inputs, Balance.FIXED_DELTA_SECONDS);
    if (state.phase === 'finished') break;
  }
  return state.winnerIndex === PLAYER_INDEX;
}

interface TierResult {
  tier: number;
  battles: number;
  playerWins: number;
  playerWinRate: number;
}

/** 한 구간에 대한 플레이어 승률(좌우 교대로 스폰 편향 제거). */
function measureTier(tier: number, playerTuning: BotTuning): TierResult {
  const botTuning = botTuningForTier(tier);
  const botBuild = botBuildForTier(tier);
  let playerWins = 0;
  let battles = 0;
  for (const seed of SEEDS) {
    for (const playerFirst of [true, false]) {
      // 좌우 교대: playerFirst=false 면 봇을 index 0 자리에 두고 승자 인덱스를 뒤집어 해석.
      const playerWon = playerFirst
        ? runDuel(playerTuning, STARTER_BUILD, botTuning, botBuild, seed)
        : !runDuelBotFirst(playerTuning, botTuning, botBuild, seed);
      if (playerWon) playerWins += 1;
      battles += 1;
    }
  }
  return { tier, battles, playerWins, playerWinRate: playerWins / battles };
}

/** 봇이 index 0(선스폰) 인 판. @returns 봇(index 0)이 이겼으면 true. */
function runDuelBotFirst(
  playerTuning: BotTuning,
  botTuning: BotTuning,
  botBuild: Build,
  seed: number,
): boolean {
  const state = createBattleState(
    [definitionFromBuild('B', botBuild), definitionFromBuild('P', STARTER_BUILD)],
    seed,
  );
  const inputs: InputCommand[] = [];
  for (let step = 0; step < MAXIMUM_STEPS; step += 1) {
    inputs[0] = botInput(state, 0, botTuning);
    inputs[1] = botInput(state, 1, playerTuning);
    stepBattle(state, inputs, Balance.FIXED_DELTA_SECONDS);
    if (state.phase === 'finished') break;
  }
  return state.winnerIndex === 0;
}

// ─────────────────────────────────────────────────────────────
// T13 — 세션 전체 구동 완주율
// ─────────────────────────────────────────────────────────────

const MAX_STEPS_PER_BATTLE = MAXIMUM_STEPS;

/** 한 런을 완주/패배까지 구동한다. @returns 완주(phase 'won') 여부. */
function driveRunCompletes(seed: number, playerTuning: BotTuning): boolean {
  const session = createSession(() => seed);
  let guard = 0;
  while (session.screen !== 'runResult' && guard < 100000) {
    guard += 1;
    if (session.screen === 'reward') {
      session.activate('reward:0'); // 첫 카드 선택(runFlow 관례, 결정론). 순진한 픽 = 완주율 하한.
      continue;
    }
    for (let step = 0; step < MAX_STEPS_PER_BATTLE; step += 1) {
      const input = botInput(session.battle, PLAYER_INDEX, playerTuning);
      session.step(input, Balance.FIXED_DELTA_SECONDS);
      if (session.screen !== 'battle') break;
    }
  }
  return session.run.phase === 'won';
}

function completionRate(playerTuning: BotTuning, seedCount: number): { completed: number; total: number } {
  let completed = 0;
  for (let index = 0; index < seedCount; index += 1) {
    const seed = 1 + index * 7919;
    if (driveRunCompletes(seed, playerTuning)) completed += 1;
  }
  return { completed, total: seedCount };
}

// ─────────────────────────────────────────────────────────────
// 출력
// ─────────────────────────────────────────────────────────────

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function main(): void {
  console.log('=== 난이도 4구간 봇 강도 측정 (N6 / T12·T13) ===');
  console.log(`시드 ${SEEDS.length}개 × 좌우 교대 = 매치업당 ${SEEDS.length * 2}판`);
  console.log('');

  console.log('--- 4구간 봇 튜닝 (BOT_TIER_TUNINGS) + 구간별 봇 빌드 ---');
  for (let tier = 1; tier <= 4; tier += 1) {
    const t = botTuningForTier(tier);
    const b = botBuildForTier(tier);
    const ids = `${b.layer.id}/${b.disk.id}/${b.driver.id}`;
    console.log(
      `  ${tier}구간  판단 ${t.decisionIntervalSeconds}s / 조준오차 ${t.aimErrorRadians}rad / 스로틀 ${t.throttle} / ` +
        `버스트거리 ${t.burstDistance} · 확률 ${t.burstProbability}  | 빌드 ${ids}`,
    );
  }
  console.log('');

  console.log('--- T12 구간별 봇 vs 기준빌드 (기준 플레이어 승률, 단조 감소 확인) ---');
  console.log('  기준 플레이어[UNSUPPORTED 잠정]: 조준오차 0.18rad / 판단 0.1s / 스로틀 1 / 버스트 0.6');
  const refResults: TierResult[] = [];
  for (let tier = 1; tier <= 4; tier += 1) {
    const r = measureTier(tier, REFERENCE_PLAYER);
    refResults.push(r);
    console.log(`  ${tier}구간  기준 플레이어 승률 ${percent(r.playerWinRate)}  (${r.playerWins}/${r.battles})`);
  }
  const monotone = refResults.every(
    (r, i) => i === 0 || r.playerWinRate <= refResults[i - 1].playerWinRate,
  );
  console.log(`  → 단조 감소(1→4구간): ${monotone ? '성립' : '★ 깨짐'}`);
  console.log('');

  console.log('--- T12 (상한 대조: 거의 완벽한 플레이어) ---');
  const perfResults: TierResult[] = [];
  for (let tier = 1; tier <= 4; tier += 1) {
    const r = measureTier(tier, PERFECT_PLAYER);
    perfResults.push(r);
    console.log(`  ${tier}구간  완벽 플레이어 승률 ${percent(r.playerWinRate)}  (${r.playerWins}/${r.battles})`);
  }
  const monotonePerf = perfResults.every(
    (r, i) => i === 0 || r.playerWinRate <= perfResults[i - 1].playerWinRate,
  );
  console.log(`  → 단조 감소(1→4구간): ${monotonePerf ? '성립' : '★ 깨짐'}`);
  console.log('');

  console.log('--- T13 12판 완주율 (런 전체 구동, 40 시드, 첫 카드 픽=하한) ---');
  const refRun = completionRate(REFERENCE_PLAYER, 40);
  const perfRun = completionRate(PERFECT_PLAYER, 40);
  console.log(
    `  기준 플레이어 완주 ${refRun.completed}/${refRun.total} = ${percent(refRun.completed / refRun.total)}  목표 40~70%`,
  );
  console.log(`  완벽 플레이어 완주 ${perfRun.completed}/${perfRun.total} = ${percent(perfRun.completed / perfRun.total)}  (상한)`);
  console.log('');

  // 결정론 — 같은 시드 두 번 구동 → 동일 완주 결과.
  let det = 0;
  for (let index = 0; index < 8; index += 1) {
    const seed = 1 + index * 7919;
    const a = driveRunCompletes(seed, REFERENCE_PLAYER);
    const b = driveRunCompletes(seed, REFERENCE_PLAYER);
    if (a === b) det += 1;
  }
  console.log(`동일 시드 재현(런 구동): ${det}/8 일치`);
  console.log('');
  console.log('※ 위는 관측값이다. 완주율 목표·기준 실력 정의 판정은 PM·디렉터 몫.');
}

main();
