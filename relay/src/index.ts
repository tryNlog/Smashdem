/**
 * Smashdem S3 room relay.
 *
 * Durable Object는 연결 쌍과 프레임 전달만 담당한다. 물리는 host browser가 실행하고,
 * state frame은 host→guest 단방향이다.
 */

import { DurableObject } from 'cloudflare:workers';
import { ROOM_CODE_LENGTH, isRoomCode, parseRelayClientMessage, type PvpLoadout, type PvpRole, type RelayServerMessage } from '../../src/net/protocol';
import { resolveRoomEndpoint, type RoomIntent } from './endpoint';
import { createRoomRouter, type RelaySend, type RoomRouter } from './router';

export interface Env {
  SMASHDEM_ROOM: DurableObjectNamespace<SmashdemRoom>;
}

type PendingAttachment = {
  readonly status: 'pending';
  readonly intent: RoomIntent;
  readonly code: string;
};

type AttachedAttachment = {
  readonly status: 'attached';
  readonly role: PvpRole;
  readonly loadout: PvpLoadout;
};

type SocketAttachment = PendingAttachment | AttachedAttachment;

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
  return code;
}

function createSeed(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] & 0x7fffffff;
}

function isPendingAttachment(value: unknown): value is PendingAttachment {
  if (!value || typeof value !== 'object') return false;
  const attachment = value as Record<string, unknown>;
  return attachment.status === 'pending' && (attachment.intent === 'create' || attachment.intent === 'join') && typeof attachment.code === 'string' && isRoomCode(attachment.code);
}

function isAttachedAttachment(value: unknown): value is AttachedAttachment {
  if (!value || typeof value !== 'object') return false;
  const attachment = value as Record<string, unknown>;
  const loadout = attachment.loadout;
  return (
    attachment.status === 'attached' &&
    (attachment.role === 'host' || attachment.role === 'guest') &&
    !!loadout &&
    typeof loadout === 'object' &&
    typeof (loadout as Record<string, unknown>).layerId === 'string' &&
    typeof (loadout as Record<string, unknown>).diskId === 'string' &&
    typeof (loadout as Record<string, unknown>).driverId === 'string'
  );
}

function messageText(message: ArrayBuffer | string): string {
  return typeof message === 'string' ? message : new TextDecoder().decode(message);
}

export class SmashdemRoom extends DurableObject<Env> {
  private readonly router: RoomRouter;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.router = createRoomRouter();

    // Hibernation 뒤에는 router 메모리만 사라진다. attachment에서 peer를 조용히 복원한다.
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as unknown;
      if (!isAttachedAttachment(attachment)) continue;
      this.router.restorePeer(attachment.role, attachment.loadout, this.sender(socket));
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket upgrade required.', { status: 426 });

    const url = new URL(request.url);
    const intent = url.searchParams.get('intent');
    const code = url.searchParams.get('code');
    if ((intent !== 'create' && intent !== 'join') || !code || !isRoomCode(code)) {
      return new Response('Invalid room endpoint.', { status: 400 });
    }

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    server.serializeAttachment({ status: 'pending', intent, code } satisfies PendingAttachment);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: ArrayBuffer | string): void {
    const frame = parseRelayClientMessage(messageText(message));
    if (!frame) {
      this.send(socket, { version: 1, type: 'error', code: 'invalid-message' });
      return;
    }

    const attachment = socket.deserializeAttachment() as unknown;
    if (isPendingAttachment(attachment)) {
      this.attachPendingSocket(socket, attachment, frame);
      return;
    }
    if (!isAttachedAttachment(attachment)) {
      this.send(socket, { version: 1, type: 'error', code: 'invalid-message' });
      return;
    }

    this.router.route(attachment.role, frame);
  }

  webSocketClose(socket: WebSocket, code: number, reason: string, _wasClean: boolean): void {
    const attachment = socket.deserializeAttachment() as unknown;
    if (isAttachedAttachment(attachment)) this.router.detach(attachment.role);
    socket.close(code, reason);
  }

  webSocketError(socket: WebSocket): void {
    const attachment = socket.deserializeAttachment() as unknown;
    if (isAttachedAttachment(attachment)) this.router.detach(attachment.role);
  }

  private attachPendingSocket(
    socket: WebSocket,
    pending: PendingAttachment,
    frame: ReturnType<typeof parseRelayClientMessage>,
  ): void {
    if (!frame) return;

    if (pending.intent === 'create') {
      if (frame.type !== 'create-room') {
        this.send(socket, { version: 1, type: 'error', code: 'invalid-message' });
        return;
      }
      if (!this.router.attachHost(frame.loadout, this.sender(socket))) return;
      socket.serializeAttachment({ status: 'attached', role: 'host', loadout: frame.loadout } satisfies AttachedAttachment);
      this.send(socket, { version: 1, type: 'room-created', code: pending.code, role: 'host' });
      return;
    }

    if (frame.type !== 'join-room' || frame.code !== pending.code) {
      this.send(socket, { version: 1, type: 'error', code: 'invalid-message' });
      return;
    }
    if (!this.router.attachGuest(frame.loadout, createSeed(), this.sender(socket))) return;
    socket.serializeAttachment({ status: 'attached', role: 'guest', loadout: frame.loadout } satisfies AttachedAttachment);
  }

  private sender(socket: WebSocket): RelaySend {
    return (frame) => this.send(socket, frame);
  }

  private send(socket: WebSocket, frame: RelayServerMessage): void {
    socket.send(JSON.stringify(frame));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Use /create or /room/<code> via WebSocket.', { status: 426 });

    const endpoint = resolveRoomEndpoint(new URL(request.url).pathname, createRoomCode);
    if (!endpoint) return new Response('Unknown room endpoint.', { status: 404 });

    const objectId = env.SMASHDEM_ROOM.idFromName(endpoint.code);
    const target = new URL('https://smashdem-room.invalid/socket');
    target.searchParams.set('intent', endpoint.intent);
    target.searchParams.set('code', endpoint.code);
    return env.SMASHDEM_ROOM.get(objectId).fetch(new Request(target.toString(), request));
  },
} satisfies ExportedHandler<Env>;