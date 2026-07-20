/**
 * 물리 시뮬레이션 + 배틀 상태머신.
 *
 * ★ 이 파일의 절대 규칙
 *  - 부작용 금지: DOM / Canvas / Date.now() / performance.now() / Math.random() 을 부르지 않는다.
 *  - 입력은 인자로만 들어오고, 시간은 dt 로만 들어온다.
 *  - 같은 상태 + 같은 입력 → 항상 같은 결과. (S3 실시간 PvP·리플레이의 전제)
 *  - 수치는 balance.ts 에서만 가져온다.
 *
 * 성능상 상태 객체를 새로 만들지 않고 제자리에서 갱신한 뒤 같은 참조를 반환한다.
 * 스냅샷이 필요하면 battleState.cloneBattleState 를 쓴다.
 */

import { clamp, normalizeInto } from '../engine/vector';
import * as Balance from './balance';
import { pairKey } from './battleState';
import {
  attackMultiplier,
  controlMultiplier,
  massMultiplier,
  spinDecayMultiplier,
} from './statModifiers';
import type { BattleState, Beyblade, InputCommand } from './types';
import { NEUTRAL_INPUT } from './types';

/** 정규화 결과를 담는 재사용 버퍼. 스텝 안에서만 쓰고 상태에 남기지 않는다. */
const scratchDirection: [number, number] = [0, 0];

/**
 * 시뮬레이션 한 스텝 전진.
 *
 * @param state 현재 배틀 상태 (제자리 갱신됨)
 * @param inputs 팽이 인덱스와 같은 순서의 입력 배열
 * @param deltaSeconds 고정 스텝 길이 (Balance.FIXED_DELTA_SECONDS)
 * @returns 갱신된 상태 (= 인자로 받은 것과 같은 객체)
 */
export function stepBattle(
  state: BattleState,
  inputs: readonly InputCommand[],
  deltaSeconds: number,
): BattleState {
  state.events.length = 0;
  state.tick += 1;
  state.phaseElapsedSeconds += deltaSeconds;

  switch (state.phase) {
    case 'ready':
      stepReadyPhase(state);
      break;
    case 'fighting':
      stepFightingPhase(state, inputs, deltaSeconds);
      break;
    case 'settling':
      // 결착 연출 구간. 물리는 계속 굴러가되 입력은 받지 않는다.
      stepPhysics(state, deltaSeconds, false);
      if (state.phaseElapsedSeconds >= Balance.SETTLE_DURATION_SECONDS) {
        enterPhase(state, 'finished');
      }
      break;
    case 'finished':
      break;
  }

  advanceVisualSpin(state, deltaSeconds);
  return state;
}

function enterPhase(state: BattleState, phase: BattleState['phase']): void {
  state.phase = phase;
  state.phaseElapsedSeconds = 0;
}

function stepReadyPhase(state: BattleState): void {
  if (state.phaseElapsedSeconds >= Balance.READY_DURATION_SECONDS) {
    enterPhase(state, 'fighting');
  }
}

function stepFightingPhase(
  state: BattleState,
  inputs: readonly InputCommand[],
  deltaSeconds: number,
): void {
  state.battleElapsedSeconds += deltaSeconds;

  applyInputs(state, inputs, deltaSeconds);
  stepPhysics(state, deltaSeconds, true);
  resolveDefeatConditions(state);
  checkBattleEnd(state);
}

// ─────────────────────────────────────────────────────────────
// 입력 적용
// ─────────────────────────────────────────────────────────────

