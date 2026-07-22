/**
 * PvP 출전 프리셋 3종 (§12-1, R12).
 *
 * "완주 빌드보다 명확히 약하되 아키타입 정체성은 온전" — 아키타입 순정 빌드 3종(어택/스태미나/링브레이커).
 * 프리셋 3종 간 밸런스 측정(N12)은 이번 작업 범위 밖이다. 여기서는 출전 선택 UI 를 채우는 데이터로만 쓴다.
 *
 * ★ S3 인계: 실제 온라인 대전 연결은 아직 stub 이다. 프리셋 build 는 그대로 PvP 매치의 팽이 정의로 넘길 수 있다.
 */

import { ARCHETYPE_BUILDS, type Build } from '../game/parts';

export interface PvpPreset {
  readonly key: string;
  readonly name: string;
  readonly build: Build;
}

export const PVP_PRESETS: readonly PvpPreset[] = [
  { key: 'attack', name: '어택 프리셋', build: ARCHETYPE_BUILDS.attack },
  { key: 'stamina', name: '스태미나 프리셋', build: ARCHETYPE_BUILDS.stamina },
  { key: 'ringBreaker', name: '링브레이커 프리셋', build: ARCHETYPE_BUILDS.ringBreaker },
];
