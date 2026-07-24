/**
 * 3택1 리롤 결정론 헤드리스 검증 (§17-D / 18-5, gameplay-programmer 배선).
 *
 * 목적: 리롤(런당 RUN_REROLL_COUNT 회)이 시드 PRNG 로만 흐르는지 = 같은 시드·같은 리롤 시퀀스면
 *   같은 3택이 나오는지 확인한다. 리롤은 run.random 만 소비하므로 S3 리플레이·네트워크에서 재현 가능해야 한다.
 *
 * 실행: npm run smoke:reroll
 * 주의: 관측값이다. 밸런스·완주율 판정이 아니라 리롤 배선의 결정론·카운터 동작 확인용(§0 — 판정은 PM·QA).
 */

import * as Balance from '../src/game/balance';
import { botInput, type BotTuning } from '../src/game/bot';
import { createRandomState } from '../src/engine/random';
import { generateRewards, type RewardCard } from '../src/game/rewards';
import { consumeReroll, createRun } from '../src/game/run';
import { createSession } from '../src/app/session';

/** 카드 3장을 비교 가능한 문자열로. */
function cardsKey(cards: readonly RewardCard[]): string {
  return cards.map((card) => `${card.part.id}:${card.kind}:${card.resultLevel}`).join(' | ');
}

/**
 * 한 시드에서 "초기 3택 + 리롤 시퀀스 전체"를 순수 레이어(run + rewards)로 재현한다.
 * 리롤은 run.random 을 전진시키므로 매 재추첨은 이전과 다른 표를 낸다(같은 시드면 항상 같은 순서).
 */
function drawSequence(seed: number): { keys: string[]; rerollsLeftTrail: number[]; consumedAfterZero: boolean } {
  const run = createRun(createRandomState(seed));
  const keys: string[] = [cardsKey(generateRewards(run.build, run.random))]; // 초기 3택
  const rerollsLeftTrail: number[] = [run.rerollsRemaining];

  // 남은 리롤을 전부 소진하며 매번 재추첨.
  while (consumeReroll(run)) {
    keys.push(cardsKey(generateRewards(run.build, run.random)));
    rerollsLeftTrail.push(run.rerollsRemaining);
  }
  // 소진 후 한 번 더 시도 → false 여야 함(0 에서 비활성).
  const consumedAfterZero = consumeReroll(run);
  return { keys, rerollsLeftTrail, consumedAfterZero };
}

/** 강한 스크립트 플레이어(runFlow 와 동일 성향) — 세션 통합 재현용. */
const PERFECT_PLAYER: BotTuning = {
  decisionIntervalSeconds: Balance.FIXED_DELTA_SECONDS,
  aimErrorRadians: 0,
  throttle: 1,
  burstDistance: 400,
  burstProbability: 1,
};

const MAX_STEPS_PER_BATTLE = Math.ceil(
  (Balance.ROUND_TIME_LIMIT_SECONDS + Balance.READY_DURATION_SECONDS + Balance.SETTLE_DURATION_SECONDS + 5) /
    Balance.FIXED_DELTA_SECONDS,
);

/**
 * 세션을 구동하되 첫 보상 화면에서 rerollEachFirstReward 회 리롤한 뒤 0번 카드를 고른다.
 * 같은 시드·같은 리롤 시퀀스면 최종 런 결과가 동일해야 한다(리롤이 PRNG 상태에 결정론적으로 반영).
 */
function driveWithReroll(seed: number, rerollOnFirstReward: number): string {
  const session = createSession(() => seed);
  let firstRewardHandled = false;
  let guard = 0;

  while (session.screen !== 'runResult' && guard < 100000) {
    guard += 1;
    if (session.screen === 'reward') {
      if (!firstRewardHandled) {
        for (let i = 0; i < rerollOnFirstReward; i += 1) session.activate('reward:reroll');
        firstRewardHandled = true;
      }
      session.activate('reward:0');
      continue;
    }
    for (let step = 0; step < MAX_STEPS_PER_BATTLE; step += 1) {
      const input = botInput(session.battle, 0, PERFECT_PLAYER);
      session.step(input, Balance.FIXED_DELTA_SECONDS);
      if (session.screen !== 'battle') break;
    }
  }

  const build = session.run.build;
  return JSON.stringify({
    phase: session.run.phase,
    reachedBattle: session.run.battleNumber,
    wins: session.run.wins,
    rerollsRemaining: session.run.rerollsRemaining,
    layer: `${build.layer.part.id}+${build.layer.level}`,
    disk: `${build.disk.part.id}+${build.disk.level}`,
    driver: `${build.driver.part.id}+${build.driver.level}`,
  });
}

