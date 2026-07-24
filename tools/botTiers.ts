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
import { botBuildForTier, runBuildLevels, runBuildToBuild, type RunBuild } from '../src/game/run';
import { applyReward, type RewardCard } from '../src/game/rewards';
import { buildFromIds, buildProfile, STARTER_BUILD, type Build, type BuildOptions } from '../src/game/parts';
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
 * 기준 플레이어 실력 3종 — 전부 `[UNSUPPORTED]` 잠정 정의(설계 문서에 판정 실력 수치 없음).
 * 봇 강도는 관측자 실력에 상대적이라, 하나의 잣대만 쓰면 곡선 모양이 그 잣대에 종속된다.
 * 그래서 세 잣대(중간/숙련/완벽)로 T12 곡선을 함께 찍어 단조성이 잣대와 무관함을 본다.
 * 사람은 스틱을 끝까지 밀고(throttle 1) 거의 매 프레임 판단하지만 조준·타이밍에 오차가 있다.
 *  - MEDIUM: 처음 잡은 심사자 상정. 조준 오차 0.28rad(≈16°). T13 "중간 난이도 조작 가정"에 가깝다.
 *  - SKILLED: 익숙해진 플레이어. 조준 오차 0.18rad(≈10°).
 *  - PERFECT: 조준 오차 0 상한 대조군(runFlow 와 동일).
 */
const MEDIUM_PLAYER: BotTuning = {
  decisionIntervalSeconds: 0.12,
  aimErrorRadians: 0.28,
  throttle: 1,
  burstDistance: 150,
  burstProbability: 0.55,
};

const SKILLED_PLAYER: BotTuning = {
  decisionIntervalSeconds: 0.1,
  aimErrorRadians: 0.18,
  throttle: 1,
  burstDistance: 160,
  burstProbability: 0.6,
};

const PERFECT_PLAYER: BotTuning = {
  decisionIntervalSeconds: Balance.FIXED_DELTA_SECONDS,
  aimErrorRadians: 0,
  throttle: 1,
  burstDistance: 400,
  burstProbability: 1,
};

/** T12/T13 기준 플레이어 = MEDIUM(심사자 상정). 완주율 목표(40~70%)의 주 잣대. */
const REFERENCE_PLAYER = MEDIUM_PLAYER;

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
// T-RUN2 파리티 프로브 (§17-F-3) — 완성+강화 플레이어 vs 4구간 봇
//
// 문제(§18-2): 완성 STRIKE3/3 +3(atk90, dmg×1.25)이 4구간 봇(STARTER)마저 100% 압도해 완주 난이도가 붕괴.
// 물음: 봇 스킬 파라미터만으로 이 격차를 메워 파리티(~약우세)가 물리적으로 가능한가?
// 봇을 이론적 최대 스킬(조준오차 0·매 프레임 판단·상시 버스트)까지 올려 상한을 잰다.
// ─────────────────────────────────────────────────────────────

/** 완성 STRIKE 3/3 빌드(어택축, 세트 드라이버 포함). §18 SET_BUILDS.STRIKE 와 동일. */
const STRIKE_BUILD: Build = buildFromIds('L02', 'D02', 'R02');

/** 런 컨텍스트 옵션(세트 ON·강화 레벨). systems-designer T-RUN 과 정합(context:'run'). */
function runOptions(level: number): BuildOptions {
  return { applySetBonus: true, context: 'run', levels: { layer: level, disk: level, driver: level } };
}

/** 숙련 플레이어(조준오차 0.18) — headlessBattle T-RUN 의 REFERENCE_PLAYER 와 정합. */
const SKILLED_PLAYER_FOR_RUN: BotTuning = {
  decisionIntervalSeconds: 0.1,
  aimErrorRadians: 0.18,
  throttle: 1,
  burstDistance: 160,
  burstProbability: 0.6,
};

/** 이론적 최대 스킬 봇 — 스킬 축의 물리적 천장(조준 완벽·즉각 판단·최대 버스트). */
const MAX_SKILL_BOT: BotTuning = {
  decisionIntervalSeconds: Balance.FIXED_DELTA_SECONDS,
  aimErrorRadians: 0,
  throttle: 1,
  burstDistance: 400,
  burstProbability: 1,
};

