> **Control/guard supersession — 2026-07-28:** Read `docs/superpowers/specs/2026-07-28-mouse-aim-guard-matchup-design.md` §8 before using this document. Its mouse-aim input, unlimited matchup guard, counter, bot, equipment, timeout, and evidence rules override conflicting text below. This document's historical guard-resource wording is not an implementation requirement.
# Character Arena Single-Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the character combat core to an equipment-driven 12-battle roguelike run with bots, rewards, a Canvas HUD, and five local completed-build slots.

**Architecture:** This plan consumes the isolated core from `2026-07-28-character-arena-core.md`. New character-specific equipment, reward, run, bot, and session modules are built alongside the legacy spinner modules. Once their 12-battle smoke and basic Canvas path exist, `main.ts` switches to the character session in one compile-tested cutover. Existing spinner modules remain reachable through the recovery tag rather than through a runtime mode toggle.

**Tech Stack:** TypeScript, Canvas 2D, Vite SSR smokes, localStorage through `src/app/hangar.ts`, fixed timestep engine.

## Global Constraints

- Run mode preserves power progression against baseline bots; do not activate mirror-build logic.
- PvP enhancement normalization is planned separately; this plan allows run enhancement only.
- Exactly 12 equipment items: four `W`, four `A`, four `C`; one unaffiliated item per slot and three aligned items per STRIKE/BREAK/GUARD route.
- Each item obeys the data cap in the approved design. No rarity, shop, fourth equipment slot, partial set bonus, or additional active ability layer.
- Rewards remain three choices and two rerolls. At least two distinct equipment outcomes appear when two eligible outcomes exist.
- A draw ends a run as a loss with no reward. Each new battle restores health, guard, action cooldowns, and counters.
- Commit each compiling task; do not push.

---

## File Map

| File | Responsibility |
|---|---|
| `src/game/character/equipment.ts` | Equipment IDs/data, equipment build, profile composition, set completion, enhancement. |
| `src/game/character/rewards.ts` | Three-choice generation, diversity rule, enhancement/swap application, preview. |
| `src/game/character/run.ts` | 12-battle deterministic run state and battle seed flow. |
| `src/game/character/bot.ts` | Pure state-reading bot priority and four non-mirroring tiers. |
| `src/app/characterSession.ts` | Run/session orchestration: battle, reward, reroll, loss, victory, bot input. |
| `src/app/characterHangar.ts` | Versioned local storage for five character equipment builds. |
| `src/render/characterRenderer.ts` | Character silhouettes, health/guard HUD, action visuals, set and ring-out feedback. |
| `src/render/characterScreens.ts` | Reward cards, run result, hangar cards, and control labels. |
| `tools/characterEquipment.ts` | Data-cap, set, enhancement, and reward cases. |
| `tools/characterRun.ts` | Twelve-battle run/reroll/draw and deterministic bot-run smoke. |
| `tools/characterBot.ts` | Priority cases for guard, counter, dash, skill, attack, approach, and rim recovery. |

## Shared Interfaces

```ts
export type EquipmentSlot = 'weapon' | 'armor' | 'accessory';
export type SetRoute = 'strike' | 'break' | 'guard' | null;

export type PassiveKind =
  | 'none'
  | 'strikeExecution'
  | 'breakMomentum'
  | 'guardCounter'
  | 'guardCapacity'
  | 'dashRecovery'
  | 'skillRecovery';

export interface EquipmentProfileModifier {
  readonly healthMaximumDelta: number;
  readonly guardMaximumDelta: number;
  readonly normalDamageMultiplier: number;
  readonly dashCooldownMultiplier: number;
  readonly skillCooldownMultiplier: number;
  readonly passive: PassiveKind;
}

export interface Equipment {
  readonly id: `W${number}` | `A${number}` | `C${number}`;
  readonly slot: EquipmentSlot;
  readonly set: SetRoute;
  readonly name: string;
  readonly profileModifier: EquipmentProfileModifier;
}

export interface EquippedItem {
  readonly equipment: Equipment;
  readonly level: number;
}

export interface CharacterRunBuild {
  readonly weapon: EquippedItem;
  readonly armor: EquippedItem;
  readonly accessory: EquippedItem;
}

export interface CharacterRunState {
  battleNumber: number;
  build: CharacterRunBuild;
  phase: 'inRun' | 'won' | 'lost';
  wins: number;
  rerollsRemaining: number;
  random: RandomState;
}
```

