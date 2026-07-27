/**
 * 두 명짜리 Smashdem PvP 방의 순수 메시지 router.
 *
 * WebSocket·Durable Object API를 모르고 전송 함수만 받는다. 이 분리 덕분에 역할 필터와
 * 방 정원을 SSR smoke에서 먼저 확인할 수 있다.
 */

import type {
  PvpLoadout,
  PvpRole,
  RelayClientMessage,
  RelayServerMessage,
} from '../../src/net/protocol';

export type RelaySend = (frame: RelayServerMessage) => void;

interface AttachedPeer {
  readonly loadout: PvpLoadout;
  readonly send: RelaySend;
}

export interface RoomRouter {
  attachHost(loadout: PvpLoadout, send: RelaySend): boolean;
  attachGuest(loadout: PvpLoadout, seed: number, send: RelaySend): boolean;
  route(from: PvpRole, frame: RelayClientMessage): void;
  detach(role: PvpRole): void;
}

export function createRoomRouter(): RoomRouter {
  let host: AttachedPeer | null = null;
  let guest: AttachedPeer | null = null;

  function peerFor(role: PvpRole): AttachedPeer | null {
    return role === 'host' ? host : guest;
  }

  function sendError(role: PvpRole, code: Extract<RelayServerMessage, { type: 'error' }>['code']): void {
    peerFor(role)?.send({ version: 1, type: 'error', code });
  }

  function sendMatchStart(seed: number): void {
    if (!host || !guest) return;
    const frame: RelayServerMessage = {
      version: 1,
      type: 'match-start',
      seed,
      hostLoadout: host.loadout,
      guestLoadout: guest.loadout,
    };
    host.send(frame);
    guest.send(frame);
  }

  return {
    attachHost(loadout: PvpLoadout, send: RelaySend): boolean {
      if (host) {
        send({ version: 1, type: 'error', code: 'room-full' });
        return false;
      }
      host = { loadout, send };
      return true;
    },

    attachGuest(loadout: PvpLoadout, seed: number, send: RelaySend): boolean {
      if (!host) {
        send({ version: 1, type: 'error', code: 'room-not-found' });
        return false;
      }
      if (guest) {
        send({ version: 1, type: 'error', code: 'room-full' });
        return false;
      }
      guest = { loadout, send };
      sendMatchStart(seed);
      return true;
    },

    route(from: PvpRole, frame: RelayClientMessage): void {
      const sender = peerFor(from);
      if (!sender) return;

      switch (frame.type) {
        case 'input':
          if (from !== 'guest') {
            sendError(from, 'role-forbidden');
            return;
          }
          host?.send({ version: 1, type: 'remote-input', tick: frame.tick, input: frame.input });
          return;
        case 'state':
          if (from !== 'host') {
            sendError(from, 'role-forbidden');
            return;
          }
          guest?.send({ version: 1, type: 'state', tick: frame.tick, battle: frame.battle });
          return;
        case 'leave':
          this.detach(from);
          return;
        case 'create-room':
        case 'join-room':
          // create/join은 socket attach 시점에만 유효하다. 이미 방에 들어온 peer가 다시 보낼 수 없다.
          sendError(from, 'role-forbidden');
          return;
      }
    },

    detach(role: PvpRole): void {
      if (role === 'host') {
        if (!host) return;
        host = null;
        guest?.send({ version: 1, type: 'opponent-left' });
        return;
      }
      if (!guest) return;
      guest = null;
      host?.send({ version: 1, type: 'opponent-left' });
    },
  };
}