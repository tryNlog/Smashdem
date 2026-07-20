/**
 * 밸런스 상수 단일 소스.
 *
 * 규칙: 게임플레이 수치는 반드시 이 파일에만 존재한다.
 * 다른 파일에서 물리·데미지·시간 관련 숫자를 직접 쓰지 않는다.
 * (systems-designer 역할이 이 파일 하나만 만져서 밸런스를 조정할 수 있어야 한다.)
 *
 * 단위 규약
 *  - 길이: 월드 유닛 (렌더에서 1 유닛 = 1 픽셀로 그린다)
 *  - 시간: 초
 *  - 속도: 유닛/초, 가속: 유닛/초²
 *  - 회전력(Spin): 0~SPIN_MAXIMUM. 사실상 HP.
 *
 * ※ 아래 수치는 S0 스파이크에서 손으로 맞춘 초기값이며 측정된 최적값이 아니다.
 *   실제 플레이 데이터로 재조정 필요.
 */

// ─────────────────────────────────────────────────────────────
// 시뮬레이션 기본
// ─────────────────────────────────────────────────────────────

/** 시뮬레이션 고정 스텝. 60 FPS 고정. */
export const FIXED_DELTA_SECONDS = 1 / 60;

/** 한 렌더 프레임에서 따라잡을 수 있는 최대 시뮬 스텝 수. */
export const MAXIMUM_STEPS_PER_FRAME = 5;

// ─────────────────────────────────────────────────────────────
// 아레나 (접시형)
// ─────────────────────────────────────────────────────────────

/** 아레나 반경. 중심을 벗어난 거리가 이 값을 넘으면 링아웃. */
export const ARENA_RADIUS = 258;

/**
 * 접시 경사가 만드는 중심 방향 가속의 최대값(= 테두리에서의 값).
 * 실제 가속은 중심에서의 거리에 비례한다: a = DISH_ACCELERATION_AT_RIM * (distance / ARENA_RADIUS).
 * 이게 팽이를 자연스럽게 가운데로 모아 충돌 빈도를 만든다.
 */
export const DISH_ACCELERATION_AT_RIM = 152;

/**
 * 테두리 턱(lip)이 시작되는 거리 비율. 이 안쪽은 완만한 경사만 작용한다.
 */
export const DISH_LIP_THRESHOLD = 0.72;

/**
 * 테두리 턱이 만드는 추가 중심 방향 가속(테두리에서의 값).
 * 턱 구간에서는 (초과분)² 에 비례해 급격히 세진다.
 *
 * 이 턱이 없으면 방향키를 한쪽으로 계속 누르는 것만으로 스스로 링 밖으로 나가버린다.
 * (입력 가속 430 / 마찰 1.35 → 자력 최고속 약 318 유닛/초 > 완만한 경사만으로 필요한 탈출속도 약 198)
 * 즉 링아웃이 "강한 타격의 보상"이 아니라 "조작 실수 자폭"이 된다.
 * 턱은 지속적인 자력 추진은 막고, 충돌로 순간적으로 실리는 큰 속도는 넘어갈 수 있게 하는 장치다.
 */
export const DISH_LIP_ACCELERATION = 1600;

/** 접시 바닥 마찰. 속도에 비례해 감속시킨다 (v *= 1 - k*dt 형태). */
export const FLOOR_DRAG_PER_SECOND = 1.35;

/** 팽이 물리 반경. 원-원 충돌 판정에 쓴다. */
export const BEYBLADE_RADIUS = 21;

// ─────────────────────────────────────────────────────────────
// 스탯 (4종, 기준값 50)
// ─────────────────────────────────────────────────────────────

/** 모든 스탯의 기준값. 이 값이면 배율 1.0 이다. */
export const STAT_BASELINE = 50;

/** 스탯이 기준값에서 ±50 벗어났을 때 해당 배율이 얼마나 흔들리는지. */
export const STAT_INFLUENCE = {
  /** attack → 가하는 충돌 데미지 배율 */
  attack: 0.6,
  /** weight → 충돌 질량(밀림 저항) 및 피격 데미지 감소 */
  weight: 0.6,
  /** stamina → 회전력 자연 감소 저항 */
  stamina: 0.5,
  /** control → 입력 가속력 */
  control: 0.5,
} as const;

// ─────────────────────────────────────────────────────────────
// 조작
// ─────────────────────────────────────────────────────────────

/** 방향키 입력이 만드는 기본 가속(control 50 기준). 관성은 마찰로만 줄어든다. */
export const MOVE_ACCELERATION_BASE = 430;

// ─────────────────────────────────────────────────────────────
// 대시 버스트 (Space)
// ─────────────────────────────────────────────────────────────

/** 버스트 게이지 최대치. */
export const BURST_GAUGE_MAXIMUM = 100;

/** 초당 게이지 회복량. */
export const BURST_GAUGE_REGENERATION_PER_SECOND = 26;

/** 버스트 1회 발동 비용. */
export const BURST_GAUGE_COST = 100;

