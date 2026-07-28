# Mouse-Aim Combat Core Implementation Plan (replaces core plan Tasks 1–5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the deterministic character combat core defined by `../specs/2026-07-28-character-arena-design.md` as amended by `../specs/2026-07-28-mouse-aim-guard-matchup-design.md`, including its normative reconciliation **§8**, without touching the deployed spinner session.

**Authority:** This is the replacement implementation plan required by mouse-aim spec §8.8. It supersedes `2026-07-28-character-arena-core.md` Tasks 1–5. Where any wording here conflicts with the mouse-aim spec, **spec §8 governs**. It also closes review items R-3 (fixed intra-tick pipeline order, Task 3) and P-1 (counter-expiry smoke case, Task 4).

**Architecture:** `src/game/character/` stays a pure serializable simulation (state → fixed-tick step → events). A new `aim.ts` owns the 256-step aim conversion. `src/app/characterInput.ts` is rewritten as the only pointer/keyboard DOM boundary and emits quantized `CharacterInputCommand` frames. `tools/character*.ts` remain headless Vite SSR smoke harnesses. Renderer/session/network are not connected by this plan.

**Tech Stack:** TypeScript, Vite SSR smoke scripts, existing `engine/random.ts`, fixed `1/60` timestep.

## Global Constraints

- `src/game/character/` must not call DOM, `Date.now()`, `performance.now()`, or `Math.random()` (AGENTS.md §3). `Math.cos`/`Math.sin`/`Math.hypot` are permitted: the host is the only simulator, and smoke reruns on one engine.
- Same serialized state + same input frames + same seed → byte-equal serialized output (spec §6-8).
- Every new number lives in `src/game/character/balance.ts` and is `[UNSUPPORTED]` until character-harness and human-play evidence exist (spec §1).
- `J`, `K`, `L` are not character action bindings (spec §2.1). Desktop bindings: WASD/arrows move, mouse aims, LMB attack, `E` skill, `Space` dash, RMB-hold guard, `R` restart.
- Legacy spinner modules, `main.ts`, session, renderer, network, and touch input are not modified (spec §7-4).
- No commercial-IP names/expressions/rules in the public repo.
- Commit compiling task-sized changes locally; **no push** (PM only).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/game/character/types.ts` | Modify | Serializable types per spec §2.2/§5/§8; guard-gauge fields removed |
| `src/game/character/aim.ts` | Create | `AIM_STEP_COUNT`, `isValidAimStep()`, `aimStepToUnit()` (spec §8.2: the only step→vector converter) |
| `src/game/character/balance.ts` | Modify | Remove guard-gauge constants; add guard/counter/motion constants (all `[UNSUPPORTED]`) |
| `src/game/character/battleState.ts` | Modify | Factory/reset with `facingAimStep` 0/128 (spec §8.2) |
| `src/game/character/simulation.ts` | Create | Fixed-tick pipeline (normative order, R-3), movement, action lifecycle, guard transitions |
| `src/game/character/combatResolution.ts` | Create | Guard cone, hit/guard-break/counter resolution, ring-out, timeout |
| `src/app/characterInput.ts` | Rewrite | Pointer+keyboard DOM boundary; per-consume aim recompute (spec §8.2) |
| `tools/characterState.ts` | Modify | State/factory/clone smoke |
| `tools/characterInput.ts` | Rewrite | Input boundary smoke |
| `tools/characterCombat.ts` | Create | Combat/guard/counter/timeout/byte-equal smoke |
| `package.json` | Modify | Add `smoke:character-combat` |

## Shared Interfaces (all later tasks rely on these exact names)

```ts
// types.ts (after Task 1)
export type Axis = -1 | 0 | 1;
export type AimStep = number; // validated integer 0..255
export type QueuedAction = 'none' | 'attack' | 'dash' | 'skill';
export type CharacterActionState =
  | 'idle' | 'attack' | 'dash' | 'skill' | 'guarding' | 'staggered' | 'ringOutReset' | 'defeated';

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

