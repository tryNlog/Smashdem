/**
 * Canvas 2D 렌더러.
 *
 * 렌더는 상태를 읽기만 하고 절대 바꾸지 않는다. 히트스톱·흔들림·파티클은 전부 이 계층의 표현이며,
 * 시뮬레이션(고정 타임스텝)은 그대로 흐른다 — S3 PvP 결정론 전제.
 */

import * as Balance from '../game/balance';
import type { BattleState, Beyblade } from '../game/types';
import type { SetTag } from '../game/parts';
import { clamp } from '../engine/vector';
import { advanceEffects, spinDropIntensity, type EffectBuffer } from './effects';
import { ARENA_COLORS, BEYBLADE_APPEARANCES, HUD_COLORS, SET_COLORS } from './palette';

/**
 * 배틀 HUD 에 얹을 런 문맥(판 카운터·난이도·F1 세트 진행). 배틀 자체 상태가 아니라
 * 런 진행 정보라 별도로 주입한다. 없으면(단발 배틀) 런 HUD 를 생략한다.
 */
export interface RunHudContext {
  readonly battleNumber: number;
  readonly totalBattles: number;
  readonly tier: number;
  readonly setTag: SetTag | null;
  readonly setCount: number;
  readonly setCompleted: boolean;
  readonly enhanceTotal: number;
}

/** 팽이 1대의 세트 외형 문맥(F2). 시뮬에 없는 런/빌드 정보라 렌더에 별도 주입한다. */
export interface BeybladeVisual {
  readonly setTag: SetTag | null;
  readonly setCompleted: boolean;
}

/** 배틀 등장 팽이별 외형. 인덱스 = beyblade.index. 없으면 무소속 취급. */
export interface BattleVisualContext {
  readonly beyblades: readonly (BeybladeVisual | undefined)[];
}

/** 아레나 중심이 화면에서 놓이는 y 좌표. 위쪽 여백은 HUD 가 차지한다. */
const ARENA_CENTER_SCREEN_Y = 336;
const HUD_PANEL_WIDTH = 300;
const HUD_PANEL_HEIGHT = 62;
const HUD_MARGIN = 18;

/** 화면 흔들림 최대 진폭(px). 영상에서 멀미 안 나게 상한을 둔다. */
const SHAKE_MAX_AMPLITUDE = 10;

interface RenderSnapshot {
  positionX: number;
  positionY: number;
  angle: number;
}

export interface Renderer {
  draw: (
    state: BattleState,
    effects: EffectBuffer,
    renderDeltaSeconds: number,
    runHud?: RunHudContext,
    visuals?: BattleVisualContext,
  ) => void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const maybeContext = canvas.getContext('2d');
  if (!maybeContext) throw new Error('Canvas 2D 컨텍스트를 얻지 못했습니다.');
  const context: CanvasRenderingContext2D = maybeContext;

  let renderClockSeconds = 0;
  // 히트스톱 중 팽이가 얼어붙어 보이게 직전 프레임 위치·각도를 잡아둔다(렌더 전용).
  const snapshots = new Map<number, RenderSnapshot>();
  // 속도 잔상(trail) — 팽이별 최근 위치 몇 개. 렌더 전용 히스토리.
  const trails = new Map<number, RenderSnapshot[]>();

  function worldToScreenX(worldX: number): number {
    return canvas.width / 2 + worldX;
  }
  function worldToScreenY(worldY: number): number {
    return ARENA_CENTER_SCREEN_Y + worldY;
  }

