/**
 * Character pointer-input smoke.
 *
 * Run: npm run smoke:character-input
 * The production boundary intentionally retains raw pointer coordinates only
 * in src/app/characterInput.ts and emits deterministic aim steps instead.
 */

import { createCharacterPointerInputSource } from '../src/app/characterInput';

interface FakeEventInit {
  readonly button?: number;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly code?: string;
  readonly repeat?: boolean;
}

interface FakeEvent extends FakeEventInit {
  defaultPrevented: boolean;
  preventDefault(): void;
}

type Listener = (event: FakeEvent) => void;

class FakeWindow {
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener as unknown as Listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener as unknown as Listener);
  }

  dispatch(type: string, init: FakeEventInit = {}): FakeEvent {
    const event: FakeEvent = {
      ...init,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }
}

let cases = 0;

function expect(condition: boolean, message: string): void {
  cases += 1;
  if (!condition) throw new Error(message);
}

function main(): void {
  const target = new FakeWindow();
  const source = createCharacterPointerInputSource(target as unknown as Window, 0);

  expect(source.consumeCommand().aimStep === 0, 'no pointer must preserve the supplied initial aim step');

  source.setFighterScreenOrigin(100, 100);
  target.dispatch('pointermove', { clientX: 200, clientY: 100 });
  expect(source.consumeCommand().aimStep === 0, 'a pointer right of the fighter must quantize to step 0');

  // The pointer stays still while the fighter moves below it, so aim recomputes to up.
  source.setFighterScreenOrigin(200, 200);
  expect(source.consumeCommand().aimStep === 192, 'a stationary pointer must re-aim after the fighter origin moves');
  target.dispatch('pointermove', { clientX: 200, clientY: 200 });
  expect(source.consumeCommand().aimStep === 192, 'a pointer at the fighter origin must preserve the prior valid aim');

  source.setFighterScreenOrigin(100, 200);
  target.dispatch('pointerdown', { button: 0, clientX: 100, clientY: 300 });
  target.dispatch('pointermove', { clientX: 200, clientY: 200 });
  const attack = source.consumeCommand();
  expect(attack.queuedAction === 'attack', 'left mouse must queue an attack');
  expect(attack.actionAimStep === 64, 'left mouse must snapshot aim at pointer-down');
  expect(attack.aimStep === 0, 'latest pointer aim must remain independent from the queued action snapshot');
  expect(source.consumeCommand().queuedAction === 'none', 'a queued action must clear after one consume');

  target.dispatch('keydown', { code: 'KeyE', repeat: false });
  target.dispatch('keyup', { code: 'KeyE' });
  target.dispatch('keydown', { code: 'Space', repeat: false });
  target.dispatch('keyup', { code: 'Space' });
  const skillAfterRejectedDash = source.consumeCommand();
  expect(skillAfterRejectedDash.queuedAction === 'skill', 'a zero-direction dash must not replace an unconsumed skill');
  expect(skillAfterRejectedDash.actionAimStep === 0, 'E must snapshot the current aim step');

  target.dispatch('keydown', { code: 'KeyD', repeat: false });
  target.dispatch('keydown', { code: 'Space', repeat: false });
  target.dispatch('keyup', { code: 'Space' });
  target.dispatch('keyup', { code: 'KeyD' });
  const dash = source.consumeCommand();
  expect(dash.queuedAction === 'dash', 'Space with movement must queue a dash');
  expect(dash.dashMoveX === 1 && dash.dashMoveY === 0, 'a queued dash must preserve its movement snapshot after key release');

  target.dispatch('keydown', { code: 'KeyW', repeat: false });
  target.dispatch('keydown', { code: 'ArrowRight', repeat: false });
  target.dispatch('pointermove', { clientX: 100, clientY: 100 });
  const separatedInput = source.consumeCommand();
  expect(separatedInput.moveX === 1 && separatedInput.moveY === -1, 'WASD and arrows must be the only movement sources');
  expect(separatedInput.aimStep === 192, 'pointer movement must affect aim without changing movement axes');
  target.dispatch('keyup', { code: 'KeyW' });
  target.dispatch('keyup', { code: 'ArrowRight' });

  target.dispatch('keydown', { code: 'KeyE', repeat: false });
  target.dispatch('pointerdown', { button: 0, clientX: 200, clientY: 200 });
  const latestAction = source.consumeCommand();
  expect(latestAction.queuedAction === 'attack', 'the latest valid action edge must replace an unconsumed action');

  target.dispatch('pointerdown', { button: 2 });
  expect(source.consumeCommand().guard, 'right mouse hold must enable guard');
  const contextMenu = target.dispatch('contextmenu');
  expect(contextMenu.defaultPrevented, 'the input boundary must prevent the browser context menu');
  target.dispatch('pointerup', { button: 2 });
  expect(!source.consumeCommand().guard, 'right mouse release must end guard');

  target.dispatch('keydown', { code: 'KeyA', repeat: false });
  target.dispatch('pointerdown', { button: 2 });
  target.dispatch('blur');
  const afterBlur = source.consumeCommand();
  expect(afterBlur.moveX === 0 && afterBlur.moveY === 0, 'blur must clear held movement input');
  expect(!afterBlur.guard, 'blur must clear held guard input');

  target.dispatch('keydown', { code: 'ArrowDown', repeat: false });
  target.dispatch('pointerdown', { button: 2 });
  target.dispatch('pointercancel');
  const afterPointerCancel = source.consumeCommand();
  expect(afterPointerCancel.moveX === 0 && afterPointerCancel.moveY === 0, 'pointercancel must clear held movement input');
  expect(!afterPointerCancel.guard, 'pointercancel must clear held guard input');

  target.dispatch('keydown', { code: 'KeyJ', repeat: false });
  target.dispatch('keydown', { code: 'KeyK', repeat: false });
  target.dispatch('keydown', { code: 'KeyL', repeat: false });
  expect(source.consumeCommand().queuedAction === 'none', 'J, K, and L must not queue character actions');

  target.dispatch('keydown', { code: 'KeyR', repeat: false });
  expect(source.consumeRestartRequest(), 'R must queue one restart request');
  expect(!source.consumeRestartRequest(), 'a restart request must clear after one consume');

  const rightTarget = new FakeWindow();
  const rightSource = createCharacterPointerInputSource(rightTarget as unknown as Window, 128);
  expect(rightSource.consumeCommand().aimStep === 128, 'the right-side fighter must preserve its supplied initial aim step');

  const noPointerCoordinates = source.consumeCommand() as unknown as Record<string, unknown>;
  expect(!('clientX' in noPointerCoordinates) && !('clientY' in noPointerCoordinates), 'raw pointer coordinates must not leave the input boundary');

  source.dispose();
  target.dispatch('keydown', { code: 'KeyE', repeat: false });
  expect(source.consumeCommand().queuedAction === 'none', 'dispose must remove input listeners');
  rightSource.dispose();

  console.log(`Character pointer input cases: ${cases}/${cases} observed`);
}

main();