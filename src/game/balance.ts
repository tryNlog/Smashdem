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
export const DISH_LIP_ACCELERATION = 950;

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
  weight: 0.45,
  /** stamina → 회전력 자연 감소 저항 */
  stamina: 0.8,
  /** control → 입력 가속력 */
  control: 0.5,
} as const;

// ─────────────────────────────────────────────────────────────
// 조작
// ─────────────────────────────────────────────────────────────

/** 방향키 입력이 만드는 기본 가속(control 50 기준). 관성은 마찰로만 줄어든다. */
export const MOVE_ACCELERATION_BASE = 355;

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
export const SPIN_DECAY_BASE_PER_SECOND = 1.05;

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
export const COLLISION_DAMAGE_PER_RELATIVE_SPEED = 0.005;

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
// 넉백 (파생 합산값) 과 링아웃 개입 레버 L1·L2·L3
//
// 설계 근거: 02_게임설계.md §2-3 / §2-4 (game-director 확정).
//  - 넉백은 5번째 스탯이 아니다. 파츠 3개의 knockback 값을 더한 파생값이며,
//    아래 레버 3종의 세기만 결정한다. 스탯 4종에는 관여하지 않는다.
//  - 세 레버는 전부 "강타"(접근속도가 임계를 넘은 충돌) 직후의 짧은 윈도우 안에서만 작동한다.
//    상시 적용하면 방향키만으로 스스로 나가는 자폭 링아웃(T4)이 되살아난다.
// ─────────────────────────────────────────────────────────────

/** 넉백 합산이 이 값 이상이면 RIM PRESSURE(1단계). L1·L2 가 약하게 열린다. */
export const KNOCKBACK_THRESHOLD_RIM_PRESSURE = 6;

/** 넉백 합산이 이 값 이상이면 RING BREAKER(2단계). L1·L2·L3 전부 열린다. */
export const KNOCKBACK_THRESHOLD_RING_BREAKER = 13;

/**
 * 강타 판정 접근 속도. 이 값 이상으로 부딪혀 들어간 충돌만 L1~L3 을 발동시킨다.
 * COLLISION_MINIMUM_RELATIVE_SPEED(26) 과 COLLISION_STRENGTH_REFERENCE_SPEED(420) 사이.
 */
export const STRIKE_APPROACH_SPEED = 150;

/**
 * L1 — 강타 시 방어자에게 실리는 법선 방향 추가 속도(유닛/초).
 * 임계1 도달만으로 받는 기본값 + 임계1 초과분 1점당 가산. 선형 비례로 두면
 * 넉백 18(최대 빌드)이 임계1 빌드의 3배가 되어 T3 가 90%대로 폭주한다(2026-07-20 실측).
 */
export const KNOCKBACK_IMPULSE_BASE = 85;

/** L1 — 임계1 초과 넉백 1점당 추가 속도(유닛/초). */
export const KNOCKBACK_IMPULSE_PER_POINT = 3.5;

/**
 * ★ 사고 링아웃(ACCIDENT) — 넉백 0~임계1 미만 구간에서만 쓰는 아주 약한 복합 도즈.
 *
 * 배경: T1(시작 빌드 링아웃) 을 단일 레버로 만들려는 시도가 3회 실패했다.
 *   턱 1600→950 단독 인하 → 0.0% / 예외 임펄스 20·40·75 단독 → 전부 0.0%.
 *   원인은 관측된 대로 "경직이 없어 방어자가 피격 다음 스텝부터 재가속"하는 것이므로,
 *   임펄스만 키워도 같은 스텝에 상쇄된다. RING BREAKER 가 작동하는 이유는 L1·L2·L3 가 함께 걸리기 때문이다.
 * 그래서 여기서는 L1·L2·L3 를 **동시에, 아주 작게** 걸되 발동 조건을 극단적으로 좁힌다.
 *   조건 = (접근속도가 아래 값 이상) AND (방어자가 이미 테두리 쪽에 있을 것).
 * 목표는 80판 중 1~6판(1~8%)이므로 좁은 조건으로 충분하다. PM 판정 2026-07-20 로 T1 목표는 1~8%.
 */
export const ACCIDENT_STRIKE_APPROACH_SPEED = 175;

/** 사고 링아웃 발동에 필요한 방어자의 최소 거리비(중심으로부터, ARENA_RADIUS 대비). */
export const ACCIDENT_DEFENDER_DISTANCE_RATIO = 0.52;

/** 사고 링아웃 L1 — 임펄스(유닛/초). RIM PRESSURE 기본값(58)보다 훨씬 작다. */
export const ACCIDENT_KNOCKBACK_IMPULSE = 140;

/** 사고 링아웃 L2·L3 윈도우(초). 3프레임. */
export const ACCIDENT_WINDOW_SECONDS = 0.30;

/** 사고 링아웃 L3 — 턱 감쇠 배율. 임계2(0.85)보다 얕게 걸린다. */
export const ACCIDENT_LIP_PIERCE_MULTIPLIER = 0.45;

/**
 * 링아웃 시점에 이 시간 안에 피격 이력이 없으면 '자폭 이탈' 로 분류한다.
 * 실측 근거: 타격 유래 이탈의 관측 최댓값이 1.17초였다(rb vs starter, seed 39596, 2026-07-20).
 * 2026-07-21 개정: 이제 즉시 패배가 아니라 페널티 계수·연출 라벨만 가른다(§2-1c).
 */
export const SELF_RING_OUT_GRACE_SECONDS = 1.5;

