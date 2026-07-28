# Smashdem 2D Character Arena Design

**Status:** Draft · PM approved direction, implementation review pending
**Date:** 2026-07-28
**Scope:** Replace the spinner battle with an original 2D character arena battle while preserving the 12-battle roguelike run and future host-authoritative PvP structure.

## 1. Product Boundary

Smashdem becomes an original character arena action game. It uses the high-level feel of inertial arena combat, equipment collection, and set completion; it does not reproduce Survival Project's title, characters, maps, art, sound, terminology, numerical tables, or other protected expression.

Source boundary: `../../../04_레퍼런스.md §5` records the same rule. This is a spiritual-successor direction, not a commercial or literal remake.

The existing 12-battle loop remains:

```
start run -> win battle -> choose 1 of 3 equipment cards -> repeat through battle 12
  -> completed build stored locally (maximum 5) -> optional one-round online PvP
```

Run loss still deletes that run's equipment. Local storage and PvP enhancement normalization remain as currently designed.

## 2. Scope Decision

### Included in this conversion

- One original 2D fighter body per combatant, rendered as a simple Canvas silhouette rather than a spinner.
- Deterministic movement, facing, manual normal attack, guard, dash/guard-break, and one weapon skill.
- Three equipment slots: weapon, armor, accessory.
- Three set routes: STRIKE, BREAK, GUARD.
- Health damage, guard damage, stagger, ring-out health penalty, central reset after non-finishing ring-out.
- Existing 12-battle run, 3-choice reward, two rerolls, enhancement, five-slot local hangar, and online single-match entry model.

### Explicitly excluded from the NAN submission build

- Existing Survival Project characters, assets, names, maps, modes, level layouts, and rules.
- Jumping, platforms, aerial attacks, grapples, projectile inventories, more than one playable character definition, and multiple maps.
- Account login, cloud save, matchmaking, ranking, reconnect authority transfer, and live-service inventory.
- Mobile control redesign beyond keeping the input interface compatible with future touch buttons.

These exclusions keep the conversion bounded to the battle contract. They are not claims about a future release scope.

## 3. Combat Contract

### 3.1 Shared combatant state

`Combatant` replaces the spinner-shaped battle entity. Its deterministic state contains:

- Position and velocity in the existing top-down arena.
- `facingX/facingY`: last non-zero intended action direction.
- `health`: damage resource; zero ends the battle.
- `guard`: frontal damage absorption resource; zero creates a stagger window.
- `actionState`: `idle`, `attack`, `dash`, `skill`, `guarding`, `staggered`, `ringOutReset`, or `defeated`.
- Equipment profile and action cooldown timers.

The current fixed `1/60` simulation, seeded random state, and no-DOM/no-clock rule stay inside `src/game/`. Action input is snapshot data, not renderer state.

### 3.2 Desktop actions

| Action | Input | Deterministic behavior |
|---|---|---|
| Move | `WASD` or arrows | Adds acceleration in the requested direction; existing inertial movement remains. |
| Manual normal attack | `J` | Uses the equipped weapon's attack profile in the current input direction, or last facing direction when movement is neutral. One activation hits a given opponent once. |
| Dash / guard-break | `Space` | Short directional dash. Contact with a guarding opponent deals guard damage and can stagger; contact with an unguarded opponent deals the dash profile's health damage and knockback. |
| Weapon skill | `K` | Uses the equipped weapon's one active skill, direction-snapshotted at button press, then begins its cooldown. |
| Guard | Hold `L` | Reduces incoming damage from a 90-degree frontal cone, spends guard, and records a timed counter opportunity for GUARD equipment. |

Every one-shot action snapshots its direction when the input is queued. `InputCommand` carries held movement plus `guard` and one `queuedAction` value (`none`, `attack`, `dash`, or `skill`) with `actionDirectionX/actionDirectionY`. An input source replaces an unconsumed queued action with its most recent button press; the simulation consumes at most one action per fixed tick. This prevents simultaneous keyboard/touch flags from creating an ambiguous action order and makes local replay and PvP frames agree even when pointer events occur between fixed ticks. The recent touch burst diagnosis at `../../RELAY.md` supplies the boundary precedent.

### 3.3 Resolution rules

1. **STRIKE route:** manual normal attacks and weapon skills spend opponent health directly. STRIKE equipment improves attack cadence, hit damage, or combo conversion.
2. **BREAK route:** dash/guard-break and BREAK weapon skills produce the largest knockback. A ring-out subtracts health, then both combatants return to central spawn with zero velocity and the existing reset freeze.
3. **GUARD route:** a successful frontal guard avoids a portion of health damage, consumes guard, and grants a short counter window. The player must still press a normal attack or weapon skill to convert that counter into damage.
4. **Finishing ring-out:** if ring-out health loss reaches zero, the battle ends with the existing ring-out origin flag. Otherwise the match continues after reset.
5. **Time limit:** the existing time-limit decision rule remains the fallback when neither health resource reaches zero.

The inherited ring-out penalty begins at the current `0.30 × maximum health` value only as a migration baseline. Its suitability for character combat is `[UNSUPPORTED]` until the new action simulation is measured.

## 4. Equipment and Sets

