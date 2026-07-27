/**
 * 터치 조작 → InputCommand 변환.
 *
 * DOM Pointer Event를 다루므로 결정론 시뮬레이션(src/game) 바깥에 둔다.
 */

import type { InputCommand } from '../game/types';

export interface TouchInputElements {
  readonly moveZone: HTMLElement;
  readonly moveKnob: HTMLElement;
  readonly burstButton: HTMLButtonElement;
}

export interface TouchInputSource {
  consumeCommand(): InputCommand;
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

const DIRECTION_ENGAGE_RATIO = 0.22;
const DIRECTION_SWITCH_RATIO = 0.32;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function quantizeAxis(value: number): number {
  if (value === 0) return 0;
  return value > 0 ? 1 : -1;
}

export function shouldShowTouchControls(hasCoarsePointer: boolean, screen: string): boolean {
  return hasCoarsePointer && (screen === 'battle' || screen === 'onlineBattle');
}

export function mergePlayerInputs(keyboard: InputCommand, touch: InputCommand): InputCommand {
  return {
    moveX: clamp(keyboard.moveX + touch.moveX, -1, 1),
    moveY: clamp(keyboard.moveY + touch.moveY, -1, 1),
    burst: keyboard.burst || touch.burst,
  };
}

export function createTouchInputSource(elements: TouchInputElements): TouchInputSource {
  let enabled = false;
  let activeMovePointerId: number | null = null;
  let moveX = 0;
  let moveY = 0;
  let directionLatched = false;
  let burstQueued = false;

  function setKnob(x: number, y: number): void {
    elements.moveKnob.style.setProperty('transform', `translate(${Math.round(x)}px, ${Math.round(y)}px)`);
  }

  function clearMovement(): void {
    activeMovePointerId = null;
    moveX = 0;
    moveY = 0;
    directionLatched = false;
    setKnob(0, 0);
  }

  function updateMovement(event: PointerEvent): void {
    const rect = elements.moveZone.getBoundingClientRect();
    const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
    const rawX = (event.clientX - (rect.left + rect.width / 2)) / radius;
    const rawY = (event.clientY - (rect.top + rect.height / 2)) / radius;
    const distance = Math.hypot(rawX, rawY);
    const displayScale = distance > 1 ? 1 / distance : 1;
    const displayX = rawX * displayScale;
    const displayY = rawY * displayScale;

    setKnob(displayX * radius, displayY * radius);
    if (!directionLatched) {
      if (distance < DIRECTION_ENGAGE_RATIO) return;
      moveX = quantizeAxis(displayX);
      moveY = quantizeAxis(displayY);
      directionLatched = true;
      return;
    }

    // A held direction survives small finger drift; release or a larger drag changes it.
    if (distance < DIRECTION_SWITCH_RATIO) return;

    moveX = quantizeAxis(displayX);
    moveY = quantizeAxis(displayY);
  }

  function handleMoveStart(event: PointerEvent): void {
    if (!enabled || activeMovePointerId !== null) return;
    event.preventDefault();
    activeMovePointerId = event.pointerId;
    elements.moveZone.setPointerCapture(event.pointerId);
    updateMovement(event);
  }

  function handleMove(event: PointerEvent): void {
    if (!enabled || activeMovePointerId !== event.pointerId) return;
    event.preventDefault();
    updateMovement(event);
  }

  function handleMoveEnd(event: PointerEvent): void {
    if (activeMovePointerId !== event.pointerId) return;
    event.preventDefault();
    clearMovement();
  }

  function handleBurst(event: PointerEvent): void {
    if (!enabled) return;
    event.preventDefault();
    burstQueued = true;
  }

  elements.moveZone.addEventListener('pointerdown', handleMoveStart);
  elements.moveZone.addEventListener('pointermove', handleMove);
  elements.moveZone.addEventListener('pointerup', handleMoveEnd);
  elements.moveZone.addEventListener('pointercancel', handleMoveEnd);
  elements.burstButton.addEventListener('pointerdown', handleBurst);

  return {
    consumeCommand(): InputCommand {
      const burst = enabled && burstQueued;
      burstQueued = false;
      return enabled ? { moveX, moveY, burst } : { moveX: 0, moveY: 0, burst: false };
    },
    setEnabled(nextEnabled: boolean): void {
      enabled = nextEnabled;
      if (!enabled) {
        burstQueued = false;
        clearMovement();
      }
    },
    dispose(): void {
      elements.moveZone.removeEventListener('pointerdown', handleMoveStart);
      elements.moveZone.removeEventListener('pointermove', handleMove);
      elements.moveZone.removeEventListener('pointerup', handleMoveEnd);
      elements.moveZone.removeEventListener('pointercancel', handleMoveEnd);
      elements.burstButton.removeEventListener('pointerdown', handleBurst);
      enabled = false;
      burstQueued = false;
      clearMovement();
    },
  };
}
