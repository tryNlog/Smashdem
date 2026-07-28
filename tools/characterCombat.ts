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

  const zeroDashState = createFightingState();
  const zeroDash = zeroDashState.combatants[0]!;
  queueAction(zeroDashState, 'dash');
  expect(zeroDash.actionState === 'idle', 'a zero-direction dash must not begin');
  expect(zeroDash.dashCooldownSeconds === 0, 'a zero-direction dash must not consume cooldown');

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

  console.log(`Character combat lifecycle cases: ${cases}/${cases} observed`);
}

main();