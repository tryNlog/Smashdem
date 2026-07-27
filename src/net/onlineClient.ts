/**
 * 브라우저 WebSocket 경계.
 *
 * 결정론 물리는 src/game 에 두고, 이 모듈은 relay JSON frame과 브라우저 소켓 수명만 다룬다.
 */

import type { BattleState, InputCommand } from '../game/types';
import {
  PVP_PROTOCOL_VERSION,
  parseRelayServerMessage,
  type PvpLoadout,
  type PvpRole,
  type RelayClientMessage,
} from './protocol';

export type OnlineClientStatus = 'connecting' | 'waiting' | 'started' | 'closed' | 'error';

/** 테스트와 브라우저 런타임이 공유하는 최소 WebSocket 표면. */
export interface WebSocketLike {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export interface OnlineClientEvents {
  onStatus(status: OnlineClientStatus, detail?: string): void;
  onRoomCreated(code: string): void;
  onMatchStart(seed: number, hostLoadout: PvpLoadout, guestLoadout: PvpLoadout): void;
  onRemoteInput(tick: number, input: InputCommand): void;
  onState(tick: number, battle: BattleState): void;
  onOpponentLeft(): void;
}

export interface OnlineClientOptions {
  readonly relayUrl: string;
  readonly events: OnlineClientEvents;
  readonly socketFactory?: (url: string) => WebSocketLike;
}

export interface OnlineClient {
  createRoom(loadout: PvpLoadout): void;
  joinRoom(code: string, loadout: PvpLoadout): void;
  sendGuestInput(tick: number, input: InputCommand): void;
  sendHostState(tick: number, battle: BattleState): void;
  close(): void;
}

const OPEN_SOCKET_STATE = 1;

function defaultSocketFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function encode(message: RelayClientMessage): string {
  return JSON.stringify(message);
}

export function createOnlineClient(options: OnlineClientOptions): OnlineClient {
  const relayUrl = stripTrailingSlash(options.relayUrl);
  const socketFactory = options.socketFactory ?? defaultSocketFactory;
  let socket: WebSocketLike | null = null;
  let role: PvpRole | null = null;

  function isActive(candidate: WebSocketLike): boolean {
    return socket === candidate;
  }

  function send(message: RelayClientMessage): void {
    if (!socket || socket.readyState !== OPEN_SOCKET_STATE) return;
    socket.send(encode(message));
  }

  function connect(path: string, pendingMessage: RelayClientMessage, nextRole: PvpRole | null): void {
    const priorSocket = socket;
    socket = null;
    role = null;
    priorSocket?.close();

    const nextSocket = socketFactory(`${relayUrl}${path}`);
    socket = nextSocket;
    role = nextRole;
    options.events.onStatus('connecting');

    nextSocket.onopen = () => {
      if (!isActive(nextSocket)) return;
      send(pendingMessage);
      options.events.onStatus('waiting');
    };

    nextSocket.onmessage = (event) => {
      if (!isActive(nextSocket) || typeof event.data !== 'string') {
        if (isActive(nextSocket)) options.events.onStatus('error', 'invalid-message');
        return;
      }

      const message = parseRelayServerMessage(event.data);
      if (!message) {
        options.events.onStatus('error', 'invalid-message');
        return;
      }

      switch (message.type) {
        case 'room-created':
          role = message.role;
          options.events.onRoomCreated(message.code);
          return;
        case 'match-start':
          options.events.onStatus('started');
          options.events.onMatchStart(message.seed, message.hostLoadout, message.guestLoadout);
          return;
        case 'remote-input':
          options.events.onRemoteInput(message.tick, message.input);
          return;
        case 'state':
          options.events.onState(message.tick, message.battle);
          return;
        case 'opponent-left':
          options.events.onOpponentLeft();
          return;
        case 'error':
          options.events.onStatus('error', message.code);
          return;
      }
    };

    nextSocket.onerror = () => {
      if (isActive(nextSocket)) options.events.onStatus('error', 'connection-error');
    };

    nextSocket.onclose = () => {
      if (!isActive(nextSocket)) return;
      socket = null;
      role = null;
      options.events.onStatus('closed');
    };
  }

  return {
    createRoom(loadout: PvpLoadout): void {
      connect('/create', { version: PVP_PROTOCOL_VERSION, type: 'create-room', loadout }, null);
    },

    joinRoom(code: string, loadout: PvpLoadout): void {
      connect(`/room/${code}`, { version: PVP_PROTOCOL_VERSION, type: 'join-room', code, loadout }, 'guest');
    },

    sendGuestInput(tick: number, input: InputCommand): void {
      if (role !== 'guest') return;
      send({ version: PVP_PROTOCOL_VERSION, type: 'input', tick, input });
    },

    sendHostState(tick: number, battle: BattleState): void {
      if (role !== 'host') return;
      send({ version: PVP_PROTOCOL_VERSION, type: 'state', tick, battle });
    },

    close(): void {
      const activeSocket = socket;
      socket = null;
      role = null;
      if (!activeSocket) return;
      if (activeSocket.readyState === OPEN_SOCKET_STATE) {
        activeSocket.send(encode({ version: PVP_PROTOCOL_VERSION, type: 'leave' }));
      }
      activeSocket.close();
    },
  };
}
