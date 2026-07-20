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

  advanceStrikeWindows(state, deltaSeconds);
  applyInputs(state, inputs, deltaSeconds);
  stepPhysics(state, deltaSeconds, true);
  resolveDefeatConditions(state);
  checkBattleEnd(state);
}

// ─────────────────────────────────────────────────────────────
// 링아웃 개입 레버 L1·L2·L3 — 강타 윈도우
//
// 설계 근거: 02_게임설계.md §2-3. 세 레버는 전부 강타(접근속도가 임계 초과) 직후
// 짧은 윈도우 안에서만 열린다. 상시 적용하면 방향키만으로 나가는 자폭 링아웃이 되살아나고,
// 그 순간 "링아웃은 타격의 보상"이라는 설계 명제가 무효가 된다(T4 최우선).
// ─────────────────────────────────────────────────────────────

/** 강타 윈도우 잔여 시간 감소. 매 fighting 스텝의 맨 앞에서 한 번만 돈다. */
function advanceStrikeWindows(state: BattleState, deltaSeconds: number): void {
  for (const beyblade of state.beyblades) {
    if (beyblade.stunRemainingSeconds > 0) {
      beyblade.stunRemainingSeconds = Math.max(0, beyblade.stunRemainingSeconds - deltaSeconds);
    }
    if (beyblade.lipPierceRemainingSeconds > 0) {
      beyblade.lipPierceRemainingSeconds = Math.max(
        0,
        beyblade.lipPierceRemainingSeconds - deltaSeconds,
      );
    }
  }
}

/** 이 팽이가 강타로 인정받는 최소 접근 속도. 특성(크러시 레이어)이 이 값을 낮춘다. */
function strikeThreshold(attacker: Beyblade): number {
  return Balance.STRIKE_APPROACH_SPEED * attacker.tuning.strikeThresholdMultiplier;
}

/**
 * 강타 성립 시 방어자에게 L1~L3 을 건다.
 *
 *  L1 넉백 임펄스 — 법선(공격자→방어자) 방향 추가 속도. 넉백 합산에 비례한다.
 *  L2 경직        — 방어자의 방향키 가속 무효화. "피격 직후 역추진"을 직접 차단한다.
 *  L3 턱 관통     — 방어자의 테두리 턱 복원 가속 감쇠. RING BREAKER 단계에서만 열린다.
 *
 * @param normalX 공격자 → 방어자 방향의 단위 벡터
 */
function applyKnockbackLevers(
  attacker: Beyblade,
  defender: Beyblade,
  approachSpeed: number,
  normalX: number,
  normalY: number,
): void {
  if (attacker.knockbackTier === 'none') {
    applyAccidentLevers(defender, approachSpeed, normalX, normalY);
    return;
  }
  if (approachSpeed < strikeThreshold(attacker)) return;

  // L1 — 넉백 임펄스.
  // 방어자의 질량(weight)으로 나눈다. weight 는 types.ts 정의부터 "충돌 시 밀림 저항"인데
  // 이 항이 없으면 넉백에 대해서만 weight 가 무효가 되어, 무거운 빌드가 링브레이커에게
  // 아무 저항도 못 한다(2026-07-20 실측: 스태미나 빌드가 링브레이커전 22.5% 승률).
  const excess = Math.max(0, attacker.knockback - Balance.KNOCKBACK_THRESHOLD_RIM_PRESSURE);
  const impulseSpeed =
    ((Balance.KNOCKBACK_IMPULSE_BASE + excess * Balance.KNOCKBACK_IMPULSE_PER_POINT) *
      attacker.tuning.knockbackImpulseMultiplier) /
    massMultiplier(defender.stats);
  defender.velocityX += normalX * impulseSpeed;
  defender.velocityY += normalY * impulseSpeed;

  // L2 — 경직
  const stunWindow =
    attacker.knockbackTier === 'ringBreaker'
      ? Balance.STUN_WINDOW_SECONDS_RING_BREAKER
      : Balance.STUN_WINDOW_SECONDS_RIM_PRESSURE;
  defender.stunRemainingSeconds = Math.max(defender.stunRemainingSeconds, stunWindow);

  // L3 — 턱 관통 (RING BREAKER 에서만)
  if (attacker.knockbackTier === 'ringBreaker') {
    defender.lipPierceRemainingSeconds = Math.max(
      defender.lipPierceRemainingSeconds,
      Balance.LIP_PIERCE_WINDOW_SECONDS,
    );
    defender.lipPierceMultiplier = Balance.LIP_PIERCE_MULTIPLIER;
  }
}

