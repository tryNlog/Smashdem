/**
 * 엔트리 포인트 — 세션(런/배틀/메타 화면) · 입력 · 렌더 · 오디오를 연결한다.
 *
 * 계층 경계가 여기서 드러난다.
 *  - 시뮬레이션(src/game/simulation.ts): 순수, 고정 스텝, 부작용 없음
 *  - 런(src/game/run.ts, rewards.ts): 순수, 시드 PRNG. 무엇을 언제 돌릴지는 세션(src/app/session.ts)이 정한다
 *  - 입력(playerInput/bot + 포인터): 시뮬 바깥에서 InputCommand·버튼 액션을 만든다
 *  - 렌더·오디오(src/render/): 상태를 읽기만 한다. 연출 난수·히트스톱은 이 계층에서만
 *
 * S3 실시간 PvP 는 이 파일에서 "1번 팽이의 입력 소스"를 봇에서 원격 입력으로 교체하는 형태가 된다.
 */

import { startFixedTimestepLoop } from './engine/fixedTimestep';
import * as Balance from './game/balance';
import { createKeyboardInputSource } from './game/playerInput';
import { buildSetSummary, enhanceTotal, tierForBattle, type RunBuild } from './game/run';
import { createSession, PLAYER_INDEX, type PvpEntryView } from './app/session';
import { createOnlineMatch, type OnlineMatchStatus } from './app/onlineMatch';
import { createOnlineClient, resolveRelayUrl } from './net/onlineClient';
import { isRoomCode } from './net/protocol';
import { clearEffects, consumeSimulationEvents, createEffectBuffer } from './render/effects';
import { createRenderer, type BattleVisualContext, type RunHudContext } from './render/renderer';
import { drawSessionOverlay, hitTestSession } from './render/screens';
import { createAudioController } from './render/audio';

