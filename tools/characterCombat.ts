/**
 * Character combat lifecycle smoke.
 *
 * Run: npm run smoke:character-combat
 * Task 3 covers the fixed-tick lifecycle only. Hit resolution, ring-out, and
 * timeout assertions are reserved for Task 4.
 */

import * as Balance from '../src/game/character/balance';
import { createCharacterBattleState } from '../src/game/character/battleState';
import {
  applyCharacterHit,
  isWithinGuardCone,
  resolveCharacterRingOut,
  resolveCharacterTimeLimit,
} from '../src/game/character/combatResolution';
import {
  actionPhase,
  actionTotalSeconds,
  stepCharacterBattle,
} from '../src/game/character/simulation';
import {
  DEFAULT_COMBAT_PROFILE,
  DEFAULT_COMBAT_STATS,
  neutralCharacterInput,
  type CharacterBattleState,
  type CharacterInputCommand,
  type QueuedAction,
} from '../src/game/character/types';

const DELTA_SECONDS = Balance.CHARACTER_FIXED_DELTA_SECONDS;

const definitions = [
  { name: 'left', stats: DEFAULT_COMBAT_STATS, profile: DEFAULT_COMBAT_PROFILE },
  { name: 'right', stats: DEFAULT_COMBAT_STATS, profile: DEFAULT_COMBAT_PROFILE },
] as const;

let cases = 0;

function expect(condition: boolean, message: string): void {
  cases += 1;
  if (!condition) throw new Error(message);
}

function createFightingState(): CharacterBattleState {
  const state = createCharacterBattleState(definitions, 20260728);
  state.phase = 'fighting';
  return state;
}

function neutralFor(state: CharacterBattleState, index: number): CharacterInputCommand {
  return neutralCharacterInput(state.combatants[index]!.facingAimStep);
}

function commandFor(
  state: CharacterBattleState,
  index: number,
  patch: Partial<CharacterInputCommand> = {},
): CharacterInputCommand {
  return { ...neutralFor(state, index), ...patch };
}

function step(
  state: CharacterBattleState,
  first: Partial<CharacterInputCommand> = {},
  second: Partial<CharacterInputCommand> = {},
): void {
  stepCharacterBattle(state, [commandFor(state, 0, first), commandFor(state, 1, second)], DELTA_SECONDS);
}

function advance(
  state: CharacterBattleState,
  seconds: number,
  first: Partial<CharacterInputCommand> = {},
): void {
  const ticks = Math.ceil(seconds / DELTA_SECONDS) + 1;
  for (let tick = 0; tick < ticks; tick += 1) step(state, first);
}

function queueAction(
  state: CharacterBattleState,
  action: Exclude<QueuedAction, 'none'>,
  patch: Partial<CharacterInputCommand> = {},
): void {
  step(state, {
    queuedAction: action,
    actionAimStep: 32,
    ...patch,
  });
}

function prepareHitState(): CharacterBattleState {
  const state = createFightingState();
  const attacker = state.combatants[0]!;
  const defender = state.combatants[1]!;
  attacker.positionX = 0;
  attacker.positionY = 0;
  attacker.facingAimStep = 0;
  attacker.actionAimStep = 0;
  defender.positionX = 40;
  defender.positionY = 0;
  defender.facingAimStep = 128;
  return state;
}

function assertClose(actual: number, expected: number, message: string): void {
  expect(Math.abs(actual - expected) < 0.000001, message);
}

