/**
 * Desktop keyboard to deterministic character input commands.
 *
 * This module owns the desktop DOM event boundary. Character simulation only
 * receives the quantized command returned by consumeCommand().
 */

import {
  NEUTRAL_CHARACTER_INPUT,
  type Axis,
  type CharacterInputCommand,
  type QueuedAction,
} from '../game/character/types';

export interface CharacterKeyboardInputSource {
  consumeCommand: () => CharacterInputCommand;
  consumeRestartRequest: () => boolean;
  dispose: () => void;
}

const MOVE_LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const MOVE_RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const MOVE_UP_KEYS = new Set(['ArrowUp', 'KeyW']);
const MOVE_DOWN_KEYS = new Set(['ArrowDown', 'KeyS']);
const ACTION_KEYS: Readonly<Record<string, QueuedAction>> = {
  KeyJ: 'attack',
  Space: 'dash',
  KeyK: 'skill',
};

function quantizeAxis(positive: boolean, negative: boolean): Axis {
  if (positive === negative) return 0;
  return positive ? 1 : -1;
}

export function createCharacterKeyboardInputSource(target: Window = window): CharacterKeyboardInputSource {
  const heldKeys = new Set<string>();
  let queuedAction: QueuedAction = 'none';
  let actionDirectionX: Axis = 0;
  let actionDirectionY: Axis = 0;
  let restartQueued = false;

  function isAnyHeld(keys: Set<string>): boolean {
    for (const key of keys) {
      if (heldKeys.has(key)) return true;
    }
    return false;
  }

  function currentMoveX(): Axis {
    return quantizeAxis(isAnyHeld(MOVE_RIGHT_KEYS), isAnyHeld(MOVE_LEFT_KEYS));
  }

  function currentMoveY(): Axis {
    return quantizeAxis(isAnyHeld(MOVE_DOWN_KEYS), isAnyHeld(MOVE_UP_KEYS));
  }

  function queueAction(action: QueuedAction): void {
    queuedAction = action;
    actionDirectionX = currentMoveX();
    actionDirectionY = currentMoveY();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    const isMovement =
      MOVE_LEFT_KEYS.has(event.code) ||
      MOVE_RIGHT_KEYS.has(event.code) ||
      MOVE_UP_KEYS.has(event.code) ||
      MOVE_DOWN_KEYS.has(event.code);
    if (isMovement || event.code === 'Space') event.preventDefault();

    if (event.repeat) return;
    heldKeys.add(event.code);

    const action = ACTION_KEYS[event.code];
    if (action !== undefined) queueAction(action);
    if (event.code === 'KeyR') restartQueued = true;
  }

  function handleKeyUp(event: KeyboardEvent): void {
    heldKeys.delete(event.code);
  }

  function handleBlur(): void {
    heldKeys.clear();
  }

  target.addEventListener('keydown', handleKeyDown);
  target.addEventListener('keyup', handleKeyUp);
  target.addEventListener('blur', handleBlur);

  return {
    consumeCommand(): CharacterInputCommand {
      const command: CharacterInputCommand = {
        ...NEUTRAL_CHARACTER_INPUT,
        moveX: currentMoveX(),
        moveY: currentMoveY(),
        guard: heldKeys.has('KeyL'),
        queuedAction,
        actionDirectionX,
        actionDirectionY,
      };
      queuedAction = 'none';
      actionDirectionX = 0;
      actionDirectionY = 0;
      return command;
    },
    consumeRestartRequest(): boolean {
      const requested = restartQueued;
      restartQueued = false;
      return requested;
    },
    dispose(): void {
      target.removeEventListener('keydown', handleKeyDown);
      target.removeEventListener('keyup', handleKeyUp);
      target.removeEventListener('blur', handleBlur);
    },
  };
}