  function draw(
    state: BattleState,
    effects: EffectBuffer,
    renderDeltaSeconds: number,
    runHud?: RunHudContext,
    visuals?: BattleVisualContext,
  ): void {
    const inHitStop = effects.hitStopRemainingSeconds > 0;
    if (!inHitStop) renderClockSeconds += renderDeltaSeconds;
    advanceEffects(effects, renderDeltaSeconds);

    const anyRingBreaker = state.beyblades.some((b) => b.knockbackTier === 'ringBreaker');

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(context, canvas);

    // 화면 흔들림 — 난수 대신 고주파 사인파를 써서 프레임마다 튀지 않게 한다. 상한 진폭 고정.
    if (effects.shakeRemainingSeconds > 0 && !inHitStop) {
      const decay = effects.shakeRemainingSeconds / 0.18;
      const shakeAmount = Math.min(SHAKE_MAX_AMPLITUDE, effects.shakeStrength * SHAKE_MAX_AMPLITUDE) * decay;
      const offsetX = Math.sin(renderClockSeconds * 91) * shakeAmount;
      const offsetY = Math.cos(renderClockSeconds * 77) * shakeAmount;
      context.translate(offsetX, offsetY);
    }

    drawArena(context, worldToScreenX(0), worldToScreenY(0), anyRingBreaker);
    drawImpactRings(context, effects, worldToScreenX, worldToScreenY);

    // 배틀 시작 등장 펄스 진행(F2). fighting 시작(GO) 시점을 0 으로 잡는다.
    const sinceStart =
      state.phase === 'ready'
        ? state.phaseElapsedSeconds - Balance.READY_DURATION_SECONDS
        : state.battleElapsedSeconds;

    for (const beyblade of state.beyblades) {
      const snapshot = updateSnapshot(beyblade, inHitStop);
      updateTrail(beyblade, inHitStop);
      const visual = visuals?.beyblades[beyblade.index];
      drawTrail(context, beyblade, visual, worldToScreenX, worldToScreenY);
      drawBeyblade(
        context,
        beyblade,
        worldToScreenX(snapshot.positionX),
        worldToScreenY(snapshot.positionY),
        snapshot.angle,
        visual,
        sinceStart,
      );
    }

    drawSparks(context, effects, worldToScreenX, worldToScreenY);

    context.setTransform(1, 0, 0, 1, 0, 0);
    drawImpactFlash(context, canvas, effects);
    drawHud(context, canvas, state, effects);
    if (runHud) drawRunHud(context, canvas, runHud);
    drawPhaseOverlay(context, canvas, state);
  }

  /** 히트스톱이면 얼린 위치를, 아니면 실시간 위치를 반환하며 스냅샷을 갱신한다. */
  function updateSnapshot(beyblade: Beyblade, inHitStop: boolean): RenderSnapshot {
    let snapshot = snapshots.get(beyblade.index);
    if (!snapshot) {
      snapshot = { positionX: beyblade.positionX, positionY: beyblade.positionY, angle: beyblade.visualSpinAngle };
      snapshots.set(beyblade.index, snapshot);
      return snapshot;
    }
    if (!inHitStop) {
      snapshot.positionX = beyblade.positionX;
      snapshot.positionY = beyblade.positionY;
      snapshot.angle = beyblade.visualSpinAngle;
    }
    return snapshot;
  }

  function updateTrail(beyblade: Beyblade, inHitStop: boolean): void {
    if (inHitStop) return;
    let history = trails.get(beyblade.index);
    if (!history) {
      history = [];
      trails.set(beyblade.index, history);
    }
    history.push({ positionX: beyblade.positionX, positionY: beyblade.positionY, angle: beyblade.visualSpinAngle });
    if (history.length > 6) history.shift();
  }

