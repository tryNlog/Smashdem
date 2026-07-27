/**
 * Local Durable Object relay integration smoke.
 *
 * Prerequisite: npm run relay:dev -- --port 8787
 * Run: npm run smoke:relay-local
 */

const relayBase = process.env.SMASHDEM_RELAY_URL ?? 'ws://127.0.0.1:8787';
const loadout = { layerId: 'L01', diskId: 'D01', driverId: 'R01' };

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function createPeer(url) {
  const socket = new WebSocket(url);
  const frames = [];
  const waiters = [];

  socket.addEventListener('message', (event) => {
    const frame = JSON.parse(String(event.data));
    frames.push(frame);
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (!waiter.predicate(frame)) continue;
      waiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(frame);
    }
  });

  return {
    socket,
    async open() {
      if (socket.readyState === WebSocket.OPEN) return;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`open timed out: ${url}`)), 5000);
        socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
        socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error(`socket error: ${url}`)); }, { once: true });
      });
    },
    next(type) {
      const known = frames.find((frame) => frame.type === type);
      if (known) return Promise.resolve(known);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`frame timed out: ${type}`)), 5000);
        waiters.push({ predicate: (frame) => frame.type === type, resolve, timeout });
      });
    },
    close() { socket.close(); },
  };
}

async function main() {
  const host = createPeer(`${relayBase}/create`);
  await host.open();
  host.socket.send(JSON.stringify({ version: 1, type: 'create-room', loadout }));
  const created = await host.next('room-created');
  expect(typeof created.code === 'string' && created.code.length === 6, 'host must receive six-character code');

  const guest = createPeer(`${relayBase}/room/${created.code}`);
  await guest.open();
  guest.socket.send(JSON.stringify({ version: 1, type: 'join-room', code: created.code, loadout }));
  await Promise.all([host.next('match-start'), guest.next('match-start')]);

  guest.socket.send(JSON.stringify({ version: 1, type: 'input', tick: 1, input: { moveX: 1, moveY: 0, burst: true } }));
  const input = await host.next('remote-input');
  expect(input.tick === 1 && input.input.burst === true, 'guest input must reach host');

  host.socket.send(JSON.stringify({ version: 1, type: 'state', tick: 3, battle: { tick: 3 } }));
  const state = await guest.next('state');
  expect(state.tick === 3 && state.battle.tick === 3, 'host state must reach guest');

  host.close();
  await guest.next('opponent-left');
  guest.close();
  console.log('Local relay integration cases: 6/6 observed');
}

await main();