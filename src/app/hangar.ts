/**
 * 격납고 — 12판 완주 팽이(빌드 스냅샷)의 로컬 저장 (§13, R15).
 *
 * 계층 경계: 이 파일은 localStorage(브라우저 I/O)를 만지므로 시뮬레이션·런(순수) 바깥의 app 계층에 둔다.
 * Date.now() 도 여기서는 허용된다(결정론이 필요한 시뮬/런이 아니라 저장 메타데이터용).
 *
 * 판정 근거(§13-1/§13-2):
 *  - "계정당 5개" → localStorage 5슬롯(브라우저당). 로그인·서버 없음.
 *  - 완주 시 저장 여부를 1회 묻는다(자동 아님). 만석이면 수동 덮어쓰기(자동 밀어내기 금지).
 */

import type { BeybladeStats } from '../game/types';
import type { SetTag } from '../game/parts';
import type { RunBuild } from '../game/run';
import { enhanceTotal, runBuildStats, buildSetSummary } from '../game/run';

/** 격납고 슬롯 수(§13, R15). */
export const HANGAR_SLOT_COUNT = 5;

const STORAGE_KEY = 'nan2026.hangar.v1';

/** 저장된 완주 팽이 1기. 전부 직렬화 가능한 순수 데이터. */
export interface HangarEntry {
  readonly version: 1;
  /** 표시용 이름(예: 완주 시각 기반). */
  readonly name: string;
  readonly layerId: string;
  readonly diskId: string;
  readonly driverId: string;
  readonly levels: { readonly layer: number; readonly disk: number; readonly driver: number };
  /** 완성된 세트 태그(3/3). 없으면 null. */
  readonly completedSet: SetTag | null;
  /** 강화 레벨 총합(표시 "+N"). */
  readonly enhanceTotal: number;
  /** 최종 스탯 4종 스냅샷. */
  readonly stats: BeybladeStats;
  /** 저장 시각(ms). */
  readonly savedAt: number;
}

/** 5칸 배열(빈 칸은 null)로 읽는다. 손상된 데이터면 전부 빈 격납고로 되돌린다. */
export function loadHangar(): (HangarEntry | null)[] {
  const empty = new Array<HangarEntry | null>(HANGAR_SLOT_COUNT).fill(null);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return empty;
    for (let index = 0; index < HANGAR_SLOT_COUNT; index += 1) {
      const candidate = parsed[index];
      if (candidate && typeof candidate === 'object') {
        empty[index] = candidate as HangarEntry;
      }
    }
    return empty;
  } catch {
    // localStorage 접근 불가(프라이빗 모드 등)·파싱 실패 시 빈 격납고로 진행한다(런은 계속 가능).
    return empty;
  }
}

/** 격납고 전체를 저장한다. 실패해도 게임 진행은 막지 않는다. */
export function saveHangar(slots: readonly (HangarEntry | null)[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch {
    // 저장 실패는 무시(로컬 편의 기능이라 런·PvP 성립에 필수 아님, §13-1 근거 c).
  }
}

/** 완주 빌드에서 격납고 엔트리를 만든다. */
export function entryFromRunBuild(build: RunBuild, savedAt: number): HangarEntry {
  const summary = buildSetSummary(build);
  return {
    version: 1,
    name: hangarNameFromTime(savedAt),
    layerId: build.layer.part.id,
    diskId: build.disk.part.id,
    driverId: build.driver.part.id,
    levels: { layer: build.layer.level, disk: build.disk.level, driver: build.driver.level },
    completedSet: summary.completed ? summary.tag : null,
    enhanceTotal: enhanceTotal(build),
    stats: runBuildStats(build),
    savedAt,
  };
}

/** 저장 시각 → 짧은 표시 이름(예: "07-22 14:30 완주"). */
function hangarNameFromTime(savedAt: number): string {
  const date = new Date(savedAt);
  const two = (value: number) => value.toString().padStart(2, '0');
  return `${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(
    date.getMinutes(),
  )} 완주`;
}

/** 지정 슬롯에 엔트리를 넣은 새 배열을 반환한다(수동 덮어쓰기 포함). */
export function withEntryAt(
  slots: readonly (HangarEntry | null)[],
  slotIndex: number,
  entry: HangarEntry,
): (HangarEntry | null)[] {
  const next = slots.slice();
  next[slotIndex] = entry;
  return next;
}

/** 빈 슬롯이 하나라도 있는가. */
export function hasEmptySlot(slots: readonly (HangarEntry | null)[]): boolean {
  return slots.some((slot) => slot === null);
}
