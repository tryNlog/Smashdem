> **Control/guard supersession — 2026-07-28:** Read `docs/superpowers/specs/2026-07-28-mouse-aim-guard-matchup-design.md` §8 before using this document. Its mouse-aim input, unlimited matchup guard, counter, bot, equipment, timeout, and evidence rules override conflicting text below. This document's historical guard-resource wording is not an implementation requirement.
# Smashdem 2D Character Arena Design

**Status:** Draft · PM direction and pivot cutoff recorded; implementation-plan review pending
**Date:** 2026-07-28
**Scope:** Replace the current spinner battle with an original 2D character arena battle while retaining the 12-battle roguelike loop and host-authoritative PvP boundary.

## 0. Authority, IP Boundary, and Supersession

This is the authoritative design for the character-arena migration. It replaces only the player-facing spinner combat, part terminology, spinner balance targets, control contract, and spinner video-cut assumptions in the documents below:

- `../../../../00_허브.md` — genre, controls, and current pivot cutoff.
- `../../../../02_게임설계.md` — historical spinner decisions and measurements; they remain evidence of prior work, not character-combat requirements.
- `../../../../03_일정.md` — current delivery schedule and 8/2 pivot decision.
- `../../AGENTS.md` and `../../RELAY.md` — implementation queue and relay state.

Detailed private reference research remains outside this public game repository. Public source and submission material must not reproduce a specific commercial title's names, characters, maps, art, sound, terminology, numerical tables, or recognizable rules. This project uses independent fighter, equipment, arena, and action names.

The live Pages build remains the pre-pivot spinner build until character-arena code is deployed. It is not evidence that the character conversion is playable.

## 1. Product Boundary

Smashdem is an original top-down 2D character arena action roguelike. The player completes a 12-battle run, chooses one of three equipment cards after victories, and builds a three-slot set before storing a completed loadout locally or using it in a one-round online PvP match.

```
start run -> win battle -> choose 1 of 3 equipment cards -> repeat through battle 12
  -> completed build stored locally (maximum 5) -> optional one-round online PvP
```

A lost run deletes that run's equipment. At every new battle, health, guard, cooldowns, counter state, velocity, action state, and ring-out-reset state return to their starting values. Equipment choices and enhancement levels persist only within the run, then the completed loadout can be stored in the existing five local slots.

## 2. Scope Decision

### Included in this conversion

- One generic original 2D fighter body per combatant, rendered as a simple Canvas silhouette rather than a spinner.
- Deterministic movement, facing, manual normal attack, guard, dash/guard-break, and one weapon skill.
- Three equipment slots: weapon, armor, accessory.
- Three set routes: STRIKE, BREAK, GUARD.
- Health damage, guard damage, stagger, ring-out health penalty, and central reset after a non-finishing ring-out.
- Existing 12-battle run, 3-choice reward, two rerolls, enhancement, five-slot local hangar, and online single-match entry model.

### Explicitly excluded from the NAN submission build

- Borrowed commercial-game characters, assets, names, maps, modes, level layouts, and rules.
- Jumping, platforms, aerial attacks, grapples, projectile inventories, more than one playable fighter definition, and multiple maps.
- Account login, cloud save, matchmaking, ranking, reconnect authority transfer, and live-service inventory.
- Mobile action-control redesign beyond preserving the input boundary for future touch buttons.

These exclusions limit the first migration to one arena-combat contract. They are not claims about a future release scope.

## 3. Combat Contract

### 3.1 Shared combatant state

`Combatant` replaces the spinner-shaped battle entity. Its deterministic state contains:

- Position and velocity in the existing top-down arena.
- `facingX/facingY`: the last non-zero action direction.
- `health`: primary damage resource; zero ends the battle.
- `guard`: frontal damage absorption resource; zero causes a stagger window.
- `actionState`: `idle`, `attack`, `dash`, `skill`, `guarding`, `staggered`, `ringOutReset`, or `defeated`.
- Equipment profile, cooldown timers, and one timed counter opportunity.

The fixed `1/60` simulation, seeded random state, and no-DOM/no-clock rule remain inside `src/game/`. Action input is frame data, not renderer state.

### 3.2 Desktop input and action queue

| Action | Input | Deterministic behavior |
|---|---|---|
| Move | `WASD` or arrows | Adds acceleration in the requested direction; inertial movement remains. |
| Manual normal attack | `J` | Uses the equipped weapon's attack profile in the action direction, or last facing direction when neutral. One activation can hit one opponent once. |
| Dash / guard-break | `Space` | Short directional dash. Against a valid frontal guard it damages guard and can stagger; otherwise it deals dash health damage and knockback. |
| Weapon skill | `K` | Uses the equipped weapon's one active skill in the snapshotted direction, then begins cooldown. |
| Guard | Hold `L` | Enables the frontal guard contract in §3.3 and spends guard on valid blocked hits. |