/**
 * 사고 링아웃 — 넉백 0~임계1 미만 공격자가 만들 수 있는 유일한 링아웃 경로.
 *
 * L1·L2·L3 를 동시에, 아주 작게 건다. 단독 레버로는 방어자의 재가속에 상쇄돼 0% 였다(balance.ts 주석 참조).
 * 발동 조건이 두 개(초강타 + 방어자가 이미 테두리 쪽) 라서 발생 빈도가 낮게 유지된다.
 */
function applyAccidentLevers(
  defender: Beyblade,
  approachSpeed: number,
  normalX: number,
  normalY: number,
): void {
  if (approachSpeed < Balance.ACCIDENT_STRIKE_APPROACH_SPEED) return;

  const distanceRatio =
    Math.hypot(defender.positionX, defender.positionY) / Balance.ARENA_RADIUS;
  if (distanceRatio < Balance.ACCIDENT_DEFENDER_DISTANCE_RATIO) return;

  const impulse = Balance.ACCIDENT_KNOCKBACK_IMPULSE / massMultiplier(defender.stats);
  defender.velocityX += normalX * impulse;
  defender.velocityY += normalY * impulse;

  defender.stunRemainingSeconds = Math.max(
    defender.stunRemainingSeconds,
    Balance.ACCIDENT_WINDOW_SECONDS,
  );
  if (defender.lipPierceRemainingSeconds <= 0) {
    defender.lipPierceRemainingSeconds = Balance.ACCIDENT_WINDOW_SECONDS;
    defender.lipPierceMultiplier = Balance.ACCIDENT_LIP_PIERCE_MULTIPLIER;
  }
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
        beyblade.burstGauge +
          Balance.BURST_GAUGE_REGENERATION_PER_SECOND *
            beyblade.tuning.burstRegenerationMultiplier *
            deltaSeconds,
      );
    }

    // 방향 입력 → 가속. 속도를 직접 세팅하지 않고 가속만 더해서 관성을 남긴다.
    normalizeInto(scratchDirection, input.moveX, input.moveY);
    const inputDirectionX = scratchDirection[0];
    const inputDirectionY = scratchDirection[1];
    // 입력 크기(아날로그 스틱 대응). 정규화 전 길이를 0~1 로 잘라 세기로 쓴다.
    const throttle = clamp(Math.hypot(input.moveX, input.moveY), 0, 1);

    const isBursting = beyblade.burstRemainingSeconds > 0;
    // L2 경직 — 강타를 맞은 직후 짧은 시간 동안 방향키 가속이 죽는다.
    // 여기가 "피격 직후 방어자가 다시 안쪽으로 추진해 바깥 속도를 상쇄하던" 문제의 개입 지점이다.
    const stunFactor =
      beyblade.stunRemainingSeconds > 0 ? Balance.STUN_ACCELERATION_FACTOR : 1;
    const acceleration =
      Balance.MOVE_ACCELERATION_BASE *
      controlMultiplier(beyblade.stats) *
      (isBursting ? Balance.BURST_ACCELERATION_MULTIPLIER : 1) *
      stunFactor *
      throttle;

    beyblade.velocityX += inputDirectionX * acceleration * deltaSeconds;
    beyblade.velocityY += inputDirectionY * acceleration * deltaSeconds;

    // 대시 버스트 발동
    // 경직 중에는 버스트도 나가지 않는다. 버스트만 살려두면 L2 가 무력화된다(임펄스로 역추진 가능).
    const canBurst =
      input.burst &&
      beyblade.stunRemainingSeconds <= 0 &&
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

      const burstImpulse = Balance.BURST_IMPULSE_SPEED * beyblade.tuning.burstImpulseMultiplier;
      beyblade.velocityX += burstDirectionX * burstImpulse;
      beyblade.velocityY += burstDirectionY * burstImpulse;

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
      // L3 턱 관통 — 강타를 맞은 직후에만 턱이 얇아진다. 턱 자체는 그대로 둔다(D8).
      const lipMultiplier =
        beyblade.lipPierceRemainingSeconds > 0 ? beyblade.lipPierceMultiplier : 1;
      accelerationMagnitude +=
        Balance.DISH_LIP_ACCELERATION * lipMultiplier * climbRatio * climbRatio;
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
      defender.lastStruckElapsedSeconds = state.battleElapsedSeconds;
      applyCollisionDamage(attacker, defender, approachSpeed, 1);
      applyCollisionDamage(defender, attacker, approachSpeed, Balance.COLLISION_ATTACKER_RECOIL_RATIO);

      // 링아웃 레버 L1·L2·L3 — 강타 판정을 통과한 경우에만.
      // 법선은 항상 "공격자 → 방어자" 방향이어야 밀림이 바깥으로 간다.
      const pushX = attacker === first ? normalX : -normalX;
      const pushY = attacker === first ? normalY : -normalY;
      applyKnockbackLevers(attacker, defender, approachSpeed, pushX, pushY);

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
      // 직전 피격 이력이 없으면 자폭 링아웃으로 분류한다.
      // PM 판정(2026-07-20): 버스트 자력 이탈은 결함이 아니라 재미 요소다. 다만 일반 링아웃 패배와
      // 구분해서 보여줘야 플레이어가 "내가 나갔구나"를 알고 다음 판으로 넘어간다.
      const secondsSinceStruck = state.battleElapsedSeconds - beyblade.lastStruckElapsedSeconds;
      const selfInflicted = !(secondsSinceStruck <= Balance.SELF_RING_OUT_GRACE_SECONDS);
      beyblade.alive = false;
      beyblade.defeatReason = selfInflicted ? 'selfRingOut' : 'ringOut';
      state.events.push({
        kind: 'ringOut',
        beybladeIndex: beyblade.index,
        positionX: beyblade.positionX,
        positionY: beyblade.positionY,
        selfInflicted,
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
    finishBattle(state, winner.index, outcomeFromDefeatReason(loser?.defeatReason));
    return;
  }

  if (survivors.length === 0) {
    // 같은 스텝에 둘 다 탈락. 동일 스탯 미러 매치에서 회전력 곡선이 겹쳐 자주 발생한다.
    // 2차 판정: 중심에 더 가까운 쪽이 승(접시 중앙을 지킨 쪽). 그것마저 같으면 무승부.
    // 근거: 02_게임설계.md §4-R5 — 서든데스 신설 전에 동점 처리 개선으로 T5 달성 가능한지 먼저 본다.
    const winnerIndex = closestToCenterIndex(state.beyblades);
    if (winnerIndex < 0) {
      finishBattle(state, -1, 'draw');
    } else {
      const loser = state.beyblades.find((beyblade) => beyblade.index !== winnerIndex);
      finishBattle(state, winnerIndex, outcomeFromDefeatReason(loser?.defeatReason));
    }
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
    if (tied) {
      // 회전력이 같으면 중심 근접도로 2차 판정한다(§4-R5).
      const closest = closestToCenterIndex(survivors);
      finishBattle(state, closest, closest < 0 ? 'draw' : 'timeLimit');
      return;
    }
    finishBattle(state, bestIndex, 'timeLimit');
  }
}

/**
 * 중심에 가장 가까운 팽이의 인덱스. 완전 동률이면 -1.
 * 무승부를 줄이기 위한 2차 판정 기준이다 — "접시 중앙을 지킨 쪽이 이긴다".
 */
function closestToCenterIndex(candidates: readonly Beyblade[]): number {
  let bestIndex = -1;
  let bestDistance = Infinity;
  let tied = false;
  for (const beyblade of candidates) {
    const distance = Math.hypot(beyblade.positionX, beyblade.positionY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = beyblade.index;
      tied = false;
    } else if (distance === bestDistance) {
      tied = true;
    }
  }
  return tied ? -1 : bestIndex;
}

/** 패자의 탈락 사유 → 라운드 결과 사유. */
function outcomeFromDefeatReason(reason: Beyblade['defeatReason'] | undefined): BattleState['outcome'] {
  if (reason === 'ringOut') return 'ringOut';
  if (reason === 'selfRingOut') return 'selfRingOut';
  return 'spinOut';
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