function applyInputs(
  state: BattleState,
  inputs: readonly InputCommand[],
  deltaSeconds: number,
): void {
  for (const beyblade of state.beyblades) {
    if (!beyblade.alive) continue;
    const input = inputs[beyblade.index] ?? NEUTRAL_INPUT;

    // 버스트 지속 시간 소진
    if (beyblade.burstRemainingSeconds > 0) {
      beyblade.burstRemainingSeconds = Math.max(0, beyblade.burstRemainingSeconds - deltaSeconds);
    }

    // 게이지 회복 (버스트 중에는 회복하지 않는다)
    if (beyblade.burstRemainingSeconds <= 0) {
      beyblade.burstGauge = Math.min(
        Balance.BURST_GAUGE_MAXIMUM,
        beyblade.burstGauge + Balance.BURST_GAUGE_REGENERATION_PER_SECOND * deltaSeconds,
      );
    }

    // 방향 입력 → 가속. 속도를 직접 세팅하지 않고 가속만 더해서 관성을 남긴다.
    normalizeInto(scratchDirection, input.moveX, input.moveY);
    const inputDirectionX = scratchDirection[0];
    const inputDirectionY = scratchDirection[1];
    // 입력 크기(아날로그 스틱 대응). 정규화 전 길이를 0~1 로 잘라 세기로 쓴다.
    const throttle = clamp(Math.hypot(input.moveX, input.moveY), 0, 1);

    const isBursting = beyblade.burstRemainingSeconds > 0;
    const acceleration =
      Balance.MOVE_ACCELERATION_BASE *
      controlMultiplier(beyblade.stats) *
      (isBursting ? Balance.BURST_ACCELERATION_MULTIPLIER : 1) *
      throttle;

    beyblade.velocityX += inputDirectionX * acceleration * deltaSeconds;
    beyblade.velocityY += inputDirectionY * acceleration * deltaSeconds;

    // 대시 버스트 발동
    const canBurst =
      input.burst &&
      beyblade.burstRemainingSeconds <= 0 &&
      beyblade.burstGauge >= Balance.BURST_GAUGE_COST;

    if (canBurst) {
      beyblade.burstGauge -= Balance.BURST_GAUGE_COST;
      beyblade.burstRemainingSeconds = Balance.BURST_DURATION_SECONDS;

      // 임펄스 방향: 입력이 있으면 입력 방향, 없으면 현재 진행 방향.
      let burstDirectionX = inputDirectionX;
      let burstDirectionY = inputDirectionY;
      if (burstDirectionX === 0 && burstDirectionY === 0) {
        normalizeInto(scratchDirection, beyblade.velocityX, beyblade.velocityY);
        burstDirectionX = scratchDirection[0];
        burstDirectionY = scratchDirection[1];
      }

      beyblade.velocityX += burstDirectionX * Balance.BURST_IMPULSE_SPEED;
      beyblade.velocityY += burstDirectionY * Balance.BURST_IMPULSE_SPEED;

      state.events.push({
        kind: 'burstActivated',
        beybladeIndex: beyblade.index,
        positionX: beyblade.positionX,
        positionY: beyblade.positionY,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 물리
// ─────────────────────────────────────────────────────────────

function stepPhysics(state: BattleState, deltaSeconds: number, drainSpin: boolean): void {
  applyDishSlope(state, deltaSeconds);
  applyFloorDrag(state, deltaSeconds);
  integratePositions(state, deltaSeconds);
  resolveCollisions(state, deltaSeconds);
  if (drainSpin) drainSpinOverTime(state, deltaSeconds);
}

/**
 * 접시형 아레나의 경사 + 테두리 턱.
 *
 * 1) 완만한 경사(접시 바닥): a = DISH_ACCELERATION_AT_RIM * (거리 / 반경)
 *    거리에 비례하는 복원 가속으로, 물리적으로는 포물면 접시 위 중력의 접선 성분에 해당한다.
 *    두 팽이를 자연히 가운데로 모아 충돌 빈도를 만드는 것이 게임적 목적이다.
 *
 * 2) 테두리 턱(lip): 바깥 구간에서만 (초과분)² 에 비례해 급격히 세지는 추가 복원 가속.
 *    지속적인 자력 추진으로는 못 넘고, 충돌로 순간적으로 실린 큰 속도로만 넘을 수 있다.
 *    → 링아웃이 조작 실수 자폭이 아니라 강한 타격의 결과가 되게 한다.
 */
function applyDishSlope(state: BattleState, deltaSeconds: number): void {
  for (const beyblade of state.beyblades) {
    if (!beyblade.alive) continue;

    const distanceFromCenter = Math.hypot(beyblade.positionX, beyblade.positionY);
    if (distanceFromCenter <= 1e-6) continue;

    const distanceRatio = distanceFromCenter / Balance.ARENA_RADIUS;
    let accelerationMagnitude = Balance.DISH_ACCELERATION_AT_RIM * distanceRatio;

    if (distanceRatio > Balance.DISH_LIP_THRESHOLD) {
      const climbRatio =
        (distanceRatio - Balance.DISH_LIP_THRESHOLD) / (1 - Balance.DISH_LIP_THRESHOLD);
      accelerationMagnitude += Balance.DISH_LIP_ACCELERATION * climbRatio * climbRatio;
    }

    // 중심을 향하는 단위 벡터 = -(위치) / 거리
    const towardCenterX = -beyblade.positionX / distanceFromCenter;
    const towardCenterY = -beyblade.positionY / distanceFromCenter;

    beyblade.velocityX += towardCenterX * accelerationMagnitude * deltaSeconds;
    beyblade.velocityY += towardCenterY * accelerationMagnitude * deltaSeconds;
  }
}

/**
 * 바닥 마찰. 속도에 비례하는 감속(점성 저항 모델).
 * 이것 때문에 최고 속도가 대략 (가속 / 마찰계수) 로 수렴한다.
 */
function applyFloorDrag(state: BattleState, deltaSeconds: number): void {
  const retention = Math.max(0, 1 - Balance.FLOOR_DRAG_PER_SECOND * deltaSeconds);
  for (const beyblade of state.beyblades) {
    if (!beyblade.alive) continue;
    beyblade.velocityX *= retention;
    beyblade.velocityY *= retention;
  }
}

/** 반암시적 오일러 적분. 속도를 먼저 갱신하고 위치를 옮긴다(안정적). */
function integratePositions(state: BattleState, deltaSeconds: number): void {
  for (const beyblade of state.beyblades) {
    if (!beyblade.alive) continue;
    beyblade.positionX += beyblade.velocityX * deltaSeconds;
    beyblade.positionY += beyblade.velocityY * deltaSeconds;
  }
}

/**
 * 회전력 자연 감소.
 *  - 기본 소모: stamina 가 높을수록 작아진다.
 *  - 속도 비례 소모: 빨리 움직일수록 빨리 지친다(움직임에 비용을 붙여 무한 회피를 막는다).
 *  - 테두리 가중: 가장자리에 붙어 도는 지연 전략에 추가 비용.
 */
function drainSpinOverTime(state: BattleState, deltaSeconds: number): void {
  for (const beyblade of state.beyblades) {
    if (!beyblade.alive) continue;

    const speed = Math.hypot(beyblade.velocityX, beyblade.velocityY);
    const distanceRatio = Math.hypot(beyblade.positionX, beyblade.positionY) / Balance.ARENA_RADIUS;
    const rimMultiplier =
      distanceRatio >= Balance.SPIN_DECAY_RIM_THRESHOLD ? Balance.SPIN_DECAY_RIM_MULTIPLIER : 1;

    const decayPerSecond =
      (Balance.SPIN_DECAY_BASE_PER_SECOND + speed * Balance.SPIN_DECAY_PER_SPEED_UNIT) *
      spinDecayMultiplier(beyblade.stats) *
      rimMultiplier;

    beyblade.spin = Math.max(0, beyblade.spin - decayPerSecond * deltaSeconds);
  }
}

// ─────────────────────────────────────────────────────────────
// 충돌
// ─────────────────────────────────────────────────────────────

/**
 * 원-원 충돌. 팽이 수가 2대뿐이라 공간 분할 없이 전수 비교한다.
 * 처리 순서: 겹침 분리 → 접근 속도 계산 → 임펄스 교환 → 데미지.
 */
function resolveCollisions(state: BattleState, deltaSeconds: number): void {
  // 쿨다운 감소
  for (let index = 0; index < state.collisionCooldowns.length; index += 1) {
    if (state.collisionCooldowns[index] > 0) {
      state.collisionCooldowns[index] = Math.max(0, state.collisionCooldowns[index] - deltaSeconds);
    }
  }

  const beyblades = state.beyblades;
  for (let firstIndex = 0; firstIndex < beyblades.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < beyblades.length; secondIndex += 1) {
      const first = beyblades[firstIndex];
      const second = beyblades[secondIndex];
      if (!first.alive || !second.alive) continue;

      const deltaX = second.positionX - first.positionX;
      const deltaY = second.positionY - first.positionY;
      const distance = Math.hypot(deltaX, deltaY);
      const contactDistance = first.radius + second.radius;
      if (distance >= contactDistance) continue;

      // 완전히 겹쳐 방향을 못 정하는 경우의 안전장치.
      const safeDistance = distance > 1e-6 ? distance : 1e-6;
      const normalX = deltaX / safeDistance;
      const normalY = deltaY / safeDistance;

      const firstMass = massMultiplier(first.stats);
      const secondMass = massMultiplier(second.stats);
      const totalMass = firstMass + secondMass;

      // 1) 겹침 분리 — 가벼운 쪽이 더 많이 밀려난다.
      const overlap = (contactDistance - safeDistance) * Balance.COLLISION_SEPARATION_SLACK;
      const firstPushRatio = secondMass / totalMass;
      const secondPushRatio = firstMass / totalMass;
      first.positionX -= normalX * overlap * firstPushRatio;
      first.positionY -= normalY * overlap * firstPushRatio;
      second.positionX += normalX * overlap * secondPushRatio;
      second.positionY += normalY * overlap * secondPushRatio;

      // 2) 법선 방향 상대 속도. 음수면 서로 접근 중.
      const relativeVelocityX = second.velocityX - first.velocityX;
      const relativeVelocityY = second.velocityY - first.velocityY;
      const approachSpeed = -(relativeVelocityX * normalX + relativeVelocityY * normalY);
      if (approachSpeed <= 0) continue; // 이미 멀어지는 중이면 임펄스를 주지 않는다(진동 방지)

      // 누가 부딪혀 들어갔는가 — 충돌 법선 방향으로 더 많이 밀고 들어온 쪽이 공격자.
      // 임펄스를 주기 "전"에 판정해야 한다(임펄스 후에는 속도가 뒤집혀 있다).
      const firstApproachContribution = first.velocityX * normalX + first.velocityY * normalY;
      const secondApproachContribution = -(second.velocityX * normalX + second.velocityY * normalY);
      const firstIsAttacker = firstApproachContribution >= secondApproachContribution;
      const attacker = firstIsAttacker ? first : second;
      const defender = firstIsAttacker ? second : first;

      // 3) 임펄스 교환 — 1차원 탄성 충돌 공식에 반발계수를 곱한 형태.
      //    j = (1 + e) * 접근속도 / (1/m1 + 1/m2)
      const impulseMagnitude =
        ((1 + Balance.COLLISION_RESTITUTION) * approachSpeed) / (1 / firstMass + 1 / secondMass);
      first.velocityX -= (normalX * impulseMagnitude) / firstMass;
      first.velocityY -= (normalY * impulseMagnitude) / firstMass;
      second.velocityX += (normalX * impulseMagnitude) / secondMass;
      second.velocityY += (normalY * impulseMagnitude) / secondMass;

      // 4) 데미지 — 쿨다운이 남아 있거나 너무 약한 접촉이면 건너뛴다.
      const key = pairKey(firstIndex, secondIndex);
      if (state.collisionCooldowns[key] > 0) continue;
      if (approachSpeed < Balance.COLLISION_MINIMUM_RELATIVE_SPEED) continue;
      state.collisionCooldowns[key] = Balance.COLLISION_COOLDOWN_SECONDS;

      // 방어자는 정타를 맞고, 공격자는 반동만 받는다.
      // 양쪽에 똑같은 데미지를 주면 같은 스탯끼리는 회전력 곡선이 완전히 겹쳐 무승부가 쏟아진다.
      // 비대칭을 두는 것이 물리적으로도(파고든 쪽이 유리) 게임적으로도(공격 보상) 맞다.
      applyCollisionDamage(attacker, defender, approachSpeed, 1);
      applyCollisionDamage(defender, attacker, approachSpeed, Balance.COLLISION_ATTACKER_RECOIL_RATIO);

      const strength = clamp(approachSpeed / Balance.COLLISION_STRENGTH_REFERENCE_SPEED, 0, 1);
      state.events.push({
        kind: 'collision',
        positionX: (first.positionX + second.positionX) / 2,
        positionY: (first.positionY + second.positionY) / 2,
        strength,
        attackerIndex: attacker.index,
        defenderIndex: defender.index,
      });
    }
  }
}

/**
 * 충돌 데미지 = 접근속도 × 기본계수 × (가한 쪽 attack 배율 / 받는 쪽 질량 배율) × 버스트 배율 × 비율.
 *
 * @param scale 1 이면 정타, COLLISION_ATTACKER_RECOIL_RATIO 면 공격자가 받는 반동.
 */
function applyCollisionDamage(
  source: Beyblade,
  receiver: Beyblade,
  approachSpeed: number,
  scale: number,
): void {
  const burstMultiplier = source.burstRemainingSeconds > 0 ? Balance.BURST_DAMAGE_MULTIPLIER : 1;

  const damage =
    approachSpeed *
    Balance.COLLISION_DAMAGE_PER_RELATIVE_SPEED *
    (attackMultiplier(source.stats) / massMultiplier(receiver.stats)) *
    burstMultiplier *
    scale;

  receiver.spin = Math.max(0, receiver.spin - damage);
}

// ─────────────────────────────────────────────────────────────
// 승패 판정
// ─────────────────────────────────────────────────────────────

/** 링아웃(아레나 이탈) / 스핀아웃(회전력 0) 판정. */
function resolveDefeatConditions(state: BattleState): void {
  for (const beyblade of state.beyblades) {
    if (!beyblade.alive) continue;

    const distanceFromCenter = Math.hypot(beyblade.positionX, beyblade.positionY);
    if (distanceFromCenter > Balance.ARENA_RADIUS) {
      beyblade.alive = false;
      beyblade.defeatReason = 'ringOut';
      state.events.push({
        kind: 'ringOut',
        beybladeIndex: beyblade.index,
        positionX: beyblade.positionX,
        positionY: beyblade.positionY,
      });
      continue;
    }

    if (beyblade.spin <= 0) {
      beyblade.alive = false;
      beyblade.defeatReason = 'spinOut';
      state.events.push({
        kind: 'spinOut',
        beybladeIndex: beyblade.index,
        positionX: beyblade.positionX,
        positionY: beyblade.positionY,
      });
    }
  }
}

function checkBattleEnd(state: BattleState): void {
  const survivors = state.beyblades.filter((beyblade) => beyblade.alive);

  if (survivors.length === 1) {
    const winner = survivors[0];
    const loser = state.beyblades.find((beyblade) => !beyblade.alive);
    finishBattle(state, winner.index, loser?.defeatReason === 'ringOut' ? 'ringOut' : 'spinOut');
    return;
  }

  if (survivors.length === 0) {
    // 같은 스텝에 둘 다 탈락 — 무승부.
    finishBattle(state, -1, 'draw');
    return;
  }

  if (state.battleElapsedSeconds >= Balance.ROUND_TIME_LIMIT_SECONDS) {
    // 시간 초과 판정승: 회전력이 많이 남은 쪽.
    let bestIndex = -1;
    let bestSpin = -Infinity;
    let tied = false;
    for (const beyblade of survivors) {
      if (beyblade.spin > bestSpin) {
        bestSpin = beyblade.spin;
        bestIndex = beyblade.index;
        tied = false;
      } else if (beyblade.spin === bestSpin) {
        tied = true;
      }
    }
    finishBattle(state, tied ? -1 : bestIndex, tied ? 'draw' : 'timeLimit');
  }
}

function finishBattle(
  state: BattleState,
  winnerIndex: number,
  outcome: BattleState['outcome'],
): void {
  state.winnerIndex = winnerIndex;
  state.outcome = outcome;
  state.events.push({ kind: 'battleFinished', winnerIndex, outcome });
  enterPhase(state, 'settling');
}

// ─────────────────────────────────────────────────────────────
// 연출용 각도
// ─────────────────────────────────────────────────────────────

/**
 * 팽이 몸체의 시각적 회전 각도. 물리에는 전혀 관여하지 않지만,
 * 렌더가 자기 시간(가변 dt)으로 굴리면 결정론 검증 시 상태가 갈리므로 시뮬 안에서 고정 스텝으로 돌린다.
 * 회전력이 남아 있을수록 빠르게 돈다 — 지친 팽이가 느려 보이게.
 */
function advanceVisualSpin(state: BattleState, deltaSeconds: number): void {
  for (const beyblade of state.beyblades) {
    const spinRatio = beyblade.spin / Balance.SPIN_MAXIMUM;
    const angularSpeed = (2 + spinRatio * 22) * (beyblade.alive ? 1 : 0.35);
    beyblade.visualSpinAngle = (beyblade.visualSpinAngle + angularSpeed * deltaSeconds) % (Math.PI * 2);
  }
}
