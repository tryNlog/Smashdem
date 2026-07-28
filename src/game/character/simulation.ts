import * as Balance from './balance';
import { isValidAimStep } from './aim';
import type {
  ActionProfile,
  CharacterActionState,
  CharacterBattleState,
  CharacterInputCommand,
  Combatant,
  QueuedAction,
} from './types';

export type ActionPhase = 'startup' | 'active' | 'recovery' | 'none';

function profileForAction(
  combatant: Combatant,
  action: CharacterActionState | QueuedAction,
): ActionProfile | null {
  switch (action) {
    case 'attack':
      return combatant.profile.normalAttack;
    case 'dash':
      return combatant.profile.dash;
    case 'skill':
      return combatant.profile.skill;
    default:
      return null;
  }
}

export function actionTotalSeconds(profile: ActionProfile): number {
  return profile.startupSeconds + profile.activeSeconds + profile.recoverySeconds;
}

export function actionPhase(combatant: Combatant): ActionPhase {
  const profile = profileForAction(combatant, combatant.actionState);
  if (profile === null || combatant.actionRemainingSeconds <= 0) return 'none';

  if (combatant.actionRemainingSeconds > profile.activeSeconds + profile.recoverySeconds) {
    return 'startup';
  }
  if (combatant.actionRemainingSeconds > profile.recoverySeconds) return 'active';
  return 'recovery';
}

function clampSpeed(combatant: Combatant, maximum: number): void {
  const speed = Math.hypot(combatant.velocityX, combatant.velocityY);
  if (speed <= maximum || speed === 0) return;
  const scale = maximum / speed;
  combatant.velocityX *= scale;
  combatant.velocityY *= scale;
}

function clearCompletedAction(combatant: Combatant): void {
  combatant.actionState = 'idle';
  combatant.actionRemainingSeconds = 0;
  combatant.dashDirectionX = 0;
  combatant.dashDirectionY = 0;
  combatant.dashImpulsePending = false;
  combatant.actionHasHit = false;
  combatant.activeCounterMultiplier = 1;
  combatant.activeCounterStagger = false;
}

function decrementTimer(value: number, deltaSeconds: number): number {
  return Math.max(0, value - deltaSeconds);
}

function tickCombatantTimers(combatant: Combatant, deltaSeconds: number): void {
  combatant.normalCooldownSeconds = decrementTimer(combatant.normalCooldownSeconds, deltaSeconds);
  combatant.dashCooldownSeconds = decrementTimer(combatant.dashCooldownSeconds, deltaSeconds);
  combatant.skillCooldownSeconds = decrementTimer(combatant.skillCooldownSeconds, deltaSeconds);

  const counterWasLive = combatant.counterRemainingSeconds > 0;
  combatant.counterRemainingSeconds = decrementTimer(combatant.counterRemainingSeconds, deltaSeconds);
  if (counterWasLive && combatant.counterRemainingSeconds === 0) {
    combatant.counterIsReinforced = false;
  }

  if (
    combatant.actionState !== 'attack' &&
    combatant.actionState !== 'dash' &&
    combatant.actionState !== 'skill' &&
    combatant.actionState !== 'staggered'
  ) {
    return;
  }

  combatant.actionRemainingSeconds = decrementTimer(combatant.actionRemainingSeconds, deltaSeconds);
  if (combatant.actionRemainingSeconds === 0) clearCompletedAction(combatant);
}

function isMovementBlocked(state: CharacterBattleState, combatant: Combatant): boolean {
  return state.resetFreezeRemainingSeconds > 0 || combatant.actionState === 'defeated' || !combatant.alive;
}

function isStartBlocked(state: CharacterBattleState, combatant: Combatant): boolean {
  return (
    state.resetFreezeRemainingSeconds > 0 ||
    combatant.actionState === 'staggered' ||
    combatant.actionState === 'ringOutReset' ||
    combatant.actionState === 'defeated' ||
    !combatant.alive
  );
}

