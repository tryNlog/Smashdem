/**
 * 키보드 → InputCommand 변환.
 *
 * DOM 이벤트를 만지는 곳이므로 시뮬레이션 계층이 아니라 그 바깥에 둔다.
 * 시뮬레이션은 여기서 만들어진 InputCommand 만 받는다.
 */

import type { InputCommand } from './types';

export interface KeyboardInputSource {
  /** 이번 스텝에 소비할 입력을 만든다. 호출하면 1회성 입력(버스트)이 소비된다. */
  consumeCommand: () => InputCommand;
  /** 재시작(R) 요청이 있었는지 확인하고 플래그를 내린다. */
  consumeRestartRequest: () => boolean;
  dispose: () => void;
}

const MOVE_LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const MOVE_RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const MOVE_UP_KEYS = new Set(['ArrowUp', 'KeyW']);
const MOVE_DOWN_KEYS = new Set(['ArrowDown', 'KeyS']);
const BURST_KEYS = new Set(['Space']);
const RESTART_KEYS = new Set(['KeyR']);

export function createKeyboardInputSource(target: Window = window): KeyboardInputSource {
  const heldKeys = new Set<string>();
  /** 버스트는 "눌린 순간" 한 번만 통과시킨다. 누르고 있어도 연발되지 않게. */
  let burstQueued = false;
  let restartQueued = false;

  function handleKeyDown(event: KeyboardEvent): void {
    // 스페이스/방향키의 스크롤 기본 동작 차단
    if (
      BURST_KEYS.has(event.code) ||
      MOVE_UP_KEYS.has(event.code) ||
      MOVE_DOWN_KEYS.has(event.code) ||
      MOVE_LEFT_KEYS.has(event.code) ||
      MOVE_RIGHT_KEYS.has(event.code)
    ) {
      event.preventDefault();
    }

    if (event.repeat) return;
    heldKeys.add(event.code);
    if (BURST_KEYS.has(event.code)) burstQueued = true;
    if (RESTART_KEYS.has(event.code)) restartQueued = true;
  }

  function handleKeyUp(event: KeyboardEvent): void {
    heldKeys.delete(event.code);
  }

  function handleBlur(): void {
    // 창 포커스를 잃으면 키가 눌린 채로 남는 것을 방지.
    heldKeys.clear();
  }

  target.addEventListener('keydown', handleKeyDown);
  target.addEventListener('keyup', handleKeyUp);
  target.addEventListener('blur', handleBlur);

  function isAnyHeld(keys: Set<string>): boolean {
    for (const key of keys) {
      if (heldKeys.has(key)) return true;
    }
    return false;
  }

  return {
    consumeCommand(): InputCommand {
      const moveX = (isAnyHeld(MOVE_RIGHT_KEYS) ? 1 : 0) - (isAnyHeld(MOVE_LEFT_KEYS) ? 1 : 0);
      const moveY = (isAnyHeld(MOVE_DOWN_KEYS) ? 1 : 0) - (isAnyHeld(MOVE_UP_KEYS) ? 1 : 0);
      const burst = burstQueued;
      burstQueued = false;
      return { moveX, moveY, burst };
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
