import {
  cloneCharacterBattleState,
  createCharacterBattleState,
  positionCombatantsAtSpawn,
  type CombatantDefinition,
} from '../src/game/character/battleState';
import * as Balance from '../src/game/character/balance';
import { aimStepToUnit, isValidAimStep } from '../src/game/character/aim';
import {
  DEFAULT_COMBAT_PROFILE,
  DEFAULT_COMBAT_STATS,
  neutralCharacterInput,
} from '../src/game/character/types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertClose(actual: number, expected: number, message: string): void {
  if (Math.abs(actual - expected) >= 1e-12) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
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

assertClose(aimStepToUnit(0).x, 1, 'aim step 0 must face world +X');
assertClose(aimStepToUnit(0).y, 0, 'aim step 0 must have no Y direction');
assertClose(aimStepToUnit(64).y, 1, 'aim step 64 must face world +Y');
assertClose(aimStepToUnit(128).x, -1, 'aim step 128 must face world -X');
assertClose(aimStepToUnit(192).y, -1, 'aim step 192 must face world -Y');
assert(
  isValidAimStep(255) && !isValidAimStep(256) && !isValidAimStep(1.5),
  'aim steps must be integer values from 0 through 255',
);

const state = createCharacterBattleState(definitions, 20260728);
const sameSeedState = createCharacterBattleState(definitions, 20260728);
const [player, bot] = state.combatants;
const neutralAtBotAim = neutralCharacterInput(128);

assert(state.combatants[0].facingAimStep === 0, 'combatant 0 must spawn facing aim step 0');
assert(state.combatants[1].facingAimStep === 128, 'combatant 1 must spawn facing aim step 128');
assert(!('guard' in player), 'combatants must not carry a guard resource');
assert(!('guardRegenDelaySeconds' in player), 'combatants must not carry guard regeneration state');
assert(!('hitCooldowns' in state), 'battle state must not carry global hit cooldowns');
assert(player.activeCounterMultiplier === 1, 'new combatants must start without a counter multiplier');
assert(
  state.combatants.every((fighter) => fighter.health === fighter.stats.healthMaximum),
  'new combatants must start at maximum health',
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
    && state.combatants.every((fighter) => (
      fighter.velocityX === 0
      && fighter.velocityY === 0
      && fighter.actionRemainingSeconds === 0
      && fighter.normalCooldownSeconds === 0
      && fighter.dashCooldownSeconds === 0
      && fighter.skillCooldownSeconds === 0
      && fighter.counterRemainingSeconds === 0
      && fighter.actionAimStep === fighter.facingAimStep
      && fighter.dashDirectionX === 0
      && fighter.dashDirectionY === 0
      && !fighter.dashImpulsePending
      && !fighter.actionHasHit
      && !fighter.counterIsReinforced
      && !fighter.grantsReinforcedCounter
      && fighter.activeCounterMultiplier === 1
      && !fighter.activeCounterStagger
      && fighter.ringOutCount === 0
    )),
  'new character battle state must initialize action and counter state',
);
assert(
  neutralAtBotAim.moveX === 0
    && neutralAtBotAim.moveY === 0
    && neutralAtBotAim.aimStep === 128
    && neutralAtBotAim.actionAimStep === 128
    && neutralAtBotAim.dashMoveX === 0
    && neutralAtBotAim.dashMoveY === 0
    && !neutralAtBotAim.guard
    && neutralAtBotAim.queuedAction === 'none',
  'neutral character input must retain its caller-provided aim step and no action',
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
cloned.combatants[0].facingAimStep = 64;
cloned.random.cursor += 1;
cloned.events.push({ type: 'ringOut', combatantIndex: 1, selfInflicted: true });
assert(state.combatants[0].health === state.combatants[0].stats.healthMaximum, 'combatant state must clone independently');
assert(state.combatants[0].facingAimStep === 0, 'aim state must clone independently');
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

console.log('Character state cases: 21/21 observed');