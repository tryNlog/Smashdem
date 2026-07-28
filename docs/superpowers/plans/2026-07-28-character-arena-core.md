> **Control/guard supersession — 2026-07-28:** Read `docs/superpowers/specs/2026-07-28-mouse-aim-guard-matchup-design.md` §8 before using this document. Its mouse-aim input, unlimited matchup guard, counter, bot, equipment, timeout, and evidence rules override conflicting text below. This document's historical guard-resource wording is not an implementation requirement.
# Character Arena Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated, deterministic 2D character-arena combat core that exposes movement, manual attack, dash, guard, weapon skill, guard break, ring-out penalty, and time-limit resolution without replacing the deployed spinner session yet.

**Architecture:** Add `src/game/character/` beside the legacy spinner modules. The new directory owns serializable state, fixed-step simulation, combat resolution, and pure bot-independent helpers. `src/app/characterInput.ts` turns desktop events into quantized action frames; `tools/character*.ts` are Vite SSR smoke harnesses. The current session and renderer remain untouched until the single-player plan has an end-to-end run to consume this core.

**Tech Stack:** TypeScript, Vite SSR smoke scripts, Canvas integration deferred to the single-player plan, existing `engine/random.ts`, `engine/vector.ts`, and fixed `1/60` timestep.

## Global Constraints

- `src/game/character/` must not call DOM, `Date.now()`, `performance.now()`, or `Math.random()`.
- Same serialized state, fixed inputs, and seed must produce the same serialized result.
- Every action direction uses `-1 | 0 | 1`; an all-zero action direction falls back to stored facing.
- Use original fighter and equipment vocabulary only; do not place commercial-IP references in the public repository.
- Keep the legacy spinner source compiling until the character session is ready. The local recovery tag is `spinner-baseline-2026-07-28` at `f97bca1`.
- New combat numbers belong in `src/game/character/balance.ts` and are `[UNSUPPORTED]` until the new harness records measurements.
- Commit only compiling task-sized changes. Do not push.

---

## File Map

| File | Responsibility |
|---|---|
| `src/game/character/types.ts` | Serializable character combat types, action frame, events, and neutral input. |
| `src/game/character/balance.ts` | Character-only named constants, including 90-second limit and ring-out baseline. |
| `src/game/character/battleState.ts` | Factories, central spawn/reset, and deep clone for character battle state. |
| `src/game/character/simulation.ts` | Fixed-step state machine, movement, action lifecycle, hits, guard, ring-out, and timeout. |
| `src/game/character/combatResolution.ts` | Pure frontal-cone, damage, stagger, and timeout helpers used by simulation and smoke cases. |
| `src/app/characterInput.ts` | Desktop keyboard event source and action queue boundary. |
| `tools/characterState.ts` | State construction/clone assertions. |
| `tools/characterInput.ts` | Keyboard action queue and snapshot assertions. |
| `tools/characterCombat.ts` | Deterministic fixed-step combat, guard, ring-out, and timeout smoke harness. |
| `package.json` | Adds `smoke:character-state`, `smoke:character-input`, and `smoke:character-combat`. |

## Shared Interfaces

```ts
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

export interface CharacterInputCommand {
  readonly moveX: Axis;
  readonly moveY: Axis;
  readonly guard: boolean;
  readonly queuedAction: QueuedAction;
  readonly actionDirectionX: Axis;
  readonly actionDirectionY: Axis;
}

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
```

### Task 1: Serializable Character State and Factory

**Files:**
- Create: `src/game/character/types.ts`
- Create: `src/game/character/balance.ts`
- Create: `src/game/character/battleState.ts`
- Create: `tools/characterState.ts`
- Modify: `package.json`

**Consumes:** `engine/random.ts`, `balance.FIXED_DELTA_SECONDS`, arena/spawn constants in legacy `balance.ts` only as explicit migration inputs.

**Produces:** `CharacterBattleState`, `Combatant`, `CharacterInputCommand`, `NEUTRAL_CHARACTER_INPUT`, `createCharacterBattleState()`, `cloneCharacterBattleState()`, and `positionCombatantsAtSpawn()` for every later character task.

- [ ] **Step 1: Write the failing state smoke**

```ts
import {
  cloneCharacterBattleState,
  createCharacterBattleState,
  type CombatantDefinition,
} from '../src/game/character/battleState';

const starter = (name: string): CombatantDefinition => ({
  name,
  stats: DEFAULT_COMBAT_STATS,
  profile: DEFAULT_COMBAT_PROFILE,
});
const definitions: readonly CombatantDefinition[] = [starter('PLAYER'), starter('BOT')];
const state = createCharacterBattleState(definitions, 20260728);
assert(state.combatants.every((fighter) => fighter.health === fighter.stats.healthMaximum));
assert(JSON.stringify(cloneCharacterBattleState(state)) === JSON.stringify(state));
```

- [ ] **Step 2: Run the smoke and record the missing-module failure**

