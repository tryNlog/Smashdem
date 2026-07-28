# Character Arena PvP V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the existing host-authoritative room-code PvP path from spinner v1 frames to character-arena v2 input and equipment snapshots, then collect local two-browser evidence before the 8/2 23:00 decision.

**Architecture:** The Cloudflare relay remains schema-agnostic: it admits two peers and forwards versioned frames, while only the host executes `stepCharacterBattle()`. The protocol parser, online match coordinator, lobby entry, and renderer move together to v2. The plan deliberately separates local relay/two-tab evidence from PM-only Cloudflare deployment and GitHub Pages push.

**Tech Stack:** TypeScript, WebSocket, Cloudflare Durable Object relay already in `relay/`, Vite SSR smoke tools, Canvas 2D.

## Global Constraints

- `PVP_PROTOCOL_VERSION` changes from `1` to `2`; no v1 compatibility parser is retained.
- V2 loadouts have `weaponId`, `armorId`, and `accessoryId` using `W01`–`W04`, `A01`–`A04`, and `C01`–`C04`.
- Input validates quantized `-1|0|1` movement/action axes, boolean guard, and exact queued-action enum.
- Host alone runs character physics and sends snapshots; guest sends input only and renders newer host snapshots.
- PvP clamps enhancement to zero but keeps set identity. Do not mirror runs or use server inventory.
- The relay never evaluates health, guard, attacks, ring-outs, equipment, or result authority.
- No push, Cloudflare login, secret entry, or production deployment from Codex.

---

## File Map

| File | Responsibility |
|---|---|
| `src/net/protocol.ts` | V2 parser and message types. |
| `src/net/onlineClient.ts` | Typed V2 client transport. |
| `src/app/onlineBattle.ts` | Host-only fixed-step coordinator using character state. |
| `src/app/onlineMatch.ts` | Room lifecycle, input routing, snapshot handling, leave handling. |
| `src/app/characterSession.ts` | Builds normalized PvP equipment entries. |
| `src/app/characterHangar.ts` | Supplies stored character build snapshots. |
| `src/render/characterScreens.ts` | PvP selection/lobby and normalized-equipment labels. |
| `src/main.ts` | Character PvP entry and online fixed-loop wiring. |
| `tools/characterPvpProtocol.ts` | V2 parsing and invalid-frame smoke cases. |
| `tools/characterOnlineMatch.ts` | Host/guest authority and snapshot-flow smoke. |
| `tools/characterOnlineRelay.ts` | Local Durable Object two-client transport smoke. |

### Task 1: Protocol V2 and Equipment Snapshot Validation

**Files:**
- Modify: `src/net/protocol.ts`
- Create: `tools/characterPvpProtocol.ts`
- Modify: `package.json`

**Consumes:** `CharacterInputCommand` and `CharacterRunBuild` from the core and single-player plans.

**Produces:** V2 `PvpLoadout`, client/server messages, parsers, and `smoke:character-pvp-protocol`.

- [ ] **Step 1: Write failing V2 parser cases**

```ts
assert(parseRelayClientMessage(JSON.stringify({
  version: 2,
  type: 'input',
  tick: 12,
  input: { moveX: 1, moveY: 0, guard: false, queuedAction: 'dash', actionDirectionX: 1, actionDirectionY: 0 },
}))?.type === 'input');

assert(parseRelayClientMessage(v1Frame) === null);
assert(parseRelayClientMessage(invalidAccessoryId) === null);
assert(parseRelayClientMessage(floatDirectionFrame) === null);
```

- [ ] **Step 2: Run before v2 is implemented**

Run: `npx vite build --ssr tools/characterPvpProtocol.ts --outDir dist-tools --logLevel warn`

Expected: a failing v1/version assertion against the current parser.

- [ ] **Step 3: Replace v1 schema atomically**

```ts
export const PVP_PROTOCOL_VERSION = 2 as const;

export interface PvpLoadout {
  readonly weaponId: string;
  readonly armorId: string;
  readonly accessoryId: string;
}
```

