import {
  cloneCharacterBattleState,
  createCharacterBattleState,
  positionCombatantsAtSpawn,
  type CombatantDefinition,
} from '../src/game/character/battleState';
import * as Balance from '../src/game/character/balance';
import {
  DEFAULT_COMBAT_PROFILE,
  DEFAULT_COMBAT_STATS,
  NEUTRAL_CHARACTER_INPUT,
} from '../src/game/character/types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function expectThrows(action: () => void, message: string): void {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(message);
}

const starter = (name: string): CombatantDefinition => ({
  name,
  stats: DEFAULT_COMBAT_STATS,
  profile: DEFAULT_COMBAT_PROFILE,
});

const definitions: readonly CombatantDefinition[] = [starter('PLAYER'), starter('BOT')];
const state = createCharacterBattleState(definitions, 20260728);
const sameSeedState = createCharacterBattleState(definitions, 20260728);
const [player, bot] = state.combatants;

assert(
  state.combatants.every((fighter) => fighter.health === fighter.stats.healthMaximum),
  'new combatants must start at maximum health',
);
assert(
  state.combatants.every((fighter) => fighter.guard === fighter.stats.guardMaximum),
  'new combatants must start at maximum guard',
);
assert(state.phase === 'ready', 'new character battle state must begin in the ready phase');
assert(
  player.positionX === -Balance.CHARACTER_SPAWN_DISTANCE_FROM_CENTER
    && player.positionY === 0
    && bot.positionX === Balance.CHARACTER_SPAWN_DISTANCE_FROM_CENTER
    && bot.positionY === 0,
  'combatants must start at opposing central spawn coordinates',
);
assert(
  state.phaseElapsedSeconds === 0
    && state.battleElapsedSeconds === 0
    && state.tick === 0
    && state.resetFreezeRemainingSeconds === 0
    && state.hitCooldowns.every((cooldown) => cooldown === 0)
    && state.combatants.every((fighter) => (
      fighter.velocityX === 0
      && fighter.velocityY === 0
      && fighter.actionRemainingSeconds === 0
      && fighter.normalCooldownSeconds === 0
      && fighter.dashCooldownSeconds === 0
      && fighter.skillCooldownSeconds === 0
      && fighter.guardRegenDelaySeconds === 0
      && fighter.counterRemainingSeconds === 0
      && fighter.ringOutCount === 0
    )),
  'new character battle state must initialize timers and cooldowns to zero',
);
assert(
  NEUTRAL_CHARACTER_INPUT.moveX === 0
    && NEUTRAL_CHARACTER_INPUT.moveY === 0
    && NEUTRAL_CHARACTER_INPUT.actionDirectionX === 0
    && NEUTRAL_CHARACTER_INPUT.actionDirectionY === 0
    && !NEUTRAL_CHARACTER_INPUT.guard
    && NEUTRAL_CHARACTER_INPUT.queuedAction === 'none',
  'neutral character input must use zero axes and no action',
);
assert(
  JSON.stringify(sameSeedState) === JSON.stringify(state),
  'the same definitions and seed must create the same serializable state',
);

state.events.push({ type: 'ringOut', combatantIndex: 0, selfInflicted: false });
const cloned = cloneCharacterBattleState(state);
assert(
  JSON.stringify(cloned) === JSON.stringify(state),
  'cloned battle state must serialize identically',
);
cloned.combatants[0].health -= 1;
cloned.hitCooldowns[0] = 1;
cloned.random.cursor += 1;
cloned.events.push({ type: 'ringOut', combatantIndex: 1, selfInflicted: true });
assert(state.combatants[0].health === state.combatants[0].stats.healthMaximum, 'combatant state must clone independently');
assert(state.hitCooldowns[0] === 0, 'cooldown state must clone independently');
assert(state.random.cursor !== cloned.random.cursor, 'random state must clone independently');
assert(state.events.length === 1, 'event state must clone independently');

const threeCombatants = cloneCharacterBattleState(state).combatants;
threeCombatants.push({ ...threeCombatants[0], index: 2 });
expectThrows(
  () => positionCombatantsAtSpawn(threeCombatants),
  'spawn helper must reject more than two combatants',
);
expectThrows(
  () => positionCombatantsAtSpawn(threeCombatants.slice(0, 1)),
  'spawn helper must reject fewer than two combatants',
);

console.log('Character state cases: 14/14 observed');