/**
 * S3 room router smoke.
 *
 * Run: npm run smoke:pvp-relay
 * Written before relay/src/router.ts exists. It proves role filtering and room
 * capacity independently from Cloudflare Worker APIs.
 */

import { createRoomRouter } from '../relay/src/router';
import type { RelayServerMessage } from '../src/net/protocol';

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const LOADOUT = { layerId: 'L01', diskId: 'D01', driverId: 'R01' } as const;

function main(): void {
  const hostFrames: RelayServerMessage[] = [];
  const guestFrames: RelayServerMessage[] = [];
  const thirdFrames: RelayServerMessage[] = [];
  const router = createRoomRouter();

  router.attachHost(LOADOUT, (frame) => hostFrames.push(frame));
  expect(router.attachGuest(LOADOUT, 123, (frame) => guestFrames.push(frame)), 'second peer must join');
  expect(hostFrames.some((frame) => frame.type === 'match-start'), 'host must receive match start');
  expect(guestFrames.some((frame) => frame.type === 'match-start'), 'guest must receive match start');

  router.route('guest', {
    version: 1,
    type: 'input',
    tick: 1,
    input: { moveX: 1, moveY: 0, burst: true },
  });
  expect(hostFrames.some((frame) => frame.type === 'remote-input'), 'guest input must reach host');

  router.route('guest', {
    version: 1,
    type: 'state',
    tick: 1,
    battle: {} as never,
  });
  expect(guestFrames.some((frame) => frame.type === 'error' && frame.code === 'role-forbidden'), 'guest state must reject');

  expect(!router.attachGuest(LOADOUT, 456, (frame) => thirdFrames.push(frame)), 'third peer must reject');
  expect(thirdFrames.some((frame) => frame.type === 'error' && frame.code === 'room-full'), 'third peer must receive room-full');

  router.detach('host');
  expect(guestFrames.some((frame) => frame.type === 'opponent-left'), 'guest must see host leave');

  const restoredHostFrames: RelayServerMessage[] = [];
  const restoredGuestFrames: RelayServerMessage[] = [];
  const restored = createRoomRouter();
  restored.restorePeer('host', LOADOUT, (frame) => restoredHostFrames.push(frame));
  restored.restorePeer('guest', LOADOUT, (frame) => restoredGuestFrames.push(frame));
  expect(restoredHostFrames.length === 0 && restoredGuestFrames.length === 0, 'rehydration must not replay match-start');

  console.log('PvP room router cases: 9/9 observed');
}

main();