The three current slots are renamed and made player-readable:

| Slot | Owns | Normal effect class |
|---|---|---|
| Weapon | Normal-attack profile and active skill | Hit shape, attack cadence, skill cooldown, damage/knockback delivery |
| Armor | Defensive passive | Guard capacity, stagger resistance, damage reduction, counter window |
| Accessory | Tempo passive | Dash recovery, skill cooldown, combo conversion, movement recovery |

The v1 card pool remains 12 items: four weapons, four armors, and four accessories. One item per slot is unaffiliated; the other three form the same set across all slots.

| Set | Weapon | Armor | Accessory | Completed 3/3 rule |
|---|---|---|---|---|
| STRIKE | Duel Blade | Duel Coat | Fury Charm | Consecutive manual hits build a short execution window; the next weapon skill converts the window to additional health damage. |
| BREAK | Ram Hammer | Impact Harness | Rim Sigil | Dash contact gains a short momentum window that improves the next delivered knockback and ring-out damage event. |
| GUARD | Counter Spear | Bulwark Plate | Mirror Charm | A successful guard grants one reinforced counter; the next manual hit restores a small amount of guard and deals additional health damage. |
| Unaffiliated | Field Saber | Field Vest | Wind Token | Reliable standalone stat/passive value without a set-completion rule. |

The set names and item names are original game vocabulary. No rarity tiers are introduced. Selecting an already owned item remains an enhancement, preserving the existing reward model. Exact damage, cooldown, guard, and enhancement values are intentionally absent from this design because they must be measured against the new combat simulation rather than copied from spinner measurements.

## 5. Character Representation

The submission build contains one generic original fighter definition for the player and one color-varied opponent definition. Character differentiation is data-ready but not a release requirement:

```ts
interface FighterDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly baseStats: CombatStats;
  readonly appearance: FighterAppearance;
}
```

`FighterAppearance` stays in `src/render/`; it cannot alter hitboxes, health, gear, action timings, or the seeded simulation. This preserves a future path for character art and alternate characters without making visual assets a network authority concern.

## 6. Architecture Migration

| Current responsibility | Character-arena replacement |
|---|---|
| `Beyblade`, spinner stats, spinner tuning | `Combatant`, `CombatStats`, `EquipmentProfile` |
| `parts.ts` | `equipment.ts`; weapon/armor/accessory data and set profile generation |
| collision-only damage | deterministic attack windows, guard resolution, dash contact, and existing body push |
| `InputCommand { moveX, moveY, burst }` | `InputCommand { moveX, moveY, guard, queuedAction, actionDirectionX, actionDirectionY }` |
| spinner ring renderer | character silhouette, facing indicator, attack arcs, guard state, stagger and ring-out effects |
| spinner build cards and inventory labels | equipment cards, slot icons, set progress, enhancement labels |
| PvP input frame | the expanded action command; host remains the only physics authority |

No DOM, `Date.now()`, or `Math.random()` enters `src/game/`. The relay remains a frame forwarder; it does not evaluate attacks, guards, health, or ring-outs.

## 7. Migration Sequence

1. Establish pure action input and combat state tests before replacing simulation behavior.
2. Replace battle simulation and renderer with one generic fighter pair, retaining arena, reset, health, and fixed timestep boundaries.
3. Migrate the 12-item data table and reward cards from parts to equipment.
4. Add STRIKE, BREAK, and GUARD action profiles and completed-set rules.
5. Adapt run storage, hangar snapshots, PvP loadouts, relay frames, and Canvas HUD to equipment names.
6. Re-run deterministic, ring-out, run-flow, reward, local relay, and online-match tests; add action-specific smoke cases.
7. Conduct desktop playtests before reopening mobile control work or visual character asset work.

Each step must compile and commit independently. The current spinner balance numbers cannot be used as evidence after step 2; character combat requires a new measurement report before numerical tuning claims.

## 8. Acceptance Evidence

The first playable character-arena build must demonstrate all of the following in a fresh run:

- A player can move, face, manually attack, hold guard, dash/guard-break, and cast the equipped weapon skill with deterministic input frames.
- STRIKE, BREAK, and GUARD each have a distinct visible damage path, not only a stat label.
- A non-finishing ring-out removes health and resets both fighters; a finishing ring-out ends the battle.
- Eleven 3-choice rewards can produce weapon/armor/accessory sets and enhancements across a 12-battle run.
- A stored completed loadout can be normalized for the existing online one-round battle path.
- Repeated fixed-seed runs reproduce the same battle state and reward sequence.

Human readability, action feel, and numerical balance remain PM/QA judgments. Automated smoke results alone do not establish them.

## 9. Risks and Decision Record

- **Balance reset:** The previous spinner balance is no longer a valid evidence set after combat replacement. PM's 2026-07-28 direction authorizes reopening balance only for the new character model.
- **Scope pressure:** More characters, maps, jumps, or original-game-style modes are excluded until the first generic fighter run and PvP path are observable.
- **PvP compatibility:** Expanding the input frame changes local and relay tests together; the host-authoritative model remains mandatory.
- **Mobile:** The current touch input work stays as an input-boundary reference, but action-button layout is deferred until desktop action playtests identify the required controls.