function main(): void {
  console.log('=== 3택1 리롤 결정론 검증 (§17-D) ===');
  console.log(`런당 리롤 허용(RUN_REROLL_COUNT): ${Balance.RUN_REROLL_COUNT}`);
  console.log('');

  const seeds = Array.from({ length: 8 }, (_, index) => 1 + index * 7919);

  // 1) 순수 레이어 결정론 — 같은 시드 두 번 → 초기 3택 + 리롤 시퀀스 전부 동일.
  let seqDeterministic = 0;
  let counterOk = 0;
  let disabledAtZeroOk = 0;
  let rerollChangedDraw = 0;
  for (const seed of seeds) {
    const a = drawSequence(seed);
    const b = drawSequence(seed);
    if (JSON.stringify(a) === JSON.stringify(b)) seqDeterministic += 1;

    // 카운터: [초기2, 리롤후1, 리롤후0] = RUN_REROLL_COUNT+1 개 항, 마지막이 0.
    const expectedTrail = Array.from({ length: Balance.RUN_REROLL_COUNT + 1 }, (_, i) => Balance.RUN_REROLL_COUNT - i);
    if (JSON.stringify(a.rerollsLeftTrail) === JSON.stringify(expectedTrail)) counterOk += 1;
    if (!a.consumedAfterZero) disabledAtZeroOk += 1;

    // 리롤이 실제로 표를 바꾸는가(초기 3택 vs 첫 리롤 결과). 우연 일치 가능성은 낮으나 관측만.
    if (a.keys.length >= 2 && a.keys[0] !== a.keys[1]) rerollChangedDraw += 1;
  }
  console.log(`순수 레이어 재현(초기+리롤 시퀀스 동일 시드 2회): ${seqDeterministic}/${seeds.length} 일치`);
  console.log(`리롤 카운터 감소열 ${'['}${Balance.RUN_REROLL_COUNT}..0${']'} 정확: ${counterOk}/${seeds.length}`);
  console.log(`0 에서 리롤 비활성(consumeReroll=false): ${disabledAtZeroOk}/${seeds.length}`);
  console.log(`리롤이 3택을 바꿈(초기≠1차리롤, 관측): ${rerollChangedDraw}/${seeds.length}`);
  console.log('');

  // 표본 1건 — 시드 1 의 초기 3택과 리롤 결과를 눈으로.
  const sample = drawSequence(seeds[0]);
  console.log(`--- 시드 ${seeds[0]} 리롤 시퀀스 표본 ---`);
  sample.keys.forEach((key, index) => {
    const label = index === 0 ? '초기 3택' : `리롤 ${index}`;
    console.log(`  ${label} (남은 ${sample.rerollsLeftTrail[index]}): ${key}`);
  });
  console.log('');

  // 2) 세션 통합 결정론 — 같은 시드·같은 리롤 횟수 → 최종 런 결과 동일.
  let integDeterministic = 0;
  let rerollAltersOutcome = 0;
  for (const seed of seeds) {
    const a0 = driveWithReroll(seed, 0);
    const a0b = driveWithReroll(seed, 0);
    const a2 = driveWithReroll(seed, 2);
    const a2b = driveWithReroll(seed, 2);
    if (a0 === a0b && a2 === a2b) integDeterministic += 1;
    // 리롤은 PRNG 를 전진시키므로 이후 판 시드·드랍이 달라진다(리롤 미사용과 최종 결과가 갈릴 수 있음) — 관측만.
    if (a0 !== a2) rerollAltersOutcome += 1;
  }
  console.log(`세션 통합 재현(같은 시드·같은 리롤 횟수 2회 구동 동일): ${integDeterministic}/${seeds.length} 일치`);
  console.log(`리롤 유무가 최종 런 상태를 가름(0회 vs 2회, 관측): ${rerollAltersOutcome}/${seeds.length}`);
  console.log('');
  console.log('※ 위는 리롤 배선의 결정론·카운터 기능 관측이다. 리롤 N·완주율 영향 판정은 PM·디렉터 몫.');
}

main();
