/** Relay Worker URL → room intent 해석. Worker API 없이 테스트할 수 있다. */

import { isRoomCode } from '../../src/net/protocol';

export type RoomIntent = 'create' | 'join';

export interface RoomEndpoint {
  readonly intent: RoomIntent;
  readonly code: string;
}

export function resolveRoomEndpoint(pathname: string, createCode: () => string): RoomEndpoint | null {
  if (pathname === '/create') {
    const code = createCode();
    return isRoomCode(code) ? { intent: 'create', code } : null;
  }

  const match = /^\/room\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  const code = match[1] ?? '';
  return isRoomCode(code) ? { intent: 'join', code } : null;
}