export function neutralCharacterInput(aimStep: AimStep): CharacterInputCommand;

export interface ActionProfile {
  readonly startupSeconds: number;
  readonly activeSeconds: number;
  readonly recoverySeconds: number;
  readonly cooldownSeconds: number;
  readonly range: number;
  readonly healthDamage: number;
  readonly knockback: number;
} // guardDamage removed (spec §8.5)

export interface CombatStats {
  readonly healthMaximum: number;
  readonly moveAcceleration: number;
  readonly maxMoveSpeed: number;
  readonly radius: number;
} // guardMaximum removed (spec §5)
```

`Combatant` mutable fields after Task 1 (replaces `facingX/facingY`, `guard`, `guardRegenDelaySeconds`):

```ts
positionX; positionY; velocityX; velocityY;
facingAimStep: AimStep;          // spawn 0 (index 0) / 128 (index 1), then := command.aimStep each tick
health: number;
actionState: CharacterActionState;
actionRemainingSeconds: number;
actionAimStep: AimStep;          // snapshot at attack/skill start
dashDirectionX: number; dashDirectionY: number; // normalized snapshot at dash start
dashImpulsePending: boolean;
actionHasHit: boolean;
normalCooldownSeconds; dashCooldownSeconds; skillCooldownSeconds;
counterRemainingSeconds: number;
counterIsReinforced: boolean;
grantsReinforcedCounter: boolean; // definition flag; false until the equipment plan wires GUARD 3/3
activeCounterMultiplier: number;  // 1 outside a counter attack
activeCounterStagger: boolean;
ringOutCount: number;
alive: boolean;
```

`CharacterBattleState` drops `hitCooldowns` (replaced by per-action `actionHasHit`).

---

### Task 1: State and Aim Migration

**Files:**
- Create: `src/game/character/aim.ts`
- Modify: `src/game/character/types.ts`, `src/game/character/balance.ts`, `src/game/character/battleState.ts`
- Test: `tools/characterState.ts` (modify)

**Interfaces:**
- Consumes: `engine/random.ts` (unchanged), legacy migration constants already in `character/balance.ts`.
- Produces: the Shared Interfaces block above; `AIM_STEP_COUNT = 256`, `isValidAimStep(value: number): boolean`, `aimStepToUnit(step: AimStep): { x: number; y: number }`; factory/reset with `facingAimStep` 0/128.

- [ ] **Step 1: Write failing state cases (extend `tools/characterState.ts`)**

```ts
import { aimStepToUnit, isValidAimStep } from '../src/game/character/aim';

// spec §8.2 orientation: 0=+X, 64=+Y(down), 128=-X, 192=-Y(up)
assertClose(aimStepToUnit(0).x, 1); assertClose(aimStepToUnit(0).y, 0);
assertClose(aimStepToUnit(64).y, 1); assertClose(aimStepToUnit(128).x, -1);
assertClose(aimStepToUnit(192).y, -1);
assert(isValidAimStep(255) && !isValidAimStep(256) && !isValidAimStep(1.5));

const state = createCharacterBattleState(definitions, 20260728);
assert(state.combatants[0].facingAimStep === 0);   // spawned -X side, faces +X
assert(state.combatants[1].facingAimStep === 128); // spawned +X side, faces -X
assert(!('guard' in state.combatants[0]));
assert(!('guardRegenDelaySeconds' in state.combatants[0]));
assert(!('hitCooldowns' in state));
assert(state.combatants[0].activeCounterMultiplier === 1);
assert(JSON.stringify(cloneCharacterBattleState(state)) === JSON.stringify(state));
```

`assertClose(a, b)`: `Math.abs(a - b) < 1e-12`.

- [ ] **Step 2: Run and record the failure**

Run: `npm run smoke:character-state`
Expected: unresolved import for `src/game/character/aim` (and type errors for removed fields) before implementation.

- [ ] **Step 3: Implement `aim.ts` and migrate types/state**

```ts
// src/game/character/aim.ts
import type { AimStep } from './types';