function cooldownForAction(combatant: Combatant, action: QueuedAction): number {
  switch (action) {
    case 'attack':
      return combatant.normalCooldownSeconds;
    case 'dash':
      return combatant.dashCooldownSeconds;
    case 'skill':
      return combatant.skillCooldownSeconds;
    case 'none':
      return 0;
  }
}

function setCooldownForAction(combatant: Combatant, action: QueuedAction, value: number): void {
  switch (action) {
    case 'attack':
      combatant.normalCooldownSeconds = value;
      return;
    case 'dash':
      combatant.dashCooldownSeconds = value;
      return;
    case 'skill':
      combatant.skillCooldownSeconds = value;
      return;
    case 'none':
      return;
  }
}

function normalizeDashDirection(moveX: number, moveY: number): { readonly x: number; readonly y: number } {
  const length = Math.hypot(moveX, moveY);
  return { x: moveX / length, y: moveY / length };
}

function beginAction(combatant: Combatant, command: CharacterInputCommand): void {
  const action = command.queuedAction;
  if (action === 'none') return;
  const profile = profileForAction(combatant, action);
  if (profile === null) return;

  combatant.actionState = action;
  combatant.actionRemainingSeconds = actionTotalSeconds(profile);
  combatant.actionHasHit = false;
  combatant.activeCounterMultiplier = 1;
  combatant.activeCounterStagger = false;
  setCooldownForAction(combatant, action, profile.cooldownSeconds);

  if (action === 'dash') {
    const direction = normalizeDashDirection(command.dashMoveX, command.dashMoveY);
    combatant.dashDirectionX = direction.x;
    combatant.dashDirectionY = direction.y;
    combatant.dashImpulsePending = true;
    return;
  }

  combatant.actionAimStep = command.actionAimStep;
  combatant.dashDirectionX = 0;
  combatant.dashDirectionY = 0;
  combatant.dashImpulsePending = false;

  if (action === 'attack' && combatant.counterRemainingSeconds > 0) {
    combatant.activeCounterMultiplier = combatant.counterIsReinforced
      ? Balance.CHARACTER_REINFORCED_COUNTER_DAMAGE_MULTIPLIER
      : Balance.CHARACTER_BASE_COUNTER_DAMAGE_MULTIPLIER;
    combatant.activeCounterStagger = combatant.counterIsReinforced;
    combatant.counterRemainingSeconds = 0;
    combatant.counterIsReinforced = false;
  }
}

function validateCommandAim(command: CharacterInputCommand, combatantIndex: number): void {
  if (!isValidAimStep(command.aimStep) || !isValidAimStep(command.actionAimStep)) {
    throw new Error(`character command has invalid aim step for combatant ${combatantIndex}`);
  }
}

function applyInput(
  state: CharacterBattleState,
  combatant: Combatant,
  command: CharacterInputCommand,
): void {
  validateCommandAim(command, combatant.index);
  combatant.facingAimStep = command.aimStep;
  if (isStartBlocked(state, combatant)) return;

  const canStartAction = combatant.actionState === 'idle' || combatant.actionState === 'guarding';
  const action = command.queuedAction;
  if (action !== 'none' && canStartAction && cooldownForAction(combatant, action) <= 0) {
    if (action !== 'dash' || command.dashMoveX !== 0 || command.dashMoveY !== 0) {
      beginAction(combatant, command);
      return;
    }
  }

  if (combatant.actionState === 'idle' && command.guard) {
    combatant.actionState = 'guarding';
  } else if (combatant.actionState === 'guarding' && !command.guard) {
    combatant.actionState = 'idle';
  }
}

