import { cloneRandomState, createRandomState } from '../../engine/random';
import * as Balance from './balance';
import type {
  AimStep,
  CharacterBattleState,
  Combatant,
  CombatProfile,
  CombatStats,
} from './types';

export interface CombatantDefinition {
  readonly name: string;
  readonly stats: CombatStats;
  readonly profile: CombatProfile;
}

const SPAWN_AIM_STEPS = [0, 128] as const;

function requireTwoCombatants(combatants: readonly Combatant[]): void {
  if (combatants.length !== 2) {
    throw new Error('character battle state requires exactly two combatants');
  }
}

function spawnPositionDirection(index: number): -1 | 1 {
  if (index === 0) return -1;
  if (index === 1) return 1;
  throw new Error('character battle state requires combatant index 0 or 1');
}

function spawnAimStep(index: number): AimStep {
  const aimStep = SPAWN_AIM_STEPS[index];
  if (aimStep === undefined) {
    throw new Error('character battle state requires combatant index 0 or 1');
  }
  return aimStep;
}

function createCombatant(index: number, definition: CombatantDefinition): Combatant {
  const aimStep = spawnAimStep(index);

  return {
    index,
    name: definition.name,
    stats: definition.stats,
    profile: definition.profile,
    positionX: 0,
    positionY: 0,
    velocityX: 0,
    velocityY: 0,
    facingAimStep: aimStep,
    health: definition.stats.healthMaximum,
    actionState: 'idle',
    actionRemainingSeconds: 0,
    actionAimStep: aimStep,
    dashDirectionX: 0,
    dashDirectionY: 0,
    dashImpulsePending: false,
    actionHasHit: false,
    normalCooldownSeconds: 0,
    dashCooldownSeconds: 0,
    skillCooldownSeconds: 0,
    counterRemainingSeconds: 0,
    counterIsReinforced: false,
    grantsReinforcedCounter: false,
    activeCounterMultiplier: 1,
    activeCounterStagger: false,
    ringOutCount: 0,
    alive: true,
  };
}

/** Positions exactly two combatants on deterministic, opposing central spawn points. */
export function positionCombatantsAtSpawn(combatants: readonly Combatant[]): void {
  requireTwoCombatants(combatants);

  for (let index = 0; index < combatants.length; index += 1) {
    const combatant = combatants[index]!;
    combatant.positionX = spawnPositionDirection(index) * Balance.CHARACTER_SPAWN_DISTANCE_FROM_CENTER;
    combatant.positionY = 0;
    combatant.velocityX = 0;
    combatant.velocityY = 0;
    combatant.facingAimStep = spawnAimStep(index);
    combatant.actionAimStep = combatant.facingAimStep;
  }
}

export function createCharacterBattleState(
  definitions: readonly CombatantDefinition[],
  seed: number,
): CharacterBattleState {
  if (definitions.length !== 2) {
    throw new Error('character battle state requires exactly two combatant definitions');
  }

  const combatants = definitions.map((definition, index) => createCombatant(index, definition));
  positionCombatantsAtSpawn(combatants);

  return {
    phase: 'ready',
    phaseElapsedSeconds: 0,
    battleElapsedSeconds: 0,
    tick: 0,
    resetFreezeRemainingSeconds: 0,
    combatants,
    random: createRandomState(seed),
    winnerIndex: -1,
    outcome: 'none',
    finishByRingOut: false,
    finishSelfInflicted: false,
    events: [],
  };
}

export function cloneCharacterBattleState(state: CharacterBattleState): CharacterBattleState {
  return {
    phase: state.phase,
    phaseElapsedSeconds: state.phaseElapsedSeconds,
    battleElapsedSeconds: state.battleElapsedSeconds,
    tick: state.tick,
    resetFreezeRemainingSeconds: state.resetFreezeRemainingSeconds,
    combatants: state.combatants.map((combatant) => ({ ...combatant })),
    random: cloneRandomState(state.random),
    winnerIndex: state.winnerIndex,
    outcome: state.outcome,
    finishByRingOut: state.finishByRingOut,
    finishSelfInflicted: state.finishSelfInflicted,
    events: state.events.map((event) => ({ ...event })),
  };
}