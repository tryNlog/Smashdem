/**
 * 헤드리스 배틀 스모크 테스트.
 *
 * 시뮬레이션이 DOM 없이 순수하게 돌아간다는 것 자체가 구조 제약이므로,
 * 브라우저 없이 Node 에서 배틀을 끝까지 돌려 다음을 관찰한다.
 *  1) 배틀이 실제로 결착나는가 (무한정 안 끝나면 밸런스가 깨진 것)
 *  2) 같은 시드로 두 번 돌리면 결과가 완전히 동일한가 (결정론 — S3 PvP 의 전제)
 *  3) 승패 사유·소요 시간 분포가 납득 가능한 범위인가
 *
 * 실행: npm run smoke
 * 주의: 이건 자동 판정이 아니라 관측값 출력이다. 판정은 사람이 한다.
 */

import * as Balance from '../src/game/balance';
import { botInput } from '../src/game/bot';
import {
  cloneBattleState,
  createBattleState,
  DEFAULT_BOT_DEFINITION,
  DEFAULT_PLAYER_DEFINITION,
} from '../src/game/battleState';
import { stepBattle } from '../src/game/simulation';
import type { BattleState, InputCommand } from '../src/game/types';

const MAXIMUM_STEPS = Math.ceil(
  (Balance.ROUND_TIME_LIMIT_SECONDS + Balance.READY_DURATION_SECONDS + Balance.SETTLE_DURATION_SECONDS + 5) /
    Balance.FIXED_DELTA_SECONDS,
);

interface BattleReport {
  winnerIndex: number;
  outcome: string;
  battleSeconds: number;
  ticks: number;
  collisionCount: number;
  burstCount: number;
  /** 배틀 중 중심에서 가장 멀리 나간 거리 / 아레나 반경. 1.0 을 넘으면 링아웃. */
  maximumDistanceRatio: number;
  /** 관측된 최대 충돌 세기(0~1). */
  maximumCollisionStrength: number;
  finalSpins: number[];
  /** 결정론 비교용 상태 지문. */
  fingerprint: string;
}