/** 버스트 지속 시간. 이 동안 데미지 배율이 오른다. */
export const BURST_DURATION_SECONDS = 0.75;

/** 버스트 발동 순간 진행 방향으로 더해지는 속도 임펄스. */
export const BURST_IMPULSE_SPEED = 360;

/** 버스트 중 가하는 데미지에 곱해지는 배율. */
export const BURST_DAMAGE_MULTIPLIER = 1.9;

/** 버스트 중 방향키 가속에 곱해지는 배율. */
export const BURST_ACCELERATION_MULTIPLIER = 1.35;

// ─────────────────────────────────────────────────────────────
// 회전력(Spin) = HP
// ─────────────────────────────────────────────────────────────

/** 회전력 최대치. 0이 되면 스핀아웃 패배. */
export const SPIN_MAXIMUM = 100;

/** 아무것도 안 해도 줄어드는 초당 회전력(stamina 50 기준). */
export const SPIN_DECAY_BASE_PER_SECOND = 0.85;

/** 속도 1유닛/초당 추가로 깎이는 초당 회전력. 빨리 움직일수록 빨리 지친다. */
export const SPIN_DECAY_PER_SPEED_UNIT = 0.0042;

/** 링 바깥쪽(테두리 근처)에서의 추가 소모 배율 — 가장자리에 붙어 도는 전략을 억제한다. */
export const SPIN_DECAY_RIM_MULTIPLIER = 1.5;

/** 위 배율이 적용되기 시작하는 거리 비율(중심으로부터, ARENA_RADIUS 대비). */
export const SPIN_DECAY_RIM_THRESHOLD = 0.75;

// ─────────────────────────────────────────────────────────────
// 충돌
// ─────────────────────────────────────────────────────────────

/** 반발 계수. 1이면 완전 탄성, 0이면 붙어버림. */
export const COLLISION_RESTITUTION = 0.95;

/** 겹침을 밀어낼 때 여유분(1.0 이면 딱 붙게 분리). 진동 방지용으로 약간 크게. */
export const COLLISION_SEPARATION_SLACK = 1.02;

/** 상대 접근 속도 1유닛/초당 기본 데미지. 실제 데미지는 여기에 attack/weight 배율이 곱해진다. */
export const COLLISION_DAMAGE_PER_RELATIVE_SPEED = 0.011;

/**
 * 공격자가 자기 충돌로 되받는 데미지 비율.
 * 1.0 이면 양쪽이 똑같이 깎여 동일 스탯끼리는 무승부만 나온다. 1보다 작게 두어 선공을 보상한다.
 */
export const COLLISION_ATTACKER_RECOIL_RATIO = 0.5;

/** 이 접근 속도 미만의 접촉은 데미지·연출 이벤트를 만들지 않는다(부비적거림 방지). */
export const COLLISION_MINIMUM_RELATIVE_SPEED = 26;

/** 연출 이벤트의 strength(0~1)를 정규화할 때 1.0 으로 치는 접근 속도. */
export const COLLISION_STRENGTH_REFERENCE_SPEED = 420;

/** 같은 두 팽이가 연속 판정되는 것을 막는 최소 간격(초). */
export const COLLISION_COOLDOWN_SECONDS = 0.08;

// ─────────────────────────────────────────────────────────────
// 배틀 진행
// ─────────────────────────────────────────────────────────────

/** 라운드 시작 카운트다운. 이 동안 입력이 무시된다. */
export const READY_DURATION_SECONDS = 1.6;

/** 결착 후 결과 화면으로 넘어가기 전 슬로우 연출 시간. */
export const SETTLE_DURATION_SECONDS = 1.2;

/** 라운드 제한 시간. 초과하면 회전력이 많이 남은 쪽이 판정승. */
export const ROUND_TIME_LIMIT_SECONDS = 90;

/** 스폰 위치의 중심으로부터의 거리. */
export const SPAWN_DISTANCE_FROM_CENTER = 150;

/** 스폰 각도에 주는 랜덤 흔들림(라디안). 매 라운드 초기 배치를 조금씩 다르게 한다. */
export const SPAWN_ANGLE_JITTER_RADIANS = 0.25;

// ─────────────────────────────────────────────────────────────
// 봇 (game-ai-engineer 역할이 이후 고도화)
// ─────────────────────────────────────────────────────────────

/** 봇이 조준 방향을 갱신하는 주기(초). 짧을수록 강해진다. */
export const BOT_DECISION_INTERVAL_SECONDS = 0.28;

/** 봇 조준에 섞는 각도 오차 최대값(라디안). 1스테이지 수준으로 크게 둔다. */
export const BOT_AIM_ERROR_RADIANS = 0.55;

/** 봇이 입력 스틱을 미는 세기(0~1). 1 미만이면 플레이어보다 가속이 느리다. */
export const BOT_THROTTLE = 0.82;

/** 봇이 버스트를 고려하는 최대 거리. */
export const BOT_BURST_DISTANCE = 120;

/** 위 거리 안에서 결정 시점마다 버스트를 쓸 확률. */
export const BOT_BURST_PROBABILITY = 0.35;