Validate each ID with its slot prefix, action enum, all axes, room code, and natural tick. Update every `RelayClientMessage` and `RelayServerMessage` branch to use the new type.

- [ ] **Step 4: Run parser and build evidence**

```powershell
npm run smoke:character-pvp-protocol
npm run build
```

Expected: acceptance/rejection cases show v2 only; existing v1 protocol smoke is removed or rewritten in the same commit so it does not assert a retired schema.

- [ ] **Step 5: Commit protocol v2**

```powershell
git add package.json src/net/protocol.ts tools/characterPvpProtocol.ts tools/pvpProtocol.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(pvp): migrate relay protocol to character v2"
```

### Task 2: Host-Authoritative Character Match Coordinator

**Files:**
- Modify: `src/app/onlineBattle.ts`
- Modify: `src/app/onlineMatch.ts`
- Modify: `src/net/onlineClient.ts`
- Create: `tools/characterOnlineMatch.ts`
- Modify: `package.json`

**Consumes:** V2 frames and `stepCharacterBattle()`.

**Produces:** Host-only character simulation; guest input-only behavior; latest snapshot rendering state.

- [ ] **Step 1: Write failing host/guest authority cases**

```ts
const host = createOnlineCharacterMatch('host', initialBattle, client);
host.step(hostInput);
assert(host.snapshotTick === 1);
assert(client.sent.some((frame) => frame.type === 'state'));

const guest = createOnlineCharacterMatch('guest', initialBattle, client);
guest.step(guestInput);
assert(guest.snapshotTick === 0);
assert(client.sent.some((frame) => frame.type === 'input'));
```

- [ ] **Step 2: Run the new smoke before coordinator conversion**

Run: `npm run smoke:character-online-match`

Expected: unresolved character match factory or a failed assertion because v1 battle state is still used.

- [ ] **Step 3: Adapt coordinator and client callbacks**

Host stores both latest `CharacterInputCommand` values, calls `stepCharacterBattle()` on each fixed tick, and emits exactly one snapshot per host tick. Guest sends only its local frame and replaces render state only when a newer host snapshot arrives. Leave handling returns both roles to the character PvP lobby.

- [ ] **Step 4: Run authority/determinism checks**

```powershell
npm run smoke:character-online-match
npm run smoke:character-combat
npm run build
```

Expected: host tick count advances; guest local physics does not; duplicate/old snapshots are ignored; same fixed input sequence produces the same host snapshot bytes.

- [ ] **Step 5: Commit coordinator conversion**

```powershell
git add package.json src/app/onlineBattle.ts src/app/onlineMatch.ts src/net/onlineClient.ts tools/characterOnlineMatch.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(pvp): run character battles on host"
```

### Task 3: Normalized PvP Entry, Lobby, and Canvas Integration

**Files:**
- Modify: `src/app/characterSession.ts`
- Modify: `src/app/characterHangar.ts`
- Modify: `src/render/characterScreens.ts`
- Modify: `src/main.ts`
- Modify: `tools/characterOnlineMatch.ts`

**Consumes:** Task 1 parser and Task 2 coordinator.

**Produces:** Three baseline entries plus locally stored character builds, all converted to enhancement-zero `PvpLoadout` snapshots before room creation/join.

- [ ] **Step 1: Write failing normalization cases**

```ts
const pvpBuild = normalizeCharacterBuildForPvp(completedRunBuild);
const pvp = characterPvpLoadout(pvpBuild);
assert(pvp.weaponId.startsWith('W'));
assert(pvpBuild.weapon.level === 0 && pvpBuild.armor.level === 0 && pvpBuild.accessory.level === 0);
assert(completedEquipmentSet(completedRunBuild) === completedEquipmentSet(pvpBuild));
```

- [ ] **Step 2: Run before entry conversion**

Run: `npm run smoke:character-online-match`

Expected: missing character PvP snapshot helper or old `layerId/diskId/driverId` mismatch.

- [ ] **Step 3: Implement entry selection and fixed-loop wiring**

