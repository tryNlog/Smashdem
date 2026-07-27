/**
 * 온라인 대전의 app 계층 조정기.
 *
 * WebSocket frame은 src/net/onlineClient, 물리 권위는 onlineBattle에 남긴다.
 * 이 파일은 화면이 방 생성/참가·상태 문구·현재 BattleState를 한 곳에서 읽게 하는 경계다.
 */

import { definitionFromBuild } from '../game/battleState';
import type { BattleState, InputCommand } from '../game/types';
import { buildFromIds } from '../game/parts';
import {
  createOnlineBattle,
  type OnlineBattle,
  type OnlineBattleUpdate,
  type OnlineRole,
} from './onlineBattle';
import type { OnlineClient, OnlineClientEvents, OnlineClientStatus } from '../net/onlineClient';
import type { PvpLoadout } from '../net/protocol';

export type OnlineMatchStatus = OnlineClientStatus | 'idle' | 'opponent-left';

export interface OnlineMatchEvents {
  onRoomCode(code: string): void;
  onStatus(status: OnlineMatchStatus, detail?: string): void;
}

export interface OnlineMatchOptions {
  readonly events: OnlineMatchEvents;
  readonly clientFactory: (events: OnlineClientEvents) => OnlineClient;
}

export interface OnlineMatch {
  readonly role: OnlineRole | null;
  readonly battle: BattleState | null;
  readonly roomCode: string | null;
  create(loadout: PvpLoadout): void;
  join(code: string, loadout: PvpLoadout): void;
  step(input: InputCommand, deltaSeconds: number): OnlineBattleUpdate;
  close(): void;
}

function pvpDefinition(name: string, loadout: PvpLoadout) {
  const build = buildFromIds(loadout.layerId, loadout.diskId, loadout.driverId);
  return definitionFromBuild(name, build, { applySetBonus: true, context: 'pvp' });
}

export function createOnlineMatch(options: OnlineMatchOptions): OnlineMatch {
  let role: OnlineRole | null = null;
  let battle: OnlineBattle | null = null;
  let client: OnlineClient | null = null;
  let roomCode: string | null = null;

  function report(status: OnlineMatchStatus, detail?: string): void {
    options.events.onStatus(status, detail);
  }

  function begin(nextRole: OnlineRole): OnlineClient {
    client?.close();
    role = nextRole;
    battle = null;
    roomCode = null;

    client = options.clientFactory({
      onStatus(status, detail) {
        report(status, detail);
      },
      onRoomCreated(code) {
        roomCode = code;
        options.events.onRoomCode(code);
      },
      onMatchStart(seed, hostLoadout, guestLoadout) {
        if (!role) {
          report('error', 'missing-role');
          return;
        }
        try {
          battle = createOnlineBattle(
            role,
            [pvpDefinition('HOST', hostLoadout), pvpDefinition('GUEST', guestLoadout)],
            seed,
          );
          report('started');
        } catch {
          battle = null;
          report('error', 'invalid-loadout');
        }
      },
      onRemoteInput(tick, input) {
        battle?.receiveRemoteInput(tick, input);
      },
      onState(tick, snapshot) {
        battle?.receiveSnapshot(tick, snapshot);
      },
      onOpponentLeft() {
        report('opponent-left');
      },
    });
    report('connecting');
    return client;
  }

  return {
    get role() {
      return role;
    },
    get battle() {
      return battle?.battle ?? null;
    },
    get roomCode() {
      return roomCode;
    },

    create(loadout: PvpLoadout): void {
      begin('host').createRoom(loadout);
    },

    join(code: string, loadout: PvpLoadout): void {
      begin('guest').joinRoom(code, loadout);
    },

    step(input: InputCommand, deltaSeconds: number): OnlineBattleUpdate {
      if (!battle || !client) return null;
      const update = battle.step(input, deltaSeconds);
      if (update?.kind === 'host-snapshot') {
        client.sendHostState(update.tick, update.battle);
      } else if (update?.kind === 'guest-input') {
        client.sendGuestInput(update.sequence, update.input);
      }
      return update;
    },

    close(): void {
      client?.close();
      client = null;
      battle = null;
      role = null;
      roomCode = null;
      report('closed');
    },
  };
}
