/**
 * S3 PvP relay protocol boundary smoke.
 *
 * Run: npm run smoke:pvp-protocol
 * This is intentionally written before src/net/protocol.ts exists. It must fail
 * until the parser rejects malformed client and relay frames at the network edge.
 */

import {
  isRoomCode,
  parseRelayClientMessage,
  parseRelayServerMessage,
} from '../src/net/protocol';

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function main(): void {
  const join = parseRelayClientMessage(JSON.stringify({
    version: 1,
    type: 'join-room',
    code: 'A7K9Q2',
    loadout: { layerId: 'L01', diskId: 'D01', driverId: 'R01' },
  }));
  expect(join?.type === 'join-room', 'valid six-character join frame must parse');

  const input = parseRelayClientMessage(JSON.stringify({
    version: 1,
    type: 'input',
    tick: 12,
    input: { moveX: 1, moveY: 0, burst: true },
  }));
  expect(input?.type === 'input' && input.input.burst, 'valid burst input must parse');

  expect(!isRoomCode('oops'), 'lowercase and short room code must reject');
  expect(parseRelayClientMessage('{"version":1,"type":"join-room","code":"oops"}') === null, 'malformed join must reject');
  expect(parseRelayClientMessage(JSON.stringify({
    version: 1,
    type: 'input',
    tick: -1,
    input: { moveX: 3, moveY: 0, burst: false },
  })) === null, 'out-of-range input must reject');
  expect(parseRelayServerMessage('{"version":2,"type":"room-created"}') === null, 'unknown protocol version must reject');

  console.log('PvP protocol parser cases: 6/6 observed');
}

main();