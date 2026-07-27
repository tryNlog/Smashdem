# Smashdem S3 Real-time PvP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task-by-task. Each task uses a failing test before production code.

**Goal:** Connect two browsers through a six-character room code and finish one host-authoritative Smashdem battle while preserving the deterministic `src/game/` simulation.

**Architecture:** The host browser alone calls `stepBattle()` at 60 Hz; the guest sends its input and renders host snapshots. A Cloudflare Worker plus one Durable Object per room only creates rooms, forwards input/state frames, and never calculates physics. The initial local proof uses the same Worker protocol; public deployment is a separate PM-executed step because it requires a Cloudflare account.

**Tech Stack:** Vanilla TypeScript, Canvas 2D, Vite, browser WebSocket, Cloudflare Workers Durable Objects, Wrangler.

## Global Constraints

- `src/game/` remains deterministic: no DOM, `Date.now()`, or `Math.random()` (repository `AGENTS.md` §3).
- PvP is a 1-round snack match. Build data is frozen when the room starts; no run state, reward, or mid-match parts synchronization (`..\\02_게임설계.md:618`).
- Role is fixed per room: creator = host/index 0, joiner = guest/index 1. The host sends the simulated state; the relay does not judge outcomes.
- Six-character room codes, no account or matchmaking (`..\\03_일정.md:12,19-25`).
- Remote deployment and push remain PM actions (`AGENTS.md` §3). A public worker URL is not committed until PM provides it.
- Kill switch: 2026-08-02 23:00 KST. If two independent browser tabs cannot finish a match by then, replace online mode with local two-player mode (`..\\00_허브.md:48-49`).

## Protocol

All frames are UTF-8 JSON with `version: 1`.

```ts
export type PvpLoadout = {
  layerId: string;
  diskId: string;
  driverId: string;
};

export type RelayClientMessage =
  | { version: 1; type: 'create-room'; loadout: PvpLoadout }
  | { version: 1; type: 'join-room'; code: string; loadout: PvpLoadout }
  | { version: 1; type: 'input'; tick: number; input: InputCommand }
  | { version: 1; type: 'state'; tick: number; battle: BattleState }
  | { version: 1; type: 'leave' };

export type RelayServerMessage =
  | { version: 1; type: 'room-created'; code: string; role: 'host' }
  | { version: 1; type: 'match-start'; seed: number; hostLoadout: PvpLoadout; guestLoadout: PvpLoadout }
  | { version: 1; type: 'remote-input'; tick: number; input: InputCommand }
  | { version: 1; type: 'state'; tick: number; battle: BattleState }
  | { version: 1; type: 'opponent-left' }
  | { version: 1; type: 'error'; code: 'invalid-message' | 'room-not-found' | 'room-full' | 'role-forbidden' };
```

`battle.events` are included in every state frame. The guest consumes events only when snapshot `tick` increases. The host sends every third simulation tick (20 Hz); it sends the terminal state immediately. The room object rejects guest `state` and host `input` forwarding mistakes. Input `burst` is a one-tick pulse; the host consumes it once when the guest tick is newer than the last consumed input tick.

## Files

- Create `src/net/protocol.ts`: versioned frame types, `parseRelayMessage`, room code/loadout/input guards.
- Create `src/net/onlineClient.ts`: browser WebSocket lifecycle, callbacks, create/join/send input/send host state.
- Create `src/app/onlineBattle.ts`: host simulation and guest snapshot application; no DOM.
- Create `relay/src/index.ts` and `relay/wrangler.jsonc`: Worker/Durable Object relay.
- Create `tools/pvpProtocol.ts` and `tools/onlineBattle.ts`: executable deterministic smokes.
- Modify `package.json`: `smoke:pvp-protocol`, `smoke:online-battle`, `relay:dev`, and a PM-only `relay:deploy` command.
- Modify `src/app/session.ts`, `src/main.ts`, `src/render/screens.ts`, and `index.html`: entry selection → room create/join → lobby status → online battle handoff. The exact UI work starts only after Tasks 1–4 provide a working transport.
- Modify `docs/RELAY.md`, `docs/ai-log.md`, and the relevant S3 design/schedule entries at each handoff.

---

### Task 1: Versioned protocol and parser