/** 양쪽 모두 봇 입력으로 돌린다(사람 입력이 없어도 결착이 나야 한다). */
function runBattle(seed: number): BattleReport {
  const state = createBattleState([DEFAULT_PLAYER_DEFINITION, DEFAULT_BOT_DEFINITION], seed);
  const inputs: InputCommand[] = [];
  let collisionCount = 0;
  let burstCount = 0;
  let maximumDistanceRatio = 0;
  let maximumCollisionStrength = 0;

  for (let step = 0; step < MAXIMUM_STEPS; step += 1) {
    inputs[0] = botInput(state, 0);
    inputs[1] = botInput(state, 1);
    stepBattle(state, inputs, Balance.FIXED_DELTA_SECONDS);

    for (const event of state.events) {
      if (event.kind === 'collision') {
        collisionCount += 1;
        maximumCollisionStrength = Math.max(maximumCollisionStrength, event.strength);
      }
      if (event.kind === 'burstActivated') burstCount += 1;
    }
    for (const beyblade of state.beyblades) {
      if (!beyblade.alive) continue;
      const ratio = Math.hypot(beyblade.positionX, beyblade.positionY) / Balance.ARENA_RADIUS;
      maximumDistanceRatio = Math.max(maximumDistanceRatio, ratio);
    }
    if (state.phase === 'finished') break;
  }

  return {
    winnerIndex: state.winnerIndex,
    outcome: state.outcome,
    battleSeconds: Number(state.battleElapsedSeconds.toFixed(2)),
    ticks: state.tick,
    collisionCount,
    burstCount,
    maximumDistanceRatio: Number(maximumDistanceRatio.toFixed(3)),
    maximumCollisionStrength: Number(maximumCollisionStrength.toFixed(3)),
    finalSpins: state.beyblades.map((beyblade) => Number(beyblade.spin.toFixed(2))),
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

/**
 * 자력 이탈 회귀 테스트.
 *
 * 배경: 초기 밸런스에서는 방향키를 한쪽으로 계속 누르는 것만으로 링 밖으로 나가버렸다.
 * 링아웃이 "강한 타격의 결과"가 아니라 "조작 실수 자폭"이 되면 접시 아레나 설계가 무의미해진다.
 * 여기서는 한 팽이를 계속 바깥으로 밀면서 스스로 나가지는지 관찰한다.
 */
function runSelfEjectProbe(
  seconds: number,
  useBurst: boolean,
): { ringOut: boolean; maximumDistanceRatio: number } {
  const state = createBattleState([DEFAULT_PLAYER_DEFINITION, DEFAULT_BOT_DEFINITION], 1);
  const steps = Math.ceil(seconds / Balance.FIXED_DELTA_SECONDS);
  let maximumDistanceRatio = 0;
  let ringOut = false;

  for (let step = 0; step < steps; step += 1) {
    const self = state.beyblades[0];
    // 항상 중심 반대 방향(= 바깥)으로 최대 입력. 게이지가 차면 버스트까지 쓴다.
    const distance = Math.hypot(self.positionX, self.positionY) || 1;
    const outwardX = self.positionX / distance;
    const outwardY = self.positionY / distance;
    const inputs: InputCommand[] = [
      {
        moveX: outwardX,
        moveY: outwardY,
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

/**
 * 링아웃 도달 가능성 프로브.
 *
 * S0 봇은 일부러 약해서(조준 오차 0.55rad) 링아웃을 거의 못 만든다.
 * 그러면 "링아웃이 봇 대전에서 안 나온다"가 밸런스 문제인지 봇이 약해서인지 구분이 안 된다.
 * 여기서는 조준 오차 없이 상대를 정확히 밀고 게이지가 차면 즉시 버스트하는
 * "숙련 플레이어" 입력을 넣어, 링아웃이 실제로 도달 가능한 결과인지 관찰한다.
 */
function runRingOutReachabilityProbe(seed: number): string {
  const state = createBattleState([DEFAULT_PLAYER_DEFINITION, DEFAULT_BOT_DEFINITION], seed);
  const steps = Math.ceil(40 / Balance.FIXED_DELTA_SECONDS);

  for (let step = 0; step < steps; step += 1) {
    const attacker = state.beyblades[0];
    const defender = state.beyblades[1];
    const deltaX = defender.positionX - attacker.positionX;
    const deltaY = defender.positionY - attacker.positionY;
    const distance = Math.hypot(deltaX, deltaY) || 1;

    const inputs: InputCommand[] = [
      {
        moveX: deltaX / distance,
        moveY: deltaY / distance,
        burst: attacker.burstGauge >= Balance.BURST_GAUGE_COST,
      },
      // 방어자는 봇 입력을 쓴다(가만히 두면 중앙에 고정되어 비현실적).
      botInput(state, 1),
    ];
    stepBattle(state, inputs, Balance.FIXED_DELTA_SECONDS);
    if (state.phase === 'finished') break;
  }

  return `${state.outcome}(승자 ${state.winnerIndex})`;
}

function main(): void {
  console.log('=== 헤드리스 배틀 스모크 ===');
  console.log(`고정 스텝: ${Balance.FIXED_DELTA_SECONDS} 초 / 최대 ${MAXIMUM_STEPS} 스텝`);
  console.log('');

  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 12345, 987654321, 42, 777, 20260720, 31337, 99, 2468];
  const outcomeCounts = new Map<string, number>();
  let unfinishedCount = 0;

  for (const seed of seeds) {
    const first = runBattle(seed);
    const second = runBattle(seed);
    const deterministic = first.fingerprint === second.fingerprint;

    outcomeCounts.set(first.outcome, (outcomeCounts.get(first.outcome) ?? 0) + 1);
    if (first.outcome === 'none') unfinishedCount += 1;

    console.log(
      [
        `seed=${seed}`,
        `outcome=${first.outcome}`,
        `winner=${first.winnerIndex}`,
        `battle=${first.battleSeconds}s`,
        `collisions=${first.collisionCount}`,
        `bursts=${first.burstCount}`,
        `최대거리비=${first.maximumDistanceRatio}`,
        `최대충돌세기=${first.maximumCollisionStrength}`,
        `동일시드 재현=${deterministic ? '일치' : '불일치'}`,
      ].join('  '),
    );
  }

  console.log('');
  const thrustOnly = runSelfEjectProbe(15, false);
  const thrustWithBurst = runSelfEjectProbe(15, true);
  console.log(
    `자력 이탈 A (방향키만, 15초): 링아웃=${thrustOnly.ringOut ? '발생' : '없음'}  최대거리비=${thrustOnly.maximumDistanceRatio}  ← 링아웃이 발생하면 설계 위반(조작 실수 자폭)`,
  );
  console.log(
    `자력 이탈 B (방향키+버스트, 15초): 링아웃=${thrustWithBurst.ringOut ? '발생' : '없음'}  최대거리비=${thrustWithBurst.maximumDistanceRatio}  ← 게이지를 쓴 의도적 행동이므로 발생해도 무방`,
  );
  const reachability = seeds.slice(0, 8).map((seed) => runRingOutReachabilityProbe(seed));
  console.log(`링아웃 도달 가능성(숙련 입력 vs 봇, 8회): ${reachability.join(', ')}`);

  console.log('');
  console.log('결착 사유 분포(봇 vs 봇):', Object.fromEntries(outcomeCounts));
  console.log(`미결착(제한시간 내 phase!=finished) 횟수: ${unfinishedCount}`);
  console.log('※ 위 수치는 관측값이다. 밸런스 적정 여부 판정은 사람이 한다.');
}

main();