### Task 1: Equipment Table, Profile Composition, and Set Rules

**Files:**
- Create: `src/game/character/equipment.ts`
- Create: `tools/characterEquipment.ts`
- Modify: `package.json`

**Consumes:** `CombatProfile` and `CombatStats` from the core plan.

**Produces:** `ALL_EQUIPMENT`, `STARTER_EQUIPMENT_BUILD`, `buildEquipmentProfile()`, `completedEquipmentSet()`, and enhancement clamp helpers.

- [ ] **Step 1: Write failing equipment assertions**

```ts
assert(ALL_EQUIPMENT.length === 12);
assert(ALL_EQUIPMENT.filter((item) => item.slot === 'weapon').length === 4);
assert(completedEquipmentSet(strikeBuild) === 'strike');
assert(buildEquipmentProfile(strikeBuild, { context: 'run' }).skill.healthDamage > starter.skill.healthDamage);
```

- [ ] **Step 2: Run before creating the equipment module**

Run: `npx vite build --ssr tools/characterEquipment.ts --outDir dist-tools --logLevel warn`

Expected: unresolved `character/equipment` import.

- [ ] **Step 3: Add the twelve data records and capped modifiers**

Define `W01`–`W04`, `A01`–`A04`, and `C01`–`C04` using the approved names. A weapon provides one normal-attack profile and one skill profile; armor/accessory each contribute one passive trigger plus at most two numeric modifiers. Give each completed set exactly one composed rule and no 2/3 rule.

```ts
export function buildEquipmentProfile(
  build: CharacterRunBuild,
  options: { readonly context: 'run' | 'pvp' },
): CombatProfile {
  // Start from a baseline profile, apply slot modifiers, then one 3/3 set rule.
}
```

- [ ] **Step 4: Run data and build checks**

```powershell
npm run smoke:character-equipment
npm run smoke:character-combat
npm run build
```

Expected: the tool checks count, `W/A/C` prefix, one unaffiliated item per slot, set recognition, enhancement cap, and profile determinism.

- [ ] **Step 5: Commit equipment data**

```powershell
git add package.json src/game/character/equipment.ts tools/characterEquipment.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(character): add equipment and set profiles"
```

### Task 2: Rewards, Rerolls, and Twelve-Battle Run State

**Files:**
- Create: `src/game/character/rewards.ts`
- Create: `src/game/character/run.ts`
- Modify: `tools/characterEquipment.ts`
- Create: `tools/characterRun.ts`
- Modify: `package.json`

**Consumes:** Task 1 equipment table and seeded `engine/random.ts`.

**Produces:** `createCharacterRun()`, `generateCharacterRewards()`, `applyCharacterReward()`, `consumeCharacterReroll()`, `recordCharacterBattleResult()`, and `advanceAfterCharacterReward()`.

- [ ] **Step 1: Write failing run/reward cases**

```ts
const rewards = generateCharacterRewards(starterBuild, random);
assert(new Set(rewards.map((card) => card.equipment.id)).size === 3);
assert(new Set(rewards.map((card) => card.equipment.slot)).size >= 2);

const rerolled = consumeCharacterReroll(run);
assert(rerolled === true && run.rerollsRemaining === 1);
recordCharacterBattleResult(run, false);
assert(run.phase === 'lost');
```

- [ ] **Step 2: Run the new smoke before implementation**

Run: `npm run smoke:character-run`

Expected: unresolved character-run export or failing reward-diversity assertion.

- [ ] **Step 3: Implement deterministic offers and run advancement**