**Files:**
- Create: `src/net/protocol.ts`
- Create: `tools/pvpProtocol.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `parseRelayClientMessage(raw: string): RelayClientMessage | null` and `parseRelayServerMessage(raw: string): RelayServerMessage | null`.
- Produces `isRoomCode(value: string): boolean` for uppercase six-character codes excluding ambiguous characters.

- [ ] **Step 1: Write the failing protocol smoke**

```ts
assert.equal(parseRelayClientMessage(JSON.stringify({
  version: 1,
  type: 'join-room',
  code: 'A7K9Q2',
  loadout: { layerId: 'L01', diskId: 'D01', driverId: 'R01' },
})).type, 'join-room');
assert.equal(parseRelayClientMessage('{"version":1,"type":"join-room","code":"oops"}'), null);
assert.equal(parseRelayServerMessage('{"version":2,"type":"room-created"}'), null);
```

- [ ] **Step 2: Run red**

Run: `npm run smoke:pvp-protocol`
Expected: command is absent or import fails because `src/net/protocol.ts` does not exist.

- [ ] **Step 3: Implement the smallest parser and types**

Use plain-object guards only; reject unknown fields only where they affect routing. Clamp `InputCommand.moveX/moveY` to `-1|0|1` at parsing time and require `burst` boolean. Do not import browser or Worker APIs.

- [ ] **Step 4: Run green and regressions**

Run: `npm run smoke:pvp-protocol; npm run build; npm run smoke:run`
Expected: parser cases print their assertions; `smoke:run` still reports same-seed 8/8.

- [ ] **Step 5: Commit**

```bash
git add src/net/protocol.ts tools/pvpProtocol.ts package.json
git commit -m "feat(pvp): add versioned relay protocol"
```

### Task 2: Online battle coordinator without a socket

**Files:**
- Create: `src/app/onlineBattle.ts`
- Create: `tools/onlineBattle.ts`

**Interfaces:**

```ts
export type OnlineRole = 'host' | 'guest';
export interface OnlineBattle {
  readonly battle: BattleState;
  readonly role: OnlineRole;
  step(localInput: InputCommand, deltaSeconds: number): boolean;
  receiveRemoteInput(tick: number, input: InputCommand): void;
  receiveSnapshot(tick: number, battle: BattleState): boolean;
  takeHostSnapshot(): { tick: number; battle: BattleState } | null;
}
```

- [ ] **Step 1: Write the failing coordinator smoke**

```ts
const host = createOnlineBattle('host', definitions, 123);
const guest = createOnlineBattle('guest', definitions, 123);
host.receiveRemoteInput(1, { moveX: 1, moveY: 0, burst: true });
host.step({ moveX: 0, moveY: 0, burst: false }, FIXED_DELTA_SECONDS);
const frame = host.takeHostSnapshot();
assert.ok(frame);
assert.equal(guest.receiveSnapshot(frame.tick, frame.battle), true);
assert.equal(guest.battle.tick, host.battle.tick);
assert.equal(guest.receiveSnapshot(frame.tick, frame.battle), false);
```

- [ ] **Step 2: Run red**

Run: `npm run smoke:online-battle`
Expected: command is absent or `createOnlineBattle` cannot be imported.

- [ ] **Step 3: Implement coordinator**

Host maps its keyboard to index 0 and queued remote input to index 1, calls existing `stepBattle`, and emits a deep `cloneBattleState` every third tick plus immediately on finish. Guest never invokes `stepBattle`; it only accepts a strictly newer snapshot and clones it. Reset `battle.events` only by replacing with the received snapshot so audio still has one event frame per increasing tick.

- [ ] **Step 4: Run green and deterministic regression**

Run: `npm run smoke:online-battle; npm run smoke; npm run smoke:run`
Expected: host/guest state equality after each delivered snapshot and existing smokes remain reproducible.

- [ ] **Step 5: Commit**

```bash
git add src/app/onlineBattle.ts tools/onlineBattle.ts package.json
git commit -m "feat(pvp): add host-authoritative battle coordinator"
```

### Task 3: Durable Object room relay

**Files:**
- Create: `relay/src/index.ts`
- Create: `relay/wrangler.jsonc`
- Modify: `package.json`

**Interfaces:**
- Relay owns only socket pairing and message routing. `SmashdemRoom` stores at most host and guest socket attachments `{ role, loadout }`.
- The Worker maps `/room/<code>` upgrades to `idFromName(code)`; code creation uses Worker `crypto.getRandomValues`, then creates the Durable Object name.

- [ ] **Step 1: Write failing pure router tests**

Extract `createRoomRouter(send)` into `relay/src/router.ts` and assert with fake `send` functions that a third peer receives `room-full`, a guest `state` receives `role-forbidden`, and a host state becomes exactly one guest forward.

- [ ] **Step 2: Run red**

Run: `npm run smoke:pvp-relay`
Expected: command/import failure before `router.ts` exists.

- [ ] **Step 3: Implement router then Worker adapter**

The host emits `match-start` once the guest joins. The Worker supplies a 31-bit seed using `crypto.getRandomValues`. A close from either peer forwards `opponent-left` and removes its attachment. The Durable Object must use the Hibernation WebSocket API (`ctx.acceptWebSocket`) and `serializeAttachment`; Cloudflare documents it for coordinated WebSocket rooms: https://developers.cloudflare.com/durable-objects/best-practices/websockets/.

- [ ] **Step 4: Run green and local relay**

Run: `npm run smoke:pvp-relay; npm run relay:dev`
Expected: router smoke describes all route assertions; Wrangler exposes a local `ws://127.0.0.1:<port>/room/<code>` endpoint.

