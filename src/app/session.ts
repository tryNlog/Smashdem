/**
 * 세션 오케스트레이터 — 런/배틀/화면을 잇는 app 계층 상태머신.
 *
 * 계층 경계: 화면 전환·격납고 저장·PvP 선택 같은 "게임 바깥" 흐름을 여기서 다룬다.
 * 시뮬레이션(순수)·런(순수)은 그대로 두고, 이 파일이 그 위에서 언제 무엇을 돌릴지 정한다.
 * Canvas·DOM 지오메트리는 여기 없다 — 그건 render/screens.ts, 입력 플러밍은 main.ts.
 *
 * 화면(screen): battle(전투) → reward(3택1) → 다시 battle → … → runResult(완주/패배) → pvpSelect(stub).
 */

import { createRandomState } from '../engine/random';
import { botInput, botTuningForTier } from '../game/bot';
import { createBattleState, definitionFromBuild } from '../game/battleState';
import type { BattleState, InputCommand } from '../game/types';
import type { RewardCard } from '../game/rewards';
import { applyReward, generateRewards } from '../game/rewards';
import type { RunState } from '../game/run';
import {
  advanceAfterReward,
  createRun,
  nextBattleSeed,
  recordBattleResult,
  runBuildLevels,
  runBuildToBuild,
  tierForBattle,
} from '../game/run';
import { STARTER_BUILD } from '../game/parts';
import { stepBattle } from '../game/simulation';
import type { HangarEntry } from './hangar';
import { entryFromRunBuild, loadHangar, saveHangar, withEntryAt } from './hangar';
import { PVP_PRESETS } from './presets';
import type { BeybladeStats } from '../game/types';
import type { SetTag } from '../game/parts';
import { buildProfile, completedSet } from '../game/parts';

export const PLAYER_INDEX = 0;
export const BOT_INDEX = 1;

export type SessionScreen = 'battle' | 'reward' | 'runResult' | 'pvpSelect';

/** 완주/패배 후 저장 질의 단계. 승리일 때만 'pending' 으로 시작한다(§13-2). */
export type SavePhase = 'pending' | 'done';

/** PvP 출전 선택 카드 뷰모델(프리셋 또는 저장 팽이). */
export interface PvpEntryView {
  readonly id: string;
  readonly name: string;
  readonly kind: 'preset' | 'saved';
  readonly setTag: SetTag | null;
  readonly completedSet: boolean;
  readonly enhanceTotal: number;
  readonly stats: BeybladeStats;
}

export interface Session {
  readonly screen: SessionScreen;
  readonly run: RunState;
  readonly battle: BattleState;
  readonly rewards: readonly RewardCard[];
  readonly hangar: readonly (HangarEntry | null)[];
  readonly savePhase: SavePhase;
  readonly pvpEntries: readonly PvpEntryView[];
  readonly pvpMessage: string | null;

  /** 배틀 화면일 때만 한 스텝 전진. 다른 화면에서는 시뮬을 멈춘다. */
  step(playerInput: InputCommand, deltaSeconds: number): void;
  /** 버튼/키 액션 디스패치(id 는 render/screens.ts 의 버튼 id 와 같다). */
  activate(id: string): void;
}

/**
 * @param seedSource 런/배틀 시드의 출처(Date.now 기반). 시뮬 바깥에서 주입한다 — 시뮬 안에서
 *   Date.now 를 부르지 않기 위함(결정론 규율). 같은 시드면 같은 런 시퀀스가 재현된다.
 */
