import type { RandomState } from '../../engine/random';
import * as Balance from './balance';

export type Axis = -1 | 0 | 1;
export type QueuedAction = 'none' | 'attack' | 'dash' | 'skill';
export type CharacterActionState =
  | 'idle'
  | 'attack'
  | 'dash'
  | 'skill'
  | 'guarding'
  | 'staggered'
  | 'ringOutReset'
  | 'defeated';
export type CharacterBattlePhase = 'ready' | 'fighting' | 'finished';
export type CharacterBattleOutcome = 'none' | 'health' | 'ringOut' | 'timeLimit' | 'draw';

export interface CharacterInputCommand {
  readonly moveX: Axis;
  readonly moveY: Axis;
  readonly guard: boolean;
  readonly queuedAction: QueuedAction;
  readonly actionDirectionX: Axis;
  readonly actionDirectionY: Axis;
}

export const NEUTRAL_CHARACTER_INPUT: CharacterInputCommand = {
  moveX: 0,
  moveY: 0,
  guard: false,
  queuedAction: 'none',
  actionDirectionX: 0,
  actionDirectionY: 0,
};

export interface ActionProfile {
  readonly startupSeconds: number;
  readonly activeSeconds: number;
  readonly recoverySeconds: number;
  readonly cooldownSeconds: number;
  readonly range: number;
  readonly healthDamage: number;
  readonly guardDamage: number;
  readonly knockback: number;
}

export interface CombatProfile {
  readonly normalAttack: ActionProfile;
  readonly dash: ActionProfile;
  readonly skill: ActionProfile;
}

export interface CombatStats {
  readonly healthMaximum: number;
  readonly guardMaximum: number;
  readonly moveAcceleration: number;
  readonly maxMoveSpeed: number;
  readonly radius: number;
}

export const DEFAULT_COMBAT_STATS: CombatStats = {
  healthMaximum: Balance.CHARACTER_DEFAULT_HEALTH_MAXIMUM,
  guardMaximum: Balance.CHARACTER_DEFAULT_GUARD_MAXIMUM,
  moveAcceleration: Balance.CHARACTER_DEFAULT_MOVE_ACCELERATION,
  maxMoveSpeed: Balance.CHARACTER_DEFAULT_MAX_MOVE_SPEED,
  radius: Balance.CHARACTER_DEFAULT_RADIUS,
};

export const DEFAULT_COMBAT_PROFILE: CombatProfile = {
  normalAttack: {
    startupSeconds: Balance.CHARACTER_NORMAL_STARTUP_SECONDS,
    activeSeconds: Balance.CHARACTER_NORMAL_ACTIVE_SECONDS,
    recoverySeconds: Balance.CHARACTER_NORMAL_RECOVERY_SECONDS,
    cooldownSeconds: Balance.CHARACTER_NORMAL_COOLDOWN_SECONDS,
    range: Balance.CHARACTER_NORMAL_RANGE,
    healthDamage: Balance.CHARACTER_NORMAL_HEALTH_DAMAGE,
    guardDamage: Balance.CHARACTER_NORMAL_GUARD_DAMAGE,
    knockback: Balance.CHARACTER_NORMAL_KNOCKBACK,
  },
  dash: {
    startupSeconds: Balance.CHARACTER_DASH_STARTUP_SECONDS,
    activeSeconds: Balance.CHARACTER_DASH_ACTIVE_SECONDS,
    recoverySeconds: Balance.CHARACTER_DASH_RECOVERY_SECONDS,
    cooldownSeconds: Balance.CHARACTER_DASH_COOLDOWN_SECONDS,
    range: Balance.CHARACTER_DASH_RANGE,
    healthDamage: Balance.CHARACTER_DASH_HEALTH_DAMAGE,
    guardDamage: Balance.CHARACTER_DASH_GUARD_DAMAGE,
    knockback: Balance.CHARACTER_DASH_KNOCKBACK,
  },
  skill: {
    startupSeconds: Balance.CHARACTER_SKILL_STARTUP_SECONDS,
    activeSeconds: Balance.CHARACTER_SKILL_ACTIVE_SECONDS,
    recoverySeconds: Balance.CHARACTER_SKILL_RECOVERY_SECONDS,
    cooldownSeconds: Balance.CHARACTER_SKILL_COOLDOWN_SECONDS,
    range: Balance.CHARACTER_SKILL_RANGE,
    healthDamage: Balance.CHARACTER_SKILL_HEALTH_DAMAGE,
    guardDamage: Balance.CHARACTER_SKILL_GUARD_DAMAGE,
    knockback: Balance.CHARACTER_SKILL_KNOCKBACK,
  },
};

export interface Combatant {
  readonly index: number;
  readonly name: string;
  readonly stats: CombatStats;
  readonly profile: CombatProfile;
  positionX: number;
  positionY: number;
  velocityX: number;
  velocityY: number;
  facingX: Axis;
  facingY: Axis;
  health: number;
  guard: number;
  actionState: CharacterActionState;
  actionRemainingSeconds: number;
  normalCooldownSeconds: number;
  dashCooldownSeconds: number;
  skillCooldownSeconds: number;
  guardRegenDelaySeconds: number;
  counterRemainingSeconds: number;
  ringOutCount: number;
  alive: boolean;
}

export interface CharacterBattleEvent {
  readonly type: 'ringOut';
  readonly combatantIndex: number;
  readonly selfInflicted: boolean;
}

export interface CharacterBattleState {
  phase: CharacterBattlePhase;
  phaseElapsedSeconds: number;
  battleElapsedSeconds: number;
  tick: number;
  resetFreezeRemainingSeconds: number;
  combatants: Combatant[];
  random: RandomState;
  hitCooldowns: number[];
  winnerIndex: number;
  outcome: CharacterBattleOutcome;
  finishByRingOut: boolean;
  finishSelfInflicted: boolean;
  events: CharacterBattleEvent[];
}
