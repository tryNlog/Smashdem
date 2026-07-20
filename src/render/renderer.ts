/**
 * Canvas 2D 렌더러.
 *
 * S0 기준선: "판독 가능한 수준"까지만 그린다.
 * 아트 폴리시(파티클·히트스톱·트레일·배경)는 technical-artist 역할이 이어받는다.
 *
 * 렌더는 상태를 읽기만 하고 절대 바꾸지 않는다.
 */

import * as Balance from '../game/balance';
import type { BattleState, Beyblade } from '../game/types';
import { clamp } from '../engine/vector';
import { advanceEffects, type EffectBuffer } from './effects';
import { ARENA_COLORS, BEYBLADE_APPEARANCES, HUD_COLORS } from './palette';

/** 아레나 중심이 화면에서 놓이는 y 좌표. 위쪽 여백은 HUD 가 차지한다. */
const ARENA_CENTER_SCREEN_Y = 336;
const HUD_PANEL_WIDTH = 300;
const HUD_PANEL_HEIGHT = 62;
const HUD_MARGIN = 18;

export interface Renderer {
  draw: (state: BattleState, effects: EffectBuffer, renderDeltaSeconds: number) => void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const maybeContext = canvas.getContext('2d');
  if (!maybeContext) throw new Error('Canvas 2D 컨텍스트를 얻지 못했습니다.');
  const context: CanvasRenderingContext2D = maybeContext;

  let renderClockSeconds = 0;

  function worldToScreenX(worldX: number): number {
    return canvas.width / 2 + worldX;
  }
  function worldToScreenY(worldY: number): number {
    return ARENA_CENTER_SCREEN_Y + worldY;
  }

  function draw(state: BattleState, effects: EffectBuffer, renderDeltaSeconds: number): void {
    renderClockSeconds += renderDeltaSeconds;
    advanceEffects(effects, renderDeltaSeconds);

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(context, canvas);

    // 화면 흔들림 — 난수 대신 고주파 사인파를 써서 프레임마다 튀지 않게 한다.
    if (effects.shakeRemainingSeconds > 0) {
      const shakeAmount = effects.shakeStrength * 9 * (effects.shakeRemainingSeconds / 0.18);
      const offsetX = Math.sin(renderClockSeconds * 91) * shakeAmount;
      const offsetY = Math.cos(renderClockSeconds * 77) * shakeAmount;
      context.translate(offsetX, offsetY);
    }

    drawArena(context, worldToScreenX(0), worldToScreenY(0));
    drawImpactRings(context, effects, worldToScreenX, worldToScreenY);

    for (const beyblade of state.beyblades) {
      drawBeyblade(context, beyblade, worldToScreenX(beyblade.positionX), worldToScreenY(beyblade.positionY));
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    drawHud(context, canvas, state);
    drawPhaseOverlay(context, canvas, state);
  }

  return { draw };
}

// ─────────────────────────────────────────────────────────────
// 배경 / 아레나
// ─────────────────────────────────────────────────────────────

function drawBackground(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  context.fillStyle = '#0b0d14';
  context.fillRect(0, 0, canvas.width, canvas.height);
}

/** 접시형 아레나: 동심원으로 경사(중심으로 갈수록 낮음)를 표현한다. */
function drawArena(context: CanvasRenderingContext2D, centerX: number, centerY: number): void {
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

  // 링아웃 경계선
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.strokeStyle = ARENA_COLORS.boundary;
  context.lineWidth = 3;
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

// ─────────────────────────────────────────────────────────────
// 팽이
// ─────────────────────────────────────────────────────────────

function drawBeyblade(
  context: CanvasRenderingContext2D,
  beyblade: Beyblade,
  screenX: number,
  screenY: number,
): void {
  const appearance = BEYBLADE_APPEARANCES[beyblade.index % BEYBLADE_APPEARANCES.length];
  const radius = beyblade.radius;

  context.save();
  context.translate(screenX, screenY);

  if (!beyblade.alive) context.globalAlpha = 0.35;

  // 접지 그림자
  context.beginPath();
  context.ellipse(0, radius * 0.55, radius * 0.95, radius * 0.38, 0, 0, Math.PI * 2);
  context.fillStyle = 'rgba(0, 0, 0, 0.45)';
  context.fill();

  // 버스트 중이면 바깥 링을 덧그려 상태를 알린다.
  if (beyblade.burstRemainingSeconds > 0) {
    context.beginPath();
    context.arc(0, 0, radius + 7, 0, Math.PI * 2);
    context.strokeStyle = HUD_COLORS.burstBarFill;
    context.lineWidth = 3;
    context.stroke();
  }

  context.rotate(beyblade.visualSpinAngle);

  // 몸체 — 날 개수가 팽이마다 달라 실루엣으로 구분된다(색각 이상 대비).
  context.beginPath();
  const bladeCount = appearance.bladeCount;
  for (let vertex = 0; vertex < bladeCount * 2; vertex += 1) {
    const isOuter = vertex % 2 === 0;
    const vertexRadius = isOuter ? radius : radius * 0.58;
    const angle = (Math.PI * vertex) / bladeCount;
    const pointX = Math.cos(angle) * vertexRadius;
    const pointY = Math.sin(angle) * vertexRadius;
    if (vertex === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  }
  context.closePath();
  context.fillStyle = appearance.bodyColor;
  context.fill();
  context.strokeStyle = appearance.rimColor;
  context.lineWidth = 2.5;
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

// ─────────────────────────────────────────────────────────────
// HUD
// ─────────────────────────────────────────────────────────────

function drawHud(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: BattleState,
): void {
  const playerOne = state.beyblades[0];
  const playerTwo = state.beyblades[1];

  if (playerOne) drawStatusPanel(context, HUD_MARGIN, HUD_MARGIN, playerOne, false);
  if (playerTwo) {
    drawStatusPanel(context, canvas.width - HUD_MARGIN - HUD_PANEL_WIDTH, HUD_MARGIN, playerTwo, true);
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

  // 회전력 게이지 (= HP)
  const barX = panelX + 10;
  const barWidth = HUD_PANEL_WIDTH - 20;
  const spinRatio = clamp(beyblade.spin / Balance.SPIN_MAXIMUM, 0, 1);
  drawBar(context, barX, panelY + 28, barWidth, 12, spinRatio, HUD_COLORS.spinBarBackground, appearance.rimColor, alignRight);

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
    case 'spinOut':
      return '스핀아웃 — 회전력 소진';
    case 'timeLimit':
      return '시간 종료 — 회전력 판정';
    case 'draw':
      return '무승부';
    case 'none':
      return '';
  }
}
