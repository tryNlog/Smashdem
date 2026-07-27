/**
 * S3 호스트 권위 PvP 배틀 coordinator.
 *
 * host만 stepBattle()을 실행한다. guest는 자신의 입력을 외부 릴레이로 보낼 frame을 만들고,
 * host가 보낸 더 최신 BattleState 스냅샷만 렌더 상태로 교체한다.
 */

import { cloneBattleState, createBattleState, type BeybladeDefinition } from '../game/battleState';
import { stepBattle } from '../game/simulation';
import type { BattleState, InputCommand } from '../game/types';

export type OnlineRole = 'host' | 'guest';

/** 호스트 state 송신 주기. 고정 60Hz 시뮬레이션의 3틱마다 = 20Hz. */
export const SNAPSHOT_TICK_INTERVAL = 3;

export type OnlineBattleUpdate =
  | { readonly kind: 'host-snapshot'; readonly tick: number; readonly battle: BattleState }
  | { readonly kind: 'guest-input'; readonly sequence: number; readonly input: InputCommand }
  | null;

export interface OnlineBattle {
  readonly role: OnlineRole;
  readonly battle: BattleState;
  /** host는 물리를 한 틱 전진하고, guest는 릴레이로 보낼 입력 frame만 만든다. */
  step(localInput: InputCommand, deltaSeconds: number): OnlineBattleUpdate;
  /** guest 입력을 host가 받을 때 호출한다. 오래된 sequence·guest 역할 호출은 무시한다. */
  receiveRemoteInput(sequence: number, input: InputCommand): void;
  /** guest가 host state를 수신할 때 호출한다. strictly newer tick만 반영한다. */
  receiveSnapshot(tick: number, snapshot: BattleState): boolean;
}

const NEUTRAL_INPUT: InputCommand = { moveX: 0, moveY: 0, burst: false };

function copyInput(input: InputCommand): InputCommand {
  return { moveX: input.moveX, moveY: input.moveY, burst: input.burst };
}

export function createOnlineBattle(
  role: OnlineRole,
  definitions: readonly BeybladeDefinition[],
  seed: number,
): OnlineBattle {
  let battle = createBattleState(definitions, seed);
  let latestRemoteInput = copyInput(NEUTRAL_INPUT);
  let latestRemoteSequence = 0;
  let nextGuestSequence = 0;
  let latestSnapshotTick = -1;

  return {
    role,
    get battle() {
      return battle;
    },

    step(localInput: InputCommand, deltaSeconds: number): OnlineBattleUpdate {
      if (role === 'guest') {
        nextGuestSequence += 1;
        return { kind: 'guest-input', sequence: nextGuestSequence, input: copyInput(localInput) };
      }

      stepBattle(battle, [copyInput(localInput), latestRemoteInput], deltaSeconds);
      // burst는 edge 입력이다. 같은 원격 axis 입력을 다음 틱에도 쓰되 burst만 소비한다.
      latestRemoteInput = { ...latestRemoteInput, burst: false };

      if (battle.tick % SNAPSHOT_TICK_INTERVAL !== 0 && battle.phase !== 'finished') return null;
      return { kind: 'host-snapshot', tick: battle.tick, battle: cloneBattleState(battle) };
    },

    receiveRemoteInput(sequence: number, input: InputCommand): void {
      if (role !== 'host' || sequence <= latestRemoteSequence) return;
      latestRemoteSequence = sequence;
      // 새 axis는 최신값을 쓰고, 아직 처리하지 않은 burst pulse는 다음 host tick까지 보존한다.
      latestRemoteInput = {
        moveX: input.moveX,
        moveY: input.moveY,
        burst: latestRemoteInput.burst || input.burst,
      };
    },

    receiveSnapshot(tick: number, snapshot: BattleState): boolean {
      if (role !== 'guest' || tick <= latestSnapshotTick || snapshot.tick !== tick) return false;
      battle = cloneBattleState(snapshot);
      latestSnapshotTick = tick;
      return true;
    },
  };
}