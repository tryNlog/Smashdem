/**
 * S3 PvP lobby session-flow smoke.
 *
 * Run: npm run smoke:pvp-lobby
 * Written before pvpLobby/selectedPvpEntry exist. This fixes the pure app
 * transition before Canvas or WebSocket code starts a connection.
 */

import { createSession } from '../src/app/session';

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function main(): void {
  const session = createSession(() => 12345);

  session.activate('battle:pvp');
  expect(session.screen === 'pvpSelect', 'battle PvP action must open entry selection');

  session.activate('pvp:entry:preset:attack');
  expect(session.screen === 'pvpLobby', 'selected entry must open the room lobby');
  expect(session.selectedPvpEntry?.id === 'preset:attack', 'room lobby must retain selected preset');

  session.activate('pvp:create');
  expect(session.screen === 'pvpLobby', 'create request must keep the lobby visible while connecting');

  session.activate('pvp:back');
  expect(session.screen === 'pvpSelect', 'lobby back action must return to entry selection');
  expect(session.selectedPvpEntry === null, 'lobby back action must clear the selected entry');

  console.log('PvP lobby session cases: 6/6 observed');
}

main();
