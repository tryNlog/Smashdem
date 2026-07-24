/**
 * 봇 파워 추종 해결책 후보 측정 (§17-F-3 / §19) — game-ai-engineer.
 *
 * 문제(§18-2): 완성+강화 STRIKE 빌드가 4구간 봇(STARTER)마저 100% 압도 → 최종 봇 접전(§17-A) 붕괴.
 * 스킬-only 물리적 불충분은 확정됨(이론상 최강 봇도 100% 패, tools/botTiers.ts).
 *
 * 이 프로브는 **채택을 결정하지 않는다.** 후보별 측정값을 만들어 디렉터·PM 이 고르게 한다.
 *  - 후보 (a) 미러 봇: 봇 빌드를 플레이어 실제 런 빌드에 동적 대칭(run.mirrorBotAssignment).
 *  - 후보 (b) STARTER 강화-only: 봇에 강화만(파츠 STARTER). 반려 근거 수치화.
 *
 * 측정 잣대(각 후보):
 *  - T-RUN2: 완성+강화(STRIKE3/3 +3·+5) 접전 복원(파리티 ~50~65% 플레이어 승률).
 *  - T12: 무투자 계단 단조 유지 — 미러가 저투자 학살 안 하는지(무투자·부분투자 플레이어 vs 미러).
 *  - 완주율: 런 전체 구동(smoke:run 계열, PT-3 "쉽다" 감안 난이도 하향 금지 → 미러는 강한 빌드만 조인다).
 *
 * 실행: npm run smoke:mirror
 * ★ 출력은 관측값이다. 목표 구간 표시는 참고이며, 채택 판정은 사람(PM·디렉터)이 한다(§0 원칙).
 */

import * as Balance from '../src/game/balance';
import { botInput, botTuningForTier, type BotTuning } from '../src/game/bot';
import { createBattleState, definitionFromBuild } from '../src/game/battleState';
import {
  mirrorBotAssignment,
  mirrorBotBuild,
  MIRROR_FRACTION_BY_TIER,
  runBuildLevels,
  runBuildToBuild,
  starterRunBuild,
  type BotBuildAssignment,
  type RunBuild,
} from '../src/game/run';
import { applyReward, type RewardCard } from '../src/game/rewards';
import {
  buildFromIds,
  buildProfile,
  completedSet,
  STARTER_BUILD,
  type Build,
  type BuildOptions,
} from '../src/game/parts';
import { stepBattle } from '../src/game/simulation';
import type { InputCommand } from '../src/game/types';
import { createSession } from '../src/app/session';

const PLAYER_INDEX = 0;
const BOT_INDEX = 1;

/** 시드 40개 × 좌우 교대 = 매치업당 80판(기존 하네스와 동일 관례). */
const SEEDS: readonly number[] = Array.from({ length: 40 }, (_, index) => 1 + index * 7919);

const MAXIMUM_STEPS = Math.ceil(
  (Balance.ROUND_TIME_LIMIT_SECONDS + Balance.READY_DURATION_SECONDS + Balance.SETTLE_DURATION_SECONDS + 5) /
    Balance.FIXED_DELTA_SECONDS,
);

// ─────────────────────────────────────────────────────────────
// 실력 잣대 (botTiers.ts 와 정합, 전부 [UNSUPPORTED] 잠정 정의)
// ─────────────────────────────────────────────────────────────

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

/**
 * 미러 파리티 스킬 — 등가 빌드(f=1)에서 스킬 3구간(플레이어 76~82%)과 4구간(38~42%) 사이 간극을
 * 메우는 커스텀 튜닝. 조준·판단·버스트를 두 구간 중간에 둔다(스탯 뻥튀기 아님, 스킬 축).
 */
const MIRROR_PARITY_SKILL: BotTuning = {
  decisionIntervalSeconds: 0.13,
  aimErrorRadians: 0.18,
  throttle: 1,
  burstDistance: 195,
  burstProbability: 0.82,
};

/** 완성 STRIKE 3/3 빌드(어택축). §18 SET_BUILDS.STRIKE 와 동일. */
const STRIKE_BUILD: Build = buildFromIds('L02', 'D02', 'R02');

