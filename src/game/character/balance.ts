import {
  ARENA_RADIUS as LEGACY_ARENA_RADIUS,
  FIXED_DELTA_SECONDS as LEGACY_FIXED_DELTA_SECONDS,
  RING_OUT_PENALTY_COEFFICIENT as LEGACY_RING_OUT_PENALTY_RATIO,
  RING_OUT_RESET_FREEZE_SECONDS as LEGACY_RESET_FREEZE_SECONDS,
  ROUND_TIME_LIMIT_SECONDS as LEGACY_ROUND_TIME_LIMIT_SECONDS,
  SELF_RING_OUT_PENALTY_COEFFICIENT as LEGACY_SELF_RING_OUT_PENALTY_RATIO,
  SPAWN_DISTANCE_FROM_CENTER as LEGACY_SPAWN_DISTANCE_FROM_CENTER,
} from '../balance';

/** Explicit migration inputs. Character simulation must import this module, not legacy balance. */
export const CHARACTER_FIXED_DELTA_SECONDS = LEGACY_FIXED_DELTA_SECONDS;
export const CHARACTER_ARENA_RADIUS = LEGACY_ARENA_RADIUS;
export const CHARACTER_ROUND_TIME_LIMIT_SECONDS = LEGACY_ROUND_TIME_LIMIT_SECONDS;
export const CHARACTER_RING_OUT_PENALTY_RATIO = LEGACY_RING_OUT_PENALTY_RATIO;
export const CHARACTER_SELF_RING_OUT_PENALTY_RATIO = LEGACY_SELF_RING_OUT_PENALTY_RATIO;
export const CHARACTER_SPAWN_DISTANCE_FROM_CENTER = LEGACY_SPAWN_DISTANCE_FROM_CENTER;
export const CHARACTER_RESET_FREEZE_SECONDS = LEGACY_RESET_FREEZE_SECONDS;
export const CHARACTER_GUARD_CONE_COSINE = Math.SQRT1_2;

/** Initial character-core defaults. Their suitability requires character-harness measurement. */
export const CHARACTER_DEFAULT_HEALTH_MAXIMUM = 100;
export const CHARACTER_DEFAULT_MOVE_ACCELERATION = 480;
export const CHARACTER_DEFAULT_MAX_MOVE_SPEED = 220;
export const CHARACTER_DEFAULT_RADIUS = 24;

export const CHARACTER_NORMAL_STARTUP_SECONDS = 0.08;
export const CHARACTER_NORMAL_ACTIVE_SECONDS = 0.1;
export const CHARACTER_NORMAL_RECOVERY_SECONDS = 0.22;
export const CHARACTER_NORMAL_COOLDOWN_SECONDS = 0.35;
export const CHARACTER_NORMAL_RANGE = 58;
export const CHARACTER_NORMAL_HEALTH_DAMAGE = 8;
export const CHARACTER_NORMAL_KNOCKBACK = 180;

export const CHARACTER_DASH_STARTUP_SECONDS = 0.04;
export const CHARACTER_DASH_ACTIVE_SECONDS = 0.14;
export const CHARACTER_DASH_RECOVERY_SECONDS = 0.28;
export const CHARACTER_DASH_COOLDOWN_SECONDS = 0.8;
export const CHARACTER_DASH_RANGE = 92;
export const CHARACTER_DASH_HEALTH_DAMAGE = 10;
export const CHARACTER_DASH_KNOCKBACK = 320;

export const CHARACTER_SKILL_STARTUP_SECONDS = 0.16;
export const CHARACTER_SKILL_ACTIVE_SECONDS = 0.18;
export const CHARACTER_SKILL_RECOVERY_SECONDS = 0.36;
export const CHARACTER_SKILL_COOLDOWN_SECONDS = 2;
export const CHARACTER_SKILL_RANGE = 76;
export const CHARACTER_SKILL_HEALTH_DAMAGE = 16;
export const CHARACTER_SKILL_KNOCKBACK = 240;

// [UNSUPPORTED] starting value; spec §4.1 character harness and human-play evidence required.
export const CHARACTER_GUARD_MOVE_ACCELERATION_MULTIPLIER = 0.6;
// [UNSUPPORTED] starting value; spec §4.2 character harness and human-play evidence required.
export const CHARACTER_GUARD_BREAK_KNOCKBACK_MULTIPLIER = 1.6;
// [UNSUPPORTED] starting value; spec §4.1 character harness and human-play evidence required.
export const CHARACTER_BASE_COUNTER_DAMAGE_MULTIPLIER = 1.35;
// [UNSUPPORTED] starting value; spec §4.1 character harness and human-play evidence required.
export const CHARACTER_REINFORCED_COUNTER_DAMAGE_MULTIPLIER = 1.75;
// [UNSUPPORTED] starting value; spec §4.1 character harness and human-play evidence required.
export const CHARACTER_REINFORCED_COUNTER_STAGGER_SECONDS = 0.35;
// [UNSUPPORTED] starting value; spec §8.3 character harness and human-play evidence required.
export const CHARACTER_BASE_COUNTER_WINDOW_SECONDS = 0.8;
// [UNSUPPORTED] starting value; attack and skill hit arc around actionAimStep requires character evidence.
export const CHARACTER_ATTACK_ARC_COSINE = Math.SQRT1_2;
// [UNSUPPORTED] starting value; spec §3.1 deterministic drag requires character evidence.
export const CHARACTER_MOVE_DRAG_PER_SECOND = 3.5;
// [UNSUPPORTED] starting value; spec §3.2 dash impulse requires character evidence.
export const CHARACTER_DASH_IMPULSE = 420;
// [UNSUPPORTED] starting value; spec §3.1 global velocity clamp requires character evidence.
export const CHARACTER_MAX_TOTAL_SPEED = 640;