// ─────────────────────────────────────────────────────────────
// 링아웃 페널티 (2026-07-21 개정 — N8·N9)
//
// 설계 근거: 02_게임설계.md §2-1b / §11-1 (PM 결정 M6=회전력).
//  - 링아웃은 결착이 아니다. 링 밖으로 나가면 회전력을 크게 잃고 중앙으로 복귀한다.
//  - 그 페널티로 회전력이 0 이하가 되면 그 링아웃이 결착("링아웃 피니시" = 스핀아웃의 한 형태).
//  - RING BREAKER 아키타입의 생존이 전적으로 N8 에 달렸다(§11-1-c): 계수가 작으면
//    "밀어내기만 하고 못 이기는 빌드", 크면 링아웃 1~2회로 즉승 회귀. T3'·T3b·T7 이 동시에 조인다.
// ─────────────────────────────────────────────────────────────

/**
 * N8 — 피격 링아웃 페널티 계수. 이탈자 회전력에서 (SPIN_MAXIMUM × 이 값) 만큼 차감한다.
 * 시작점 제안 0.30(§2-1b). S2 ①단계 실측으로 확정 대상.
 */
export const RING_OUT_PENALTY_COEFFICIENT = 0.30;

/**
 * 자폭 링아웃(직전 피격 없이 스스로 이탈) 페널티 계수.
 * 제약(§2-1c / D10): 자폭 계수 ≥ 피격 계수. 자폭이 더 가벼우면 불리한 위치에서
 * 일부러 나가 중앙으로 리셋하는 이득이 생긴다. 동일값으로 시작한다.
 */
export const SELF_RING_OUT_PENALTY_COEFFICIENT = 0.30;

/**
 * N9 — 링아웃 페널티 후 중앙 복귀 리셋 프리즈 길이(초). 0.5~0.8 범위 내 확정(§2-1b 4번).
 * 이 동안 입력·물리·충돌·판정이 정지한다. 라운드 제한 90초에 포함된다(D13).
 * 시뮬 틱 기준으로만 감소한다 — 결정론·S3 PvP 의 전제.
 */
export const RING_OUT_RESET_FREEZE_SECONDS = 0.6;

/** L2 — 경직 중 방어자의 방향키 가속에 곱하는 계수. 0 이면 역추진 완전 차단. */
export const STUN_ACCELERATION_FACTOR = 0;

/** L2 경직 윈도우(초) — RIM PRESSURE 단계. */
export const STUN_WINDOW_SECONDS_RIM_PRESSURE = 0.35;

/** L2 경직 윈도우(초) — RING BREAKER 단계. */
export const STUN_WINDOW_SECONDS_RING_BREAKER = 0.32;

/** L3 — 턱 관통 윈도우(초). RING BREAKER 단계에서만 열린다. */
export const LIP_PIERCE_WINDOW_SECONDS = 0.5;

/**
 * L3 — 턱 관통 중 DISH_LIP_ACCELERATION 에 곱하는 배율.
 * 턱 자체를 없애거나 상시 완화하는 것은 금지(설계 D8). 강타 직후에만 얇아진다.
 */
export const LIP_PIERCE_MULTIPLIER = 0.5;

// ─────────────────────────────────────────────────────────────
// 세트 보너스 (N10) 와 중복 강화 (N11) — 2026-07-21 ③단계
//
// 설계 근거: 02_게임설계.md §3-5(SET1~SET4) / §12-2(R13) / §12-5(R14).
//  - 세트는 3종(STRIKE=어택축 / GUARD=스태미나축 / BREAK=링브레이커축), 슬롯당 1종, 완성 조건 3슬롯.
//    보너스는 3/3 에서만 1항 발동. 2/3 부분 보너스 없음(SET1).
//  - ★ SET4: 보너스는 해당 아키타입의 강한 주 축을 증폭하지 않고 약점 축을 보전한다.
//    T10(매치업별 30~70%) 방어. 특히 세트 보너스가 링브레이커 vs 스태미나를 70% 초과로 밀면 SET4 위반.
//  - 형태(SET3): 스탯 가산 1항. 신규 효과 종류를 만들지 않는다.
//  - 중복 강화(R13): 이미 보유한 파츠 재획득 시 level +1(상한 +3). 스탯·넉백을 스케일한다(기존 축).
// ─────────────────────────────────────────────────────────────

/**
 * 세트 3/3 완성 시 붙는 스탯 가산 1항(SET4=약점 축 보전).
 *  - STRIKE(어택) 약점 = 지구전 → stamina 보전(자연 감소 저항)
 *  - GUARD(스태미나) 약점 = 링아웃에 밀림 → weight 보전(질량=넉백 저항)
 *  - BREAK(링브레이커) 약점 = 스핀아웃(낮은 sta) → stamina 보전
 * 값은 ③단계 실측(T11 55~70% / T14 40~60% / SET4 RB vs 스태미나 ≤70%)으로 확정 대상.
 */
export const SET_BONUS_STRIKE_STAMINA = 4;
export const SET_BONUS_GUARD_WEIGHT = 4;
export const SET_BONUS_BREAK_STAMINA = 1;

/**
 * N11 — 중복 강화 스케일. 파츠 level 1당 그 파츠의 스탯 델타·넉백에 더해지는 비율.
 * level 0(기본)~3(상한). level L 이면 델타에 (1 + L × 이 값) 을 곱한다.
 * 0.5 이면 +3 강화 시 파츠 기여가 2.5배. T14(세트 vs 순수 강화 40~60%)로 확정 대상.
 */
export const ENHANCE_SCALE_PER_LEVEL = 0.5;

/** 중복 강화 상한(R13). */
export const ENHANCE_LEVEL_CAP = 3;

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