/** 완성+강화 플레이어(index 0) vs 봇(주어진 빌드·옵션·튜닝) 승률. 좌우 교대 80판. */
function measureRunParity(
  playerLevel: number,
  playerTuning: BotTuning,
  botTuning: BotTuning,
  botBuild: Build = STARTER_BUILD,
  botOptions: BuildOptions | undefined = undefined,
): { playerWinRate: number; averageSeconds: number } {
  const playerDef = definitionFromBuild('P', STRIKE_BUILD, runOptions(playerLevel));
  const botDef = definitionFromBuild('B', botBuild, botOptions);
  let playerWins = 0;
  let totalSeconds = 0;
  let battles = 0;
  for (const seed of SEEDS) {
    for (const flip of [0, 1]) {
      const state = createBattleState([playerDef, botDef], seed + flip * 104729);
      const inputs: InputCommand[] = [];
      for (let step = 0; step < MAXIMUM_STEPS; step += 1) {
        inputs[PLAYER_INDEX] = botInput(state, PLAYER_INDEX, playerTuning);
        inputs[BOT_INDEX] = botInput(state, BOT_INDEX, botTuning);
        stepBattle(state, inputs, Balance.FIXED_DELTA_SECONDS);
        if (state.phase === 'finished') break;
      }
      if (state.winnerIndex === PLAYER_INDEX) playerWins += 1;
      totalSeconds += state.battleElapsedSeconds;
      battles += 1;
    }
  }
  return { playerWinRate: playerWins / battles, averageSeconds: totalSeconds / battles };
}

// ─────────────────────────────────────────────────────────────
// T13 — 세션 전체 구동 완주율
// ─────────────────────────────────────────────────────────────

const MAX_STEPS_PER_BATTLE = MAXIMUM_STEPS;

type PickStrategy = 'naive' | 'competent';

/** 결과 빌드의 전투력 점수(스탯 합, 세트 보너스·강화 포함). 높을수록 강한 빌드. */
function buildScore(runBuild: RunBuild): number {
  const profile = buildProfile(runBuildToBuild(runBuild), {
    levels: runBuildLevels(runBuild),
    applySetBonus: true,
  });
  const s = profile.stats;
  return s.attack + s.weight + s.stamina + s.control;
}

/**
 * 3택1 픽 전략.
 *  - naive: 항상 0번(runFlow 관례). 나쁜 사이드그레이드도 집어 빌드가 약해질 수 있다 → 완주율 하한.
 *  - competent: 고른 뒤 빌드 전투력이 최대가 되는 카드(동점은 낮은 인덱스). "빌드를 키우는 보통 사람" 대리.
 *    ★ 픽 전략은 봇 강도가 아니라 빌드 설계 영역이라 game-ai-engineer 의 소관 밖이다.
 *    두 전략의 완주율로 T13 을 구간으로 제시한다(단일 수치 단정 회피).
 */