`InputCommand` becomes:

```ts
type Axis = -1 | 0 | 1;
type QueuedAction = 'none' | 'attack' | 'dash' | 'skill';

interface InputCommand {
  readonly moveX: Axis;
  readonly moveY: Axis;
  readonly guard: boolean;
  readonly queuedAction: QueuedAction;
  readonly actionDirectionX: Axis;
  readonly actionDirectionY: Axis;
}
```

A one-shot action snapshots its direction when it is queued. An input source replaces an unconsumed queued action with its most recent button press, and the simulation consumes no more than one action per fixed tick. `actionDirectionX=0` and `actionDirectionY=0` means “use current facing”; action direction is deliberately quantized, not a floating-point unit vector. The recent touch direction snapshot at `../../RELAY.md` is the input-boundary precedent.

### 3.3 Guard, rear hits, counter, and stagger

1. A hit is eligible for guard only when the defender is `guarding` and the attacker lies inside the defender's 90-degree forward cone: `dot(defenderFacing, directionFromDefenderToAttacker) >= cos(45 degrees)`.
2. A rear or side hit bypasses guard and applies the attack's health damage and knockback profile. This includes a dash striking a guarding opponent from outside the cone.
3. A valid frontal guarded hit first spends guard. Any guard damage beyond the remaining guard transfers to health; a guard that reaches zero begins stagger.
4. Guard does not regenerate while the player holds guard or during a configured delay after receiving guard damage. It then regenerates at a configured deterministic rate. Each battle begins at maximum guard.
5. A successful frontal guard that absorbs positive damage grants one timed counter opportunity. GUARD equipment can improve this opportunity, but the player must directly press `J` or `K` to convert it into damage.
6. During `staggered`, new attack, dash, skill, and guard starts are ignored; movement input remains available. The stagger timer expires through fixed simulation ticks only. Exact delay, regeneration rate, and stagger duration require the new harness and remain `[UNSUPPORTED]` until measured.

### 3.4 Damage, ring-out, and time limit

1. **STRIKE route:** manual attacks and weapon skills damage opponent health directly.
2. **BREAK route:** dash/guard-break and BREAK weapon skills have the largest knockback. A non-finishing ring-out subtracts health, then both combatants respawn centrally with zero velocity and a reset freeze.
3. **GUARD route:** a frontal guard converts incoming damage into guard loss, then opens a direct-input counter opportunity.
4. **Finishing ring-out:** if ring-out health loss reaches zero, the battle ends with a ring-out origin flag. Otherwise the battle resumes after reset.
5. **Self ring-out:** the self-inflicted health penalty must be equal to or greater than the opponent-inflicted ring-out penalty, preventing a beneficial central-reset exploit.
6. **Time limit:** at 90 seconds, higher health wins; if health is equal, higher guard wins; if guard is equal, the fighter closer to arena center wins; exact equality is a draw. The run layer treats a draw as a loss with no reward. The 90-second value and every new damage coefficient are `[UNSUPPORTED]` for character combat until measured.

The previous `0.30 × maximum resource` ring-out value is a migration starting point only. Its suitability for character health is `[UNSUPPORTED]` until the new action simulation is measured.

## 4. Equipment, Enhancement, and Sets

| Slot | Owns | Effect class |
|---|---|---|
| Weapon | Normal-attack profile and one active skill | Hit shape, cadence, skill cooldown, health/knockback delivery |
| Armor | Defensive passive | Guard capacity, stagger resistance, damage reduction, counter window |
| Accessory | Tempo passive | Dash recovery, skill cooldown, combo conversion, movement recovery |

The v1 pool is exactly 12 items: four weapons, four armors, and four accessories. In each slot, one item is unaffiliated and the remaining three align to STRIKE, BREAK, or GUARD.

| Set | Weapon | Armor | Accessory | Completed 3/3 rule |
|---|---|---|---|---|
| STRIKE | Duel Blade | Duel Coat | Fury Charm | Consecutive manual hits build a short execution window; the next weapon skill converts it to additional health damage. |
| BREAK | Ram Hammer | Impact Harness | Rim Sigil | Dash contact gains a short momentum window that improves the next delivered knockback and ring-out damage event. |
| GUARD | Counter Spear | Bulwark Plate | Mirror Charm | A successful guard grants one reinforced counter; the next manual hit restores a small amount of guard and deals additional health damage. |
| Unaffiliated | Field Saber | Field Vest | Wind Token | Reliable standalone value without a completed-set rule. |

