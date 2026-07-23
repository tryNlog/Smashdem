/**
 * 렌더 전용 난수 (mulberry32).
 *
 * ★ 시뮬레이션 시드(engine/random)와 완전히 분리된 별개 난수다.
 *   파티클 튐 각도·잔상 흔들림 같은 "보이기만 하는" 값에만 쓰며, 시뮬 상태에 절대 닿지 않는다.
 *   (결정론 규율: src/game 안 난수는 스냅샷·롤백 대상, 이 난수는 화면 표현이라 재현 대상이 아니다.)
 */

let renderSeed = 0x9e3779b9;

/** 0~1 난수. 프레임마다 호출되며 시뮬 결정론과 무관하다. */
export function renderRandomUnit(): number {
  renderSeed |= 0;
  renderSeed = (renderSeed + 0x6d2b79f5) | 0;
  let t = Math.imul(renderSeed ^ (renderSeed >>> 15), 1 | renderSeed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** min~max 균등 난수. */
export function renderRandomRange(minimum: number, maximum: number): number {
  return minimum + renderRandomUnit() * (maximum - minimum);
}
