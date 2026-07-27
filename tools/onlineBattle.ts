/**
 * S3 host-authoritative battle coordinator smoke.
 *
 * Run: npm run smoke:online-battle
 * Written before src/app/onlineBattle.ts exists. The smoke proves that only the
 * host advances physics and a guest only accepts strictly newer state frames.
 */

import * as Balance from '../src/game/balance';
import { DEFAULT_BOT_DEFINITION, DEFAULT_PLAYER_DEFINITION } from '../src/game/battleState';
import { createOnlineBattle } from '../src/app/onlineBattle';

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function main(): void {
  const definitions = [DEFAULT_PLAYER_DEFINITION, DEFAULT_BOT_DEFINITION] as const;
  const host = createOnlineBattle('host', definitions, 12345);
  const guest = createOnlineBattle('guest', definitions, 12345);

  const guestInput = guest.step({ moveX: 1, moveY: 0, burst: true }, Balance.FIXED_DELTA_SECONDS);
  expect(guestInput?.kind === 'guest-input' && guestInput.sequence === 1, 'guest must emit first input sequence');
  expect(guest.battle.tick === 0, 'guest must not advance local physics');

  if (guestInput?.kind === 'guest-input') host.receiveRemoteInput(guestInput.sequence, guestInput.input);
  host.step({ moveX: 0, moveY: 0, burst: false }, Balance.FIXED_DELTA_SECONDS);
  host.step({ moveX: 0, moveY: 0, burst: false }, Balance.FIXED_DELTA_SECONDS);
  const hostFrame = host.step({ moveX: 0, moveY: 0, burst: false }, Balance.FIXED_DELTA_SECONDS);
  expect(hostFrame?.kind === 'host-snapshot', 'host must emit a snapshot every third simulation tick');

  if (hostFrame?.kind !== 'host-snapshot') throw new Error('missing host snapshot');
  expect(guest.receiveSnapshot(hostFrame.tick, hostFrame.battle), 'guest must accept newer snapshot');
  expect(guest.battle.tick === host.battle.tick, 'guest tick must equal delivered host tick');
  expect(!guest.receiveSnapshot(hostFrame.tick, hostFrame.battle), 'guest must ignore duplicate snapshot');

  console.log('Host-authoritative coordinator cases: 6/6 observed');
}

main();