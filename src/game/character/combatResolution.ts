import * as Balance from './balance';
import { aimStepToUnit } from './aim';
import { positionCombatantsAtSpawn } from './battleState';
import type { ActionProfile, CharacterBattleOutcome, CharacterBattleState, Combatant } from './types';

export type CharacterHitKind = 'attack' | 'dash' | 'skill';

function profileForHit(combatant: Combatant, kind: CharacterHitKind): ActionProfile {
  switch (kind) {
    case 'attack':
      return combatant.profile.normalAttack;
    case 'dash':
      return combatant.profile.dash;
    case 'skill':
      return combatant.profile.skill;
  }
}

function clampTotalSpeed(combatant: Combatant): void {
  const speed = Math.hypot(combatant.velocityX, combatant.velocityY);
  if (speed <= Balance.CHARACTER_MAX_TOTAL_SPEED || speed === 0) return;
  const scale = Balance.CHARACTER_MAX_TOTAL_SPEED / speed;
  combatant.velocityX *= scale;
  combatant.velocityY *= scale;
}

function finishCharacterBattle(
  state: CharacterBattleState,
  winnerIndex: number,
  outcome: CharacterBattleOutcome,
  finishByRingOut = false,
  finishSelfInflicted = false,
): void {
  state.phase = 'finished';
  state.winnerIndex = winnerIndex;
  state.outcome = outcome;
  state.finishByRingOut = finishByRingOut;
  state.finishSelfInflicted = finishSelfInflicted;
}

function defeatFromHealth(state: CharacterBattleState, defender: Combatant, attacker: Combatant): void {
  if (defender.health > 0) return;
  defender.health = 0;
  defender.alive = false;
  defender.actionState = 'defeated';
  defender.actionRemainingSeconds = 0;
  finishCharacterBattle(state, attacker.index, 'health');
}

function resetCombatantForRingOut(combatant: Combatant): void {
  combatant.actionState = 'ringOutReset';
  combatant.actionRemainingSeconds = 0;
  combatant.dashDirectionX = 0;
  combatant.dashDirectionY = 0;
  combatant.dashImpulsePending = false;
  combatant.actionHasHit = false;
  combatant.normalCooldownSeconds = 0;
  combatant.dashCooldownSeconds = 0;
  combatant.skillCooldownSeconds = 0;
  combatant.counterRemainingSeconds = 0;
  combatant.counterIsReinforced = false;
  combatant.activeCounterMultiplier = 1;
  combatant.activeCounterStagger = false;
}

function resetAfterRingOut(state: CharacterBattleState): void {
  positionCombatantsAtSpawn(state.combatants);
  for (const combatant of state.combatants) resetCombatantForRingOut(combatant);
  state.resetFreezeRemainingSeconds = Balance.CHARACTER_RESET_FREEZE_SECONDS;
}

function currentHitInflictor(state: CharacterBattleState, defenderIndex: number): Combatant | null {
  for (const combatant of state.combatants) {
    if (combatant.index !== defenderIndex && combatant.actionHasHit) return combatant;
  }
  return null;
}

function closestToCenterIndex(combatants: readonly Combatant[]): number {
  let winnerIndex = -1;
  let bestDistance = Infinity;
  let tied = false;
  for (const combatant of combatants) {
    const distance = Math.hypot(combatant.positionX, combatant.positionY);
    if (distance < bestDistance) {
      bestDistance = distance;
      winnerIndex = combatant.index;
      tied = false;
    } else if (distance === bestDistance) {
      tied = true;
    }
  }
  return tied ? -1 : winnerIndex;
}

/** Returns whether the attacker is inside the defender's 90-degree frontal guard cone. */
export function isWithinGuardCone(defender: Combatant, attacker: Combatant): boolean {
  const dx = attacker.positionX - defender.positionX;
  const dy = attacker.positionY - defender.positionY;
  const length = Math.hypot(dx, dy);
  if (length === 0) return true;
  const facing = aimStepToUnit(defender.facingAimStep);
  return (facing.x * dx + facing.y * dy) / length >= Balance.CHARACTER_GUARD_CONE_COSINE;
}