- [ ] **Step 5: Commit**

```bash
git add relay package.json
git commit -m "feat(pvp): add durable object room relay"
```

### Task 4: Browser WebSocket client

**Files:**
- Create: `src/net/onlineClient.ts`
- Modify: `src/main.ts`
- Modify: `package.json`

**Interfaces:**

```ts
export interface OnlineClient {
  connectCreate(loadout: PvpLoadout): void;
  connectJoin(code: string, loadout: PvpLoadout): void;
  sendInput(tick: number, input: InputCommand): void;
  sendState(tick: number, battle: BattleState): void;
  close(): void;
}
```

- [ ] **Step 1: Write a failing fake-socket smoke**

Use an injected `WebSocketLike` factory. Assert create/join route serialization, no `state` send before role `host`, and a malformed server frame invokes one error callback without throwing.

- [ ] **Step 2: Run red**

Run: `npm run smoke:online-client`
Expected: command/import failure before client exists.

- [ ] **Step 3: Implement lifecycle**

Derive the endpoint from `VITE_RELAY_URL`; local fallback is `ws://127.0.0.1:8787`, production without a configured URL leaves online entry disabled and explains that relay deployment is pending. On close/error, return control to the PvP selection screen and preserve the selected entry.

- [ ] **Step 4: Run green**

Run: `npm run smoke:online-client; npm run build`
Expected: serialized frames match protocol smoke and the static client build has no secret.

- [ ] **Step 5: Commit**

```bash
git add src/net/onlineClient.ts tools/onlineClient.ts package.json src/main.ts
git commit -m "feat(pvp): add browser relay client"
```

### Task 5: Canvas lobby and session handoff

**Files:**
- Modify: `src/app/session.ts`
- Modify: `src/main.ts`
- Modify: `src/render/screens.ts`
- Modify: `index.html`

- [ ] **Step 1: Write a failing session-flow smoke**

```ts
session.activate('pvp:entry:preset:strike');
session.activate('pvp:create');
assert.equal(session.screen, 'pvpLobby');
assert.equal(session.selectedPvpEntry?.id, 'preset:strike');
```

- [ ] **Step 2: Run red**

Run: `npm run smoke:pvp-lobby`
Expected: `pvpLobby` and `selectedPvpEntry` are not present.

- [ ] **Step 3: Implement only required UI**

Add a Canvas lobby showing selected top, room code, connection state, and host/join/back controls. Add one native six-character `<input>` overlay for joining because Canvas has no text-entry semantics; it is shown only in `pvpLobby`, uppercases input, and disables join until `isRoomCode` is true. `main.ts` creates an `OnlineBattle` after `match-start`; host steps it, guest submits input and renders newer snapshots.

- [ ] **Step 4: Run green and manual two-tab proof**

Run: `npm run smoke:pvp-lobby; npm run build; npm run relay:dev`.
Manual: browser A creates a room, browser B joins the displayed code, each moves independently, host ends a battle, guest sees the same finish outcome. Record console errors and final tick values in `docs/RELAY.md`.

- [ ] **Step 5: Commit**

```bash
git add src/app/session.ts src/main.ts src/render/screens.ts index.html tools/pvpLobby.ts package.json
git commit -m "feat(pvp): add room lobby and online battle handoff"
```

### Task 6: Public relay deployment and kill-switch evidence

**Files:**
- Modify: `README.md`, `DEPLOY.md`, `docs/RELAY.md`, `docs/ai-log.md`, `..\\02_게임설계.md`, `..\\03_일정.md`

- [ ] **Step 1: Configure deployment input**

PM creates the Cloudflare Worker project and supplies only its public `wss://...workers.dev/room/` endpoint. Do not place account tokens, API secrets, or personal credentials in the repository.

- [ ] **Step 2: Build Pages with endpoint**

Run: `VITE_RELAY_URL=wss://<worker>/room/ npm run build`.
Expected: Vite static output contains the public endpoint only; no token is present.

- [ ] **Step 3: Perform two-device test**

Host and guest use distinct browser profiles or devices. Preserve: room code, role assignment, successful `match-start`, final tick, outcome, and disconnect behavior in `docs/RELAY.md`.

- [ ] **Step 4: Commit the evidence docs**

```bash
git add README.md DEPLOY.md docs/RELAY.md docs/ai-log.md
git commit -m "docs(pvp): record deployment and two-browser evidence"
```

## Self-review Notes

- Scope is one room, two peers, one match, no matchmaking/spectators/account system. These match the existing kill-switch scope.
- Anti-cheat is not provided: host authority prevents normal guest divergence but a modified host can forge state. `[UNSUPPORTED]` A production anti-cheat service is outside the NAN deadline and requires a trusted simulation server.
- Cloudflare public deployment requires a PM-owned account action; the local Worker test and all client protocol/coordinator work remain executable without that action.