export const AIM_STEP_COUNT = 256;

export function isValidAimStep(value: number): value is AimStep {
  return Number.isInteger(value) && value >= 0 && value < AIM_STEP_COUNT;
}

/** Spec §8.2: the only combat helper converting an aim step to a direction. */
export function aimStepToUnit(step: AimStep): { readonly x: number; readonly y: number } {
  const radians = (step / AIM_STEP_COUNT) * Math.PI * 2;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}
```

In `types.ts`: apply the Shared Interfaces block; `neutralCharacterInput(aimStep)` returns all-zero axes, `guard: false`, `queuedAction: 'none'`, `actionAimStep: aimStep`, zero dash axes. Delete `NEUTRAL_CHARACTER_INPUT` (a fixed constant would rotate combatant 1 to step 0). In `battleState.ts`: `SPAWN_AIM_STEPS = [0, 128] as const`; factory and `positionCombatantsAtSpawn()` assign `facingAimStep`, drop guard fields, initialize the new fields (`actionAimStep` = spawn step, `dashDirectionX/Y` 0, flags false, `activeCounterMultiplier` 1); clone copies every new field and no longer carries `hitCooldowns`.

- [ ] **Step 4: Migrate `balance.ts` constants**

Remove `CHARACTER_DEFAULT_GUARD_MAXIMUM`, `CHARACTER_NORMAL_GUARD_DAMAGE`, `CHARACTER_DASH_GUARD_DAMAGE`, `CHARACTER_SKILL_GUARD_DAMAGE`. Keep `CHARACTER_GUARD_CONE_COSINE = Math.SQRT1_2` (spec §8.2). Add, each commented `[UNSUPPORTED] starting value`:

```ts
export const CHARACTER_GUARD_MOVE_ACCELERATION_MULTIPLIER = 0.6;   // spec §4.1
export const CHARACTER_GUARD_BREAK_KNOCKBACK_MULTIPLIER = 1.6;     // spec §4.2
export const CHARACTER_BASE_COUNTER_DAMAGE_MULTIPLIER = 1.35;      // spec §4.1
export const CHARACTER_REINFORCED_COUNTER_DAMAGE_MULTIPLIER = 1.75;// spec §4.1
export const CHARACTER_REINFORCED_COUNTER_STAGGER_SECONDS = 0.35;  // spec §4.1
export const CHARACTER_BASE_COUNTER_WINDOW_SECONDS = 0.8;          // spec §8.3
export const CHARACTER_ATTACK_ARC_COSINE = Math.SQRT1_2;           // attack/skill hit arc around actionAimStep
export const CHARACTER_MOVE_DRAG_PER_SECOND = 3.5;                 // spec §3.1 deterministic drag
export const CHARACTER_DASH_IMPULSE = 420;                          // spec §3.2 named dash impulse
export const CHARACTER_MAX_TOTAL_SPEED = 640;                       // spec §3.1 global velocity clamp
```

- [ ] **Step 5: Run state smoke and build**

Run: `npm run smoke:character-state` then `npm run build`
Expected: smoke prints its assertion count; `tsc` reports no diagnostics (`characterInput.ts` still compiles because Task 1 keeps `Axis`/`QueuedAction` exports; if the removed `NEUTRAL_CHARACTER_INPUT` breaks it, replace that import with `neutralCharacterInput(0)` as a temporary shim — Task 2 rewrites the file).

- [ ] **Step 6: Commit**

```powershell
git add src/game/character tools/characterState.ts src/app/characterInput.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(character): migrate state to aim-step matchup guard"
```

### Task 2: Pointer Input Boundary (replaces `7148034`)

**Files:**
- Rewrite: `src/app/characterInput.ts`
- Rewrite: `tools/characterInput.ts`

**Interfaces:**
- Consumes: `CharacterInputCommand`, `AimStep`, `Axis`, `neutralCharacterInput` from Task 1.
- Produces:

```ts
export interface CharacterPointerInputSource {
  consumeCommand: () => CharacterInputCommand;
  consumeRestartRequest: () => boolean;
  setFighterScreenOrigin: (x: number, y: number) => void; // session/renderer feeds this
  dispose: () => void;
}
export function createCharacterPointerInputSource(
  target: Window = window,
  initialAimStep: AimStep = 0, // pass 128 for the right-side fighter
): CharacterPointerInputSource;
```

- [ ] **Step 1: Write failing input cases (rewrite `tools/characterInput.ts` with a fake event target)**

```ts
const source = createCharacterPointerInputSource(fakeWindow, 0);