export function createSession(seedSource: () => number): Session {
  let screen: SessionScreen = 'battle';
  let run = createRun(createRandomState(seedSource()));
  let battle = createBattleForCurrentBattle(run);
  let rewards: RewardCard[] = [];
  let hangar = loadHangar();
  let savePhase: SavePhase = 'done';
  let pvpEntries: PvpEntryView[] = [];
  let pvpMessage: string | null = null;

  function createBattleForCurrentBattle(forRun: RunState): BattleState {
    // 플레이어 정의 — 런 빌드에 강화·세트 보너스를 얹는다(buildProfile 재사용).
    const playerDefinition = definitionFromBuild('나', runBuildToBuild(forRun.build), {
      levels: runBuildLevels(forRun.build),
      applySetBonus: true,
    });
    // 봇 정의 — 지금은 시작 빌드 고정. 티어별 강도는 봇 파라미터(botTuningForTier)로만 준다.
    // ★ game-ai-engineer 인계: 티어별로 봇 "빌드"를 바꾸고 싶으면 이 줄을 tier 로 분기한다.
    const botDefinition = definitionFromBuild('상대', STARTER_BUILD);
    const seed = nextBattleSeed(forRun);
    return createBattleState([playerDefinition, botDefinition], seed);
  }

  function startNextBattle(): void {
    battle = createBattleForCurrentBattle(run);
    screen = 'battle';
  }

  function onBattleFinished(): void {
    const playerWon = battle.winnerIndex === PLAYER_INDEX;
    const result = recordBattleResult(run, playerWon);

    if (result.showReward) {
      rewards = generateRewards(run.build, run.random);
      screen = 'reward';
      return;
    }

    // 런 종료(완주 또는 패배). 완주면 저장 질의를 연다(§13-2).
    savePhase = run.phase === 'won' ? 'pending' : 'done';
    screen = 'runResult';
  }

  function chooseReward(cardIndex: number): void {
    const card = rewards[cardIndex];
    if (!card) return;
    const nextBuild = applyReward(run.build, card);
    advanceAfterReward(run, nextBuild);
    rewards = [];
    startNextBattle();
  }

  function saveToSlot(slotIndex: number): void {
    if (savePhase !== 'pending' || run.phase !== 'won') return;
    const entry = entryFromRunBuild(run.build, Date.now());
    hangar = withEntryAt(hangar, slotIndex, entry);
    saveHangar(hangar);
    savePhase = 'done';
  }

  function beginNewRun(): void {
    run = createRun(createRandomState(seedSource()));
    rewards = [];
    savePhase = 'done';
    startNextBattle();
  }

  function openPvpSelect(): void {
    pvpEntries = buildPvpEntries(hangar);
    pvpMessage = null;
    screen = 'pvpSelect';
  }

  function closePvpSelect(): void {
    pvpMessage = null;
    // 런이 진행 중이면 배틀로, 끝났으면 결과 화면으로 돌아간다.
    screen = run.phase === 'inRun' ? 'battle' : 'runResult';
  }

  function selectPvpEntry(entryId: string): void {
    const entry = pvpEntries.find((candidate) => candidate.id === entryId);
    if (!entry) return;
    // ★ S3 stub: 실제 온라인 대전 연결은 아직 없다. 선택만 확인하고 안내를 띄운다.
    pvpMessage = `${entry.name} 선택됨 — 온라인 대전(방 코드/실시간)은 S3 에서 연결 예정 (현재 stub)`;
  }

  return {
    get screen() {
      return screen;
    },
    get run() {
      return run;
    },
    get battle() {
      return battle;
    },
    get rewards() {
      return rewards;
    },
    get hangar() {
      return hangar;
    },
    get savePhase() {
      return savePhase;
    },
    get pvpEntries() {
      return pvpEntries;
    },
    get pvpMessage() {
      return pvpMessage;
    },

    step(playerInput: InputCommand, deltaSeconds: number): void {
      if (screen !== 'battle') return;

      const tier = tierForBattle(run.battleNumber);
      const inputs: InputCommand[] = [];
      inputs[PLAYER_INDEX] = playerInput;
      inputs[BOT_INDEX] = botInput(battle, BOT_INDEX, botTuningForTier(tier));

      stepBattle(battle, inputs, deltaSeconds);

      if (battle.phase === 'finished') onBattleFinished();
    },

    activate(id: string): void {
      if (id.startsWith('reward:')) {
        chooseReward(Number(id.slice('reward:'.length)));
        return;
      }
      if (id.startsWith('result:save:')) {
        saveToSlot(Number(id.slice('result:save:'.length)));
        return;
      }
      if (id.startsWith('pvp:entry:')) {
        selectPvpEntry(id.slice('pvp:entry:'.length));
        return;
      }
      switch (id) {
        case 'result:noSave':
          if (savePhase === 'pending') savePhase = 'done';
          return;
        case 'result:newRun':
          beginNewRun();
          return;
        case 'result:pvp':
        case 'battle:pvp':
          openPvpSelect();
          return;
        case 'pvp:back':
          closePvpSelect();
          return;
      }
    },
  };
}

/** 프리셋 3종 + 저장 팽이(최대 5) 를 출전 선택 카드로 만든다(§13-2). */
function buildPvpEntries(hangar: readonly (HangarEntry | null)[]): PvpEntryView[] {
  const entries: PvpEntryView[] = [];

  for (const preset of PVP_PRESETS) {
    const profile = buildProfile(preset.build);
    const tag = completedSet(preset.build);
    entries.push({
      id: `preset:${preset.key}`,
      name: preset.name,
      kind: 'preset',
      setTag: tag,
      completedSet: tag !== null,
      enhanceTotal: 0,
      stats: profile.stats,
    });
  }

  hangar.forEach((slot, index) => {
    if (!slot) return;
    entries.push({
      id: `saved:${index}`,
      name: slot.name,
      kind: 'saved',
      setTag: slot.completedSet,
      completedSet: slot.completedSet !== null,
      enhanceTotal: slot.enhanceTotal,
      stats: slot.stats,
    });
  });

  return entries;
}
