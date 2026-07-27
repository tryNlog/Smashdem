# Smashdem Mobile Touch Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task. Every production-input change starts with a failing smoke.

**Goal:** Let a coarse-pointer browser play run battles and online battles with a touch joystick and burst button while preserving the existing deterministic `InputCommand` boundary.

**Architecture:** A DOM-facing `src/app/touchInput.ts` produces `{ moveX, moveY, burst }` outside `src/game/`. `src/main.ts` merges keyboard and touch inputs before the fixed loop. HTML controls live below the canvas, so a small mobile viewport does not cover the arena or Canvas menus.

**Tech Stack:** Vanilla TypeScript, DOM Pointer Events, CSS, Vite executable smoke scripts.

## Global Constraints

- `src/game/` remains free of DOM, wall-clock time, and global randomness (`AGENTS.md` §3).
- Existing keyboard movement and `Space` burst remain available; touch is an additional input source.
- A burst pointer press becomes one `burst: true` tick, not a held repeat.
- Controls appear only for `(pointer: coarse)` and `battle`/`onlineBattle`; hiding them clears input state.
- No balance values, part effects, or simulation changes.
- Local commits only; no remote push.

---

### Task 1: Pointer-event input source

**Files:**
- Create: `src/app/touchInput.ts`
- Create: `tools/touchInput.ts`
- Modify: `package.json`

**Interfaces:**

```ts
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

export function createTouchInputSource(elements: TouchInputElements): TouchInputSource;
export function mergePlayerInputs(keyboard: InputCommand, touch: InputCommand): InputCommand;
```

1. Write `tools/touchInput.ts` before implementation. Its fake elements must assert: a pointer in the upper-right maps to `{ moveX: 1, moveY: -1 }`; `pointerup` returns neutral; one burst `pointerdown` yields one true pulse then false; disabled input clears movement; `mergePlayerInputs` clamps summed axes to `[-1, 1]` and ORs burst.
2. Run `npm run smoke:touch-input`; before source creation it must fail because the module is absent.
3. Implement one active move pointer. Compute displacement from `getBoundingClientRect()` center, return neutral inside a 22% radius dead zone, otherwise quantize each nonzero axis to `-1` or `1`. Clamp visual knob movement to zone radius. Release/cancel/disabled state clears movement. The burst button queues a pulse on pointerdown.
4. Add `smoke:touch-input` to `package.json` and run `npm run smoke:touch-input; npm run build; npm run smoke:run`.
5. Commit `src/app/touchInput.ts`, `tools/touchInput.ts`, and `package.json` with `feat(input): add touch command source`.

### Task 2: Battle-only native controls

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`
- Reuse: `src/app/touchInput.ts`, `tools/touchInput.ts`

1. Extend the smoke with the disabled-reset assertion if it is not already covered; run it against Task 1 and observe the intended failure before integration support is introduced.
2. Add `#touch-controls` after `#game-shell`, with `#touch-move-zone`, `#touch-move-knob`, and a `button` carrying a lightning entity plus `aria-label="버스트"`. Keep controls below the canvas; use stable dimensions, `touch-action: none`, and no visible explanatory copy. Start hidden.
3. In `main.ts`, construct the source and derive visibility from `matchMedia('(pointer: coarse)').matches` plus session screen `battle` or `onlineBattle`. Reset it on screen changes. Merge `keyboard.consumeCommand()` and `touchInput.consumeCommand()` before either `session.step` or `onlineMatch.step`.
4. Run `npm run smoke:touch-input; npm run build; npm run smoke:online-client; npm run smoke:pvp-lobby; npm run smoke:online-match`.
5. Commit native surface and integration with `feat(input): show battle touch controls on mobile`.

### Task 3: Handoff and device boundary

**Files:**
- Modify: `README.md`
- Modify: `docs/RELAY.md`
- Modify: `docs/ai-log.md`

1. Document `npm run smoke:touch-input` and that it checks pointer-to-command mapping, not real-device layout.
2. Record the manual device checklist: start a run; test eight move directions and one burst; enter reward; rotate/resize; verify controls hide on non-battle screens.
3. Run `npm run smoke:touch-input; npm run build; git diff --check` and commit the record with `docs(input): record mobile control checks`.

## Scope Notes

- No synthetic keyboard events and no `src/game/` changes.
- `[UNSUPPORTED]` Android/iOS ergonomics, safe-area behavior, and multi-touch handling need PM/device observation.
- In online play the merged command reaches existing `onlineMatch.step`; host authority remains unchanged.
