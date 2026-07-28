# Mouse Aim and Matchup Guard Design

**Status:** Draft · PM design approval recorded 2026-07-28; written-spec review pending.

**Authority:** This document updates the character-arena input and guard contract in `2026-07-28-character-arena-design.md`. It supersedes that document's desktop bindings and guard-resource rules, and it replaces Core Plan Task 2's `J`/`K`/`L` keyboard action mapping. It does not replace the 12-battle run, original-character/IP boundary, deterministic simulation boundary, or local recovery tag.

## 1. Goals and Boundaries

- Keyboard controls character position and velocity only.
- Mouse movement controls character facing and action aim only; it never writes movement axes, position, or velocity.
- The player can move in one direction while aiming, guarding, or attacking in another direction.
- The normal attack is direct input through left click. The weapon skill is direct input through `E`. Guard is held right click. Dash remains `Space` and follows movement input, not aim.
- The spinner game's velocity carry-over is retained as a character-motion property: movement acceleration, dash impulse, and received knockback act on one velocity vector that decays through deterministic drag.
- Guard is an unlimited frontal matchup tool, not a depleting resource. BREAK counters a guarding target through stronger dash knockback; GUARD counters successful defense through a direct-input counterattack.

All numerical constants introduced below belong in `src/game/character/balance.ts` and remain `[UNSUPPORTED]` until character smoke and human-play evidence exist.

## 2. Input Contract

### 2.1 Split ownership

| Control | Owned state | Effect |
|---|---|---|
| `WASD` / arrows | `moveX`, `moveY` | Keyboard-only acceleration request. It is the sole source for character coordinate movement. |
| Mouse move | `aimStep` | Sets facing/aim only from the fighter's current screen origin to the pointer. It never changes `moveX`, `moveY`, position, or velocity. |
| Left click | `attack` | Queues one normal attack and snapshots the current `aimStep`. |
| `E` | `skill` | Queues one weapon skill and snapshots the current `aimStep`. |
| `Space` | `dash` | Queues one dash and snapshots current `moveX`/`moveY`; an all-zero movement snapshot rejects the dash without consuming its cooldown. |
| Right mouse button hold | `guard` | Holds frontal guard toward the latest `aimStep`. Releasing it ends guard. |
| `R` | restart request | Retains the existing post-run restart boundary only. |

`J`, `K`, and `L` are not character action bindings under this contract.

### 2.2 Deterministic aim representation

Raw pointer coordinates remain in `src/app/characterInput.ts`. That boundary receives the current player screen origin from the session/renderer and quantizes the pointer angle to one integer `aimStep` in the inclusive range `0..255`.

```ts
export type AimStep = number; // validated integer 0..255

export interface CharacterInputCommand {
  readonly moveX: Axis;
  readonly moveY: Axis;
  readonly aimStep: AimStep;
  readonly guard: boolean;
  readonly queuedAction: QueuedAction;
  readonly actionAimStep: AimStep;
  readonly dashMoveX: Axis;
  readonly dashMoveY: Axis;
}
```

- The simulation converts an `aimStep` to a direction only on the authoritative host. No mouse coordinates enter `src/game/` or the network protocol.
- Attack and skill use `actionAimStep`, captured at left click or `E` keydown.
- Guard reads the latest `aimStep` while right click remains held.
- Dash reads `dashMoveX`/`dashMoveY`, captured at `Space` keydown. It does not use `aimStep`.
- A mouse event before a valid fighter screen origin is available preserves the last valid `aimStep`; it does not invent a movement direction.

The v2 PvP protocol will validate the integer range and relay these fields as input data. The host remains the only combat simulator.

## 3. Motion, Dash, and Knockback

### 3.1 Shared velocity

Each combatant owns `velocityX` and `velocityY`. On each fixed simulation tick:

1. A non-zero keyboard movement axis adds acceleration after diagonal normalization.
2. Deterministic drag reduces the resulting velocity.
3. Speed clamps prevent diagonal or repeated-impulse acceleration from escaping the character balance bounds.

Mouse aiming is absent from all three operations. Releasing movement retains velocity until drag dissipates it. Opposite movement accelerates against the current vector rather than replacing it.

### 3.2 Dash composition

A valid dash adds a named impulse in the snapshotted keyboard movement direction to the same velocity vector. It never assigns a replacement velocity.

- Same-direction dash raises existing momentum.
- Reverse-direction dash first cancels existing momentum and only moves backward once the added impulse exceeds it.
- A dash cannot start from a zero movement snapshot.
- The dash action still has startup, active, recovery, and cooldown phases; the impulse rule does not bypass them.

### 3.3 Knockback

