/**
 * Mobile touch input smoke.
 *
 * Run: npm run smoke:touch-input
 * Written before src/app/touchInput.ts exists. It fixes the DOM boundary:
 * pointer motion becomes the existing InputCommand shape, burst is one pulse,
 * and hiding controls clears held movement.
 */

import { createTouchInputSource, mergePlayerInputs, shouldShowTouchControls } from '../src/app/touchInput';

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

type PointerListener = (event: FakePointerEvent) => void;

interface FakePointerEvent {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  preventDefault(): void;
}

class FakeStyle {
  readonly values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

class FakeElement {
  readonly style = new FakeStyle();
  readonly listeners = new Map<string, PointerListener>();
  readonly capturedPointers: number[] = [];

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener as unknown as PointerListener);
  }

  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }

  setPointerCapture(pointerId: number): void {
    this.capturedPointers.push(pointerId);
  }

  releasePointerCapture(_pointerId: number): void {}

  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, width: 100, height: 100 } as DOMRect;
  }

  emit(type: string, pointerId: number, clientX = 50, clientY = 50): void {
    const listener = this.listeners.get(type);
    listener?.({ pointerId, clientX, clientY, preventDefault() {} });
  }
}

function main(): void {
  const moveZone = new FakeElement();
  const moveKnob = new FakeElement();
  const burstButton = new FakeElement();
  const source = createTouchInputSource({
    moveZone: moveZone as unknown as HTMLElement,
    moveKnob: moveKnob as unknown as HTMLElement,
    burstButton: burstButton as unknown as HTMLButtonElement,
  });

  expect(shouldShowTouchControls(true, 'battle'), 'coarse battle screens must expose touch controls');
  expect(shouldShowTouchControls(true, 'onlineBattle'), 'coarse online battle screens must expose touch controls');
  expect(!shouldShowTouchControls(true, 'reward'), 'non-battle screens must hide touch controls');
  expect(!shouldShowTouchControls(false, 'battle'), 'fine-pointer screens must hide touch controls');

  source.setEnabled(true);
  moveZone.emit('pointerdown', 7, 95, 5);
  const diagonal = source.consumeCommand();
  expect(diagonal.moveX === 1 && diagonal.moveY === -1 && !diagonal.burst, 'upper-right stick must emit a diagonal command');
  expect(moveZone.capturedPointers[0] === 7, 'move pointer must be captured');
  expect(moveKnob.style.values.get('transform') !== undefined, 'move knob must receive visual feedback');

  moveZone.emit('pointerup', 7);
  const neutralAfterRelease = source.consumeCommand();
  expect(neutralAfterRelease.moveX === 0 && neutralAfterRelease.moveY === 0, 'released stick must return movement to neutral');

  moveZone.emit('pointerdown', 10, 95, 50);
  const heldRight = source.consumeCommand();
  expect(heldRight.moveX === 1 && heldRight.moveY === 0, 'right stick must emit a cardinal command');

  moveZone.emit('pointermove', 10, 53, 59);
  const heldThroughDrift = source.consumeCommand();
  expect(
    heldThroughDrift.moveX === 1 && heldThroughDrift.moveY === 0,
    'small drift toward the stick center must retain the held direction',
  );

  moveZone.emit('pointermove', 10, 5, 50);
  const reversed = source.consumeCommand();
  expect(reversed.moveX === -1 && reversed.moveY === 0, 'a deliberate opposite drag must switch direction without releasing');

  moveZone.emit('pointermove', 10, 50, 5);
  const turned = source.consumeCommand();
  expect(turned.moveX === 0 && turned.moveY === -1, 'a deliberate perpendicular drag must switch direction without releasing');
  moveZone.emit('pointerup', 10);

  burstButton.emit('pointerdown', 8);
  expect(source.consumeCommand().burst, 'burst pointerdown must queue one burst pulse');
  expect(!source.consumeCommand().burst, 'burst pulse must be consumed after one command');

  moveZone.emit('pointerdown', 9, 5, 95);
  source.setEnabled(false);
  const disabled = source.consumeCommand();
  expect(disabled.moveX === 0 && disabled.moveY === 0 && !disabled.burst, 'disabled controls must clear input state');
  expect(moveKnob.style.values.get('transform') === 'translate(0px, 0px)', 'disabled controls must reset the move knob');

  const merged = mergePlayerInputs(
    { moveX: -1, moveY: 0, burst: false },
    { moveX: 1, moveY: 1, burst: true },
  );
  expect(merged.moveX === 0 && merged.moveY === 1 && merged.burst, 'keyboard and touch commands must merge without exceeding axis bounds');

  console.log('Touch input cases: 17/17 observed');
}

main();