function applyDashImpulses(state: CharacterBattleState): void {
  for (const combatant of state.combatants) {
    if (combatant.actionState !== 'dash' || actionPhase(combatant) !== 'active' || !combatant.dashImpulsePending) {
      continue;
    }

    combatant.velocityX += combatant.dashDirectionX * Balance.CHARACTER_DASH_IMPULSE;
    combatant.velocityY += combatant.dashDirectionY * Balance.CHARACTER_DASH_IMPULSE;
    // Movement applies drag and the shared global clamp after this hit-phase impulse.
    combatant.dashImpulsePending = false;
  }

  // Task 4 owns action hit tests and their health, knockback, ring-out, and timeout resolution.
}

function applyMovement(
  state: CharacterBattleState,
  combatant: Combatant,
  command: CharacterInputCommand,
  deltaSeconds: number,
): void {
  if (isMovementBlocked(state, combatant)) {
    combatant.velocityX = 0;
    combatant.velocityY = 0;
    return;
  }

  if (command.moveX !== 0 || command.moveY !== 0) {
    const length = Math.hypot(command.moveX, command.moveY);
    const beforeSpeed = Math.hypot(combatant.velocityX, combatant.velocityY);
    const acceleration =
      combatant.stats.moveAcceleration *
      (combatant.actionState === 'guarding' ? Balance.CHARACTER_GUARD_MOVE_ACCELERATION_MULTIPLIER : 1);
    combatant.velocityX += (command.moveX / length) * acceleration * deltaSeconds;
    combatant.velocityY += (command.moveY / length) * acceleration * deltaSeconds;
    clampSpeed(combatant, Math.max(beforeSpeed, combatant.stats.maxMoveSpeed));
  }

  const dragFactor = Math.max(0, 1 - Balance.CHARACTER_MOVE_DRAG_PER_SECOND * deltaSeconds);
  combatant.velocityX *= dragFactor;
  combatant.velocityY *= dragFactor;
  clampSpeed(combatant, Balance.CHARACTER_MAX_TOTAL_SPEED);
  combatant.positionX += combatant.velocityX * deltaSeconds;
  combatant.positionY += combatant.velocityY * deltaSeconds;
}

function requireInputs(state: CharacterBattleState, inputs: readonly CharacterInputCommand[]): void {
  if (inputs.length !== state.combatants.length) {
    throw new Error('character battle requires one input command per combatant');
  }
}

/** Advances one deterministic character-combat tick in place and returns the same state reference. */
export function stepCharacterBattle(
  state: CharacterBattleState,
  inputs: readonly CharacterInputCommand[],
  deltaSeconds: number,
): CharacterBattleState {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new Error('character battle requires a finite non-negative deltaSeconds');
  }
  requireInputs(state, inputs);

  // 1. Tick bookkeeping and battle clocks.
  state.events.length = 0;
  state.tick += 1;
  state.phaseElapsedSeconds += deltaSeconds;
  if (state.phase === 'fighting') state.battleElapsedSeconds += deltaSeconds;
  if (state.phase !== 'fighting') {
    for (let index = 0; index < state.combatants.length; index += 1) {
      validateCommandAim(inputs[index]!, state.combatants[index]!.index);
    }
    return state;
  }

  // 2. Timer phase: combatants are processed in stable index order.
  if (state.resetFreezeRemainingSeconds > 0) {
    state.resetFreezeRemainingSeconds = decrementTimer(state.resetFreezeRemainingSeconds, deltaSeconds);
  }
  for (const combatant of state.combatants) tickCombatantTimers(combatant, deltaSeconds);

  // 3. Input phase: validated aim is authoritative, then action/guard transitions.
  for (let index = 0; index < state.combatants.length; index += 1) {
    applyInput(state, state.combatants[index]!, inputs[index]!);
  }

  // 4. Hit phase: Task 3 only gives an active dash its shared velocity impulse.
  applyDashImpulses(state);

  // 5. Movement phase: acceleration, drag, clamps, then position integration.
  for (let index = 0; index < state.combatants.length; index += 1) {
    applyMovement(state, state.combatants[index]!, inputs[index]!, deltaSeconds);
  }

  // 6. Ring-out and time-limit resolution is intentionally deferred to Task 4.
  return state;
}
