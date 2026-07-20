/**
 * 2D 벡터 유틸.
 *
 * 시뮬레이션의 좌표는 객체 할당을 피하려고 x/y 를 분리한 숫자 필드로 들고 다닌다.
 * 그래서 여기 있는 함수들은 벡터 객체가 아니라 스칼라 쌍을 받는다.
 */

/** 원점에서 (x, y) 까지의 거리. */
export function vectorLength(x: number, y: number): number {
  return Math.hypot(x, y);
}

/** 두 점 사이의 거리. */
export function distanceBetween(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/**
 * (x, y) 를 길이 1로 정규화한 결과를 out 배열에 [x, y] 로 담는다.
 * 길이가 0이면 (0, 0) 을 담는다 — 0으로 나누는 것을 막기 위함.
 */
export function normalizeInto(out: [number, number], x: number, y: number): [number, number] {
  const length = Math.hypot(x, y);
  if (length <= 1e-9) {
    out[0] = 0;
    out[1] = 0;
    return out;
  }
  out[0] = x / length;
  out[1] = y / length;
  return out;
}

/** value 를 [minimum, maximum] 범위로 자른다. */
export function clamp(value: number, minimum: number, maximum: number): number {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

/** 선형 보간. alpha 0 이면 from, 1 이면 to. */
export function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}