### 4.1 Data cap

- Each weapon has one normal-attack profile, one active skill, and at most two numeric modifiers.
- Each armor or accessory has one passive trigger and at most two numeric modifiers.
- A completed set has one rule only; there is no second ability layer, rarity system, item inventory, status-effect catalogue, or partial 2/3 set bonus.
- Reacquiring an owned item remains an enhancement. Enhancement increases the existing equipment profile and does not create a new action.

Exact numerical values are absent because they need a character-combat measurement harness.

### 4.2 Run and PvP balance inheritance

The spinner numbers, matchups, and archetype targets are archived rather than carried forward. The following product-level constraints remain:

- Run mode is a power-fantasy progression against baseline bots. Completed equipment and enhancements are allowed to create late-run dominance; bots do not mirror the player loadout.
- PvP normalizes enhancement to level zero while preserving completed sets, so a stored run trophy carries identity without an enhancement-level gap deciding the match.
- A three-choice reward must offer at least two distinct equipment outcomes whenever two or more eligible outcomes exist. Duplicate ownership can appear as enhancement, but a reward cannot force all three choices to replace a current set path. Rerolls remain limited to two per run.
- The three routes are behavioral counters, not a required hard rock-paper-scissors win-rate loop: GUARD can block frontal STRIKE pressure; BREAK can challenge guarding; STRIKE can punish missed dash or post-stagger recovery with direct damage. New matchup targets require measurement rather than copied spinner thresholds.

## 5. Bot Agent Contract

The 12-battle run must remain immediately playable by one visitor, so bot migration is part of the first combat implementation rather than a later polish item.

`CharacterBotTuning` replaces spinner-specific burst fields. It contains decision interval, aim error, movement throttle, preferred attack distance, guard reserve, dash willingness, skill willingness, and retreat-from-rim threshold. It does not change player or bot equipment values by tier.

At each deterministic decision interval, the bot evaluates, in order:

1. ring danger and recovery toward center;
2. a frontal incoming attack/dash while guard is above reserve, then holds guard;
3. a valid counter opportunity, then queues `attack`;
4. an opponent currently guarding, then queues `dash` when available;
5. a weapon-skill distance and cooldown condition, then queues `skill`;
6. normal-attack range, then queues `attack`;
7. otherwise approaches or retreats to preferred distance.

The resolver reads battle state and deterministic seeded noise only; it must not call clock APIs, DOM APIs, or mutate random state outside the simulation's owned PRNG path.

The four tiers retain skill progression rather than stat inflation: tier 1 is slow and visibly permissive, tier 2 reliably approaches and attacks, tier 3 can guard and use skills, and tier 4 can use all action branches with lower reaction delay and aim error. Bots retain baseline equipment and do not use dormant mirror-build logic. Exact tier values and 12-run completion rates are `[UNSUPPORTED]` until the action harness exists.

## 6. Character Representation

The submission build contains one generic original fighter definition for the player and one color-varied opponent. Character differentiation is data-ready, not a submission requirement:

```ts
interface FighterDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly baseStats: CombatStats;
  readonly appearance: FighterAppearance;
}
```

`FighterAppearance` stays in `src/render/`; it cannot alter hitboxes, health, gear, action timings, or seeded simulation. This keeps future character appearances outside network authority.

## 7. Architecture and Protocol Migration

| Current responsibility | Character-arena replacement |
|---|---|
| `Beyblade`, spinner stats, spinner tuning | `Combatant`, `CombatStats`, `EquipmentProfile` |
| `parts.ts` | `equipment.ts`; weapon/armor/accessory data and set profile generation |
| collision-only damage | deterministic attack windows, guard resolution, dash contact, and body push |
| `InputCommand { moveX, moveY, burst }` | the queued action input in §3.2 |
| spinner renderer | fighter silhouette, facing indicator, attack arcs, guard, stagger, and ring-out effects |
| spinner cards and inventory labels | equipment cards, slot icons, set progress, enhancement labels |
| v1 PvP loadout | v2 equipment loadout with `weaponId`, `armorId`, and `accessoryId` |

The PvP migration increments `PVP_PROTOCOL_VERSION` from 1 to 2. Equipment IDs use `W01`–`W04`, `A01`–`A04`, and `C01`–`C04`. Input parsing validates all six axes as `-1|0|1`, `guard` as boolean, and `queuedAction` as the declared enum. The relay forwards version-2 frames only and remains a frame forwarder; host simulation remains the sole authority for attack, guard, health, and ring-out resolution.

