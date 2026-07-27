/**
 * S3 OnlineMatch app-boundary smoke.
 *
 * Run: npm run smoke:online-match
 * Written before src/app/onlineMatch.ts exists. This proves the screen-facing
 * controller translates relay callbacks into host/guest battle ownership.
 */

import { createOnlineMatch, type OnlineMatchEvents } from '../src/app/onlineMatch';
import type { OnlineClient, OnlineClientEvents } from '../src/net/onlineClient';
import type { PvpLoadout } from '../src/net/protocol';
import * as Balance from '../src/game/balance';

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const LOADOUT: PvpLoadout = { layerId: 'L02', diskId: 'D02', driverId: 'R02' };

interface FakeClient extends OnlineClient {
  readonly events: OnlineClientEvents;
  readonly creates: PvpLoadout[];
  readonly joins: Array<{ readonly code: string; readonly loadout: PvpLoadout }>;
  readonly inputs: number[];
  readonly states: number[];
}

function makeFakeClient(events: OnlineClientEvents): FakeClient {
  const creates: PvpLoadout[] = [];
  const joins: Array<{ readonly code: string; readonly loadout: PvpLoadout }> = [];
  const inputs: number[] = [];
  const states: number[] = [];
  return {
    events,
    creates,
    joins,
    inputs,
    states,
    createRoom(loadout) {
      creates.push(loadout);
    },
    joinRoom(code, loadout) {
      joins.push({ code, loadout });
    },
    sendGuestInput(tick) {
      inputs.push(tick);
    },
    sendHostState(tick) {
      states.push(tick);
    },
    close() {},
  };
}

function main(): void {
  const clients: FakeClient[] = [];
  const roomCodes: string[] = [];
  const statuses: string[] = [];
  const events: OnlineMatchEvents = {
    onRoomCode(code) {
      roomCodes.push(code);
    },
    onStatus(status) {
      statuses.push(status);
    },
  };
  const match = createOnlineMatch({
    events,
    clientFactory(clientEvents) {
      const client = makeFakeClient(clientEvents);
      clients.push(client);
      return client;
    },
  });

  match.create(LOADOUT);
  expect(clients[0].creates[0] === LOADOUT, 'host flow must request room creation with selected loadout');
  clients[0].events.onRoomCreated('ABCDEF');
  expect(roomCodes[0] === 'ABCDEF', 'room-created must expose the share code');
  clients[0].events.onMatchStart(99, LOADOUT, LOADOUT);
  expect(match.role === 'host' && match.battle !== null, 'room creator must own host battle simulation');

  match.step({ moveX: 0, moveY: 0, burst: false }, Balance.FIXED_DELTA_SECONDS);
  match.step({ moveX: 0, moveY: 0, burst: false }, Balance.FIXED_DELTA_SECONDS);
  match.step({ moveX: 0, moveY: 0, burst: false }, Balance.FIXED_DELTA_SECONDS);
  expect(clients[0].states[0] === 3, 'host third fixed tick must forward a snapshot');

  const guest = createOnlineMatch({
    events: { onRoomCode() {}, onStatus() {} },
    clientFactory(clientEvents) {
      const client = makeFakeClient(clientEvents);
      clients.push(client);
      return client;
    },
  });
  guest.join('ABCDEF', LOADOUT);
  expect(clients[1].joins[0]?.code === 'ABCDEF', 'guest flow must request the supplied room code');
  clients[1].events.onMatchStart(99, LOADOUT, LOADOUT);
  guest.step({ moveX: 1, moveY: 0, burst: true }, Balance.FIXED_DELTA_SECONDS);
  expect(clients[1].inputs[0] === 1, 'guest fixed tick must forward one input sequence');

  const hostSnapshot = match.battle;
  if (!hostSnapshot) throw new Error('host snapshot missing');
  clients[1].events.onState(hostSnapshot.tick, hostSnapshot);
  expect(guest.battle?.tick === hostSnapshot.tick, 'guest must adopt a newer host snapshot');
  clients[0].events.onOpponentLeft();
  expect(statuses.includes('opponent-left'), 'opponent departure must reach UI state');

  console.log('Online match controller cases: 9/9 observed');
}

main();
