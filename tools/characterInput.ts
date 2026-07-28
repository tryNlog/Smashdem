/**
 * Character desktop input smoke.
 *
 * Run: npm run smoke:character-input
 * This defines the desktop-DOM boundary before its implementation exists.
 */

import { createCharacterKeyboardInputSource } from '../src/app/characterInput';

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

interface FakeKeyboardEvent {
  readonly code: string;
  readonly repeat: boolean;
  preventDefault(): void;
}

type Listener = (event: FakeKeyboardEvent) => void;

class FakeWindow {
  private readonly listeners = new Map<string, Listener>();

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener as unknown as Listener);
  }

  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }

  emit(type: string, code = '', repeat = false): void {
    this.listeners.get(type)?.({ code, repeat, preventDefault() {} });
  }
}

function main(): void {
  const target = new FakeWindow();
  const source = createCharacterKeyboardInputSource(target as unknown as Window);

  target.emit('keydown', 'ArrowRight');
  target.emit('keydown', 'KeyJ');
  const attack = source.consumeCommand();
  expect(attack.queuedAction === 'attack', 'J must queue an attack');
  expect(
    attack.actionDirectionX === 1 && attack.actionDirectionY === 0,
    'an action must snapshot movement when the action key is pressed',
  );
  expect(source.consumeCommand().queuedAction === 'none', 'an action must clear after one consume');

  target.emit('keyup', 'ArrowRight');
  target.emit('keydown', 'KeyK');
  target.emit('keydown', 'Space');
  expect(source.consumeCommand().queuedAction === 'dash', 'the latest non-repeated action must replace the pending action');

  target.emit('keydown', 'KeyW');
  target.emit('keydown', 'KeyD');
  const diagonal = source.consumeCommand();
  expect(diagonal.moveX === 1 && diagonal.moveY === -1, 'WASD must emit quantized movement axes');
  target.emit('keyup', 'KeyW');
  target.emit('keyup', 'KeyD');
  target.emit('keydown', 'ArrowLeft');
  target.emit('keydown', 'ArrowDown');
  const arrowDiagonal = source.consumeCommand();
  expect(arrowDiagonal.moveX === -1 && arrowDiagonal.moveY === 1, 'arrow keys must emit quantized movement axes');
  target.emit('keyup', 'ArrowLeft');
  target.emit('keyup', 'ArrowDown');

  target.emit('keydown', 'KeyL');
  expect(source.consumeCommand().guard, 'held L must enable guard');
  target.emit('keyup', 'KeyL');
  expect(!source.consumeCommand().guard, 'releasing L must disable guard');

  target.emit('keydown', 'KeyJ');
  target.emit('keydown', 'KeyJ', true);
  expect(source.consumeCommand().queuedAction === 'attack', 'repeated action keydown must not enqueue another action');
  expect(source.consumeCommand().queuedAction === 'none', 'one non-repeated action must produce one command only');

  target.emit('keydown', 'KeyR');
  expect(source.consumeRestartRequest(), 'R must queue one restart request');
  expect(!source.consumeRestartRequest(), 'restart request must clear after one consume');

  target.emit('keydown', 'KeyJ');
  const neutralSnapshot = source.consumeCommand();
  expect(
    neutralSnapshot.actionDirectionX === 0 && neutralSnapshot.actionDirectionY === 0,
    'an action without movement must preserve a zero snapshot for facing fallback',
  );

  source.dispose();
  console.log('Character input cases: 14/14 observed');
}

main();
