/**
 * S3 browser WebSocket client smoke.
 *
 * Run: npm run smoke:online-client
 * Written before src/net/onlineClient.ts exists. The smoke fixes the browser
 * boundary: create/join frames are queued until socket open, outbound frames
 * are role-filtered, and incoming relay frames are parsed before callbacks.
 */

import { createBattleState, DEFAULT_BOT_DEFINITION, DEFAULT_PLAYER_DEFINITION } from '../src/game/battleState';
import {
  createOnlineClient,
  type OnlineClientEvents,
  type WebSocketLike,
} from '../src/net/onlineClient';
import { PVP_PROTOCOL_VERSION, type PvpLoadout } from '../src/net/protocol';

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const LOADOUT: PvpLoadout = { layerId: 'L01', diskId: 'D01', driverId: 'R01' };

class FakeSocket implements WebSocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly sent: string[] = [];
  closeCalls = 0;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

function main(): void {
  const urls: string[] = [];
  const sockets: FakeSocket[] = [];
  const statuses: string[] = [];
  const rooms: string[] = [];
  const starts: number[] = [];
  const remoteInputs: number[] = [];
  const stateTicks: number[] = [];
  const opponentsLeft: string[] = [];

  const events: OnlineClientEvents = {
    onStatus(status, detail) {
      statuses.push(`${status}:${detail ?? ''}`);
    },
    onRoomCreated(code) {
      rooms.push(code);
    },
    onMatchStart(seed) {
      starts.push(seed);
    },
    onRemoteInput(tick) {
      remoteInputs.push(tick);
    },
    onState(tick) {
      stateTicks.push(tick);
    },
    onOpponentLeft() {
      opponentsLeft.push('left');
    },
  };

  const client = createOnlineClient({
    relayUrl: 'ws://relay.test',
    events,
    socketFactory(url) {
      urls.push(url);
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });

  client.createRoom(LOADOUT);
  expect(urls[0] === 'ws://relay.test/create', 'create must use /create endpoint');
  expect(sockets[0].sent.length === 0, 'create frame must wait for socket open');
  sockets[0].open();
  expect(
    sockets[0].sent[0] === JSON.stringify({ version: PVP_PROTOCOL_VERSION, type: 'create-room', loadout: LOADOUT }),
    'create must serialize the versioned create-room frame after socket open',
  );
  sockets[0].receive({ version: PVP_PROTOCOL_VERSION, type: 'room-created', code: 'ABCDEF', role: 'host' });
  expect(rooms[0] === 'ABCDEF', 'room-created must reach caller');

  const battle = createBattleState([DEFAULT_PLAYER_DEFINITION, DEFAULT_BOT_DEFINITION], 123);
  client.sendHostState(battle.tick, battle);
  expect(
    JSON.parse(sockets[0].sent[1] ?? '{}').type === 'state',
    'host may send snapshots after room-created confirms host role',
  );

  client.joinRoom('ABCDEF', LOADOUT);
  expect(urls[1] === 'ws://relay.test/room/ABCDEF', 'join must use room endpoint');
  sockets[1].open();
  expect(
    JSON.parse(sockets[1].sent[0] ?? '{}').type === 'join-room',
    'join must serialize join-room after socket open',
  );
  client.sendHostState(9, battle);
  expect(sockets[1].sent.length === 1, 'guest role must not send host state');
  client.sendGuestInput(3, { moveX: 1, moveY: 0, burst: true });
  expect(
    JSON.parse(sockets[1].sent[1] ?? '{}').type === 'input',
    'guest role must send local input to host',
  );

  sockets[1].receive({
    version: PVP_PROTOCOL_VERSION,
    type: 'match-start',
    seed: 987,
    hostLoadout: LOADOUT,
    guestLoadout: LOADOUT,
  });
  sockets[1].receive({
    version: PVP_PROTOCOL_VERSION,
    type: 'remote-input',
    tick: 4,
    input: { moveX: 0, moveY: 1, burst: false },
  });
  sockets[1].receive({ version: PVP_PROTOCOL_VERSION, type: 'state', tick: 5, battle });
  sockets[1].receive({ version: PVP_PROTOCOL_VERSION, type: 'opponent-left' });
  expect(starts[0] === 987, 'match-start must reach caller');
  expect(remoteInputs[0] === 4, 'remote input must reach caller');
  expect(stateTicks[0] === 5, 'state must reach caller');
  expect(opponentsLeft.length === 1, 'opponent-left must reach caller');

  sockets[1].receive({ version: 999, type: 'state' });
  expect(statuses.includes('error:invalid-message'), 'malformed server frame must be reported without dispatch');

  client.close();
  expect(sockets[1].closeCalls === 1, 'close must close the active socket');

  console.log('Browser online client cases: 12/12 observed');
}

main();
