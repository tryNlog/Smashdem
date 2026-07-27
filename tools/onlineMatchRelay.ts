/**
 * S3 real WebSocket path smoke.
 *
 * Run: npm run smoke:online-match-relay
 * Requires: npm run relay:dev -- --port 8787
 *
 * This uses Node 22's WebSocket implementation with the same OnlineClient
 * default socket factory used by the browser. It does not replace a manual
 * two-tab Canvas check.
 */

import * as Balance from '../src/game/balance';
import { createOnlineMatch, type OnlineMatchStatus } from '../src/app/onlineMatch';
import { createOnlineClient } from '../src/net/onlineClient';
import type { PvpLoadout } from '../src/net/protocol';

const RELAY_URL = 'ws://127.0.0.1:8787';
const LOADOUT: PvpLoadout = { layerId: 'L02', diskId: 'D02', driverId: 'R02' };

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}

async function main(): Promise<void> {
  let roomCode = '';
  const hostStatuses: OnlineMatchStatus[] = [];
  const guestStatuses: OnlineMatchStatus[] = [];
  const host = createOnlineMatch({
    events: {
      onRoomCode(code) {
        roomCode = code;
      },
      onStatus(status) {
        hostStatuses.push(status);
      },
    },
    clientFactory(events) {
      return createOnlineClient({ relayUrl: RELAY_URL, events });
    },
  });
  const guest = createOnlineMatch({
    events: {
      onRoomCode() {},
      onStatus(status) {
        guestStatuses.push(status);
      },
    },
    clientFactory(events) {
      return createOnlineClient({ relayUrl: RELAY_URL, events });
    },
  });

  try {
    host.create(LOADOUT);
    await waitFor(() => roomCode.length === 6, 'host room code');
    guest.join(roomCode, LOADOUT);
    await waitFor(() => host.battle !== null && guest.battle !== null, 'match-start on both peers');
    expect(host.role === 'host' && guest.role === 'guest', 'room creator and joiner must retain opposite roles');

    host.step({ moveX: 0, moveY: 0, burst: false }, Balance.FIXED_DELTA_SECONDS);
    host.step({ moveX: 0, moveY: 0, burst: false }, Balance.FIXED_DELTA_SECONDS);
    host.step({ moveX: 0, moveY: 0, burst: false }, Balance.FIXED_DELTA_SECONDS);
    await waitFor(() => guest.battle?.tick === host.battle?.tick, 'guest host snapshot');
    expect(guest.battle?.tick === 3, 'guest must observe host third tick snapshot');

    guest.close();
    await waitFor(() => hostStatuses.includes('opponent-left'), 'host opponent-left relay event');
    expect(guestStatuses.includes('started'), 'guest must have received match-start before closing');

    console.log('Online match relay cases: 6/6 observed');
  } finally {
    host.close();
    guest.close();
  }
}

void main();
