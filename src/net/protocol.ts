/**
 * S3 실시간 PvP 릴레이 프레임.
 *
 * 이 파일은 브라우저 WebSocket·Cloudflare Worker 양쪽이 공유하는 순수 JSON 경계다.
 * 결정론 물리는 src/game 에 남고, 여기서는 메시지 모양만 검사한다.
 */

import type { BattleState, InputCommand } from '../game/types';

export const PVP_PROTOCOL_VERSION = 1 as const;
export const ROOM_CODE_LENGTH = 6;

/** 혼동하기 쉬운 I/O/0/1 을 뺀 대문자·숫자 여섯 자리. */
const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const PART_ID_PATTERNS = {
  layer: /^L\d{2}$/,
  disk: /^D\d{2}$/,
  driver: /^R\d{2}$/,
};

export type PvpRole = 'host' | 'guest';

/** PvP 시작 시점에 고정되는 파츠 스냅샷. 강화는 PvP 컨텍스트에서 0으로 정규화한다. */
export interface PvpLoadout {
  readonly layerId: string;
  readonly diskId: string;
  readonly driverId: string;
}

export type RelayClientMessage =
  | { readonly version: typeof PVP_PROTOCOL_VERSION; readonly type: 'create-room'; readonly loadout: PvpLoadout }
  | { readonly version: typeof PVP_PROTOCOL_VERSION; readonly type: 'join-room'; readonly code: string; readonly loadout: PvpLoadout }
  | { readonly version: typeof PVP_PROTOCOL_VERSION; readonly type: 'input'; readonly tick: number; readonly input: InputCommand }
  | { readonly version: typeof PVP_PROTOCOL_VERSION; readonly type: 'state'; readonly tick: number; readonly battle: BattleState }
  | { readonly version: typeof PVP_PROTOCOL_VERSION; readonly type: 'leave' };

export type RelayErrorCode = 'invalid-message' | 'room-not-found' | 'room-full' | 'role-forbidden';

export type RelayServerMessage =
  | { readonly version: typeof PVP_PROTOCOL_VERSION; readonly type: 'room-created'; readonly code: string; readonly role: 'host' }
  | {
      readonly version: typeof PVP_PROTOCOL_VERSION;
      readonly type: 'match-start';
      readonly seed: number;
      readonly hostLoadout: PvpLoadout;
      readonly guestLoadout: PvpLoadout;
    }
  | { readonly version: typeof PVP_PROTOCOL_VERSION; readonly type: 'remote-input'; readonly tick: number; readonly input: InputCommand }
  | { readonly version: typeof PVP_PROTOCOL_VERSION; readonly type: 'state'; readonly tick: number; readonly battle: BattleState }
  | { readonly version: typeof PVP_PROTOCOL_VERSION; readonly type: 'opponent-left' }
  | { readonly version: typeof PVP_PROTOCOL_VERSION; readonly type: 'error'; readonly code: RelayErrorCode };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNaturalNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isLoadout(value: unknown): value is PvpLoadout {
  if (!isRecord(value)) return false;
  return (
    typeof value.layerId === 'string' &&
    PART_ID_PATTERNS.layer.test(value.layerId) &&
    typeof value.diskId === 'string' &&
    PART_ID_PATTERNS.disk.test(value.diskId) &&
    typeof value.driverId === 'string' &&
    PART_ID_PATTERNS.driver.test(value.driverId)
  );
}

function isInputCommand(value: unknown): value is InputCommand {
  if (!isRecord(value)) return false;
  return (
    (value.moveX === -1 || value.moveX === 0 || value.moveX === 1) &&
    (value.moveY === -1 || value.moveY === 0 || value.moveY === 1) &&
    typeof value.burst === 'boolean'
  );
}

function isBattleSnapshot(value: unknown): value is BattleState {
  // 상태 전체를 네트워크 경계에서 깊게 다시 검증하면 host 20Hz 스냅샷 비용이 불필요하게 커진다.
  // 물리값은 host만 생성하고 guest는 더 최신 tick만 반영한다. 최소한 객체가 아닌 프레임은 차단한다.
  return isRecord(value);
}

function decode(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== PVP_PROTOCOL_VERSION || typeof value.type !== 'string') return null;
    return value;
  } catch {
    return null;
  }
}

export function isRoomCode(value: string): boolean {
  return value.length === ROOM_CODE_LENGTH && ROOM_CODE_PATTERN.test(value);
}

export function parseRelayClientMessage(raw: string): RelayClientMessage | null {
  const frame = decode(raw);
  if (!frame) return null;

  switch (frame.type) {
    case 'create-room':
      return isLoadout(frame.loadout)
        ? { version: PVP_PROTOCOL_VERSION, type: 'create-room', loadout: frame.loadout }
        : null;
    case 'join-room':
      return typeof frame.code === 'string' && isRoomCode(frame.code) && isLoadout(frame.loadout)
        ? { version: PVP_PROTOCOL_VERSION, type: 'join-room', code: frame.code, loadout: frame.loadout }
        : null;
    case 'input':
      return isNaturalNumber(frame.tick) && isInputCommand(frame.input)
        ? { version: PVP_PROTOCOL_VERSION, type: 'input', tick: frame.tick, input: frame.input }
        : null;
    case 'state':
      return isNaturalNumber(frame.tick) && isBattleSnapshot(frame.battle)
        ? { version: PVP_PROTOCOL_VERSION, type: 'state', tick: frame.tick, battle: frame.battle }
        : null;
    case 'leave':
      return { version: PVP_PROTOCOL_VERSION, type: 'leave' };
    default:
      return null;
  }
}

export function parseRelayServerMessage(raw: string): RelayServerMessage | null {
  const frame = decode(raw);
  if (!frame) return null;

  switch (frame.type) {
    case 'room-created':
      return typeof frame.code === 'string' && isRoomCode(frame.code) && frame.role === 'host'
        ? { version: PVP_PROTOCOL_VERSION, type: 'room-created', code: frame.code, role: 'host' }
        : null;
    case 'match-start':
      return isNaturalNumber(frame.seed) && isLoadout(frame.hostLoadout) && isLoadout(frame.guestLoadout)
        ? {
            version: PVP_PROTOCOL_VERSION,
            type: 'match-start',
            seed: frame.seed,
            hostLoadout: frame.hostLoadout,
            guestLoadout: frame.guestLoadout,
          }
        : null;
    case 'remote-input':
      return isNaturalNumber(frame.tick) && isInputCommand(frame.input)
        ? { version: PVP_PROTOCOL_VERSION, type: 'remote-input', tick: frame.tick, input: frame.input }
        : null;
    case 'state':
      return isNaturalNumber(frame.tick) && isBattleSnapshot(frame.battle)
        ? { version: PVP_PROTOCOL_VERSION, type: 'state', tick: frame.tick, battle: frame.battle }
        : null;
    case 'opponent-left':
      return { version: PVP_PROTOCOL_VERSION, type: 'opponent-left' };
    case 'error':
      return frame.code === 'invalid-message' || frame.code === 'room-not-found' || frame.code === 'room-full' || frame.code === 'role-forbidden'
        ? { version: PVP_PROTOCOL_VERSION, type: 'error', code: frame.code }
        : null;
    default:
      return null;
  }
}