Export `normalizeCharacterBuildForPvp(build)` from `character/equipment.ts`; it copies equipment IDs and clamps every level to zero. Show baseline STRIKE/BREAK/GUARD entries and up to five stored character loadouts. Display weapon/armor/accessory names, set identity, and the explicit text that PvP normalizes enhancement. Reuse the existing room-code creation/join path; replace its loadout and render types only.

- [ ] **Step 4: Run UI-adjacent integration checks**

```powershell
npm run smoke:character-online-match
npm run smoke:character-pvp-protocol
npm run build
```

Expected: TypeScript checks the main loop and Canvas screens. Two-tab visual readability requires a human browser observation.

- [ ] **Step 5: Commit PvP entry integration**

```powershell
git add src/app/characterSession.ts src/app/characterHangar.ts src/render/characterScreens.ts src/main.ts tools/characterOnlineMatch.ts docs/ai-log.md docs/RELAY.md
git commit -m "feat(pvp): select normalized character loadouts"
```

### Task 4: Local Relay Evidence and 8/2 Decision Record

**Files:**
- Create: `tools/characterOnlineRelay.ts`
- Modify: `package.json`
- Modify: `relay/src/router.ts`
- Modify: `relay/src/index.ts`
- Modify: `docs/RELAY.md`
- Modify: `docs/ai-log.md`

**Consumes:** V2 client frames and the existing local Durable Object configuration.

**Produces:** A local host/guest room smoke and factual PM handoff for Cloudflare/Pages and the 8/2 decision.

- [ ] **Step 1: Write a failing local transport scenario**

```ts
const host = await connectCharacterClient('host');
const code = await host.createRoom(loadoutA);
const guest = await connectCharacterClient('guest');
await guest.joinRoom(code, loadoutB);
await waitForMatchStart(host, guest);
await host.sendInput(dashRight);
await waitForState(guest, 1);
assert(guest.latestBattle.tick === 1);
```

- [ ] **Step 2: Run before relay test conversion**

Run: `node tools/characterOnlineRelay.mjs`

Expected: missing tool or v1-frame parser rejection.

- [ ] **Step 3: Update relay tests without giving the relay combat authority**

The router and Durable Object may validate room/role/frame shape but must not inspect combat snapshots beyond parser acceptance. Update local relay test fixtures to v2 `W/A/C` loadouts and action frames.

- [ ] **Step 4: Run full local network evidence**

```powershell
npm run smoke:character-pvp-protocol
npm run smoke:character-online-match
npm run smoke:character-online-relay
npm run build
```

Then a human opens two desktop browser tabs against the local relay, creates/joins a room, executes one character battle to result, and records either the observation or a blocking condition in `docs/RELAY.md`.

- [ ] **Step 5: Commit the local-PvP handoff**

```powershell
git add package.json relay/src/router.ts relay/src/index.ts tools/characterOnlineRelay.ts docs/ai-log.md docs/RELAY.md
git commit -m "test(pvp): exercise character relay locally"
```

### Task 5: PM-Only Deployment Gate

**Files:**
- Modify: `DEPLOY.md`
- Modify: `README.md`
- Modify: `docs/RELAY.md`

**Consumes:** Local two-browser evidence from Task 4.

**Produces:** An exact PM checklist for Worker deployment, `VITE_RELAY_URL`, Pages redeploy, and public two-browser observation. It does not execute any account operation.

- [ ] **Step 1: Record the exact required values, not secrets**

Document the Worker origin format, conversion to `wss://`, the GitHub Actions variable name `VITE_RELAY_URL`, and the Pages URL. Do not put Cloudflare tokens, account IDs, or private endpoints in source.

- [ ] **Step 2: Add the public-observation checklist**

```markdown
- [ ] Two browsers create/join the same code.
- [ ] Both see match start.
- [ ] Host and guest inputs affect one authoritative battle.
- [ ] A battle result returns both clients to lobby.
```

- [ ] **Step 3: Commit documentation only**

```powershell
git add README.md DEPLOY.md docs/RELAY.md docs/ai-log.md
git commit -m "docs: hand off character PvP deployment"
```