// spec §8.2: no pointer yet → prior valid aimStep unchanged
assert(source.consumeCommand().aimStep === 0);

// pointer right of origin → step 0; recompute on every consume after origin moves
source.setFighterScreenOrigin(100, 100);
fakeWindow.dispatch('pointermove', { clientX: 200, clientY: 100 });
assert(source.consumeCommand().aimStep === 0);
source.setFighterScreenOrigin(100, 200); // fighter moved down; stationary pointer now points up
assert(source.consumeCommand().aimStep === 192);

// LMB queues attack and snapshots actionAimStep at press (spec §2.2)
fakeWindow.dispatch('pointerdown', { button: 0, clientX: 100, clientY: 300 });
const attack = source.consumeCommand();
assert(attack.queuedAction === 'attack' && attack.actionAimStep === 64);
assert(source.consumeCommand().queuedAction === 'none'); // consumed exactly once

// E queues skill; latest edge replaces unconsumed action (spec §8.1)
fakeWindow.dispatch('keydown', { code: 'KeyE', repeat: false });
fakeWindow.dispatch('keydown', { code: 'Space', repeat: false }); // zero movement → dash rejected
assert(source.consumeCommand().queuedAction === 'skill');

// Space snapshots movement axes; zero-direction dash never enters the queue (spec §2.1)
fakeWindow.dispatch('keydown', { code: 'KeyD', repeat: false });
fakeWindow.dispatch('keydown', { code: 'Space', repeat: false });
const dash = source.consumeCommand();
assert(dash.queuedAction === 'dash' && dash.dashMoveX === 1 && dash.dashMoveY === 0);

// RMB hold = guard; release ends it; blur clears held state
fakeWindow.dispatch('pointerdown', { button: 2 });
assert(source.consumeCommand().guard === true);
fakeWindow.dispatch('blur', {});
assert(source.consumeCommand().guard === false);