Use a seeded shuffle of eligible equipment. Select three unique IDs. When two or more slots are eligible, select at least two slots before filling the third card. A selected duplicate builds an enhancement level; a different item in the same slot replaces that slot. Run victory at battle 12 sets `phase: 'won'` without a twelfth reward; loss or draw sets `phase: 'lost'`.

- [ ] **Step 4: Run deterministic flow cases**

```powershell
npm run smoke:character-equipment
npm run smoke:character-run
npm run build
```

Add an eight-run same-seed comparison including both rerolls. Expected: reward IDs, levels, battle seeds, and final run state serialize identically.

- [ ] **Step 5: Commit progression state**

```powershell
git add package.json src/game/character/rewards.ts src/game/character/run.ts tools/characterEquipment.ts tools/characterRun.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(character): add twelve battle equipment run"
```

### Task 3: Four-Tier Bot Priority Without Build Mirroring

**Files:**
- Create: `src/game/character/bot.ts`
- Modify: `src/game/character/balance.ts`
- Create: `tools/characterBot.ts`
- Modify: `package.json`

**Consumes:** Core `CharacterBattleState`, `CharacterInputCommand`, equipment baseline profiles, and `noiseFromSeed()`.

**Produces:** `CharacterBotTuning`, `characterBotTuningForTier()`, and `characterBotInput(state, index, tuning)`.

- [ ] **Step 1: Write priority cases before implementation**

```ts
assert(characterBotInput(incomingFrontalDashState, 1, tierFour).guard === true);
assert(characterBotInput(counterWindowState, 1, tierFour).queuedAction === 'attack');
assert(characterBotInput(targetGuardingState, 1, tierFour).queuedAction === 'dash');
assert(characterBotInput(skillRangeState, 1, tierFour).queuedAction === 'skill');
assert(characterBotInput(normalRangeState, 1, tierTwo).queuedAction === 'attack');
```

- [ ] **Step 2: Run before the bot module exists**

Run: `npx vite build --ssr tools/characterBot.ts --outDir dist-tools --logLevel warn`

Expected: unresolved `character/bot` import.

- [ ] **Step 3: Implement the ordered resolver and tiers**

```ts
export function characterBotInput(
  state: CharacterBattleState,
  index: number,
  tuning: CharacterBotTuning,
): CharacterInputCommand {
  // rim recovery -> frontal guard -> counter -> anti-guard dash -> skill -> attack -> approach/retreat
}
```

Use decision-bucket seeded noise for aim only. Tier data changes decision interval, aim error, throttle, preferred distance, guard reserve, dash willingness, skill willingness, and rim threshold. Bots always use baseline equipment; do not call `mirrorBotAssignment()` or mirror a completed build.

- [ ] **Step 4: Run bot evidence**

```powershell
npm run smoke:character-bot
npm run smoke:character-combat
npm run build
```

Expected: the smoke records all seven priority branches and repeats the same commands for the same seed/state.

- [ ] **Step 5: Commit bot behavior**

```powershell
git add package.json src/game/character/bot.ts src/game/character/balance.ts tools/characterBot.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(character): add deterministic arena bots"
```

### Task 4: Character Session and First Canvas Cutover

**Files:**
- Create: `src/app/characterSession.ts`
- Create: `src/render/characterRenderer.ts`
- Create: `src/render/characterScreens.ts`
- Modify: `src/main.ts`
- Modify: `index.html`
- Modify: `tools/characterRun.ts`

**Consumes:** Task 1–3 pure core, run state, and bot input.

**Produces:** A desktop-playable first screen that starts a character battle against a bot and reaches a three-choice reward after victory.

- [ ] **Step 1: Write a failing session-flow smoke**

```ts
const session = createCharacterSession(20260728);
advanceUntilFighting(session);
session.step({ moveX: 1, moveY: 0, guard: false, queuedAction: 'attack', actionDirectionX: 1, actionDirectionY: 0 });
forcePlayerBattleWin(session);
assert(session.screen === 'reward');
assert(session.rewards.length === 3);
```