function scriptedSnapshot(): string {
  const state = createFightingState();
  state.combatants[0]!.positionX = -30;
  state.combatants[1]!.positionX = 30;
  for (let tick = 0; tick < 90; tick += 1) {
    const first: Partial<CharacterInputCommand> = tick === 0
      ? { queuedAction: 'attack', actionAimStep: 0, aimStep: 0 }
      : tick === 30
        ? { queuedAction: 'dash', dashMoveX: 1, dashMoveY: 0, aimStep: 0 }
        : { moveX: tick < 20 ? 1 : 0, aimStep: 0 };
    const second: Partial<CharacterInputCommand> = tick < 25
      ? { guard: true, aimStep: 128 }
      : { moveX: -1, aimStep: 128 };
    step(state, first, second);
  }
  return JSON.stringify(state);
}
function main(): void {
  const state = createFightingState();
  const left = state.combatants[0]!;

  step(state, { aimStep: 32 });
  expect(left.facingAimStep === 32, 'a command aim step must update facing');
  expect(left.velocityX === 0 && left.velocityY === 0, 'aim input must not move the combatant');

  queueAction(state, 'attack');
  expect(left.actionState === 'attack', 'a queued attack must begin from idle');
  expect(left.actionAimStep === 32, 'an attack must retain its accepted action aim');
  expect(actionPhase(left) === 'startup', 'a new attack must begin in startup');
  expect(left.normalCooldownSeconds > 0, 'an accepted attack must start its cooldown');
  advance(state, actionTotalSeconds(left.profile.normalAttack));
  expect(left.actionState === 'idle', 'an action must return to idle after its total duration');

  step(state, { guard: true });
  expect(left.actionState === 'guarding', 'held guard must enter guarding from idle');
  queueAction(state, 'attack', { guard: true });
  expect(left.actionState === 'attack', 'an accepted attack must end guarding before it begins');
  advance(state, actionTotalSeconds(left.profile.normalAttack), { guard: true });
  expect(left.actionState === 'guarding', 'held guard must resume after action recovery');

  const rejectedGuardState = createFightingState();
  const rejectedGuard = rejectedGuardState.combatants[0]!;
  step(rejectedGuardState, { guard: true });
  step(rejectedGuardState, { guard: false, queuedAction: 'dash', actionAimStep: 32 });
  expect(
    rejectedGuard.actionState === 'idle',
    'a rejected zero-direction dash must still release guard in the same tick',
  );

  const zeroDashState = createFightingState();
  const zeroDash = zeroDashState.combatants[0]!;
  queueAction(zeroDashState, 'dash');
  expect(zeroDash.actionState === 'idle', 'a zero-direction dash must not begin');
  expect(zeroDash.dashCooldownSeconds === 0, 'a zero-direction dash must not consume cooldown');

  const preClampDashState = createFightingState();
  const preClampDash = preClampDashState.combatants[0]!;
  preClampDash.velocityX = 500;
  queueAction(preClampDashState, 'dash', { dashMoveX: 1, dashMoveY: 0 });
  step(preClampDashState);
  step(preClampDashState);
  step(preClampDashState);
  expect(
    Math.abs(preClampDash.velocityX - Balance.CHARACTER_MAX_TOTAL_SPEED) < 0.000001,
    'a dash impulse must reach movement drag before the shared global clamp',
  );

  const dashState = createFightingState();
  const dash = dashState.combatants[0]!;
  queueAction(dashState, 'dash', { dashMoveX: 1, dashMoveY: 0 });
  advance(dashState, dash.profile.dash.startupSeconds);
  const forwardVelocity = dash.velocityX;
  expect(forwardVelocity > 0, 'an active same-direction dash must add forward shared velocity');
  advance(dashState, actionTotalSeconds(dash.profile.dash));
  advance(dashState, dash.dashCooldownSeconds);
  queueAction(dashState, 'dash', { dashMoveX: -1, dashMoveY: 0 });
  advance(dashState, dash.profile.dash.startupSeconds);
  expect(dash.velocityX < 0, 'a reverse dash must cancel prior momentum before reversing it');

  const guardMotionState = createFightingState();
  const guardMotion = guardMotionState.combatants[0]!;
  step(guardMotionState, { guard: true, moveX: 1 });
  const guardedVelocity = guardMotion.velocityX;
  const unguardedState = createFightingState();
  const unguarded = unguardedState.combatants[0]!;
  step(unguardedState, { moveX: 1 });
  expect(
    guardedVelocity > 0 && guardedVelocity < unguarded.velocityX,
    'guard movement must use the configured acceleration multiplier',
  );

  const counterState = createFightingState();
  const counter = counterState.combatants[0]!;
  counter.counterRemainingSeconds = 10;
  queueAction(counterState, 'skill');
  expect(counter.counterRemainingSeconds > 0, 'a skill must not consume a live counter');
  advance(counterState, actionTotalSeconds(counter.profile.skill));
  advance(counterState, counter.skillCooldownSeconds);
  queueAction(counterState, 'attack');
  expect(counter.counterRemainingSeconds === 0, 'an accepted attack must consume a live counter');

  const staggeredState = createFightingState();
  const staggered = staggeredState.combatants[0]!;
  staggered.actionState = 'staggered';
  staggered.actionRemainingSeconds = 1;
  step(staggeredState, { guard: true, moveX: 1, queuedAction: 'attack', actionAimStep: 32 });
  expect(staggered.actionState === 'staggered', 'staggered combatants must reject action and guard starts');
  expect(staggered.velocityX > 0, 'staggered combatants must retain movement input');

  const frozenState = createFightingState();
  const frozen = frozenState.combatants[0]!;
  frozenState.resetFreezeRemainingSeconds = 1;
  frozen.velocityX = 99;
  step(frozenState, { guard: true, moveX: 1, queuedAction: 'attack', actionAimStep: 32 });
  expect(frozen.actionState === 'idle', 'reset-frozen combatants must reject action and guard starts');
  expect(frozen.velocityX === 0 && frozen.velocityY === 0, 'reset-frozen combatants must hold zero velocity');

  const latestActionState = createFightingState();
  const latest = latestActionState.combatants[0]!;
  step(latestActionState, { queuedAction: 'skill', actionAimStep: 96 });
  expect(latest.actionState === 'skill', 'the received queued action must start once per tick');
  expect(latest.actionAimStep === 96, 'one tick must retain only the provided latest action snapshot');

  expect(
    (() => {
      try {
        step(createFightingState(), { aimStep: 256 });
        return false;
      } catch {
        return true;
      }
    })(),
    'invalid aim steps must throw at the simulation boundary',
  );

  expect(
    (() => {
      try {
        const readyState = createCharacterBattleState(definitions, 20260728);
        stepCharacterBattle(
          readyState,
          [commandFor(readyState, 0, { actionAimStep: 256 }), commandFor(readyState, 1)],
          DELTA_SECONDS,
        );
        return false;
      } catch {
        return true;
      }
    })(),
    'invalid action aim steps must throw before a non-fighting phase can ignore them',
  );

  const frontalGuardState = prepareHitState();
  const frontalGuardAttacker = frontalGuardState.combatants[0]!;
  const frontalGuardDefender = frontalGuardState.combatants[1]!;
  frontalGuardDefender.actionState = 'guarding';
  const frontalHealth = frontalGuardDefender.health;
  expect(isWithinGuardCone(frontalGuardDefender, frontalGuardAttacker), 'the defender must recognize a frontal attacker');
  applyCharacterHit(frontalGuardState, 0, 1, 'attack');
  expect(frontalGuardDefender.health === frontalHealth, 'a frontal guard must block normal health damage');
  expect(frontalGuardDefender.velocityX === 0 && frontalGuardDefender.velocityY === 0, 'a frontal guard must block normal knockback');
  assertClose(
    frontalGuardDefender.counterRemainingSeconds,
    Balance.CHARACTER_BASE_COUNTER_WINDOW_SECONDS,
    'a frontal guard must grant one counter window',
  );
  frontalGuardDefender.counterRemainingSeconds = 0.2;
  frontalGuardDefender.counterIsReinforced = true;
  applyCharacterHit(frontalGuardState, 0, 1, 'skill');
  assertClose(
    frontalGuardDefender.counterRemainingSeconds,
    Balance.CHARACTER_BASE_COUNTER_WINDOW_SECONDS,
    'a later successful guard must refresh instead of stack its counter window',
  );
  expect(frontalGuardDefender.counterIsReinforced === frontalGuardDefender.grantsReinforcedCounter, 'a guard refresh must take the current reinforcement flag');
  expect(frontalGuardDefender.health === frontalHealth, 'a frontal guard must block skill health damage');
  expect(frontalGuardDefender.velocityX === 0 && frontalGuardDefender.velocityY === 0, 'a frontal guard must block skill knockback');

  const rearGuardState = prepareHitState();
  const rearGuardAttacker = rearGuardState.combatants[0]!;
  const rearGuardDefender = rearGuardState.combatants[1]!;
  rearGuardAttacker.positionX = 80;
  rearGuardDefender.actionState = 'guarding';
  expect(!isWithinGuardCone(rearGuardDefender, rearGuardAttacker), 'the rear attacker must fall outside the guard cone');
  applyCharacterHit(rearGuardState, 0, 1, 'skill');
  expect(rearGuardDefender.health < rearGuardDefender.stats.healthMaximum, 'a rear skill must bypass guard health blocking');
  expect(Math.hypot(rearGuardDefender.velocityX, rearGuardDefender.velocityY) > 0, 'a rear skill must bypass guard knockback blocking');

  const dashGuardState = prepareHitState();
  const dashGuardAttacker = dashGuardState.combatants[0]!;
  const dashGuardDefender = dashGuardState.combatants[1]!;
  dashGuardAttacker.positionX = 80;
  dashGuardDefender.actionState = 'guarding';
  dashGuardDefender.counterRemainingSeconds = 0.4;
  dashGuardDefender.counterIsReinforced = true;
  const dashHealth = dashGuardDefender.health;
  applyCharacterHit(dashGuardState, 0, 1, 'dash');
  expect(dashGuardDefender.health === dashHealth - dashGuardAttacker.profile.dash.healthDamage, 'a dash must deal ordinary health damage through guard');
  assertClose(
    Math.hypot(dashGuardDefender.velocityX, dashGuardDefender.velocityY),
    dashGuardAttacker.profile.dash.knockback * Balance.CHARACTER_GUARD_BREAK_KNOCKBACK_MULTIPLIER,
    'a guarded dash must apply the configured amplified knockback at any angle',
  );
  expect(dashGuardDefender.actionState === 'guarding', 'a guarded dash must retain the held guard state');
  assertClose(dashGuardDefender.counterRemainingSeconds, 0.4, 'a guarded dash must not create or refresh a counter');
  expect(dashGuardDefender.counterIsReinforced, 'a guarded dash must not alter the existing counter flag');

  const counterExpiryState = createFightingState();
  const counterExpiry = counterExpiryState.combatants[0]!;
  counterExpiry.counterRemainingSeconds = Balance.CHARACTER_BASE_COUNTER_WINDOW_SECONDS;
  counterExpiry.counterIsReinforced = true;
  for (let tick = 0; tick < Math.ceil(Balance.CHARACTER_BASE_COUNTER_WINDOW_SECONDS / DELTA_SECONDS) + 1; tick += 1) {
    step(counterExpiryState);
  }
  expect(counterExpiry.counterRemainingSeconds === 0, 'an unused counter must expire through fixed ticks');
  expect(!counterExpiry.counterIsReinforced, 'counter expiry must clear reinforcement state');

  const dashCounterState = createFightingState();
  const dashCounter = dashCounterState.combatants[0]!;
  dashCounter.counterRemainingSeconds = 1;
  dashCounter.counterIsReinforced = true;
  queueAction(dashCounterState, 'dash', { dashMoveX: 1, dashMoveY: 0 });
  expect(dashCounter.counterRemainingSeconds > 0 && dashCounter.counterIsReinforced, 'an accepted dash must not consume a counter');

  const singleHitState = prepareHitState();
  const singleHitAttacker = singleHitState.combatants[0]!;
  const singleHitDefender = singleHitState.combatants[1]!;
  step(singleHitState, { queuedAction: 'attack', actionAimStep: 0, aimStep: 0 });
  for (let tick = 0; tick < 30 && !singleHitAttacker.actionHasHit; tick += 1) step(singleHitState);
  expect(singleHitAttacker.actionHasHit, 'an active normal attack must perform its hit test once');
  const healthAfterFirstHit = singleHitDefender.health;
  for (let tick = 0; tick < 20; tick += 1) step(singleHitState);
  expect(singleHitDefender.health === healthAfterFirstHit, 'an action must not apply its hit more than once');

  const reinforcedCounterState = prepareHitState();
  const reinforcedAttacker = reinforcedCounterState.combatants[0]!;
  const reinforcedDefender = reinforcedCounterState.combatants[1]!;
  reinforcedAttacker.activeCounterMultiplier = Balance.CHARACTER_REINFORCED_COUNTER_DAMAGE_MULTIPLIER;
  reinforcedAttacker.activeCounterStagger = true;
  applyCharacterHit(reinforcedCounterState, 0, 1, 'attack');
  expect(reinforcedDefender.actionState === 'staggered', 'only a reinforced normal counter must enter stagger');
  assertClose(
    reinforcedDefender.actionRemainingSeconds,
    Balance.CHARACTER_REINFORCED_COUNTER_STAGGER_SECONDS,
    'a reinforced counter must use the configured stagger duration',
  );
  const ordinaryCounterState = prepareHitState();
  ordinaryCounterState.combatants[0]!.activeCounterMultiplier = Balance.CHARACTER_BASE_COUNTER_DAMAGE_MULTIPLIER;
  applyCharacterHit(ordinaryCounterState, 0, 1, 'attack');
  expect(ordinaryCounterState.combatants[1]!.actionState !== 'staggered', 'a non-reinforced counter must not stagger');

  const ringOutState = createFightingState();
  const ringOutLoser = ringOutState.combatants[1]!;
  ringOutLoser.positionX = Balance.CHARACTER_ARENA_RADIUS + 1;
  const healthBeforeRingOut = ringOutLoser.health;
  resolveCharacterRingOut(ringOutState, 1);
  assertClose(
    ringOutLoser.health,
    healthBeforeRingOut - ringOutLoser.stats.healthMaximum * Balance.CHARACTER_SELF_RING_OUT_PENALTY_RATIO,
    'a non-finishing self ring-out must apply the legacy health penalty ratio',
  );
  expect(ringOutState.resetFreezeRemainingSeconds === Balance.CHARACTER_RESET_FREEZE_SECONDS, 'a non-finishing ring-out must enter reset freeze');
  expect(ringOutState.combatants[0]!.facingAimStep === 0 && ringOutState.combatants[1]!.facingAimStep === 128, 'a ring-out reset must restore spawn-facing aim steps');
  expect(ringOutState.events[0]?.type === 'ringOut' && ringOutState.events[0]?.selfInflicted, 'a self ring-out must emit its event classification');
  const resetSpawnX = ringOutState.combatants[0]!.positionX;
  step(ringOutState, { moveX: 1 });
  expect(ringOutState.combatants[0]!.positionX === resetSpawnX, 'reset freeze after an actual ring-out must reject movement');

  const inflictedRingOutState = createFightingState();
  const inflictedLoser = inflictedRingOutState.combatants[1]!;
  inflictedRingOutState.combatants[0]!.actionHasHit = true;
  inflictedLoser.positionX = Balance.CHARACTER_ARENA_RADIUS + 1;
  const inflictedBefore = inflictedLoser.health;
  resolveCharacterRingOut(inflictedRingOutState, 1);
  const inflictedLoss = inflictedBefore - inflictedLoser.health;
  const selfRingOutState = createFightingState();
  const selfLoser = selfRingOutState.combatants[1]!;
  selfLoser.positionX = Balance.CHARACTER_ARENA_RADIUS + 1;
  const selfBefore = selfLoser.health;
  resolveCharacterRingOut(selfRingOutState, 1);
  const selfLoss = selfBefore - selfLoser.health;
  expect(selfLoss >= inflictedLoss, 'a self ring-out penalty must not be lower than an opponent-inflicted penalty');

  const healthTimeoutState = createFightingState();
  healthTimeoutState.combatants[0]!.health = 90;
  healthTimeoutState.combatants[1]!.health = 40;
  resolveCharacterTimeLimit(healthTimeoutState);
  expect(healthTimeoutState.winnerIndex === 0 && healthTimeoutState.outcome === 'timeLimit', 'timeout must prefer higher health');
  const centerTimeoutState = createFightingState();
  centerTimeoutState.combatants[0]!.positionX = 5;
  centerTimeoutState.combatants[1]!.positionX = 45;
  resolveCharacterTimeLimit(centerTimeoutState);
  expect(centerTimeoutState.winnerIndex === 0 && centerTimeoutState.outcome === 'timeLimit', 'equal-health timeout must prefer the combatant nearer center');
  const drawTimeoutState = createFightingState();
  drawTimeoutState.combatants[0]!.positionX = -10;
  drawTimeoutState.combatants[1]!.positionX = 10;
  resolveCharacterTimeLimit(drawTimeoutState);
  expect(drawTimeoutState.winnerIndex === -1 && drawTimeoutState.outcome === 'draw', 'equal-health and equal-distance timeout must draw');

  const firstScriptedSnapshot = scriptedSnapshot();
  for (let repetition = 0; repetition < 8; repetition += 1) {
    expect(scriptedSnapshot() === firstScriptedSnapshot, `scripted character sequence must be byte-equal on repeat ${repetition + 1}`);
  }
  console.log('Character scripted byte-equal repeats: 8/8 observed');

  console.log(`Character combat cases: ${cases}/${cases} observed`);
}

main();