// J/K/L are not action bindings (spec §2.1)
fakeWindow.dispatch('keydown', { code: 'KeyJ', repeat: false });
assert(source.consumeCommand().queuedAction === 'none');
```

- [ ] **Step 2: Run before implementation**

Run: `npm run smoke:character-input`
Expected: failures for missing `createCharacterPointerInputSource` export.

- [ ] **Step 3: Implement the boundary**

Keep the existing WASD/arrow key-set logic. Add: `lastPointerX/Y` (null until first `pointermove`/`pointerdown`), `originX/Y` (null until `setFighterScreenOrigin`), `lastValidAimStep = initialAimStep`. Compute on demand:

```ts
function computeAimStep(): AimStep {
  if (lastPointerX === null || originX === null) return lastValidAimStep;
  const dx = lastPointerX - originX;
  const dy = lastPointerY - originY;
  if (dx === 0 && dy === 0) return lastValidAimStep;
  const turns = Math.atan2(dy, dx) / (Math.PI * 2);
  lastValidAimStep = ((Math.round(turns * 256) % 256) + 256) % 256;
  return lastValidAimStep;
}
```

Handlers: `pointermove` stores coordinates only; `pointerdown` button 0 → `queuedAction='attack'`, `actionAimStep=computeAimStep()`; button 2 → `guardHeld=true`; `pointerup` button 2 → `guardHeld=false`; `contextmenu` → `preventDefault()`; `keydown KeyE` → skill + `actionAimStep` snapshot; `Space` → snapshot `currentMoveX/Y()`, queue dash only when either axis is non-zero; `KeyR` → restart flag; `blur`/`pointercancel` → clear held keys and `guardHeld`. `consumeCommand()` returns `{ moveX, moveY, aimStep: computeAimStep(), guard: guardHeld, queuedAction, actionAimStep, dashMoveX, dashMoveY }`, then clears the queued action and its snapshots. Raw pointer coordinates never leave this module (spec §2.2).

- [ ] **Step 4: Run smoke and build**

Run: `npm run smoke:character-input`, `npm run smoke:touch-input`, `npm run build`
Expected: all input assertions print; legacy touch/spinner untouched and compiling.

- [ ] **Step 5: Commit**

```powershell
git add src/app/characterInput.ts tools/characterInput.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(character): replace input with pointer aim boundary"
```

### Task 3: Fixed-Tick Simulation — Movement, Actions, Guard Transitions

**Files:**
- Create: `src/game/character/simulation.ts`
- Create: `tools/characterCombat.ts` (lifecycle cases; Task 4 extends it)
- Modify: `package.json` (`"smoke:character-combat": "vite build --ssr tools/characterCombat.ts --outDir dist-tools --logLevel warn && node dist-tools/characterCombat.js"` — mirror the existing character smoke script pattern)

**Interfaces:**
- Consumes: Task 1 state/types/balance/aim.
- Produces: `stepCharacterBattle(state: CharacterBattleState, inputs: readonly CharacterInputCommand[], deltaSeconds: number): CharacterBattleState`; internal helpers `actionTotalSeconds(profile)`, `actionPhase(combatant): 'startup' | 'active' | 'recovery' | 'none'` (exported for smoke).

**Normative intra-tick order (closes review R-3).** Every fixed tick runs, in this exact order:

1. clear `events`, `tick += 1`, advance battle clock/phase timers;
2. per combatant (index ascending): advance action/cooldown/counter/reset-freeze timers; an action whose remaining time reaches zero returns to `idle` and resets `activeCounterMultiplier`/`activeCounterStagger`;
3. **input phase** (index ascending): validate `aimStep`/`actionAimStep` with `isValidAimStep` (throw on invalid — the protocol layer is responsible for pre-validation); `facingAimStep := command.aimStep`; then action/guard transitions (rules below);
4. **hit phase** (attacker index ascending): dash impulse on the first `active` tick, then hit tests (Task 4);
5. **movement phase**: acceleration → drag → clamps → position integration;
6. ring-out and timeout resolution (Task 4).

Because the input phase precedes the hit phase, a combatant whose action was accepted this tick is no longer `guarding` when hits resolve — spec §8.1 "cannot block and begin an action in the same tick" holds by construction. Guard re-entry: recovery that ends in step 2 makes the combatant eligible in step 3 of the same tick when RMB is still held (this plan's reading of §8.1 "next eligible fixed tick" — the next point at which guard evaluation runs).

**Transition rules (step 3).** Skip action and guard starts entirely while `staggered`, `ringOutReset`, reset-frozen, or `defeated` (movement input is also ignored while reset-frozen or defeated; a staggered combatant keeps movement — spec §8.1). Otherwise, when `queuedAction !== 'none'`, the action's cooldown is `<= 0`, and `actionState` is `idle` or `guarding`:

- a dash whose `dashMoveX === 0 && dashMoveY === 0` is ignored and consumes no cooldown (defensive mirror of the boundary rule, for bot/network frames);
- otherwise start the action: `actionState := queuedAction`, `actionRemainingSeconds := actionTotalSeconds(profile)`, cooldown := `profile.cooldownSeconds`, `actionHasHit := false`; attack/skill store `actionAimStep`; dash stores normalized `dashDirectionX/Y` and sets `dashImpulsePending := true`; starting from `guarding` ends guard (spec §8.1);
- an accepted **attack** with `counterRemainingSeconds > 0` consumes the counter: `activeCounterMultiplier := counterIsReinforced ? CHARACTER_REINFORCED_COUNTER_DAMAGE_MULTIPLIER : CHARACTER_BASE_COUNTER_DAMAGE_MULTIPLIER`, `activeCounterStagger := counterIsReinforced`, then `counterRemainingSeconds := 0`, `counterIsReinforced := false` (spec §8.3 — consumption at acceptance, whiff included; `E`/`Space` never consume);
- with no queued action: `idle` + held guard → `guarding`; `guarding` + released guard → `idle`.

**Movement phase (step 5).**

```ts
// acceleration (skip while reset-frozen or defeated; staggered keeps it)
if ((moveX !== 0 || moveY !== 0) && movementAllowed) {
  const length = Math.hypot(moveX, moveY); // diagonal normalization
  let accel = combatant.stats.moveAcceleration;
  if (combatant.actionState === 'guarding') accel *= Balance.CHARACTER_GUARD_MOVE_ACCELERATION_MULTIPLIER;
  const before = Math.hypot(velocityX, velocityY);
  velocityX += (moveX / length) * accel * dt;
  velocityY += (moveY / length) * accel * dt;
  // movement may not push speed beyond max(previous speed, stats.maxMoveSpeed)
  const cap = Math.max(before, combatant.stats.maxMoveSpeed);
  clampSpeed(combatant, cap);
}
// deterministic drag, then the global clamp shared with dash/knockback impulses
const dragFactor = Math.max(0, 1 - Balance.CHARACTER_MOVE_DRAG_PER_SECOND * dt);
velocityX *= dragFactor; velocityY *= dragFactor;
clampSpeed(combatant, Balance.CHARACTER_MAX_TOTAL_SPEED);
positionX += velocityX * dt; positionY += velocityY * dt;
```

Opposite input therefore accelerates against the current vector instead of replacing it, and released movement decays through drag only (spec §3.1). The dash impulse (step 4, first `active` tick) adds `CHARACTER_DASH_IMPULSE * dashDirection` to the same velocity vector — never an assignment — so a reverse dash first cancels momentum (spec §3.2).

- [ ] **Step 1: Write failing lifecycle cases in `tools/characterCombat.ts`**

```ts
const state = createCharacterBattleState(definitions, 20260728);
state.phase = 'fighting';
const aim0 = () => neutralCharacterInput(state.combatants[0].facingAimStep);