An attack or dash delivers knockback by adding an impulse to the defender's shared velocity vector. That velocity then dissipates through the same drag as ordinary movement. Therefore a ring-out requires positioning and repeated displacement rather than a permanent knockback state.

## 4. Unlimited Matchup Guard

### 4.1 Base guard

Guard has no maximum, regeneration, overflow, or depletion state. A combatant can hold right click indefinitely while it is neither staggered nor reset-frozen. Guarded movement remains available through keyboard input at `GUARD_MOVE_ACCELERATION_MULTIPLIER`; its initial value is `[UNSUPPORTED]`.

Initial migration constants are `GUARD_MOVE_ACCELERATION_MULTIPLIER = 0.60`, `GUARD_BREAK_KNOCKBACK_MULTIPLIER = 1.60`, `BASE_COUNTER_DAMAGE_MULTIPLIER = 1.35`, `GUARD_REINFORCED_COUNTER_DAMAGE_MULTIPLIER = 1.75`, and `GUARD_REINFORCED_COUNTER_STAGGER_SECONDS = 0.35`. They are `[UNSUPPORTED]` starting values, not inherited spinner measurements.

For a frontal normal attack or weapon skill against a guarding target:

- health damage is `0`;
- delivered knockback is `0`;
- the defender receives one counter opportunity;
- only one counter opportunity can exist at a time.

Rear and side normal/skill hits bypass guard and use their ordinary profiles.

### 4.2 Dash guard-break

When a dash hits a target that is currently guarding, it does not receive normal guard cancellation. The target receives the dash's ordinary health damage plus dash knockback multiplied by `GUARD_BREAK_KNOCKBACK_MULTIPLIER`. This rule applies regardless of front/rear angle so a dash is a clear matchup answer to the guarding state.

The multiplier, dash health damage, drag, and ring-out penalty require character harness evidence and are `[UNSUPPORTED]` values.

### 4.3 Counterattack and GUARD equipment

A counter opportunity is consumed only by the next left-click normal attack. `E` weapon skill does not consume or receive the counter bonus.

- Base counter: direct normal attack receives the named counter damage modifier.
- GUARD completed set: successful guard creates a reinforced counter. Its next left-click attack receives a larger named damage modifier and applies the existing stagger effect for a named duration.
- A counter remains player-triggered; guarding never auto-attacks.

This makes the three routes distinct without requiring hard win-rate targets:

| Route | Player behavior |
|---|---|
| STRIKE | Aim and manually pressure health through normal attacks and weapon skills. |
| BREAK | Use movement-direction dashes to counter guarding targets, create displacement, and accumulate ring-out health penalties. |
| GUARD | Read the opponent's attack direction, block frontal normal/skill pressure, then directly spend the resulting counterattack. |

## 5. State and Resolution Migration

The following former character fields/rules are removed from the new contract:

- `CombatStats.guardMaximum`
- `Combatant.guard`
- `Combatant.guardRegenDelaySeconds`
- guard damage, guard overflow, guard regeneration, and zero-guard stagger
- guard as the second time-limit tiebreaker

`counterRemainingSeconds`, `guarding`, `staggered`, and fixed-tick timers remain. A staggered combatant cannot begin guard, attack, dash, or skill, while movement input remains available.

Time-limit resolution becomes: higher health, then smaller distance from arena center, then draw. The run continues to treat a draw as a loss with no reward.

## 6. Required Evidence

The replacement input/combat smoke must observe at least:

1. mouse movement changes `aimStep` while leaving keyboard movement axes unchanged;
2. left click and `E` snapshot `aimStep`, while right-click guard follows latest `aimStep`;
3. `Space` snapshots movement axes and rejects a zero-direction dash;
4. same-direction dash increases shared velocity; reverse dash cancels momentum before reversing; aim changes do not affect position;
5. guard blocks frontal normal/skill health and knockback, then grants one direct normal counter;
6. rear/side normal or skill bypasses guard;
7. dash against guarding applies the named amplified knockback; unguarded dash retains ordinary knockback;
8. fixed seed plus the same input-frame sequence produces byte-equal serialized output.

Human play must separately inspect keyboard movement/mouse aim separation, reverse-dash feel, guard-break readability, and GUARD counter readability. Those assessments are `[UNSUPPORTED]` until observed.

## 7. Scope and Migration Order

1. Replace the unconnected Task 2 keyboard action boundary (`7148034`) with mouse aim, left-click attack, `E` skill, right-click guard, and movement-snapshotted dash.
2. Migrate character state and the lifecycle/resolution plan before connecting a renderer or session.
3. Convert bot and PvP v2 frames to deterministic `aimStep` only after the local character combat smoke exists.
4. Keep the deployed spinner session unchanged until the character single-player cutover is observed.

No original commercial-IP names, expressions, characters, maps, or assets are introduced by this change.
