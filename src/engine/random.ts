/**
 * 시드 기반 결정론적 난수.
 *
 * 왜 Math.random() 을 쓰지 않는가:
 * S3 의 실시간 PvP(호스트 권위 + 입력 동기화)와 리플레이는
 * "같은 시드 + 같은 입력 → 같은 결과" 가 성립해야 성립한다.
 * Math.random() 은 시드를 줄 수 없어서 이 성질이 깨진다.
 * 따라서 시뮬레이션 내부의 모든 난수는 이 파일을 거친다.
 */

/** PRNG 의 전체 상태. 시뮬레이션 상태의 일부로 저장·복제된다. */
export interface RandomState {
  /** 재현용 원본 시드. 스테이트리스 해시(noiseFromSeed)의 입력으로도 쓴다. */
  readonly seed: number;
  /** 현재 스트림 위치. nextRandomUnit 을 부를 때마다 전진한다. */
  cursor: number;
}

export function createRandomState(seed: number): RandomState {
  // 시드 0 은 mulberry32 계열에서 퇴화하므로 0이 아닌 값으로 밀어둔다.
  const safeSeed = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return { seed: safeSeed, cursor: safeSeed };
}

/**
 * mulberry32 — 32비트 상태 PRNG. 게임 밸런스 수준의 품질이면 충분하고,
 * 상태가 정수 하나뿐이라 네트워크 스냅샷에 그대로 실어 보낼 수 있다.
 * 반환값은 [0, 1) 구간.
 */
export function nextRandomUnit(state: RandomState): number {
  state.cursor = (state.cursor + 0x6d2b79f5) >>> 0;
  let mixed = state.cursor;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
}

/** [minimum, maximum) 구간의 난수. */
export function nextRandomRange(state: RandomState, minimum: number, maximum: number): number {
  return minimum + nextRandomUnit(state) * (maximum - minimum);
}

/**
 * 상태를 전진시키지 않는 결정론적 해시 노이즈. 반환값은 [0, 1).
 *
 * 봇 AI 처럼 "시뮬레이션 바깥에서 상태를 읽기만 하고 입력을 만들어내는" 쪽이 쓴다.
 * botInput 이 RandomState 를 전진시키면 시뮬레이션 상태가 호출 순서에 의존하게 되어
 * 결정론이 깨지므로, 그쪽에는 순수 함수인 이 해시를 준다.
 */
export function noiseFromSeed(seed: number, channelA: number, channelB: number): number {
  let mixed = (Math.imul(seed, 0x9e3779b1) ^ Math.imul(channelA + 1, 0x85ebca6b) ^ Math.imul(channelB + 1, 0xc2b2ae35)) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
}

export function cloneRandomState(state: RandomState): RandomState {
  return { seed: state.seed, cursor: state.cursor };
}