// aim follows command; movement axes untouched (spec §6-1)
step(state, [{ ...aim0(), aimStep: 32 }, neutralCharacterInput(128)]);
assert(state.combatants[0].facingAimStep === 32);
assert(state.combatants[0].velocityX === 0 && state.combatants[0].velocityY === 0);

// attack starts from queue, uses actionAimStep, returns to idle, sets cooldown
step(state, [{ ...aim0(), queuedAction: 'attack', actionAimStep: 32 }, neutralCharacterInput(128)]);
assert(state.combatants[0].actionState === 'attack' && state.combatants[0].actionAimStep === 32);
advanceSeconds(state, attackTotal);
assert(state.combatants[0].actionState === 'idle' && state.combatants[0].normalCooldownSeconds > 0);

// guard hold enters guarding; LMB during guard ends guard and attacks; guard resumes after recovery (spec §8.1, §8.7-1)
holdGuard(state, 0);
assert(state.combatants[0].actionState === 'guarding');
stepWithGuardHeld(state, 0, { queuedAction: 'attack', actionAimStep: 32 });
assert(state.combatants[0].actionState === 'attack');
advanceSecondsWithGuardHeld(state, 0, attackTotal);
assert(state.combatants[0].actionState === 'guarding');

// same-direction dash raises momentum; reverse dash cancels before reversing (spec §6-4)
// zero-direction dash from a frame is ignored without cooldown (spec §8.7-5)
// guard movement multiplier applies while guarding (spec §8.7-6)
// latest queued action wins; one action start per tick (spec §8.7-3)
```

Write each commented case as real assertions using the helpers above (`step`, `advanceSeconds`, `holdGuard` are local harness functions in the smoke file; implement them there).

- [ ] **Step 2: Run before implementation**

Run: `npm run smoke:character-combat`
Expected: unresolved import for `src/game/character/simulation`.

- [ ] **Step 3: Implement `simulation.ts` exactly per the normative order above**

- [ ] **Step 4: Run smoke and build**

Run: `npm run smoke:character-combat`, `npm run smoke:character-state`, `npm run build`
Expected: lifecycle assertions print; no type diagnostics.

- [ ] **Step 5: Commit**

```powershell
git add src/game/character/simulation.ts tools/characterCombat.ts package.json docs/ai-log.md docs/RELAY.md
git commit -m "feat(character): add aim-step simulation lifecycle"
```

### Task 4: Guard, Counter, Ring-Out, and Timeout Resolution

**Files:**
- Create: `src/game/character/combatResolution.ts`
- Modify: `src/game/character/simulation.ts` (call resolution from the hit phase)
- Modify: `tools/characterCombat.ts` (extend)

**Interfaces:**
- Consumes: Task 3 pipeline, `aimStepToUnit`, balance constants.
- Produces:

```ts
export function isWithinGuardCone(defender: Combatant, attacker: Combatant): boolean;
export function applyCharacterHit(
  state: CharacterBattleState, attackerIndex: number, defenderIndex: number,
  kind: 'attack' | 'dash' | 'skill',
): void;
export function resolveCharacterRingOut(state: CharacterBattleState, combatantIndex: number): void;
export function resolveCharacterTimeLimit(state: CharacterBattleState): void;
```

**Resolution rules (spec §4, §8.2–§8.4):**

```ts
export function isWithinGuardCone(defender: Combatant, attacker: Combatant): boolean {
  const dx = attacker.positionX - defender.positionX;
  const dy = attacker.positionY - defender.positionY;
  const length = Math.hypot(dx, dy);
  if (length === 0) return true;
  const facing = aimStepToUnit(defender.facingAimStep);
  return (facing.x * dx + facing.y * dy) / length >= Balance.CHARACTER_GUARD_CONE_COSINE;
}
```

`applyCharacterHit` (attacker profile of `kind`, damage pre-multiplied by the attacker's `activeCounterMultiplier` when `kind === 'attack'`):

- defender `guarding` + `kind === 'dash'`: full health damage; knockback impulse × `CHARACTER_GUARD_BREAK_KNOCKBACK_MULTIPLIER`, **any angle**; guard state is not cleared; no counter is created or refreshed (spec §8.3/§8.4);
- defender `guarding` + attack/skill + frontal cone: damage 0, knockback 0; `counterRemainingSeconds := CHARACTER_BASE_COUNTER_WINDOW_SECONDS` (refresh, never stack), `counterIsReinforced := defender.grantsReinforcedCounter` (spec §4.1/§8.3);
- defender `guarding` + attack/skill + rear/side: ordinary profile (spec §4.1);
- defender not guarding: ordinary profile; if the attacker's `activeCounterStagger` is set and damage lands, defender enters `staggered` for `CHARACTER_REINFORCED_COUNTER_STAGGER_SECONDS` (stagger ends guard/actions; the only stagger source — spec §8.3);
- knockback direction = `normalize(defender.position - attacker.position)` (fallback `aimStepToUnit(attacker.facingAimStep)` at zero distance); impulse adds to defender velocity, then global `CHARACTER_MAX_TOTAL_SPEED` clamp — the same decaying vector as movement (spec §3.3).

Hit test in the simulation hit phase, once per action (`actionHasHit`): attack/skill hit when `distance <= profile.range + defender.stats.radius` **and** defender lies within the attacker's arc around `aimStepToUnit(attacker.actionAimStep)` (`CHARACTER_ATTACK_ARC_COSINE`); dash hits by reach alone (`distance <= profile.range + defender.stats.radius`) during active frames. Ring-out keeps the legacy penalty ratios, central reset (`positionCombatantsAtSpawn` restores spawn facing 0/128), reset freeze, self-penalty-not-lower rule, and `ringOut` events. `resolveCharacterTimeLimit` at 90s: higher health → smaller `Math.hypot(positionX, positionY)` → draw (spec §8.5).

- [ ] **Step 1: Write failing resolution cases (extend `tools/characterCombat.ts`)**

Cover, as real assertions: frontal attack/skill vs guard → 0 damage/0 knockback + counter granted once (spec §6-5); rear/side bypass (spec §6-6); dash vs guard → full damage + ×1.6 knockback at any angle, guard retained, no counter (spec §6-7, §8.7-4); counter refresh without stacking; counter consumed by accepted LMB only (`E`/dash/guard transitions leave it); **counter expires after `CHARACTER_BASE_COUNTER_WINDOW_SECONDS` unused (review P-1)**; reinforced counter staggers and stagger rejects action/guard starts while movement remains (spec §8.7-7); reset-frozen rejects movement (spec §8.1); timeout resolves health → center distance → draw; non-finishing ring-out applies penalty + central reset; self ring-out penalty not lower; and an eight-repeat same-seed loop asserting byte-equal `JSON.stringify` snapshots after an identical scripted input sequence (spec §6-8).

- [ ] **Step 2: Run before implementation**

Run: `npm run smoke:character-combat`
Expected: assertion failures for missing `combatResolution` exports.

- [ ] **Step 3: Implement `combatResolution.ts` and wire the hit phase**

- [ ] **Step 4: Run all core evidence**

Run: `npm run smoke:character-state`, `npm run smoke:character-input`, `npm run smoke:character-combat`, `npm run build`
Expected: every case above prints in the smoke output; record actual counts in `docs/ai-log.md`. Numeric suitability of all constants stays `[UNSUPPORTED]`.

- [ ] **Step 5: Commit**

```powershell
git add src/game/character/combatResolution.ts src/game/character/simulation.ts tools/characterCombat.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(character): resolve matchup guard combat"
```

### Task 5: Relay Handoff

**Files:**
- Modify: `docs/RELAY.md`, `docs/ai-log.md`

- [ ] **Step 1: Capture evidence**

```powershell
npm run smoke:character-state; npm run smoke:character-input; npm run smoke:character-combat; npm run build; git status --short
```

- [ ] **Step 2: Update RELAY.md** — last commit hash, per-smoke assertion counts, remaining `[UNSUPPORTED]` values (all balance constants + human-play items of spec §6), and that `main.ts` still runs the legacy spinner session until the single-player cutover plan.

- [ ] **Step 3: Commit**

```powershell
git add docs/RELAY.md docs/ai-log.md
git commit -m "docs: hand off mouse-aim combat core"
```

---

## Out of Scope (later plan revisions)

- Equipment/12-run migration (single-player plan revision must apply spec §8.5 replacements).
- Bot tiers and decision order (single-player plan revision must apply spec §8.6).
- PvP v2 frame shape/validation for the eight-field command (pvp-v2 plan revision; host remains sole simulator).
- Renderer/session cutover; deployed spinner stays untouched (spec §7-4).

## Self-Review (run after writing, before commit)

1. Spec coverage: §2 input contract → Tasks 1–2; §3 motion → Task 3; §4 guard/counter → Task 4; §5 state removals → Task 1; §6+§8.7 smoke → Tasks 2–4 (all 15 evidence items mapped); §8.1 → Task 3 rules; §8.2 → Task 1 aim + Task 2 recompute; §8.3/§8.4 → Task 4; §8.5 timeout → Task 4; R-3 → Task 3 normative order; P-1 → Task 4 Step 1.
2. Placeholder scan: no TBD/TODO; every code step carries concrete code or an exact rule list.
3. Type consistency: `CharacterPointerInputSource`, `neutralCharacterInput`, `facingAimStep`, `actionAimStep`, `dashDirectionX/Y`, `activeCounterMultiplier` names match across Tasks 1–4.