Run: `npx vite build --ssr tools/characterState.ts --outDir dist-tools --logLevel warn`

Expected: module-resolution failure for `src/game/character/battleState.ts` before implementation.

- [ ] **Step 3: Implement the minimal serializable model**

```ts
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
```

Export `DEFAULT_COMBAT_STATS` and `DEFAULT_COMBAT_PROFILE` alongside the types. Implement `createCharacterBattleState(definitions, seed)` with phase `ready`, two central spawn positions, health/guard at their maxima, zero cooldowns, and serializable events. Implement the clone by copying every mutable combatant field, the random state, cooldown arrays, and events.

- [ ] **Step 4: Add named migration constants and run the smoke**

Add `CHARACTER_ROUND_TIME_LIMIT_SECONDS = 90`, `CHARACTER_RING_OUT_PENALTY_RATIO = 0.30`, `CHARACTER_SELF_RING_OUT_PENALTY_RATIO = 0.30`, spawn distance, reset-freeze seconds, and guard cone cosine to `character/balance.ts`. Add `smoke:character-state` to `package.json`, then run:

```powershell
npm run smoke:character-state
npm run build
```

Expected: the smoke prints its assertion count and TypeScript emits no diagnostics. The numeric suitability remains `[UNSUPPORTED]` in `docs/ai-log.md`.

- [ ] **Step 5: Commit the state boundary**

```powershell
git add package.json src/game/character/types.ts src/game/character/balance.ts src/game/character/battleState.ts tools/characterState.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(character): add serializable battle state"
```

### Task 2: Quantized Desktop Input and Action Snapshot Queue

**Files:**
- Create: `src/app/characterInput.ts`
- Create: `tools/characterInput.ts`
- Modify: `package.json`

**Consumes:** `CharacterInputCommand`, `Axis`, and `NEUTRAL_CHARACTER_INPUT` from Task 1.

**Produces:** `createCharacterKeyboardInputSource(target)` with `consumeCommand()` and `consumeRestartRequest()`; it is the only desktop-DOM boundary for actions.

- [ ] **Step 1: Write failing action-queue cases**

```ts
source.keydown({ code: 'KeyJ', repeat: false });
source.keydown({ code: 'ArrowRight', repeat: false });
const first = source.consumeCommand();
assert(first.queuedAction === 'attack');
assert(first.actionDirectionX === 1 && first.actionDirectionY === 0);
assert(source.consumeCommand().queuedAction === 'none');

source.keydown({ code: 'KeyK', repeat: false });
source.keydown({ code: 'Space', repeat: false });
assert(source.consumeCommand().queuedAction === 'dash');
```

- [ ] **Step 2: Run the smoke before implementation**

Run: `npx vite build --ssr tools/characterInput.ts --outDir dist-tools --logLevel warn`

Expected: missing `src/app/characterInput.ts` import.

- [ ] **Step 3: Implement key handling and latest-action replacement**

```ts
const ACTION_KEYS: Readonly<Record<string, QueuedAction>> = {
  KeyJ: 'attack',
  Space: 'dash',
  KeyK: 'skill',
};

function queueAction(action: QueuedAction): void {
  queuedAction = action;
  actionDirectionX = currentMoveX();
  actionDirectionY = currentMoveY();
}
```

Hold `KeyL` for `guard`; map `WASD` and arrows to quantized movement. Do not queue repeated keydown events. When action direction is zero, leave it zero so simulation can use facing. Clear the action exactly once from `consumeCommand()`.

- [ ] **Step 4: Run input and legacy build checks**

```powershell
npm run smoke:character-input
npm run smoke:touch-input
npm run build
```

Expected: character input assertions identify `J`, `Space`, `K`, held `L`, action replacement, snapshot direction, and one-consume behavior. Legacy touch still compiles because it has not been connected to character UI.

- [ ] **Step 5: Commit the input boundary**

```powershell
git add package.json src/app/characterInput.ts tools/characterInput.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(character): queue desktop action input"
```

### Task 3: Fixed-Step Movement, Facing, and Action Lifecycle

**Files:**
- Create: `src/game/character/simulation.ts`
- Modify: `tools/characterCombat.ts`
- Modify: `package.json`

**Consumes:** Task 1 state and Task 2 action-frame contract.

**Produces:** `stepCharacterBattle(state, inputs, deltaSeconds)`, `queueCombatantAction()`, action cooldown behavior, and deterministic movement/facing.

- [ ] **Step 1: Write failing lifecycle cases**

```ts
state.phase = 'fighting';
stepCharacterBattle(state, [attackRight, NEUTRAL_CHARACTER_INPUT], FIXED_DELTA_SECONDS);
assert(state.combatants[0].actionState === 'attack');
assert(state.combatants[0].facingX === 1);

advance(state, attackStartupPlusActivePlusRecovery);
assert(state.combatants[0].actionState === 'idle');
assert(state.combatants[0].normalCooldownSeconds > 0);
```

