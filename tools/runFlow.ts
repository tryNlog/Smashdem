/**
 * 12판 런 흐름 헤드리스 검증 (S2 런 통합).
 *
 * 목적: 브라우저 없이 세션 상태머신 전체를 구동해 "런이 끝까지 도는가 + 결정론적인가"를 확인한다.
 *  - 강한 스크립트 플레이어(조준 오차 0)로 각 판을 치고, 승리 시 3택1 0번 카드를 자동 선택.
 *  - 12판 완주(phase 'won') 도달 가능성, 전 시드 종료 보장, 동일 시드 재현을 관측한다.
 *  - 보상 드랍의 축 다양성(§3-4)·중복 강화 흡수(R13)를 표본 점검한다.
 *
 * 실행: npm run smoke:run
 * 주의: 관측값이다. 밸런스 판정이 아니라 런 배선의 기능 확인용이다(§0 원칙 — 판정은 PM·QA).
 * localStorage 는 Node 에 없다 → hangar.ts 의 try/catch 로 빈 격납고로 진행된다(저장 경로는 no-op).
 */

import * as Balance from '../src/game/balance';
import { botInput, type BotTuning } from '../src/game/bot';
import { createRandomState } from '../src/engine/random';
import { generateRewards } from '../src/game/rewards';
import { createRun, dominantSetTag, tierForBattle } from '../src/game/run';
import { createSession } from '../src/app/session';

/** 거의 완벽한 플레이어 — 조준 오차 0, 상시 최대 스로틀, 적극 버스트. */
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

interface RunOutcome {
  phase: string;
  reachedBattle: number;
  wins: number;
  finalSetTag: string | null;
  finalEnhanceTotal: number;
}

/** 세션 하나를 완주(또는 패배)까지 구동한다. */
function driveRun(seed: number): RunOutcome {
  const session = createSession(() => seed);
  let guard = 0;

  // 화면이 배틀/보상을 오가며 런이 끝(runResult)날 때까지 돈다.
  while (session.screen !== 'runResult' && guard < 100000) {
    guard += 1;

    if (session.screen === 'reward') {
      session.activate('reward:0'); // 항상 첫 카드 선택
      continue;
    }

    // 배틀 화면 — 한 판을 결착까지 스텝.
    for (let step = 0; step < MAX_STEPS_PER_BATTLE; step += 1) {
      const input = botInput(session.battle, 0, PERFECT_PLAYER);
      session.step(input, Balance.FIXED_DELTA_SECONDS);
      if (session.screen !== 'battle') break;
    }
  }

  return {
    phase: session.run.phase,
    reachedBattle: session.run.battleNumber,
    wins: session.run.wins,
    finalSetTag: session.run.build.layer.part.set ?? null,
    finalEnhanceTotal:
      session.run.build.layer.level + session.run.build.disk.level + session.run.build.driver.level,
  };
}

function main(): void {
  console.log('=== 12판 런 흐름 헤드리스 검증 (S2) ===');
  console.log(`판당 최대 스텝 ${MAX_STEPS_PER_BATTLE} / 총 판 ${Balance.RUN_TOTAL_BATTLES} / 구간당 ${Balance.RUN_BATTLES_PER_TIER}판`);
  console.log('');

  // 난이도 구간 매핑 확인(§12-3 계단형 4구간).
  const tierMap = Array.from({ length: Balance.RUN_TOTAL_BATTLES }, (_, index) => tierForBattle(index + 1));
  console.log(`판→난이도 구간: ${tierMap.join(' ')}  (기대: 1 1 1 2 2 2 3 3 3 4 4 4)`);
  console.log('');

  // 여러 시드로 런을 구동 — 완주 가능성 + 전 시드 종료 보장.
  const seeds = Array.from({ length: 20 }, (_, index) => 1 + index * 7919);
  let completed = 0;
  let terminated = 0;
  for (const seed of seeds) {
    const outcome = driveRun(seed);
    if (outcome.phase === 'won' || outcome.phase === 'lost') terminated += 1;
    if (outcome.phase === 'won') completed += 1;
  }
  console.log(`강한 플레이어로 20 시드 구동: 종료 ${terminated}/20, 12판 완주(won) ${completed}/20`);
  console.log('  ※ 완주율은 봇 강도(placeholder)에 좌우된다. 완주 가능 여부(>0)만 이번 관심사다.');
  console.log('');

  // 결정론 — 같은 시드 두 번 구동 → 동일 결과.
  let deterministic = 0;
  const detSeeds = seeds.slice(0, 8);
  for (const seed of detSeeds) {
    const a = driveRun(seed);
    const b = driveRun(seed);
    if (JSON.stringify(a) === JSON.stringify(b)) deterministic += 1;
  }
  console.log(`동일 시드 재현(런 구동 전체): ${deterministic}/${detSeeds.length} 일치`);
  console.log('');

  // 보상 드랍 표본 — 축 다양성(§3-4) + 중복 강화 흡수(R13).
  console.log('--- 3택1 드랍 표본 (시작 빌드 기준, 시드 5개) ---');
  for (let index = 0; index < 5; index += 1) {
    const run = createRun(createRandomState(1 + index * 104729));
    const dominant = dominantSetTag(run.build);
    const cards = generateRewards(run.build, run.random);
    const summary = cards
      .map((card) => `${card.part.id}(${card.part.set ?? '무소속'}/${card.kind})`)
      .join('  ');
    const axes = new Set(cards.map((card) => card.part.set ?? 'none'));
    console.log(`  우세축 ${dominant ?? '없음'} → ${summary}   [축 종류 ${axes.size}]`);
  }
  console.log('');
  console.log('※ 위는 런 배선의 기능 관측이다. 밸런스·완주율 판정은 PM·QA 몫.');
}

main();