/** Applies one already-confirmed active-action hit through guard, counter, and shared velocity rules. */
export function applyCharacterHit(
  state: CharacterBattleState,
  attackerIndex: number,
  defenderIndex: number,
  kind: CharacterHitKind,
): void {
  if (state.phase !== 'fighting') return;
  const attacker = state.combatants[attackerIndex];
  const defender = state.combatants[defenderIndex];
  if (attacker === undefined || defender === undefined || !attacker.alive || !defender.alive) return;

  if (defender.actionState === 'guarding' && kind !== 'dash' && isWithinGuardCone(defender, attacker)) {
    defender.counterRemainingSeconds = Balance.CHARACTER_BASE_COUNTER_WINDOW_SECONDS;
    defender.counterIsReinforced = defender.grantsReinforcedCounter;
    return;
  }

  const profile = profileForHit(attacker, kind);
  const damageMultiplier = kind === 'attack' ? attacker.activeCounterMultiplier : 1;
  defender.health = Math.max(0, defender.health - profile.healthDamage * damageMultiplier);

  const dx = defender.positionX - attacker.positionX;
  const dy = defender.positionY - attacker.positionY;
  const length = Math.hypot(dx, dy);
  const direction = length === 0
    ? aimStepToUnit(attacker.facingAimStep)
    : { x: dx / length, y: dy / length };
  const knockbackMultiplier = defender.actionState === 'guarding' && kind === 'dash'
    ? Balance.CHARACTER_GUARD_BREAK_KNOCKBACK_MULTIPLIER
    : 1;
  const impulse = profile.knockback * knockbackMultiplier;
  defender.velocityX += direction.x * impulse;
  defender.velocityY += direction.y * impulse;
  clampTotalSpeed(defender);

  if (kind === 'attack' && attacker.activeCounterStagger && defender.health > 0) {
    defender.actionState = 'staggered';
    defender.actionRemainingSeconds = Balance.CHARACTER_REINFORCED_COUNTER_STAGGER_SECONDS;
  }
  defeatFromHealth(state, defender, attacker);
}

/** Resolves one arena exit. Without a current action hit, the exit is self-inflicted. */
export function resolveCharacterRingOut(state: CharacterBattleState, combatantIndex: number): void {
  if (state.phase !== 'fighting') return;
  const combatant = state.combatants[combatantIndex];
  if (combatant === undefined || !combatant.alive) return;

  const inflictor = currentHitInflictor(state, combatantIndex);
  const selfInflicted = inflictor === null;
  const penaltyRatio = selfInflicted
    ? Math.max(Balance.CHARACTER_SELF_RING_OUT_PENALTY_RATIO, Balance.CHARACTER_RING_OUT_PENALTY_RATIO)
    : Balance.CHARACTER_RING_OUT_PENALTY_RATIO;
  combatant.health = Math.max(0, combatant.health - combatant.stats.healthMaximum * penaltyRatio);
  combatant.ringOutCount += 1;
  state.events.push({ type: 'ringOut', combatantIndex, selfInflicted });

  if (combatant.health === 0) {
    combatant.alive = false;
    combatant.actionState = 'defeated';
    combatant.actionRemainingSeconds = 0;
    finishCharacterBattle(state, inflictor?.index ?? (combatantIndex === 0 ? 1 : 0), 'ringOut', true, selfInflicted);
    return;
  }

  resetAfterRingOut(state);
}

/** Resolves a 90-second tie-break: health, then center distance, then draw. */
export function resolveCharacterTimeLimit(state: CharacterBattleState): void {
  if (state.phase !== 'fighting') return;
  const first = state.combatants[0];
  const second = state.combatants[1];
  if (first === undefined || second === undefined) return;

  if (first.health !== second.health) {
    finishCharacterBattle(state, first.health > second.health ? first.index : second.index, 'timeLimit');
    return;
  }

  const winnerIndex = closestToCenterIndex(state.combatants);
  finishCharacterBattle(state, winnerIndex, winnerIndex < 0 ? 'draw' : 'timeLimit');
}
