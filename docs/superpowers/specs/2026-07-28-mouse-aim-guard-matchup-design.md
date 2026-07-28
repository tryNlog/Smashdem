# Mouse Aim and Matchup Guard Design

**Status:** PM-approved 2026-07-28 · written-spec review reconciled in §8; follow-up amendments applied to §8.1 (reset-freeze movement) and §8.6 (explicit bot decision order).

**Authority:** This document updates the character-arena input and guard contract in `2026-07-28-character-arena-design.md`. It supersedes that document's desktop bindings, guard-resource rules, guard-specific bot order, guard-specific equipment effects, guard time-limit tiebreaker, and guard acceptance evidence. It supersedes Core Plan Tasks 2–4 where their input interface, guard state, guard smoke, or timeout rules differ, the corresponding single-player equipment/bot/render rules, and PvP v2 input-frame shape. It does not replace the 12-battle run, original-character/IP boundary, deterministic simulation boundary, or local recovery tag. **Within this document, §8 is the normative reconciliation section when an earlier paragraph is ambiguous.**

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

## 8. Review Reconciliation (Normative)

This section resolves the written-spec review findings dated 2026-07-28. It governs over conflicting wording in §§2–7 and the dependency documents named in the authority paragraph.

### 8.1 Action priority and guard transitions

`queuedAction` remains one slot. A non-repeated left-click, `E`, or `Space` edge replaces an earlier unconsumed action; the simulation consumes at most one queued action per fixed tick. Right-click is held state only and never competes for that slot.

If a combatant is `guarding` and receives an accepted attack, skill, or valid non-zero-direction dash action, that action ends `guarding` immediately and becomes the active action. It cannot block and begin an action in the same tick. When action recovery ends, a still-held right mouse button re-enters `guarding` on the next eligible fixed tick. Staggered and reset-frozen combatants reject every action and guard start. Keyboard movement remains available only while staggered, per §5; a reset-frozen combatant also rejects movement input and holds zero velocity until the freeze ends, matching the base contract's zero-velocity central reset.

### 8.2 Aim, facing, and frontal geometry

`AimStep` is an integer in `0..255`. Step `0` points world +X/right, `64` points +Y/down, `128` points -X/left, and `192` points -Y/up. The authoritative simulation derives a unit facing direction from that step. `Combatant.facingAimStep` replaces `facingX`/`facingY`; `aimStepToUnit()` is the only combat helper that converts the integer to a direction vector.

A frontal guard retains the former total 90-degree cone: `dot(aimStepToUnit(defender.facingAimStep), directionFromDefenderToAttacker) >= cos(45 degrees)`. Front/rear/side references throughout this document use that definition.

A two-combatant factory initializes combatant `0` at aim step `0` and combatant `1` at aim step `128`, so both face their opponent before the first pointer event. The input boundary stores the latest pointer screen coordinate and recomputes `aimStep` on every `consumeCommand()` from that coordinate and the latest supplied fighter screen origin. A stationary pointer therefore still changes aim when the fighter moves. If either coordinate is unavailable, the prior valid `aimStep` remains unchanged.

### 8.3 Counter lifetime and stagger sources

`BASE_COUNTER_WINDOW_SECONDS = 0.80` is the initial `[UNSUPPORTED]` counter lifetime. A successful eligible guard writes that value to `counterRemainingSeconds`. A later successful guard while a counter is live refreshes the timer to the same value; counters never stack.

Only a completed GUARD-set reinforced counter produces stagger in the initial character candidate. A dash guard-break, base counter, normal attack, weapon skill, armor, and accessory do not independently add stagger. There is no `staggerResistance` equipment modifier in this candidate.

A counter is consumed only when a left-click normal attack is accepted. `E`, `Space`, right-click transitions, failed actions, and a dash guard-break do not consume it. A dash guard-break also does not create or refresh a counter.

### 8.4 Dash guard-break wording

A guarding target never cancels an incoming dash. The dash applies its ordinary health damage and `GUARD_BREAK_KNOCKBACK_MULTIPLIER` to its ordinary knockback. The target's right-click remains a held intent; the hit itself neither clears guard state nor imposes a guard-lock timer. This is the selected amplified-knockback branch, not the rejected multi-second guard-lock branch.

### 8.5 Equipment migration

The following replacements are mandatory for the equipment/run plan:

| Retired term | Replacement |
|---|---|
| `guardCapacity` passive | `counterWindow` passive |
| `guardMaximumDelta` | `counterWindowSecondsDelta` |
| Guard capacity armor effect | Counter-window extension, guard-movement multiplier, or counter-damage modifier |
| Stagger resistance armor effect | Removed from the initial candidate |
| GUARD 3/3 restores guard | GUARD 3/3 creates the reinforced direct counter defined in §4.3 and §8.3 |
| Health/guard HUD and battle reset | Health HUD and counter-window indicator; new battle restores health, cooldowns, counter state, velocity, action state, and ring-out-reset state |

`CombatStats.guardMaximum`, `Combatant.guard`, `Combatant.guardRegenDelaySeconds`, and `ActionProfile.guardDamage` are removed. The timeout resolver is health, then center distance, then draw.

### 8.6 Bot migration

`CharacterBotTuning.guardReserve` is removed. A bot may hold guard only against an incoming frontal normal attack or weapon skill; against an incoming dash it chooses lateral/center evasion movement rather than guard. The full decision order at each deterministic interval is:

1. rim danger and recovery toward center;
2. incoming-threat response — hold guard against a frontal normal attack or weapon skill, evade an incoming dash with lateral/center movement;
3. a live counter opportunity, then queue `attack`;
4. an opponent currently guarding, then queue `dash` when available;
5. a weapon-skill distance and cooldown condition, then queue `skill`;
6. normal-attack range, then queue `attack`;
7. otherwise approach or retreat to preferred distance.

Rim recovery keeps its former first position, so a rim-endangered bot recovers toward center before it guards or evades. Bot action frames derive `aimStep` directly from deterministic state/seeded noise; they do not have mouse coordinates.

### 8.7 Required smoke additions

In addition to §6, the replacement smoke must observe:

1. held right-click plus left-click/`E`/valid `Space` starts that action, ends guard, and resumes guard after recovery only if right-click remains held;
2. initial two-combatant aim steps, 90-degree frontal cone, rear/side bypass, and stationary-pointer re-aim after a changed fighter origin;
3. latest unconsumed action wins and no more than one action starts per tick;
4. counter refresh without stacking, left-click-only consumption, and no counter created by dash guard-break;
5. a zero-direction dash does not start and does not consume cooldown;
6. guard-movement acceleration multiplier applies while guarding;
7. only reinforced GUARD counter creates stagger; stagger rejects action/guard starts; and timeout resolves health, then center distance, then draw.

### 8.8 Dependent-document status

The existing Core Plan Task 2 implementation commit `7148034` is superseded and remains unconnected. Core Plan Task 1 state code is an interim boundary that must be migrated before Task 3/4 implementation. The existing core, single-player, and PvP plans are not executable for their affected tasks until a replacement implementation plan cites this reconciliation section.
