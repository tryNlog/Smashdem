/**
 * 엔트리 포인트 — 시뮬레이션 / 입력 / 렌더를 연결한다.
 *
 * 계층 경계가 여기서 드러난다.
 *  - 시뮬레이션(src/game/simulation.ts): 순수, 고정 스텝, 부작용 없음
 *  - 입력(src/game/playerInput.ts, bot.ts): 시뮬 바깥에서 InputCommand 를 만든다
 *  - 렌더(src/render/): 상태를 읽기만 한다
 *
 * S3 의 실시간 PvP 는 이 파일에서 "1번 팽이의 입력 소스"를 봇에서 원격 입력으로 교체하는 형태가 된다.
 */

import { startFixedTimestepLoop } from './engine/fixedTimestep';
import * as Balance from './game/balance';
import { botInput } from './game/bot';
import {
  createBattleState,
  DEFAULT_BOT_DEFINITION,
  DEFAULT_PLAYER_DEFINITION,
} from './game/battleState';
import { createKeyboardInputSource } from './game/playerInput';
import { stepBattle } from './game/simulation';
import type { BattleState, InputCommand } from './game/types';
import { NEUTRAL_INPUT } from './game/types';
import { clearEffects, consumeSimulationEvents, createEffectBuffer } from './render/effects';
import { createRenderer } from './render/renderer';

const PLAYER_INDEX = 0;
const BOT_INDEX = 1;

function bootstrap(): void {
  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('#game-canvas 를 찾지 못했습니다.');
  }

  const renderer = createRenderer(canvas);
  const effects = createEffectBuffer();
  const keyboard = createKeyboardInputSource();

  /**
   * 시드는 시뮬레이션 바깥에서 만들어 주입한다.
   * (시뮬 안에서 Date.now() 를 부르면 결정론이 깨진다 — 구조 제약)
   */
  function makeSeed(): number {
    return Date.now() & 0x7fffffff;
  }

  let state: BattleState = createBattleState(
    [DEFAULT_PLAYER_DEFINITION, DEFAULT_BOT_DEFINITION],
    makeSeed(),
  );

  function restart(): void {
    state = createBattleState([DEFAULT_PLAYER_DEFINITION, DEFAULT_BOT_DEFINITION], makeSeed());
    clearEffects(effects);
  }

  // 입력 버퍼 — 한 렌더 프레임에 시뮬 스텝이 여러 번 돌 수 있으므로
  // 프레임당 한 번만 키보드를 읽고 그 값을 스텝들이 공유한다.
  const inputs: InputCommand[] = [NEUTRAL_INPUT, NEUTRAL_INPUT];

  let previousRenderTimeMilliseconds = performance.now();

  startFixedTimestepLoop({
    fixedDeltaSeconds: Balance.FIXED_DELTA_SECONDS,
    maximumStepsPerFrame: Balance.MAXIMUM_STEPS_PER_FRAME,

    update(fixedDeltaSeconds) {
      if (keyboard.consumeRestartRequest()) restart();

      inputs[PLAYER_INDEX] = keyboard.consumeCommand();
      inputs[BOT_INDEX] = botInput(state, BOT_INDEX);

      stepBattle(state, inputs, fixedDeltaSeconds);
      consumeSimulationEvents(effects, state.events);
    },

    render() {
      const nowMilliseconds = performance.now();
      const renderDeltaSeconds = Math.min(
        0.1,
        (nowMilliseconds - previousRenderTimeMilliseconds) / 1000,
      );
      previousRenderTimeMilliseconds = nowMilliseconds;

      renderer.draw(state, effects, renderDeltaSeconds);
    },
  });
}

bootstrap();
