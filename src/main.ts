/**
 * 엔트리 포인트 — 세션(런/배틀/메타 화면) · 입력 · 렌더를 연결한다.
 *
 * 계층 경계가 여기서 드러난다.
 *  - 시뮬레이션(src/game/simulation.ts): 순수, 고정 스텝, 부작용 없음
 *  - 런(src/game/run.ts, rewards.ts): 순수, 시드 PRNG. 무엇을 언제 돌릴지는 세션(src/app/session.ts)이 정한다
 *  - 입력(playerInput/bot + 포인터): 시뮬 바깥에서 InputCommand·버튼 액션을 만든다
 *  - 렌더(src/render/): 상태를 읽기만 한다
 *
 * S3 실시간 PvP 는 이 파일에서 "1번 팽이의 입력 소스"를 봇에서 원격 입력으로 교체하는 형태가 된다.
 * (세션의 PvP 출전 선택은 지금 stub 이며, 실제 온라인 연결이 S3 에서 여기에 붙는다.)
 */

import { startFixedTimestepLoop } from './engine/fixedTimestep';
import * as Balance from './game/balance';
import { createKeyboardInputSource } from './game/playerInput';
import { buildSetSummary, enhanceTotal, tierForBattle, type RunBuild } from './game/run';
import { createSession } from './app/session';
import { clearEffects, consumeSimulationEvents, createEffectBuffer } from './render/effects';
import { createRenderer, type RunHudContext } from './render/renderer';
import { drawSessionOverlay, hitTestSession } from './render/screens';

function bootstrap(): void {
  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('#game-canvas 를 찾지 못했습니다.');
  }
  const overlayContext = canvas.getContext('2d');
  if (!overlayContext) throw new Error('Canvas 2D 컨텍스트를 얻지 못했습니다.');

  const renderer = createRenderer(canvas);
  const effects = createEffectBuffer();
  const keyboard = createKeyboardInputSource();

  /**
   * 시드는 시뮬레이션·런 바깥에서 만들어 주입한다.
   * (순수 계층 안에서 Date.now() 를 부르면 결정론이 깨진다 — 구조 제약)
   */
  const session = createSession(() => Date.now() & 0x7fffffff);

  // 배틀↔메타 화면 전환 감지(전환 시 연출 잔상 정리).
  let previousScreen = session.screen;

  // 메뉴 키보드 단축 — 마우스가 1차 조작이고, 이건 보조다.
  window.addEventListener('keydown', (event) => {
    if (session.screen === 'reward') {
      if (event.key === '1') session.activate('reward:0');
      else if (event.key === '2') session.activate('reward:1');
      else if (event.key === '3') session.activate('reward:2');
    } else if (session.screen === 'pvpSelect' && event.key === 'Escape') {
      session.activate('pvp:back');
    }
  });

  // 카드/버튼 클릭 — 캔버스가 CSS 로 축소될 수 있으므로 좌표를 실제 캔버스 해상도로 환산한다.
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const id = hitTestSession(canvas, session, x, y);
    if (id) session.activate(id);
  });

  let previousRenderTimeMilliseconds = performance.now();

  startFixedTimestepLoop({
    fixedDeltaSeconds: Balance.FIXED_DELTA_SECONDS,
    maximumStepsPerFrame: Balance.MAXIMUM_STEPS_PER_FRAME,

    update(fixedDeltaSeconds) {
      const playerInput = keyboard.consumeCommand();
      const wasBattle = session.screen === 'battle';

      session.step(playerInput, fixedDeltaSeconds);

      // 배틀 스텝에서 뱉은 연출 이벤트만 소비한다(비-배틀 화면에서는 스텝이 안 돌아 events 가 안 갱신됨).
      if (wasBattle) consumeSimulationEvents(effects, session.battle.events);

      if (session.screen !== previousScreen) {
        if (session.screen === 'battle') clearEffects(effects);
        previousScreen = session.screen;
      }
    },

    render() {
      const nowMilliseconds = performance.now();
      const renderDeltaSeconds = Math.min(0.1, (nowMilliseconds - previousRenderTimeMilliseconds) / 1000);
      previousRenderTimeMilliseconds = nowMilliseconds;

      const runHud =
        session.screen === 'battle' ? runHudFor(session.run.build, session.run.battleNumber) : undefined;
      renderer.draw(session.battle, effects, renderDeltaSeconds, runHud);
      drawSessionOverlay(overlayContext, canvas, session);
    },
  });
}

/** 세션 런 빌드 → 배틀 HUD 문맥(판 카운터·난이도·F1 세트 진행). */
function runHudFor(build: RunBuild, battleNumber: number): RunHudContext {
  const summary = buildSetSummary(build);
  return {
    battleNumber,
    totalBattles: Balance.RUN_TOTAL_BATTLES,
    tier: tierForBattle(battleNumber),
    setTag: summary.tag,
    setCount: summary.count,
    setCompleted: summary.completed,
    enhanceTotal: enhanceTotal(build),
  };
}

bootstrap();