- [ ] **Step 2: Run the smoke before session construction exists**

Run: `npm run smoke:character-run`

Expected: missing `createCharacterSession` export or failed screen transition assertion.

- [ ] **Step 3: Build the session and render only required player feedback**

`createCharacterSession(seed)` owns the run, battle, reward list, and current screen. It calls `characterBotInput()` for the bot and `stepCharacterBattle()` once per fixed tick. Render a distinct fighter silhouette, health and guard bars, action-state label, arena rim, ring-out reset, `W/A/C` equipment slots, set pips, and the `J`/`Space`/`K`/`L` control hints. Do not add character selection, maps, or mobile action buttons.

- [ ] **Step 4: Switch `main.ts` only after build evidence**

Keep the legacy imports until the new session reaches battle and reward screens. Then replace the main loop’s session/input/renderer wiring in one change. Update `index.html` instructions to `WASD/Arrows`, `J`, `Space`, `K`, and hold `L`.

```powershell
npm run smoke:character-run
npm run smoke:character-bot
npm run build
```

Expected: type checking covers the entry-point cutover; visual readability still requires a desktop person to inspect it.

- [ ] **Step 5: Commit the playable session slice**

```powershell
git add src/app/characterSession.ts src/render/characterRenderer.ts src/render/characterScreens.ts src/main.ts index.html tools/characterRun.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(character): render single player arena run"
```

### Task 5: Five-Slot Character Hangar and Full-Run Evidence

**Files:**
- Create: `src/app/characterHangar.ts`
- Modify: `src/app/characterSession.ts`
- Modify: `src/render/characterScreens.ts`
- Modify: `tools/characterRun.ts`
- Modify: `docs/RELAY.md`
- Modify: `docs/ai-log.md`

**Consumes:** Completed `CharacterRunBuild` from Task 2 and session result from Task 4.

**Produces:** Versioned localStorage save/load for at most five completed character builds and a 12-battle smoke used by the 8/2 pivot review.

- [ ] **Step 1: Write failing storage and run cases**

```ts
function simulateTwelveBattles(seed: number): CharacterRunState {
  const run = createCharacterRun(createRandomState(seed));
  while (run.phase === 'inRun') {
    const result = recordCharacterBattleResult(run, true);
    if (result.showReward) {
      const card = generateCharacterRewards(run.build, run.random)[0];
      advanceAfterCharacterReward(run, applyCharacterReward(run.build, card));
    }
  }
  return run;
}

const store = createCharacterHangar(memoryStorage);
store.save(completedBuild('strike'));
assert(store.list().length === 1);
for (let index = 1; index < 5; index += 1) store.save(completedBuild('guard'));
assert(store.save(completedBuild('break')) === 'full');
const state = simulateTwelveBattles(20260728);
assert(state.phase === 'won');
assert(state.battleNumber === 12);
```

- [ ] **Step 2: Run before storage implementation**

Run: `npm run smoke:character-run`

Expected: missing character hangar module or failed five-slot assertion.

- [ ] **Step 3: Implement versioned, local-only snapshots**

Use a new localStorage key such as `smashdem.character-hangar.v1`; never reinterpret legacy spinner saves as character equipment. Save only completed 12-battle builds. At full capacity, return `full` and let the renderer ask the player to choose a replacement slot; never remove a slot automatically.

- [ ] **Step 4: Run the full single-player evidence set**

```powershell
npm run smoke:character-state
npm run smoke:character-input
npm run smoke:character-combat
npm run smoke:character-equipment
npm run smoke:character-bot
npm run smoke:character-run
npm run build
```

Record actual smoke counts, one bot-run result, and all remaining `[UNSUPPORTED]` balance questions in the relay. A human desktop playtest remains separate evidence.

- [ ] **Step 5: Commit hangar and handoff**

```powershell
git add src/app/characterHangar.ts src/app/characterSession.ts src/render/characterScreens.ts tools/characterRun.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(character): store completed arena builds"
```