No DOM, `Date.now()`, or `Math.random()` enters `src/game/`.

## 8. Migration Schedule and Pivot Cutoff

### 8.1 Delivery sequence

| Date | Work | Evidence needed before moving on |
|---|---|---|
| 7/28 | Contract hardening, rollback tag, implementation plan | This specification and relay record reviewed by PM |
| 7/29 | Pure action input, combatant state, manual attack/dash/guard/skill tests | Fixed-seed action smoke and build output |
| 7/30 | Equipment table, rewards, run/hangar migration | 12-battle reward-flow smoke with three slots |
| 7/31 | Bot tiers, ring-out health penalty, initial action effects | Bot action smoke plus one full bot run |
| 8/1 | Protocol v2, local two-tab integration, first external desktop playtest | Two-browser observation or a recorded blocking condition |
| 8/2 23:00 | Pivot and PvP decision | §8.2 criteria |
| 8/3–8/7 | New-model measurement, QA, deployment, PDFs, video capture | Measurement records and draft submission assets |
| 8/8–8/9 | Submission assembly | PM review of required artifacts |

The date allocations are `[UNSUPPORTED]` estimates. The new harness and human-readability checks determine whether the sequence can continue.

### 8.2 8/2 23:00 pivot cutoff

The local tag `spinner-baseline-2026-07-28` points to `f97bca1` and preserves the pre-pivot spinner build. At the cutoff, the character candidate must show all of the following in one fresh run against bots:

1. a 12-battle run can progress from battle 1 through battle 12;
2. manual attack, dash/guard-break, weapon skill, and held guard visibly execute;
3. weapon, armor, and accessory can be selected and shown as separate slots;
4. a non-finishing ring-out applies health penalty and reset rather than immediate defeat.

If any condition lacks direct observation at the cutoff, the final submission branch returns to the tagged spinner baseline. This is a PM-approved safety decision, not an assertion that either build has met the criteria.

The existing 8/2 real-time-PvP decision applies to the character candidate only if the pivot criteria are observed. If the candidate has the full run but online PvP lacks a two-browser finished match, online PvP is reduced to local two-player scope; the 12-battle run remains the primary submission path.

### 8.3 Video reconstruction

The former spinner-oriented cuts are retired. The 30–60 second capture plan is:

1. manual attack, dash, guard, and weapon skill against a bot;
2. a three-choice equipment reward plus set progress;
3. a completed-set action and ring-out health penalty/reset;
4. a 12-battle progress montage and hangar, with two-tab PvP only if it is observed.

## 9. Acceptance Evidence

Before the 8/2 cutoff, the character candidate needs evidence for the following:

- Fixed-seed input frames reproduce movement, attack, dash, guard, and skill action states.
- Guard smoke cases distinguish frontal guard absorption, rear bypass, guard overflow, regeneration delay, stagger action lock, and counter conversion.
- Timeout smoke cases choose health, then guard, then center distance, then draw in that order.
- Ring-out smoke cases distinguish non-finishing reset, finishing ring-out, and self-ring-out penalty not lower than an opponent-inflicted penalty.
- Bot cases queue attack, dash, guard, and skill under their respective conditions; a deterministic 12-battle run observes all three STRIKE/BREAK/GUARD routes across defined baseline loadouts.
- Eleven three-choice rewards can produce weapons, armor, accessories, and enhancements without forcing a three-card path replacement.
- A stored completed loadout normalizes enhancement for version-2 online entry while retaining its set identity.
- Repeated fixed-seed runs reproduce the same battle state, reward sequence, and bot action frames.

Human action feel, readability, balance, and external browser behavior remain PM/QA judgments. Automated smoke output is evidence for deterministic behavior only.

## 10. Risks and Decision Record

- **Balance reset:** previous spinner measurements are not numerical evidence after combat replacement. New numerical claims require a new harness.
- **Scope pressure:** extra fighters, maps, jumps, and nonessential modes remain excluded until the first generic fighter run and required input evidence are observed.
- **PvP compatibility:** protocol v2 changes input, loadout, parser, relay, and local two-tab tests together. Host authority remains mandatory.
- **Mobile:** existing touch work is input-boundary history only. Action-button layout waits for desktop action playtests.
- **Fallback:** `spinner-baseline-2026-07-28` remains local unless PM deliberately pushes or switches it; no automatic remote branch change occurs.