/** 런 컨텍스트 옵션(세트 ON·전 슬롯 동일 강화). systems-designer T-RUN 과 정합. */
function runOptions(level: number): BuildOptions {
  return { applySetBonus: true, context: 'run', levels: { layer: level, disk: level, driver: level } };
}

/** 빌드+동일 강화 레벨을 RunBuild 로 표현(미러 입력용). */
function runBuildAt(build: Build, level: number): RunBuild {
  return {
    layer: { part: build.layer, level },
    disk: { part: build.disk, level },
    driver: { part: build.driver, level },
  };
}

// ─────────────────────────────────────────────────────────────
// 공통 대결 — 플레이어(index 0, 빌드+옵션+튜닝) vs 봇(index 1, 빌드+옵션+튜닝), 좌우 교대 80판
// ─────────────────────────────────────────────────────────────

interface DuelResult {
  playerWinRate: number;
  averageSeconds: number;
}

function measure(
  playerBuild: Build,
  playerOptions: BuildOptions | undefined,
  playerTuning: BotTuning,
  botBuild: Build,
  botOptions: BuildOptions | undefined,
  botTuning: BotTuning,
): DuelResult {
  const playerDef = definitionFromBuild('P', playerBuild, playerOptions);
  const botDef = definitionFromBuild('B', botBuild, botOptions);
  let playerWins = 0;
  let totalSeconds = 0;
  let battles = 0;
  for (const seed of SEEDS) {
    for (const flip of [0, 1]) {
      // 좌우 교대: flip=1 이면 스폰 시드를 흔들어 선/후 스폰 편향 제거(botTiers 관례).
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
// 완주율 — 런 전체 구동. botBuildFor 훅으로 미러 봇 주입(생략 시 현행 STARTER 봇).
// ─────────────────────────────────────────────────────────────

type PickStrategy = 'naive' | 'competent';

function buildScore(build: RunBuild): number {
  const profile = buildProfile(runBuildToBuild(build), {
    levels: runBuildLevels(build),
    applySetBonus: true,
  });
  const s = profile.stats;
  return s.attack + s.weight + s.stamina + s.control;
}

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

type BotResolver = ((playerBuild: RunBuild, tier: number) => BotBuildAssignment) | undefined;

type TuningResolver = ((playerBuild: RunBuild, tier: number) => BotTuning) | undefined;

function driveRunCompletesFull(
  seed: number,
  playerTuning: BotTuning,
  strategy: PickStrategy,
  botBuildFor: BotResolver,
  botTuningFor: TuningResolver,
): boolean {
  const sessionOptions: {
    botBuildFor?: (playerBuild: RunBuild, tier: number) => BotBuildAssignment;
    botTuningFor?: (playerBuild: RunBuild, tier: number) => BotTuning;
  } = {};
  if (botBuildFor) sessionOptions.botBuildFor = botBuildFor;
  if (botTuningFor) sessionOptions.botTuningFor = botTuningFor;
  const session = createSession(() => seed, sessionOptions);
  let guard = 0;
  while (session.screen !== 'runResult' && guard < 100000) {
    guard += 1;
    if (session.screen === 'reward') {
      const index = pickCardIndex(session.run.build, session.rewards, strategy);
      session.activate(`reward:${index}`);
      continue;
    }
    for (let step = 0; step < MAXIMUM_STEPS; step += 1) {
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
  botBuildFor: BotResolver,
  botTuningFor: TuningResolver = undefined,
): number {
  let completed = 0;
  for (let index = 0; index < seedCount; index += 1) {
    const seed = 1 + index * 7919;
    if (driveRunCompletesFull(seed, playerTuning, strategy, botBuildFor, botTuningFor)) completed += 1;
  }
  return completed / seedCount;
}

/** 미러 봇 스킬 다이얼: 빌드는 미러, 스킬은 구간을 skillCap 으로 잘라 낮춘다(전역 — 저투자에도 적용). */
function cappedTuningResolver(skillCap: number): (playerBuild: RunBuild, tier: number) => BotTuning {
  return (_playerBuild, tier) => botTuningForTier(Math.min(tier, skillCap));
}

/**
 * 빌드 인지형 스킬 다이얼: 플레이어가 세트를 완성했을 때(미러가 봇 파워를 실제로 올릴 때)만
 * 스킬을 skillCap 으로 낮춘다. 미완성(저투자)이면 정상 구간 스킬 유지 → 저투자엔 난이도 하향 없음.
 * 이게 "미러가 켜진 판만 조정" — PT-3 난이도 하향 금지와 정합.
 */
function mirrorAwareTuning(skillCap: number): (playerBuild: RunBuild, tier: number) => BotTuning {
  return (playerBuild, tier) => {
    const mirrored = completedSet(runBuildToBuild(playerBuild)) !== null;
    return botTuningForTier(mirrored ? Math.min(tier, skillCap) : tier);
  };
}

/** 세트 완성 시 커스텀 파리티 스킬, 미완성이면 정상 구간 스킬. 미러 빌드와 짝지어 T-RUN2 파리티 후보. */
function mirrorParityTuning(playerBuild: RunBuild, tier: number): BotTuning {
  const mirrored = completedSet(runBuildToBuild(playerBuild)) !== null;
  return mirrored ? MIRROR_PARITY_SKILL : botTuningForTier(tier);
}

// ─────────────────────────────────────────────────────────────
// 출력
// ─────────────────────────────────────────────────────────────

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function inParity(rate: number): string {
  return rate >= 0.5 && rate <= 0.65 ? '파리티 내' : rate > 0.65 ? '플레이어 우세' : '봇 우세';
}

function main(): void {
  console.log('=== 봇 파워 추종 후보 측정 (§17-F-3 / §19) ===');
  console.log(`시드 ${SEEDS.length}개 × 좌우 교대 = 매치업당 ${SEEDS.length * 2}판`);
  console.log(`미러 구간 강도표 MIRROR_FRACTION_BY_TIER = [${MIRROR_FRACTION_BY_TIER.join(', ')}]`);
  console.log('');

  // ── 후보 (a) 미러: T-RUN2 파리티 복원 + 파워 반응 스윕 ──────────────────
  console.log('--- (a) 미러 봇: T-RUN2 파리티 스윕 (STRIKE3/3 +N vs 4구간봇, 봇=미러 fraction) ---');
  console.log('  플레이어 = STRIKE3/3 +N(숙련 0.18rad), 봇 = 같은 파츠·강화×fraction + 4구간 튜닝.');
  console.log('  fraction 0=현행(STARTER봇)…1=완전대칭. 플레이어 승률이 100%→파리티로 내려가면 파워 반응 성립.');
  const fractions = [0, 0.25, 0.5, 0.75, 1];
  for (const lv of [3, Balance.ENHANCE_LEVEL_CAP_RUN]) {
    const playerRun = runBuildAt(STRIKE_BUILD, lv);
    const cells = fractions.map((f) => {
      const bot = mirrorBotAssignment(playerRun, f);
      const r = measure(STRIKE_BUILD, runOptions(lv), SKILLED_PLAYER, bot.build, bot.options, botTuningForTier(4));
      return `f=${f} ${percent(r.playerWinRate)}`;
    });
    console.log(`  STRIKE3/3 +${lv}  ${cells.join('  ')}`);
  }
  console.log('  ※ 파리티(플레이어 50~65%) 드는 fraction 이 T-RUN2 복원점. 채택 fraction 은 디렉터 판정.');
  console.log('');

  // 스킬 다이얼: 빌드는 완전 미러(f=1, 대칭), 봇 스킬만 구간 튜닝으로 조절 → 파리티 미세 조정.
  // 빌드가 대칭이면 승부는 순수 스킬 결정. 스킬을 낮추면 플레이어 우세로, 높이면 봇 우세로 연속 이동.
  console.log('--- (a) 미러 봇: 빌드 완전대칭(f=1) × 봇 스킬 다이얼 (STRIKE3/3 +N vs 미러빌드봇) ---');
  console.log('  빌드는 플레이어와 동일(대칭). 봇 스킬만 1~4구간 튜닝. 스킬이 파리티 미세 조정 축.');
  for (const lv of [3, Balance.ENHANCE_LEVEL_CAP_RUN]) {
    const playerRun = runBuildAt(STRIKE_BUILD, lv);
    const bot = mirrorBotAssignment(playerRun, 1);
    const cells: string[] = [];
    for (let skillTier = 1; skillTier <= 4; skillTier += 1) {
      const r = measure(STRIKE_BUILD, runOptions(lv), SKILLED_PLAYER, bot.build, bot.options, botTuningForTier(skillTier));
      cells.push(`스킬${skillTier}구간 ${percent(r.playerWinRate)}`);
    }
    console.log(`  STRIKE3/3 +${lv}  ${cells.join('  ')}`);
  }
  console.log('  ※ 파리티(50~65%) 드는 스킬 구간이 미러 봇의 권장 스킬. 빌드=대칭이라 스탯 뻥튀기 아님.');
  console.log('');

  // 등가 빌드 + 커스텀 파리티 스킬(스킬 3·4구간 간극 보간).
  console.log('--- (a) 미러 봇: 빌드 완전대칭(f=1) + 커스텀 파리티 스킬 (스킬3·4구간 간극 보간) ---');
  for (const lv of [3, Balance.ENHANCE_LEVEL_CAP_RUN]) {
    const playerRun = runBuildAt(STRIKE_BUILD, lv);
    const bot = mirrorBotAssignment(playerRun, 1);
    const r = measure(STRIKE_BUILD, runOptions(lv), SKILLED_PLAYER, bot.build, bot.options, MIRROR_PARITY_SKILL);
    console.log(
      `  STRIKE3/3 +${lv}  vs 미러빌드+파리티스킬  플레이어승률 ${percent(r.playerWinRate)} (판 ${r.averageSeconds.toFixed(1)}s)  [${inParity(r.playerWinRate)}]`,
    );
  }
  console.log('  ※ 이 조합이 T-RUN2 파리티 후보. 채택·미세조정은 디렉터/L2 정밀 스윕.');
  console.log('');

  // ── 후보 (a) 저투자 미학살 확인 ──────────────────────────────────────
  console.log('--- (a) 미러 봇: 저투자 미학살 확인 (플레이어 투자도 vs 미러4구간봇) ---');
  console.log('  미러는 플레이어 빌드에서 파생 → 저투자면 봇도 약함. 학살(플레이어 승률 급락)이 없어야 한다.');
  const investLevels: Array<[string, RunBuild]> = [
    ['무투자(시작빌드)      ', starterRunBuild()],
    ['STRIKE3/3 +0(완성무강화)', runBuildAt(STRIKE_BUILD, 0)],
    ['STRIKE3/3 +3          ', runBuildAt(STRIKE_BUILD, 3)],
    ['STRIKE3/3 +5          ', runBuildAt(STRIKE_BUILD, 5)],
  ];
  for (const [label, playerRun] of investLevels) {
    const bot = mirrorBotBuild(playerRun, 4);
    const playerBuild = runBuildToBuild(playerRun);
    const playerOpt = runOptions(playerRun.layer.level); // 전 슬롯 동일 레벨 가정(측정 편의)
    const r = measure(playerBuild, playerOpt, SKILLED_PLAYER, bot.build, bot.options, botTuningForTier(4));
    console.log(`  ${label} vs 미러4구간봇  플레이어승률 ${percent(r.playerWinRate)}  [${inParity(r.playerWinRate)}]`);
  }
  console.log('  ※ 무투자 35% = 현행 4구간봇(STARTER) 난이도 그대로(미러 무효, 아래 T12 숙련 4구간과 동일값).');
  console.log('    미러가 저투자를 "더" 어렵게 만들지 않음 = 학살 없음. §16-4 반려안(고정 아키타입=1.3% 학살)과 구분.');
  console.log('');

  // ── 후보 (a) T12 단조 유지 (미러 배선 상태에서) ───────────────────────
  console.log('--- (a) 미러 봇: T12 단조 유지 (무투자 기준플레이어 vs 미러 구간봇) ---');
  console.log('  기준 플레이어 = 시작빌드. 미러는 저투자에 무효라 봇=STARTER 로 수렴 → §16 곡선과 일치해야 함.');
  const sticks: Array<[string, BotTuning]> = [
    ['중간(심사자)', MEDIUM_PLAYER],
    ['숙련', SKILLED_PLAYER],
    ['완벽(상한)', PERFECT_PLAYER],
  ];
  const refRun = starterRunBuild();
  for (const [name, tuning] of sticks) {
    const rates: number[] = [];
    for (let tier = 1; tier <= 4; tier += 1) {
      const bot = mirrorBotBuild(refRun, tier);
      const r = measure(STARTER_BUILD, undefined, tuning, bot.build, bot.options, botTuningForTier(tier));
      rates.push(r.playerWinRate);
    }
    const monotone = rates.every((r, i) => i === 0 || r <= rates[i - 1]);
    const line = rates.map((r, i) => `${i + 1}구간 ${percent(r)}`).join('  ');
    console.log(`  ${name.padEnd(12)} ${line}   단조감소 ${monotone ? '성립' : '★깨짐'}`);
  }
  console.log('');

  // ── 후보 (b) STARTER 강화-only ───────────────────────────────────────
  console.log('--- (b) STARTER 강화-only: 후반 봇에 강화만(파츠 STARTER) — 반려 근거 ---');
  console.log('  봇 = STARTER 파츠 + 강화 level(런 컨텍스트) + 4구간 튜닝. 세트 없음.');
  for (const lv of [3, Balance.ENHANCE_LEVEL_CAP_RUN]) {
    const cells = [1, 2, 3, 4, 5].map((botLv) => {
      const botOpt: BuildOptions = {
        applySetBonus: true,
        context: 'run',
        levels: { layer: botLv, disk: botLv, driver: botLv },
      };
      const r = measure(STRIKE_BUILD, runOptions(lv), SKILLED_PLAYER, STARTER_BUILD, botOpt, botTuningForTier(4));
      return `봇+${botLv} ${percent(r.playerWinRate)}`;
    });
    console.log(`  플레이어 STRIKE3/3 +${lv}  ${cells.join('  ')}`);
  }
  console.log('  ※ 최대 강화(+5)에서도 플레이어 승률이 파리티까지 안 내려가면 강화-only 불충분(반려 근거).');
  console.log('');

  // ── 완주율 (미러 OFF / 미러 빌드+4구간스킬 / 미러 빌드+스킬다이얼) ───────────
  console.log('--- 완주율 (런 전체 구동, 40 시드) — 미러 변형 비교. PT-3 난이도 하향 금지·목표 40~70% ---');
  console.log('  ★ 핵심 긴장: 후반 봇이 판당 파리티(≈50%)면 다판 관문 완주율은 0.5^n 로 급락한다.');
  console.log('  즉 T-RUN2(판당 접전)과 T13(완주율 40~70%)은 동시 달성이 구조적으로 어렵다(디렉터 판정).');
  const variants: Array<[string, BotResolver, TuningResolver]> = [
    ['OFF(현행)                 ', undefined, undefined],
    ['미러+4구간스킬             ', mirrorBotBuild, undefined],
    ['미러+전역스킬캡2구간        ', mirrorBotBuild, cappedTuningResolver(2)],
    ['미러+세트인지스킬캡2구간    ', mirrorBotBuild, mirrorAwareTuning(2)],
    ['미러+세트인지파리티스킬     ', mirrorBotBuild, mirrorParityTuning],
  ];
  for (const [label, bf, tf] of variants) {
    const naive = completionRate(MEDIUM_PLAYER, 'naive', 40, bf, tf);
    const comp = completionRate(MEDIUM_PLAYER, 'competent', 40, bf, tf);
    const skilled = completionRate(SKILLED_PLAYER, 'competent', 40, bf, tf);
    console.log(
      `  ${label} 순진픽 ${percent(naive)}  전투력픽(중간) ${percent(comp)}  전투력픽(숙련) ${percent(skilled)}`,
    );
  }
  console.log('  ※ 순진픽(저투자)은 미러가 조여도 붕괴하면 안 됨(저투자 학살 신호). 전투력픽이 목표대(40~70%)로.');
  console.log('');

  // ── 결정론 ───────────────────────────────────────────────────────────
  let det = 0;
  for (let index = 0; index < 8; index += 1) {
    const seed = 1 + index * 7919;
    const a = driveRunCompletesFull(seed, MEDIUM_PLAYER, 'competent', mirrorBotBuild, cappedTuningResolver(3));
    const b = driveRunCompletesFull(seed, MEDIUM_PLAYER, 'competent', mirrorBotBuild, cappedTuningResolver(3));
    if (a === b) det += 1;
  }
  console.log(`동일 시드 재현(미러 런 구동): ${det}/8 일치`);
  console.log('');
  console.log('※ 위는 관측값이다. 후보 채택·파리티 목표·기준 실력 정의 판정은 PM·디렉터 몫.');
}

main();