  function drawTrail(
    ctx: CanvasRenderingContext2D,
    beyblade: Beyblade,
    visual: BeybladeVisual | undefined,
    toX: (v: number) => number,
    toY: (v: number) => number,
  ): void {
    const history = trails.get(beyblade.index);
    if (!history || history.length < 2) return;
    const speed = Math.hypot(beyblade.velocityX, beyblade.velocityY);
    const speedFactor = clamp(speed / 260, 0, 1);
    if (speedFactor < 0.12) return; // 거의 정지면 잔상 안 그린다.
    const appearance = BEYBLADE_APPEARANCES[beyblade.index % BEYBLADE_APPEARANCES.length];
    const color = visual?.setCompleted && visual.setTag ? SET_COLORS[visual.setTag] : appearance.rimColor;
    for (let i = 0; i < history.length - 1; i += 1) {
      const point = history[i];
      const ageRatio = (i + 1) / history.length;
      ctx.beginPath();
      ctx.arc(toX(point.positionX), toY(point.positionY), beyblade.radius * (0.5 + ageRatio * 0.4), 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = ageRatio * speedFactor * 0.16;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return { draw };
}

// ─────────────────────────────────────────────────────────────
// 런 HUD — 판 카운터 N/12 · 난이도 구간 · F1 세트 진행 (§12-6 / §2-5)
// ─────────────────────────────────────────────────────────────

function drawRunHud(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  runHud: RunHudContext,
): void {
  context.textAlign = 'center';
  context.textBaseline = 'top';

  // 판 카운터 N/12 — 영상 컷 3 몽타주의 뼈대(§12-6). TIME 아래 중앙에 크게.
  context.fillStyle = HUD_COLORS.overlayText;
  context.font = '800 22px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText(`${runHud.battleNumber} / ${runHud.totalBattles}`, canvas.width / 2, HUD_MARGIN + 52);

  context.fillStyle = HUD_COLORS.label;
  context.font = '600 11px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText(`ROUND · 난이도 구간 ${runHud.tier}`, canvas.width / 2, HUD_MARGIN + 80);

  // 세트 진행·장착 파츠·강화는 좌측 인벤토리 패널(screens.ts drawBuildOverviewPanel)이 그린다.
  // 여기(renderer)의 한 줄 텍스트를 그 패널로 대체했다 — 중복 방지(§17 재판정 후 PM 가시화 요청).
}

// ─────────────────────────────────────────────────────────────
// 배경 / 아레나
// ─────────────────────────────────────────────────────────────

function drawBackground(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  context.fillStyle = '#0b0d14';
  context.fillRect(0, 0, canvas.width, canvas.height);
}

/** 접시형 아레나: 동심원으로 경사(중심으로 갈수록 낮음)를 표현한다. */
function drawArena(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  ringBreakerActive: boolean,
): void {
  const radius = Balance.ARENA_RADIUS;

  const gradient = context.createRadialGradient(centerX, centerY, radius * 0.05, centerX, centerY, radius);
  gradient.addColorStop(0, ARENA_COLORS.floorInner);
  gradient.addColorStop(1, ARENA_COLORS.floorOuter);

  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = gradient;
  context.fill();

  // 동심원 — 경사 등고선. 안쪽으로 갈수록 촘촘하게 보이도록 제곱 간격.
  context.strokeStyle = ARENA_COLORS.ringLine;
  context.lineWidth = 1;
  for (let step = 1; step <= 5; step += 1) {
    const ratio = (step / 5) ** 0.75;
    context.beginPath();
    context.arc(centerX, centerY, radius * ratio, 0, Math.PI * 2);
    context.stroke();
  }

  // 중심 표식
  context.beginPath();
  context.arc(centerX, centerY, 6, 0, Math.PI * 2);
  context.fillStyle = ARENA_COLORS.centerGlow;
  context.fill();

  // 링아웃 경계선 — RING BREAKER 가 판에 있으면 테두리가 달아오른다(F2 확장, §2-5).
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.strokeStyle = ringBreakerActive ? SET_COLORS.BREAK : ARENA_COLORS.boundary;
  context.lineWidth = ringBreakerActive ? 5 : 3;
  context.stroke();
}

function drawImpactRings(
  context: CanvasRenderingContext2D,
  effects: EffectBuffer,
  worldToScreenX: (value: number) => number,
  worldToScreenY: (value: number) => number,
): void {
  for (const ring of effects.impactRings) {
    const lifeRatio = clamp(ring.remainingSeconds / ring.totalSeconds, 0, 1);
    const expansion = 1 - lifeRatio;
    const radius = 8 + expansion * (20 + ring.strength * 46);

    context.beginPath();
    context.arc(worldToScreenX(ring.positionX), worldToScreenY(ring.positionY), radius, 0, Math.PI * 2);
    context.strokeStyle = ring.color;
    context.globalAlpha = lifeRatio * (0.35 + ring.strength * 0.55);
    context.lineWidth = 1 + ring.strength * 3;
    context.stroke();
    context.globalAlpha = 1;
  }
}

/** 충돌 스파크 — 짧은 선분. 속도 방향으로 늘어난다. */
function drawSparks(
  context: CanvasRenderingContext2D,
  effects: EffectBuffer,
  worldToScreenX: (value: number) => number,
  worldToScreenY: (value: number) => number,
): void {
  context.save();
  context.globalCompositeOperation = 'lighter';
  context.lineCap = 'round';
  for (const spark of effects.sparks) {
    const lifeRatio = clamp(spark.remainingSeconds / spark.totalSeconds, 0, 1);
    const speed = Math.hypot(spark.velocityX, spark.velocityY);
    const screenX = worldToScreenX(spark.positionX);
    const screenY = worldToScreenY(spark.positionY);
    const directionX = speed > 0.001 ? spark.velocityX / speed : 1;
    const directionY = speed > 0.001 ? spark.velocityY / speed : 0;
    context.beginPath();
    context.moveTo(screenX, screenY);
    context.lineTo(screenX - directionX * spark.length, screenY - directionY * spark.length);
    context.strokeStyle = spark.color;
    context.globalAlpha = lifeRatio;
    context.lineWidth = spark.width;
    context.stroke();
  }
  context.restore();
  context.globalAlpha = 1;
}

/** 강타·링아웃 순간 화면 전체 플래시(가산 합성). */
function drawImpactFlash(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  effects: EffectBuffer,
): void {
  if (effects.flashRemainingSeconds <= 0 || effects.flashStrength <= 0) return;
  const ratio = clamp(effects.flashRemainingSeconds / effects.flashTotalSeconds, 0, 1);
  context.save();
  context.globalCompositeOperation = 'lighter';
  context.globalAlpha = effects.flashStrength * ratio;
  context.fillStyle = effects.flashColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
  context.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────
// 팽이
// ─────────────────────────────────────────────────────────────

function drawBeyblade(
  context: CanvasRenderingContext2D,
  beyblade: Beyblade,
  screenX: number,
  screenY: number,
  angle: number,
  visual: BeybladeVisual | undefined,
  sinceStart: number,
): void {
  const appearance = BEYBLADE_APPEARANCES[beyblade.index % BEYBLADE_APPEARANCES.length];
  const radius = beyblade.radius;
  const setTag = visual?.setTag ?? null;
  const setDone = visual?.setCompleted ?? false;
  const setColor = setTag ? SET_COLORS[setTag] : null;

  // 회전력이 줄면 팽이가 기울고 회전이 느려 보인다 — 남은 체력을 그림으로 읽는다.
  const spinRatio = clamp(beyblade.spin / Balance.SPIN_MAXIMUM, 0, 1);
  const wobble = beyblade.alive ? (1 - spinRatio) * 0.16 * Math.sin(angle * 3) : 0;

  context.save();
  context.translate(screenX, screenY);

  if (!beyblade.alive) context.globalAlpha = 0.35;

  // 접지 그림자
  context.beginPath();
  context.ellipse(0, radius * 0.55, radius * 0.95, radius * 0.38, 0, 0, Math.PI * 2);
  context.fillStyle = 'rgba(0, 0, 0, 0.45)';
  context.fill();

  // 회전력 저하 시 살짝 기울인다(비틀).
  context.rotate(wobble);

  // F2 — 세트 완성 시 세트 색 오라 링 + 배틀 시작 등장 펄스.
  if (setDone && setColor && beyblade.alive) {
    drawSetAura(context, radius, setColor, setTag, sinceStart, angle);
  }

  // RING BREAKER — 넉백 특화 빌드는 상시 붉은 스파이크 링(색+모양 이중 신호).
  if (beyblade.knockbackTier === 'ringBreaker' && beyblade.alive) {
    drawBreakerSpikes(context, radius, angle);
  }

  // 버스트 중이면 바깥 링을 덧그려 상태를 알린다.
  if (beyblade.burstRemainingSeconds > 0) {
    context.beginPath();
    context.arc(0, 0, radius + 7, 0, Math.PI * 2);
    context.strokeStyle = HUD_COLORS.burstBarFill;
    context.lineWidth = 3;
    context.stroke();
  }

  context.rotate(angle);

  // 몸체 — 날 개수가 팽이마다 달라 실루엣으로 구분된다(색각 이상 대비).
  context.beginPath();
  const bladeCount = appearance.bladeCount;
  for (let vertex = 0; vertex < bladeCount * 2; vertex += 1) {
    const isOuter = vertex % 2 === 0;
    const vertexRadius = isOuter ? radius : radius * 0.58;
    const vertexAngle = (Math.PI * vertex) / bladeCount;
    const pointX = Math.cos(vertexAngle) * vertexRadius;
    const pointY = Math.sin(vertexAngle) * vertexRadius;
    if (vertex === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  }
  context.closePath();
  context.fillStyle = appearance.bodyColor;
  context.fill();
  // 세트 완성이면 테두리를 세트 색으로 물들인다(판독 이중화).
  context.strokeStyle = setDone && setColor ? setColor : appearance.rimColor;
  context.lineWidth = setDone ? 3.5 : 2.5;
  context.stroke();

  // 중심축 — 회전 방향을 눈으로 읽을 수 있게 한쪽에만 마크를 둔다.
  context.beginPath();
  context.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
  context.fillStyle = appearance.accentColor;
  context.fill();
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(radius * 0.85, 0);
  context.strokeStyle = appearance.accentColor;
  context.lineWidth = 2;
  context.stroke();

  context.restore();
}

/** 세트 완성 오라 — 회전하는 세트 색 링 + 배틀 시작 직후 1회 확장 펄스(F2). */
function drawSetAura(
  context: CanvasRenderingContext2D,
  radius: number,
  color: string,
  setTag: SetTag | null,
  sinceStart: number,
  angle: number,
): void {
  // 상시 오라 링.
  context.save();
  context.globalAlpha = 0.5;
  context.beginPath();
  context.arc(0, 0, radius + 5, 0, Math.PI * 2);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.stroke();
  context.restore();

  // 세트별 이중 신호: STRIKE=이중 링, GUARD=두꺼운 방어 링, BREAK=파선(스파이크 느낌).
  context.save();
  context.strokeStyle = color;
  context.globalAlpha = 0.42;
  if (setTag === 'STRIKE') {
    context.beginPath();
    context.arc(0, 0, radius + 9, 0, Math.PI * 2);
    context.lineWidth = 1.5;
    context.stroke();
  } else if (setTag === 'GUARD') {
    context.beginPath();
    context.arc(0, 0, radius + 9, 0, Math.PI * 2);
    context.lineWidth = 4;
    context.stroke();
  } else if (setTag === 'BREAK') {
    context.setLineDash([5, 5]);
    context.lineDashOffset = angle * radius;
    context.beginPath();
    context.arc(0, 0, radius + 9, 0, Math.PI * 2);
    context.lineWidth = 2.5;
    context.stroke();
    context.setLineDash([]);
  }
  context.restore();

  // 배틀 시작 등장 펄스 — GO 직후 0.7초 확장하며 사라진다.
  if (sinceStart >= 0 && sinceStart < 0.7) {
    const progress = sinceStart / 0.7;
    context.save();
    context.globalAlpha = (1 - progress) * 0.7;
    context.beginPath();
    context.arc(0, 0, radius + 6 + progress * 34, 0, Math.PI * 2);
    context.strokeStyle = color;
    context.lineWidth = 3 * (1 - progress) + 1;
    context.stroke();
    context.restore();
  }
}

/** RING BREAKER 스파이크 링 — 넉백 특화임을 색+모양으로 표시. */
function drawBreakerSpikes(context: CanvasRenderingContext2D, radius: number, angle: number): void {
  context.save();
  context.rotate(angle * 0.5);
  context.strokeStyle = SET_COLORS.BREAK;
  context.globalAlpha = 0.7;
  context.lineWidth = 2;
  const spikes = 8;
  for (let i = 0; i < spikes; i += 1) {
    const a = (Math.PI * 2 * i) / spikes;
    context.beginPath();
    context.moveTo(Math.cos(a) * (radius + 3), Math.sin(a) * (radius + 3));
    context.lineTo(Math.cos(a) * (radius + 11), Math.sin(a) * (radius + 11));
    context.stroke();
  }
  context.restore();
}

// ─────────────────────────────────────────────────────────────
// HUD
// ─────────────────────────────────────────────────────────────

function drawHud(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: BattleState,
  effects: EffectBuffer,
): void {
  const playerOne = state.beyblades[0];
  const playerTwo = state.beyblades[1];

  if (playerOne) drawStatusPanel(context, HUD_MARGIN, HUD_MARGIN, playerOne, false, effects);
  if (playerTwo) {
    drawStatusPanel(context, canvas.width - HUD_MARGIN - HUD_PANEL_WIDTH, HUD_MARGIN, playerTwo, true, effects);
  }

  // 남은 시간
  const remainingSeconds = Math.max(
    0,
    Balance.ROUND_TIME_LIMIT_SECONDS - state.battleElapsedSeconds,
  );
  context.fillStyle = HUD_COLORS.overlayText;
  context.font = '600 24px "Segoe UI", "Malgun Gothic", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText(remainingSeconds.toFixed(0), canvas.width / 2, HUD_MARGIN + 6);

  context.font = '500 11px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillStyle = HUD_COLORS.label;
  context.fillText('TIME', canvas.width / 2, HUD_MARGIN + 34);
}

function drawStatusPanel(
  context: CanvasRenderingContext2D,
  panelX: number,
  panelY: number,
  beyblade: Beyblade,
  alignRight: boolean,
  effects: EffectBuffer,
): void {
  const appearance = BEYBLADE_APPEARANCES[beyblade.index % BEYBLADE_APPEARANCES.length];

  context.fillStyle = HUD_COLORS.panelBackground;
  context.fillRect(panelX, panelY, HUD_PANEL_WIDTH, HUD_PANEL_HEIGHT);

  context.textBaseline = 'top';
  context.textAlign = alignRight ? 'right' : 'left';
  const textX = alignRight ? panelX + HUD_PANEL_WIDTH - 10 : panelX + 10;

  context.font = '700 14px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillStyle = appearance.rimColor;
  context.fillText(beyblade.name, textX, panelY + 8);

  context.font = '500 11px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillStyle = HUD_COLORS.label;
  context.textAlign = alignRight ? 'left' : 'right';
  const spinTextX = alignRight ? panelX + 10 : panelX + HUD_PANEL_WIDTH - 10;
  context.fillText(`SPIN ${Math.ceil(beyblade.spin)}`, spinTextX, panelY + 10);

  // 링아웃 카운터(F3) — 패널 상단 중앙. 링아웃이 페널티가 되어 한 판에 여러 번 누적된다(§2-1b).
  context.textAlign = 'center';
  context.fillStyle = beyblade.ringOutCount > 0 ? '#ff9a3c' : HUD_COLORS.label;
  context.fillText(`링아웃 ${beyblade.ringOutCount}`, panelX + HUD_PANEL_WIDTH / 2, panelY + 10);

  // 회전력 게이지 (= HP). F3 — 링아웃 순간 게이지가 번쩍인다.
  const barX = panelX + 10;
  const barWidth = HUD_PANEL_WIDTH - 20;
  const spinRatio = clamp(beyblade.spin / Balance.SPIN_MAXIMUM, 0, 1);
  const dropIntensity = spinDropIntensity(effects, beyblade.index);
  drawBar(context, barX, panelY + 28, barWidth, 12, spinRatio, HUD_COLORS.spinBarBackground, appearance.rimColor, alignRight);
  if (dropIntensity > 0) {
    // 게이지 위에 흰색 번쩍임 + 테두리 강조.
    context.save();
    context.globalAlpha = dropIntensity * 0.8;
    context.fillStyle = '#fff2c4';
    context.fillRect(barX, panelY + 28, barWidth * spinRatio, 12);
    context.strokeStyle = '#ffb14e';
    context.lineWidth = 2;
    context.strokeRect(barX - 1, panelY + 27, barWidth + 2, 14);
    context.restore();
    context.globalAlpha = 1;
  }

  // 스킬(대시 버스트) 게이지
  const burstRatio = clamp(beyblade.burstGauge / Balance.BURST_GAUGE_MAXIMUM, 0, 1);
  const burstColor = burstRatio >= 1 ? HUD_COLORS.burstBarReady : HUD_COLORS.burstBarFill;
  drawBar(context, barX, panelY + 45, barWidth, 6, burstRatio, HUD_COLORS.burstBarBackground, burstColor, alignRight);
}

/** 가로 게이지. alignRight 면 오른쪽부터 채워 좌우 대칭 HUD 를 만든다. */
function drawBar(
  context: CanvasRenderingContext2D,
  barX: number,
  barY: number,
  barWidth: number,
  barHeight: number,
  ratio: number,
  backgroundColor: string,
  fillColor: string,
  alignRight: boolean,
): void {
  context.fillStyle = backgroundColor;
  context.fillRect(barX, barY, barWidth, barHeight);

  const filledWidth = barWidth * ratio;
  context.fillStyle = fillColor;
  context.fillRect(alignRight ? barX + barWidth - filledWidth : barX, barY, filledWidth, barHeight);
}

// ─────────────────────────────────────────────────────────────
// 오버레이 (준비 / 결과)
// ─────────────────────────────────────────────────────────────

function drawPhaseOverlay(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: BattleState,
): void {
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  if (state.phase === 'ready') {
    const remaining = Math.max(0, Balance.READY_DURATION_SECONDS - state.phaseElapsedSeconds);
    const label = remaining > 0.45 ? Math.ceil(remaining).toString() : 'GO!';
    context.fillStyle = HUD_COLORS.overlayText;
    context.font = '800 84px "Segoe UI", "Malgun Gothic", sans-serif';
    context.fillText(label, canvas.width / 2, ARENA_CENTER_SCREEN_Y);
    return;
  }

  if (state.phase === 'finished') {
    context.fillStyle = HUD_COLORS.overlayBackground;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const winner = state.beyblades[state.winnerIndex];
    const resultLine = winner ? `${winner.name} WIN` : 'DRAW';

    context.fillStyle = HUD_COLORS.overlayText;
    context.font = '800 58px "Segoe UI", "Malgun Gothic", sans-serif';
    context.fillText(resultLine, canvas.width / 2, ARENA_CENTER_SCREEN_Y - 40);

    context.fillStyle = HUD_COLORS.overlaySubText;
    context.font = '500 20px "Segoe UI", "Malgun Gothic", sans-serif';
    context.fillText(describeOutcome(state), canvas.width / 2, ARENA_CENTER_SCREEN_Y + 14);

    context.font = '500 16px "Segoe UI", "Malgun Gothic", sans-serif';
    context.fillText('R 키를 누르면 다시 시작', canvas.width / 2, ARENA_CENTER_SCREEN_Y + 58);
  }
}

function describeOutcome(state: BattleState): string {
  switch (state.outcome) {
    case 'ringOut':
      return '링아웃 — 아레나 밖으로 밀려남';
    case 'selfRingOut':
      return '자폭 링아웃 — 스스로 아레나 밖으로 나감';
    case 'spinOut':
      return state.finishByRingOut ? '링아웃 피니시 — 밀려나며 회전력 소진' : '스핀아웃 — 회전력 소진';
    case 'timeLimit':
      return '시간 종료 — 회전력 판정';
    case 'draw':
      return '무승부';
    case 'none':
      return '';
  }
}
