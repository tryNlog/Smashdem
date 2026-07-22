/**
 * 렌더 색상·형태 정의.
 *
 * 색만으로 두 팽이를 구분하면 색각 이상 사용자와 저화질 영상(제출물 #2)에서 구분이 무너진다.
 * 그래서 **색과 모양을 둘 다** 다르게 준다.
 * 실제 아트 폴리시는 technical-artist 역할이 이어받는다.
 */

export interface BeybladeAppearance {
  readonly bodyColor: string;
  readonly rimColor: string;
  readonly accentColor: string;
  /** 몸체 다각형의 꼭짓점 수. 팽이마다 실루엣을 다르게 하기 위한 값. */
  readonly bladeCount: number;
}

export const BEYBLADE_APPEARANCES: readonly BeybladeAppearance[] = [
  // 0번 = 플레이어: 청록 / 6날 (뾰족한 별 실루엣)
  { bodyColor: '#1c6f7d', rimColor: '#5fe3ff', accentColor: '#c9f7ff', bladeCount: 6 },
  // 1번 = 봇: 주황 / 3날 (넓은 삼각 실루엣)
  { bodyColor: '#7d3f14', rimColor: '#ff9a3c', accentColor: '#ffe0b8', bladeCount: 3 },
];

export const ARENA_COLORS = {
  floorOuter: '#151a28',
  floorInner: '#1e2740',
  ringLine: 'rgba(120, 150, 200, 0.28)',
  boundary: '#8fa6d8',
  centerGlow: 'rgba(120, 170, 255, 0.10)',
} as const;

/** 세트 태그별 색 (F1 세트 진행 표시 · 3택1 카드 · 출전 카드 공용). */
export const SET_COLORS = {
  STRIKE: '#ff7a7a',
  GUARD: '#7ab6ff',
  BREAK: '#ffb14e',
} as const;

export const HUD_COLORS = {
  panelBackground: 'rgba(18, 22, 34, 0.85)',
  label: '#aab3cc',
  spinBarBackground: '#2a3145',
  burstBarBackground: '#2a3145',
  burstBarFill: '#ffd166',
  burstBarReady: '#fff3c4',
  overlayBackground: 'rgba(8, 10, 18, 0.72)',
  overlayText: '#f2f5ff',
  overlaySubText: '#9aa4c0',
} as const;
