import {
  cloneCharacterBattleState,
  createCharacterBattleState,
  type CombatantDefinition,
} from '../src/game/character/battleState';
import { DEFAULT_COMBAT_PROFILE, DEFAULT_COMBAT_STATS } from '../src/game/character/types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const starter = (name: string): CombatantDefinition => ({
  name,
  stats: DEFAULT_COMBAT_STATS,
  profile: DEFAULT_COMBAT_PROFILE,
});

const definitions: readonly CombatantDefinition[] = [starter('PLAYER'), starter('BOT')];
const state = createCharacterBattleState(definitions, 20260728);
const sameSeedState = createCharacterBattleState(definitions, 20260728);

assert(
  state.combatants.every((fighter) => fighter.health === fighter.stats.healthMaximum),
  'new combatants must start at maximum health',
);
assert(
  JSON.stringify(cloneCharacterBattleState(state)) === JSON.stringify(state),
  'cloned battle state must serialize identically',
);
assert(
  JSON.stringify(sameSeedState) === JSON.stringify(state),
  'the same definitions and seed must create the same serializable state',
);

const cloned = cloneCharacterBattleState(state);
cloned.combatants[0].health -= 1;
cloned.hitCooldowns[0] = 1;
assert(state.combatants[0].health === state.combatants[0].stats.healthMaximum, 'combatant state must clone independently');
assert(state.hitCooldowns[0] === 0, 'cooldown state must clone independently');

console.log('Character state cases: 5/5 observed');