/** 음소거 토글 버튼 지오메트리(화면 좌하단). draw·hitTest 공용. */
const MUTE_BUTTON = { x: 16, y: 582, w: 132, h: 30 } as const;

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
  const audio = createAudioController();

  /**
   * 시드는 시뮬레이션·런 바깥에서 만들어 주입한다.
   * (순수 계층 안에서 Date.now() 를 부르면 결정론이 깨진다 — 구조 제약)
   */
  const session = createSession(() => Date.now() & 0x7fffffff);
  const roomCodeInputElement = document.getElementById('room-code-input');
  if (!(roomCodeInputElement instanceof HTMLInputElement)) {
    throw new Error('#room-code-input 을 찾지 못했습니다.');
  }
  const roomCodeInput: HTMLInputElement = roomCodeInputElement;

  const relayUrl = resolveRelayUrl(import.meta.env.VITE_RELAY_URL, window.location.hostname);
  const onlineMatch = createOnlineMatch({
    events: {
      onRoomCode(code) {
        roomCodeInput.value = code;
        session.setPvpMessage('방 코드 ' + code + ' — 상대 참가 대기');
      },
      onStatus(status, detail) {
        if (status === 'started' && onlineMatch.battle) {
          session.enterOnlineBattle();
          syncRoomCodeInput();
        } else if ((status === 'opponent-left' || status === 'closed') && session.screen === 'onlineBattle') {
          session.returnToPvpLobby();
          syncRoomCodeInput();
        }
        session.setPvpMessage(onlineStatusText(status, detail));
      },
    },
    clientFactory(events) {
      if (!relayUrl) throw new Error('relay endpoint unavailable');
      return createOnlineClient({ relayUrl, events });
    },
  });

  function onlineStatusText(status: OnlineMatchStatus, detail?: string): string {
    switch (status) {
      case 'connecting':
        return 'relay 연결 중';
      case 'waiting':
        return '상대 참가 대기';
      case 'started':
        return onlineMatch.battle ? '대전 시작' : '대전 상태 동기화 중';
      case 'opponent-left':
        return '상대가 방을 나갔습니다.';
      case 'closed':
        return '연결을 종료했습니다.';
      case 'error':
        return '연결 오류' + (detail ? ': ' + detail : '');
      case 'idle':
        return '연결 대기';
    }
  }

  function syncRoomCodeInput(): void {
    const visible = session.screen === 'pvpLobby';
    roomCodeInput.hidden = !visible;
    if (!visible) roomCodeInput.blur();
  }

  function beginCreateRoom(): void {
    const entry = session.selectedPvpEntry;
    if (!entry) return;
    if (!relayUrl) {
      session.setPvpMessage('공개 relay 주소가 아직 설정되지 않았습니다.');
      return;
    }
    session.setPvpMessage('방 생성 연결 중');
    onlineMatch.create(entry.loadout);
  }

  function beginJoinRoom(): void {
    const entry = session.selectedPvpEntry;
    const code = roomCodeInput.value.trim().toUpperCase();
    roomCodeInput.value = code;
    if (!entry) return;
    if (!isRoomCode(code)) {
      session.setPvpMessage('방 코드 6자리를 입력하세요.');
      roomCodeInput.focus();
      return;
    }
    if (!relayUrl) {
      session.setPvpMessage('공개 relay 주소가 아직 설정되지 않았습니다.');
      return;
    }
    session.setPvpMessage('방 참가 연결 중');
    onlineMatch.join(code, entry.loadout);
  }

  function activateSession(id: string): void {
    const shouldCloseRelay = (id === 'pvp:back' || id === 'pvp:leave') && onlineMatch.role !== null;
    if (shouldCloseRelay) onlineMatch.close();
    session.activate(id);
    if (id === 'pvp:create') beginCreateRoom();
    else if (id === 'pvp:join') beginJoinRoom();
    syncRoomCodeInput();
  }

  roomCodeInput.addEventListener('input', () => {
    roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  });
  roomCodeInput.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      beginJoinRoom();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      activateSession('pvp:back');
    }
  });
  syncRoomCodeInput();

  // 배틀↔메타 화면 전환 감지(전환 시 연출 잔상 정리).
  let previousScreen = session.screen;
  // 배틀 시작·종료 감지용(세트완성 팡파레 / 승패 효과음).
  let previousBattleNumber = session.run.battleNumber;
  let battleFinishHandled = session.battle.phase === 'finished';

  // 메뉴 키보드 단축 — 마우스가 1차 조작이고, 이건 보조다.
  window.addEventListener('keydown', (event) => {
    audio.resume();
    if (event.key === 'm' || event.key === 'M') {
      audio.toggleMute();
      return;
    }
    if (session.screen === 'reward') {
      if (event.key === '1') selectReward('reward:0');
      else if (event.key === '2') selectReward('reward:1');
      else if (event.key === '3') selectReward('reward:2');
      else if (event.key === 'r' || event.key === 'R') {
        // 리롤(§17-D) — 남은 횟수 판정·재추첨은 세션이 한다(0 이면 무반응).
        audio.play('rewardSelect');
        session.activate('reward:reroll');
      }
    } else if ((session.screen === 'pvpSelect' || session.screen === 'pvpLobby' || session.screen === 'onlineBattle') && event.key === 'Escape') {
      activateSession(session.screen === 'onlineBattle' ? 'pvp:leave' : 'pvp:back');
    }
  });

  function selectReward(id: string): void {
    audio.play('rewardSelect');
    session.activate(id);
  }

  // 카드/버튼 클릭 — 캔버스가 CSS 로 축소될 수 있으므로 좌표를 실제 캔버스 해상도로 환산한다.
  canvas.addEventListener('pointerdown', (event) => {
    audio.resume();
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

    // 음소거 버튼 우선 판정(모든 화면 공용).
    if (x >= MUTE_BUTTON.x && x <= MUTE_BUTTON.x + MUTE_BUTTON.w && y >= MUTE_BUTTON.y && y <= MUTE_BUTTON.y + MUTE_BUTTON.h) {
      audio.toggleMute();
      return;
    }

    const id = hitTestSession(canvas, session, x, y);
    if (!id) return;
    if (id.startsWith('reward:')) selectReward(id);
    else activateSession(id);
  });

  let previousRenderTimeMilliseconds = performance.now();

  startFixedTimestepLoop({
    fixedDeltaSeconds: Balance.FIXED_DELTA_SECONDS,
    maximumStepsPerFrame: Balance.MAXIMUM_STEPS_PER_FRAME,

    update(fixedDeltaSeconds) {
      const playerInput = keyboard.consumeCommand();
      const wasRunBattle = session.screen === 'battle';
      const onlineBattleActive = session.screen === 'onlineBattle' && onlineMatch.battle !== null;

      if (onlineBattleActive) {
        onlineMatch.step(playerInput, fixedDeltaSeconds);
        const battle = onlineMatch.battle;
        // host는 매 tick을, guest는 새 snapshot을 적용한 tick만 소비한다. 같은 이벤트의 60Hz 중복 재생을 막는다.
        const consumeEvents = onlineMatch.role === 'host' || onlineMatch.consumeSnapshotAccepted();
        if (battle && consumeEvents) {
          consumeSimulationEvents(effects, battle.events, (cue, strength) => audio.play(cue, strength));
          if (!battleFinishHandled && battle.phase === 'finished') {
            const localIndex = onlineMatch.role === 'guest' ? 1 : 0;
            audio.play(battle.winnerIndex === localIndex ? 'win' : 'lose');
            battleFinishHandled = true;
          }
        }
      } else {
        session.step(playerInput, fixedDeltaSeconds);
        // 런 배틀 스텝에서 뱉은 연출 이벤트만 소비한다(비-배틀 화면에서는 events 가 안 갱신됨).
        if (wasRunBattle) {
          consumeSimulationEvents(effects, session.battle.events, (cue, strength) => audio.play(cue, strength));
          if (!battleFinishHandled && session.battle.phase === 'finished') {
            audio.play(session.battle.winnerIndex === PLAYER_INDEX ? 'win' : 'lose');
            battleFinishHandled = true;
          }
        }
      }

      // 새 배틀 진입 감지 — 세트 완성 상태로 시작하면 팡파레(F2 청각 신호).
      if (session.run.battleNumber !== previousBattleNumber) {
        previousBattleNumber = session.run.battleNumber;
        battleFinishHandled = false;
        if (session.screen === 'battle' && buildSetSummary(session.run.build).completed) {
          audio.play('setComplete');
        }
      }

      if (session.screen !== previousScreen) {
        if (session.screen === 'battle' || session.screen === 'onlineBattle') {
          clearEffects(effects);
          battleFinishHandled = false;
        }
        previousScreen = session.screen;
      }
    },

    render() {
      const nowMilliseconds = performance.now();
      const renderDeltaSeconds = Math.min(0.1, (nowMilliseconds - previousRenderTimeMilliseconds) / 1000);
      previousRenderTimeMilliseconds = nowMilliseconds;

      const onRunBattle = session.screen === 'battle';
      const onlineBattle = session.screen === 'onlineBattle' ? onlineMatch.battle : null;
      const runHud = onRunBattle ? runHudFor(session.run.build, session.run.battleNumber) : undefined;
      const visuals = onRunBattle
        ? battleVisualsFor(session.run.build)
        : onlineBattle
          ? onlineBattleVisualsFor(session.selectedPvpEntry, onlineMatch.role)
          : undefined;
      renderer.draw(onlineBattle ?? session.battle, effects, renderDeltaSeconds, runHud, visuals);
      drawSessionOverlay(overlayContext, canvas, session);
      drawMuteButton(overlayContext, audio.isMuted());
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

/** 배틀 등장 팽이 외형(F2). 플레이어=런 빌드 세트, 봇=시작 빌드(무소속). */
function battleVisualsFor(build: RunBuild): BattleVisualContext {
  const summary = buildSetSummary(build);
  return {
    beyblades: [
      { setTag: summary.tag, setCompleted: summary.completed },
      undefined,
    ],
  };
}

/** 온라인 대전에서는 내 출전 세트만 index(host=0, guest=1)에 표시한다. 상대 외형은 match-start loadout 확장 범위다. */
function onlineBattleVisualsFor(
  entry: PvpEntryView | null,
  role: 'host' | 'guest' | null,
): BattleVisualContext | undefined {
  if (!entry || !role) return undefined;
  const visual = { setTag: entry.setTag, setCompleted: entry.completedSet };
  return { beyblades: role === 'host' ? [visual, undefined] : [undefined, visual] };
}
function drawMuteButton(context: CanvasRenderingContext2D, muted: boolean): void {
  context.save();
  context.fillStyle = muted ? 'rgba(60, 40, 40, 0.9)' : 'rgba(38, 48, 74, 0.9)';
  context.fillRect(MUTE_BUTTON.x, MUTE_BUTTON.y, MUTE_BUTTON.w, MUTE_BUTTON.h);
  context.strokeStyle = muted ? '#a05a5a' : '#4a5678';
  context.lineWidth = 1.5;
  context.strokeRect(MUTE_BUTTON.x, MUTE_BUTTON.y, MUTE_BUTTON.w, MUTE_BUTTON.h);
  context.fillStyle = muted ? '#ff9a9a' : '#c9d2ea';
  context.font = '600 13px "Segoe UI", "Malgun Gothic", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(muted ? '[ 음소거 ] M' : '[ 소리 켜짐 ] M', MUTE_BUTTON.x + MUTE_BUTTON.w / 2, MUTE_BUTTON.y + MUTE_BUTTON.h / 2);
  context.restore();
}

bootstrap();
