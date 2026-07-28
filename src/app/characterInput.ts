/**
 * Browser-only pointer and keyboard boundary for character combat.
 *
 * Raw pointer coordinates remain here. Commands sent to simulation contain only
 * deterministic movement axes, action snapshots, and 256-step aim values.
 */

import {
  neutralCharacterInput,
  type AimStep,
  type Axis,
  type CharacterInputCommand,
  type QueuedAction,
} from '../game/character/types';

export interface CharacterPointerInputSource {
  consumeCommand: () => CharacterInputCommand;
  consumeRestartRequest: () => boolean;
  setFighterScreenOrigin: (x: number, y: number) => void;
  dispose: () => void;
}

const MOVE_LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const MOVE_RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const MOVE_UP_KEYS = new Set(['ArrowUp', 'KeyW']);
const MOVE_DOWN_KEYS = new Set(['ArrowDown', 'KeyS']);
const AIM_STEP_COUNT = 256;

function quantizeAxis(positive: boolean, negative: boolean): Axis {
  if (positive === negative) return 0;
  return positive ? 1 : -1;
}

export function createCharacterPointerInputSource(
  target: Window = window,
  initialAimStep: AimStep = 0,
): CharacterPointerInputSource {
  const heldKeys = new Set<string>();
  let guardHeld = false;
  let queuedAction: QueuedAction = 'none';
  let actionAimStep = initialAimStep;
  let dashMoveX: Axis = 0;
  let dashMoveY: Axis = 0;
  let restartQueued = false;
  let lastPointerX: number | null = null;
  let lastPointerY: number | null = null;
  let fighterOriginX: number | null = null;
  let fighterOriginY: number | null = null;
  let lastValidAimStep = initialAimStep;

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

  function computeAimStep(): AimStep {
    if (
      lastPointerX === null ||
      lastPointerY === null ||
      fighterOriginX === null ||
      fighterOriginY === null
    ) {
      return lastValidAimStep;
    }

    const deltaX = lastPointerX - fighterOriginX;
    const deltaY = lastPointerY - fighterOriginY;
    if (deltaX === 0 && deltaY === 0) return lastValidAimStep;

    const turns = Math.atan2(deltaY, deltaX) / (Math.PI * 2);
    lastValidAimStep = ((Math.round(turns * AIM_STEP_COUNT) % AIM_STEP_COUNT) + AIM_STEP_COUNT) % AIM_STEP_COUNT;
    return lastValidAimStep;
  }

  function recordPointer(event: MouseEvent): void {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  }

  function queueAimAction(action: Exclude<QueuedAction, 'none' | 'dash'>): void {
    queuedAction = action;
    actionAimStep = computeAimStep();
    dashMoveX = 0;
    dashMoveY = 0;
  }

  function queueDash(): void {
    const moveX = currentMoveX();
    const moveY = currentMoveY();
    if (moveX === 0 && moveY === 0) return;

    queuedAction = 'dash';
    actionAimStep = computeAimStep();
    dashMoveX = moveX;
    dashMoveY = moveY;
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
    if (event.code === 'KeyE') queueAimAction('skill');
    if (event.code === 'Space') queueDash();
    if (event.code === 'KeyR') restartQueued = true;
  }

  function handleKeyUp(event: KeyboardEvent): void {
    heldKeys.delete(event.code);
  }

  function handlePointerMove(event: PointerEvent): void {
    recordPointer(event);
  }

  function handleMouseDown(event: MouseEvent): void {
    recordPointer(event);
    if (event.button === 0) queueAimAction('attack');
    if (event.button === 2) guardHeld = true;
  }

  function handleMouseUp(event: MouseEvent): void {
    if (event.button === 2) guardHeld = false;
  }

  function clearHeldInput(): void {
    heldKeys.clear();
    guardHeld = false;
  }

  function handleContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  target.addEventListener('keydown', handleKeyDown);
  target.addEventListener('keyup', handleKeyUp);
  target.addEventListener('pointermove', handlePointerMove);
  target.addEventListener('mousedown', handleMouseDown);
  target.addEventListener('mouseup', handleMouseUp);
  target.addEventListener('pointercancel', clearHeldInput);
  target.addEventListener('contextmenu', handleContextMenu);
  target.addEventListener('blur', clearHeldInput);

  return {
    consumeCommand(): CharacterInputCommand {
      const aimStep = computeAimStep();
      const command: CharacterInputCommand = {
        ...neutralCharacterInput(aimStep),
        moveX: currentMoveX(),
        moveY: currentMoveY(),
        guard: guardHeld,
        queuedAction,
        actionAimStep,
        dashMoveX,
        dashMoveY,
      };
      queuedAction = 'none';
      actionAimStep = aimStep;
      dashMoveX = 0;
      dashMoveY = 0;
      return command;
    },
    consumeRestartRequest(): boolean {
      const requested = restartQueued;
      restartQueued = false;
      return requested;
    },
    setFighterScreenOrigin(x: number, y: number): void {
      fighterOriginX = x;
      fighterOriginY = y;
    },
    dispose(): void {
      target.removeEventListener('keydown', handleKeyDown);
      target.removeEventListener('keyup', handleKeyUp);
      target.removeEventListener('pointermove', handlePointerMove);
      target.removeEventListener('mousedown', handleMouseDown);
      target.removeEventListener('mouseup', handleMouseUp);
      target.removeEventListener('pointercancel', clearHeldInput);
      target.removeEventListener('contextmenu', handleContextMenu);
      target.removeEventListener('blur', clearHeldInput);
    },
  };
}