- [ ] **Step 2: Run the smoke before action lifecycle exists**

Run: `npm run smoke:character-combat`

Expected: an assertion failure or unresolved export for `stepCharacterBattle`.

- [ ] **Step 3: Implement lifecycle before hit resolution**

```ts
export function stepCharacterBattle(
  state: CharacterBattleState,
  inputs: readonly CharacterInputCommand[],
  deltaSeconds: number,
): CharacterBattleState {
  state.events.length = 0;
  state.tick += 1;
  advanceTimers(state, deltaSeconds);
  if (state.phase === 'ready') return advanceReady(state);
  if (state.phase === 'fighting') applyCharacterInputs(state, inputs, deltaSeconds);
  return state;
}
```

Apply held movement only when not reset-frozen; update facing only from non-zero action/move direction. Start no more than one of `attack`, `dash`, or `skill` per combatant per tick. A staggered combatant accepts movement but rejects all new action and guard starts.

- [ ] **Step 4: Run deterministic lifecycle cases**

```powershell
npm run smoke:character-combat
npm run build
```

Add an eight-repeat same-seed loop that compares JSON snapshots after the same command sequence. Expected: every serialized snapshot is byte-equal; no numerical balance claim is made.

- [ ] **Step 5: Commit lifecycle work**

```powershell
git add package.json src/game/character/simulation.ts tools/characterCombat.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(character): add action lifecycle simulation"
```

### Task 4: Guard, Hit, Ring-Out, and Timeout Resolution

**Files:**
- Create: `src/game/character/combatResolution.ts`
- Modify: `src/game/character/simulation.ts`
- Modify: `tools/characterCombat.ts`

**Consumes:** Task 3 lifecycle and `CombatProfile` action data.

**Produces:** `isWithinGuardCone()`, `applyCharacterHit()`, `resolveCharacterRingOut()`, and `resolveCharacterTimeLimit()`.

- [ ] **Step 1: Write failing rule cases**

```ts
assert(isWithinGuardCone(guardingFacingRight, attackerAtRight) === true);
assert(isWithinGuardCone(guardingFacingRight, attackerAtLeft) === false);

applyCharacterHit(state, 0, 1, dashProfile);
assert(state.combatants[1].guard < guardBefore);

applyCharacterHit(state, 0, 1, rearDashProfile);
assert(state.combatants[1].health < healthBefore);
```

Also assert guard overflow lowers health, zero guard enters `staggered`, stagger rejects a queued skill, guard regeneration starts only after its delay, non-finishing ring-out resets both fighters, self ring-out penalty is not lower, and timeout resolves health → guard → center distance → draw.

- [ ] **Step 2: Run the smoke before resolution is implemented**

Run: `npm run smoke:character-combat`

Expected: guard-cone and timeout assertions fail because no hit resolver exists.

- [ ] **Step 3: Implement pure resolution helpers and call them from action active frames**

```ts
export function isWithinGuardCone(defender: Combatant, attacker: Combatant): boolean {
  const directionX = attacker.positionX - defender.positionX;
  const directionY = attacker.positionY - defender.positionY;
  const length = Math.hypot(directionX, directionY);
  if (length === 0) return true;
  return (defender.facingX * directionX + defender.facingY * directionY) / length >= GUARD_CONE_COSINE;
}
```

On a valid guard, subtract guard first and transfer overflow to health. On rear/side contact, bypass guard. Ring-out uses the character penalty ratios, calls central reset only while both fighters remain alive, and emits serializable `ringOut` events. Do not inherit spinner collision or burst helpers.

- [ ] **Step 4: Run all core evidence**

```powershell
npm run smoke:character-state
npm run smoke:character-input
npm run smoke:character-combat
npm run build
```

Expected: smoke output lists front/rear, overflow, stagger, guard delay, normal/self ring-out, and all four time-limit tiers. Record actual assertion counts in `docs/ai-log.md`.

- [ ] **Step 5: Commit combat resolution**

```powershell
git add src/game/character/combatResolution.ts src/game/character/simulation.ts tools/characterCombat.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(character): resolve guard and ring-out combat"
```

### Task 5: Core Review Handoff

**Files:**
- Modify: `docs/RELAY.md`
- Modify: `docs/ai-log.md`

**Consumes:** Task 1–4 smoke results.

**Produces:** A compile-tested pure combat core ready for equipment, bots, session, and rendering; it does not change the Pages entry point.

- [ ] **Step 1: Capture actual command evidence**

```powershell
npm run smoke:character-state
npm run smoke:character-input
npm run smoke:character-combat
npm run build
git status --short
```

- [ ] **Step 2: Update relay with factual boundaries**

Record the last commit hash, smoke counts, known `[UNSUPPORTED]` numeric values, and that `main.ts` still runs the legacy session until the single-player plan’s session cutover.

- [ ] **Step 3: Commit the handoff document**

```powershell
git add docs/RELAY.md docs/ai-log.md
git commit -m "docs: hand off character combat core"
```