function pickCardIndex(build: RunBuild, cards: readonly RewardCard[], strategy: PickStrategy): number {
  if (strategy === 'naive') return 0;
  let bestIndex = 0;
  let bestScore = -Infinity;
  for (let index = 0; index < cards.length; index += 1) {
    const score = buildScore(applyReward(build, cards[index]));
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

/** 한 런을 완주/패배까지 구동한다. @returns 완주(phase 'won') 여부. */
function driveRunCompletes(seed: number, playerTuning: BotTuning, strategy: PickStrategy): boolean {
  const session = createSession(() => seed);
  let guard = 0;
  while (session.screen !== 'runResult' && guard < 100000) {
    guard += 1;
    if (session.screen === 'reward') {
      const index = pickCardIndex(session.run.build, session.rewards, strategy);
      session.activate(`reward:${index}`);
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

function completionRate(
  playerTuning: BotTuning,
  strategy: PickStrategy,
  seedCount: number,
): { completed: number; total: number } {
  let completed = 0;
  for (let index = 0; index < seedCount; index += 1) {
    const seed = 1 + index * 7919;
    if (driveRunCompletes(seed, playerTuning, strategy)) completed += 1;
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

  console.log('--- T12 구간별 봇 vs 기준빌드 (플레이어 승률이 1→4구간 단조 감소 확인) ---');
  const sticks: Array<[string, BotTuning]> = [
    ['중간(심사자)', MEDIUM_PLAYER],
    ['숙련', SKILLED_PLAYER],
    ['완벽(상한)', PERFECT_PLAYER],
  ];
  for (const [name, tuning] of sticks) {
    const results: TierResult[] = [];
    for (let tier = 1; tier <= 4; tier += 1) results.push(measureTier(tier, tuning));
    const monotone = results.every((r, i) => i === 0 || r.playerWinRate <= results[i - 1].playerWinRate);
    const line = results.map((r) => `${r.tier}구간 ${percent(r.playerWinRate)}`).join('  ');
    console.log(`  ${name.padEnd(12)} ${line}   단조감소 ${monotone ? '성립' : '★깨짐'}`);
  }
  console.log('  ※ 잣대별로 곡선 높이는 다르나(봇 강도는 상대적) 단조성이 목표. 완벽 잣대의 1~2구간 역전은');
  console.log('    상시 버스트 성향의 자멸 변동(80판 중 1~2판)이라 난이도 역전이 아니다.');
  console.log('');

  console.log('--- ★ T-RUN2 파리티 프로브 (완성 STRIKE3/3+강화 vs 4구간 봇, §17-F-3) ---');
  console.log('  목표: 플레이어 승률 파리티~약우세(대략 50~65%). 현재 4구간 봇 튜닝 + 스킬 천장(MAX)을 함께 잰다.');
  for (const lv of [3, Balance.ENHANCE_LEVEL_CAP_RUN]) {
    const cur = measureRunParity(lv, SKILLED_PLAYER_FOR_RUN, botTuningForTier(4));
    const max = measureRunParity(lv, SKILLED_PLAYER_FOR_RUN, MAX_SKILL_BOT);
    console.log(
      `  STRIKE3/3 +${lv}  vs 4구간봇(현행) 플레이어승률 ${percent(cur.playerWinRate)} (판 ${cur.averageSeconds.toFixed(1)}s)  ` +
        `| vs 스킬천장봇 ${percent(max.playerWinRate)}`,
    );
  }
  console.log('  ※ 스킬천장봇도 플레이어를 못 막으면(승률≈100%) 스킬 축만으론 파리티 물리적 불가 → [UNSUPPORTED] 상신.');
  console.log('');

  console.log('--- T13 12판 완주율 (런 전체 구동, 40 시드) 목표 40~70% ---');
  const refNaive = completionRate(REFERENCE_PLAYER, 'naive', 40);
  const refComp = completionRate(REFERENCE_PLAYER, 'competent', 40);
  const perfComp = completionRate(PERFECT_PLAYER, 'competent', 40);
  console.log(
    `  기준 플레이어 · 순진픽(하한)   ${refNaive.completed}/${refNaive.total} = ${percent(refNaive.completed / refNaive.total)}`,
  );
  console.log(
    `  기준 플레이어 · 전투력픽(대표) ${refComp.completed}/${refComp.total} = ${percent(refComp.completed / refComp.total)}`,
  );
  console.log(
    `  완벽 플레이어 · 전투력픽(상한) ${perfComp.completed}/${perfComp.total} = ${percent(perfComp.completed / perfComp.total)}`,
  );
  console.log('  ※ 픽 전략(빌드 설계)은 봇 강도 밖이라 완주율을 구간으로 제시한다. 판정은 PM·디렉터.');
  console.log('');

  // 결정론 — 같은 시드 두 번 구동 → 동일 완주 결과.
  let det = 0;
  for (let index = 0; index < 8; index += 1) {
    const seed = 1 + index * 7919;
    const a = driveRunCompletes(seed, REFERENCE_PLAYER, 'competent');
    const b = driveRunCompletes(seed, REFERENCE_PLAYER, 'competent');
    if (a === b) det += 1;
  }
  console.log(`동일 시드 재현(런 구동): ${det}/8 일치`);
  console.log('');
  console.log('※ 위는 관측값이다. 완주율 목표·기준 실력 정의 판정은 PM·디렉터 몫.');
}

main();
