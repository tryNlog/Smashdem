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
import { botInput, botTuningForTier, type BotTuning } from '../game/bot';
import { createBattleState, definitionFromBuild } from '../game/battleState';
import type { BattleState, InputCommand } from '../game/types';
import type { RewardCard } from '../game/rewards';
import { applyReward, generateRewards } from '../game/rewards';
import type { BotBuildAssignment, RunBuild, RunState } from '../game/run';
import {
  advanceAfterReward,
  consumeReroll,
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
import type { Build, SetTag } from '../game/parts';
import { buildFromIds, buildProfile, completedSet } from '../game/parts';
import type { PvpLoadout } from '../net/protocol';

export const PLAYER_INDEX = 0;
export const BOT_INDEX = 1;

export type SessionScreen = 'battle' | 'reward' | 'runResult' | 'pvpSelect' | 'pvpLobby' | 'onlineBattle';

/** 완주/패배 후 저장 질의 단계. 승리일 때만 'pending' 으로 시작한다(§13-2). */
export type SavePhase = 'pending' | 'done';

/** PvP 출전 선택 카드 뷰모델(프리셋 또는 저장 팽이). */
export interface PvpEntryView {
  readonly id: string;
  /** PvP 시작 시 relay로 전송할 파츠 ID 스냅샷. 강화는 profile에서 0으로 정규화한다. */
  readonly loadout: PvpLoadout;
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
  readonly selectedPvpEntry: PvpEntryView | null;
  readonly pvpMessage: string | null;
  /** WebSocket 바깥 계층(main)이 connection 상태를 Canvas에 전달한다. */
  setPvpMessage(message: string | null): void;
  /** match-start 뒤 main의 host-authoritative 전투 렌더로 넘긴다. */
  enterOnlineBattle(): void;
  /** 상대 이탈·나가기 뒤 선택한 출전 팽이를 보존한 대기실로 돌아간다. */
  returnToPvpLobby(): void;

  /** 배틀 화면일 때만 한 스텝 전진. 다른 화면에서는 시뮬을 멈춘다. */
  step(playerInput: InputCommand, deltaSeconds: number): void;
  /** 버튼/키 액션 디스패치(id 는 render/screens.ts 의 버튼 id 와 같다). */
  activate(id: string): void;
}

/**
 * 세션 생성 옵션.
 * @property botBuildFor 봇 빌드 부여 해석기(미러 봇 후보 측정·배선용). 생략 시 전 구간 시작 빌드
 *   고정(현행 동작·바이트 동일). 주어지면 매 판 (플레이어 런 빌드, 구간) → 봇 빌드+옵션.
 *   결정론 규율: 해석기는 런 빌드만 읽는 순수 함수여야 한다(run.mirrorBotBuild 가 그 예).
 */
export interface SessionOptions {
  readonly botBuildFor?: (playerBuild: RunBuild, tier: number) => BotBuildAssignment;
  /**
   * 봇 스킬 튜닝 해석기(미러 봇 스킬 다이얼 측정·배선용). 생략 시 botTuningForTier(tier)(현행).
   * 미러가 봇 빌드를 플레이어와 대등하게 올릴 때, 스킬을 4구간 최대치로 두면 봇 우세로 과조준되므로
   * 스킬을 별도 축으로 낮춰 파리티를 맞추기 위한 훅. 결정론 규율: 순수 함수여야 한다.
   */
  readonly botTuningFor?: (playerBuild: RunBuild, tier: number) => BotTuning;
}

/**
 * @param seedSource 런/배틀 시드의 출처(Date.now 기반). 시뮬 바깥에서 주입한다 — 시뮬 안에서
 *   Date.now 를 부르지 않기 위함(결정론 규율). 같은 시드면 같은 런 시퀀스가 재현된다.
 * @param options 봇 빌드 해석기 등. 생략 시 현행(시작 빌드 봇) 동작 불변.
 */
export function createSession(seedSource: () => number, options: SessionOptions = {}): Session {
  let screen: SessionScreen = 'battle';
  let run = createRun(createRandomState(seedSource()));
  let battle = createBattleForCurrentBattle(run);
  let rewards: RewardCard[] = [];
  let hangar = loadHangar();
  let savePhase: SavePhase = 'done';
  let pvpEntries: PvpEntryView[] = [];
  let selectedPvpEntry: PvpEntryView | null = null;
  let pvpMessage: string | null = null;

  function createBattleForCurrentBattle(forRun: RunState): BattleState {
    // 플레이어 정의 — 런 빌드에 강화·세트 보너스를 얹는다(buildProfile 재사용).
    // context: 'run' — 런 강화 상한(§17-B/18-4)을 명시. STRIKE 세트 완성이면 damageDealtMultiplier
    // ×1.25 가 여기서 실어지고(applySetBonus), 그게 배틀 시뮬(applyCollisionDamage)에서 상대 회전력을
    // 더 깎는다 = "스트라이커가 상대 회전력을 눈에 띄게 깎는다"(§17-F)의 실제 배선 지점이다.
    const playerDefinition = definitionFromBuild('나', runBuildToBuild(forRun.build), {
      levels: runBuildLevels(forRun.build),
      applySetBonus: true,
      context: 'run',
    });
    // 봇 정의 — 기본은 시작 빌드 고정(현행). options.botBuildFor 가 주어지면 그 해석기가 준
    // 빌드+옵션(미러 봇 등)을 쓴다. 티어별 강도는 봇 파라미터(botTuningForTier)로도 함께 준다.
    const botAssignment: BotBuildAssignment = options.botBuildFor
      ? options.botBuildFor(forRun.build, tierForBattle(forRun.battleNumber))
      : { build: STARTER_BUILD, options: {} };
    const botDefinition = definitionFromBuild('상대', botAssignment.build, botAssignment.options);
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

  /**
   * 3택1 리롤(§17-D) — 남은 횟수가 있으면 3택 전부 재추첨(N7 드랍 테이블 재롤).
   * 재추첨은 run.random 만 소비 → 같은 시드·같은 리롤 시퀀스면 같은 3택(결정론). 신규 화면 없음.
   */
  function rerollReward(): void {
    if (screen !== 'reward') return;
    if (!consumeReroll(run)) return;
    rewards = generateRewards(run.build, run.random);
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
    selectedPvpEntry = null;
    pvpMessage = null;
    screen = 'pvpSelect';
  }

  function closePvpSelect(): void {
    selectedPvpEntry = null;
    pvpMessage = null;
    // 런이 진행 중이면 배틀로, 끝났으면 결과 화면으로 돌아간다.
    screen = run.phase === 'inRun' ? 'battle' : 'runResult';
  }

  function closePvpLobby(): void {
    selectedPvpEntry = null;
    pvpMessage = null;
    screen = 'pvpSelect';
  }

  function enterOnlineBattle(): void {
    if (!selectedPvpEntry) return;
    pvpMessage = null;
    screen = 'onlineBattle';
  }

  function returnToPvpLobby(): void {
    screen = selectedPvpEntry ? 'pvpLobby' : 'pvpSelect';
  }

  function selectPvpEntry(entryId: string): void {
    const entry = pvpEntries.find((candidate) => candidate.id === entryId);
    if (!entry) return;
    selectedPvpEntry = entry;
    pvpMessage = null;
    screen = 'pvpLobby';
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
    get selectedPvpEntry() {
      return selectedPvpEntry;
    },
    get pvpMessage() {
      return pvpMessage;
    },
    setPvpMessage(message: string | null): void {
      pvpMessage = message;
    },
    enterOnlineBattle(): void {
      enterOnlineBattle();
    },
    returnToPvpLobby(): void {
      returnToPvpLobby();
    },

    step(playerInput: InputCommand, deltaSeconds: number): void {
      if (screen !== 'battle') return;

      const tier = tierForBattle(run.battleNumber);
      const botTuning = options.botTuningFor
        ? options.botTuningFor(run.build, tier)
        : botTuningForTier(tier);
      const inputs: InputCommand[] = [];
      inputs[PLAYER_INDEX] = playerInput;
      inputs[BOT_INDEX] = botInput(battle, BOT_INDEX, botTuning);

      stepBattle(battle, inputs, deltaSeconds);

      if (battle.phase === 'finished') onBattleFinished();
    },

    activate(id: string): void {
      if (id === 'reward:reroll') {
        rerollReward();
        return;
      }
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
        case 'pvp:create':
        case 'pvp:join':
          return;
        case 'pvp:leave':
          returnToPvpLobby();
          return;
        case 'pvp:back':
          if (screen === 'pvpLobby') closePvpLobby();
          else closePvpSelect();
          return;
      }
    },
  };
}

/**
 * PvP 컨텍스트 전투 프로파일(§18-4, S3 대비 배선).
 *  - context: 'pvp' → 강화 레벨이 ENHANCE_LEVEL_CAP_PVP(=0) 으로 clamp = 완주 빌드의 강화 격차 정규화.
 *  - applySetBonus: true → 세트 완성 상태는 유지(STRIKE ×1.25·BREAK sta+5 등이 PvP 에서도 유효, SET4′ ≤75% 검증 대상).
 * S3 실시간 대전이 붙으면 이 함수가 PvP 팽이 정의(definitionFromBuild)의 옵션 소스가 된다.
 */
function pvpCombatantProfile(build: Build) {
  return buildProfile(build, { applySetBonus: true, context: 'pvp' });
}

/** 프리셋 3종 + 저장 팽이(최대 5) 를 출전 선택 카드로 만든다(§13-2). PvP 컨텍스트로 정규화(강화 0). */
function loadoutForBuild(build: Build): PvpLoadout {
  return { layerId: build.layer.id, diskId: build.disk.id, driverId: build.driver.id };
}

function buildPvpEntries(hangar: readonly (HangarEntry | null)[]): PvpEntryView[] {
  const entries: PvpEntryView[] = [];

  for (const preset of PVP_PRESETS) {
    const profile = pvpCombatantProfile(preset.build);
    const tag = completedSet(preset.build);
    entries.push({
      id: `preset:${preset.key}`,
      loadout: loadoutForBuild(preset.build),
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
    // 완주 빌드를 PvP 컨텍스트로 정규화(강화 0)해 스탯을 재도출한다 — 격납고에 저장된 stats 는
    // 런 컨텍스트(강화 반영)라 PvP 매치업을 오도한다(§18-4). 손상 데이터면 저장 스냅샷으로 폴백.
    let pvpStats = slot.stats;
    try {
      pvpStats = pvpCombatantProfile(buildFromIds(slot.layerId, slot.diskId, slot.driverId)).stats;
    } catch {
      // 손상된 격납고 엔트리 — 저장된 stats 로 진행(런은 계속 가능, §13-1).
    }
    entries.push({
      id: `saved:${index}`,
      loadout: { layerId: slot.layerId, diskId: slot.diskId, driverId: slot.driverId },
      name: slot.name,
      kind: 'saved',
      setTag: slot.completedSet,
      completedSet: slot.completedSet !== null,
      // PvP 정규화로 강화는 0. 표시도 0 으로 두어 "PvP 에서는 강화 격차 없음"(§18-4)을 정직하게 반영.
      enhanceTotal: 0,
      stats: pvpStats,
    });
  });

  return entries;
}
