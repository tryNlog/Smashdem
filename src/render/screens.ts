/**
 * 메타 화면 렌더 + 클릭 히트테스트 (3택1 보상 / 완주·패배 결과 / PvP 출전 선택).
 *
 * ★ 배틀 화면(아레나·팽이·배틀 HUD)은 renderer.ts 가 그린다. 이 파일은 그 위에 얹히는
 *   "게임 바깥" 화면만 담당한다. 버튼 지오메트리를 draw 와 hitTest 가 공유해 단일 소스로 둔다.
 *
 * 심사자가 아무것도 안 읽어도(절대 원칙 1) 카드를 눌러 진행할 수 있게, 클릭 가능한 카드/버튼을
 * 큰 사각형으로 그린다. 키보드 단축(1/2/3 등)은 main.ts 가 같은 버튼 id 로 디스패치한다.
 */

import type { Session } from '../app/session';
import type { RewardCard } from '../game/rewards';
import { setPreviewForCard } from '../game/rewards';
import { buildSetSummary, enhanceTotal, setCount } from '../game/run';
import type { RunBuild } from '../game/run';
import type { SetTag } from '../game/parts';
import type { BeybladeStats } from '../game/types';
import { HANGAR_SLOT_COUNT } from '../app/hangar';
import type { HangarEntry } from '../app/hangar';
import { HUD_COLORS, SET_COLORS } from './palette';

/** 클릭 가능한 사각형 버튼. draw 와 hitTest 가 같은 배열을 쓴다. */
export interface UiButton {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const CARD_BG = 'rgba(30, 38, 58, 0.96)';

function setColor(tag: SetTag | null): string {
  return tag ? SET_COLORS[tag] : '#8792ad';
}

// ─────────────────────────────────────────────────────────────
// 버튼 레이아웃 (화면별) — draw·hitTest 공용
// ─────────────────────────────────────────────────────────────

function rewardButtons(canvas: HTMLCanvasElement): UiButton[] {
  const cardWidth = 236;
  const cardHeight = 316;
  const gap = 28;
  const totalWidth = cardWidth * 3 + gap * 2;
  const startX = (canvas.width - totalWidth) / 2;
  const y = 176;
  return [0, 1, 2].map((index) => ({
    id: `reward:${index}`,
    x: startX + index * (cardWidth + gap),
    y,
    w: cardWidth,
    h: cardHeight,
  }));
}

/** 3택1 화면의 리롤 버튼(§17-D — 신규 화면 없이 기존 화면에 버튼 1개). 카드 3장 아래 중앙. */
function rewardRerollButton(canvas: HTMLCanvasElement): UiButton {
  const w = 300;
  const h = 46;
  return { id: 'reward:reroll', x: (canvas.width - w) / 2, y: 512, w, h };
}

function runResultButtons(canvas: HTMLCanvasElement, session: Session): UiButton[] {
  const buttons: UiButton[] = [];
  const won = session.run.phase === 'won';

  if (won && session.savePhase === 'pending') {
    // 저장 질의 — 5슬롯 + [저장 안 함]. (§13-2 수동 덮어쓰기)
    const slotWidth = 150;
    const slotHeight = 92;
    const gap = 16;
    const totalWidth = slotWidth * HANGAR_SLOT_COUNT + gap * (HANGAR_SLOT_COUNT - 1);
    const startX = (canvas.width - totalWidth) / 2;
    const y = 300;
    for (let index = 0; index < HANGAR_SLOT_COUNT; index += 1) {
      buttons.push({ id: `result:save:${index}`, x: startX + index * (slotWidth + gap), y, w: slotWidth, h: slotHeight });
    }
    buttons.push({ id: 'result:noSave', x: canvas.width / 2 - 110, y: y + slotHeight + 28, w: 220, h: 48 });
    return buttons;
  }

  // 최종 — [새 런 시작] [온라인 대전]
  const buttonWidth = 240;
  const buttonHeight = 56;
  const gap = 24;
  const startX = (canvas.width - (buttonWidth * 2 + gap)) / 2;
  const y = 392;
  buttons.push({ id: 'result:newRun', x: startX, y, w: buttonWidth, h: buttonHeight });
  buttons.push({ id: 'result:pvp', x: startX + buttonWidth + gap, y, w: buttonWidth, h: buttonHeight });
  return buttons;
}

function pvpButtons(canvas: HTMLCanvasElement, session: Session): UiButton[] {
  const buttons: UiButton[] = [];
  const cardWidth = 200;
  const cardHeight = 132;
  const gapX = 20;
  const gapY = 20;
  const columns = 4;
  const startX = (canvas.width - (cardWidth * columns + gapX * (columns - 1))) / 2;
  const startY = 150;
  session.pvpEntries.forEach((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    buttons.push({
      id: `pvp:entry:${entry.id}`,
      x: startX + column * (cardWidth + gapX),
      y: startY + row * (cardHeight + gapY),
      w: cardWidth,
      h: cardHeight,
    });
  });
  buttons.push({ id: 'pvp:back', x: canvas.width / 2 - 90, y: 560, w: 180, h: 44 });
  return buttons;
}

function pvpLobbyButtons(canvas: HTMLCanvasElement): UiButton[] {
  const buttonWidth = 210;
  const buttonHeight = 46;
  const gap = 20;
  return [
    { id: 'pvp:create', x: canvas.width / 2 - buttonWidth - gap / 2, y: 432, w: buttonWidth, h: buttonHeight },
    { id: 'pvp:join', x: canvas.width / 2 + gap / 2, y: 432, w: buttonWidth, h: buttonHeight },
    { id: 'pvp:back', x: canvas.width / 2 - 100, y: 502, w: 200, h: 42 },
  ];
}
/** 배틀 화면에 상시 노출되는 [온라인 대전] 버튼(§1-3 "언제든"). */
function battleButtons(canvas: HTMLCanvasElement): UiButton[] {
  return [{ id: 'battle:pvp', x: canvas.width / 2 - 74, y: 588, w: 148, h: 26 }];
}

function buttonsFor(canvas: HTMLCanvasElement, session: Session): UiButton[] {
  switch (session.screen) {
    case 'reward':
      // 3장 카드 + 리롤 버튼 1개. 리롤은 남은 횟수 0 이어도 히트영역에 두되(클릭 시 무반응),
      // 그리기에서 비활성 표시한다(§17-D "0 이면 비활성"). 카드 매핑은 앞 3개 인덱스만 쓴다.
      return [...rewardButtons(canvas), rewardRerollButton(canvas)];
    case 'runResult':
      return runResultButtons(canvas, session);
    case 'pvpSelect':
      return pvpButtons(canvas, session);
    case 'pvpLobby':
      return pvpLobbyButtons(canvas);
    case 'battle':
      return battleButtons(canvas);
  }
}

/** 클릭 좌표(캔버스 기준) → 버튼 id. 없으면 null. */
export function hitTestSession(
  canvas: HTMLCanvasElement,
  session: Session,
  x: number,
  y: number,
): string | null {
  for (const button of buttonsFor(canvas, session)) {
    if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
      return button.id;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 그리기
// ─────────────────────────────────────────────────────────────

export function drawSessionOverlay(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, session: Session): void {
  switch (session.screen) {
    case 'reward':
      drawRewardScreen(context, canvas, session);
      break;
    case 'runResult':
      drawRunResultScreen(context, canvas, session);
      break;
    case 'pvpSelect':
      drawPvpScreen(context, canvas, session);
      break;
    case 'pvpLobby':
      drawPvpLobbyScreen(context, canvas, session);
      break;
    case 'battle':
      // 배틀 중에도 세트 진행을 볼 수 있게 좌측(플레이어 상태 패널 아래, 아레나 왼쪽 빈 공간)에 얹는다.
      drawBuildOverviewPanel(context, 18, 86, session.run.build);
      drawBattlePvpButton(context, canvas);
      break;
  }
}

function drawDimBackground(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  context.fillStyle = 'rgba(6, 8, 14, 0.82)';
  context.fillRect(0, 0, canvas.width, canvas.height);
}

// ── 인벤토리형 빌드 개요 패널 ────────────────────────────────
// PM 재플레이 피드백: 세트 진행이 텍스트 한 줄로는 안 보인다 → 장착 3슬롯 + 세트 3축 진행도를
// 칩·pip 게이지로 한눈에. 배틀 HUD 좌측과 3택1 좌상단에 같은 뷰를 얹는다(신규 전용 화면 없음, §4-R4).
// 순수 렌더 — 런 상태(RunBuild)만 읽는다(시뮬·결정론 불변). 세트 진행 계산은 run.ts setCount 재사용.
// 정밀 연출(애니메이션·타격 가시화)은 technical-artist 몫. 여기서는 판독 가능한 레이아웃까지.

const OVERVIEW_SET_TAGS: readonly SetTag[] = ['STRIKE', 'GUARD', 'BREAK'];

/** 인벤토리 패널의 세로 크기(픽셀). 배치 시 겹침 계산에 쓰라고 상수로 노출한다. */
export const BUILD_OVERVIEW_PANEL_HEIGHT = 8 + 18 + 3 * 16 + 8 + 3 * 16 + 8; // = 138

/**
 * 빌드 개요 패널을 (x, y) 좌상단 기준으로 그린다. 폭 214px, 높이 BUILD_OVERVIEW_PANEL_HEIGHT.
 *  - 상단: 장착 3슬롯(레이어/디스크/드라이버) — 세트색 칩 + 파츠명 + 강화 +N.
 *  - 하단: 세트 3축 진행도 — 3칸 pip 게이지 + n/3(완성이면 ★완성, 세트색 강조).
 */
export function drawBuildOverviewPanel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  build: RunBuild,
): void {
  const panelWidth = 214;
  const padX = 12;
  const rowHeight = 16;
  const slots = [build.layer, build.disk, build.driver] as const;
  const totalEnhance = enhanceTotal(build);
  const height = BUILD_OVERVIEW_PANEL_HEIGHT;

  // 배경 + 테두리
  context.fillStyle = 'rgba(14, 18, 30, 0.86)';
  context.fillRect(x, y, panelWidth, height);
  context.strokeStyle = 'rgba(90, 110, 150, 0.5)';
  context.lineWidth = 1;
  context.strokeRect(x + 0.5, y + 0.5, panelWidth - 1, height - 1);

  let cursorY = y + 8;

  // 헤더 — "내 팽이" + 강화 총합
  context.textBaseline = 'top';
  context.textAlign = 'left';
  context.font = '700 12px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillStyle = HUD_COLORS.label;
  context.fillText('내 팽이', x + padX, cursorY);
  if (totalEnhance > 0) {
    context.textAlign = 'right';
    context.fillStyle = '#ffd166';
    context.fillText(`강화 +${totalEnhance}`, x + panelWidth - padX, cursorY);
  }
  cursorY += 18;

  // 슬롯 3행 — [세트색 사각칩] 파츠명 … [+N]
  for (const slot of slots) {
    const tag = slot.part.set ?? null;
    context.fillStyle = tag ? SET_COLORS[tag] : '#6b7488';
    context.fillRect(x + padX, cursorY + 3, 9, 9);

    context.textAlign = 'left';
    context.fillStyle = HUD_COLORS.overlayText;
    context.font = '600 11px "Segoe UI", "Malgun Gothic", sans-serif';
    context.fillText(slot.part.name, x + padX + 16, cursorY + 1);

    if (slot.level > 0) {
      context.textAlign = 'right';
      context.fillStyle = '#ffd166';
      context.font = '700 11px "Segoe UI", "Malgun Gothic", sans-serif';
      context.fillText(`+${slot.level}`, x + panelWidth - padX, cursorY + 1);
    }
    cursorY += rowHeight;
  }

  // 구분선
  context.strokeStyle = 'rgba(90, 110, 150, 0.3)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x + padX, cursorY + 3);
  context.lineTo(x + panelWidth - padX, cursorY + 3);
  context.stroke();
  cursorY += 8;

  // 세트 3축 — 이름 + 3칸 pip 게이지 + n/3(완성 ★)
  for (const tag of OVERVIEW_SET_TAGS) {
    const count = setCount(build, tag);
    const done = count >= 3;
    const color = SET_COLORS[tag];

    context.textAlign = 'left';
    context.font = '700 11px "Segoe UI", "Malgun Gothic", sans-serif';
    context.fillStyle = done ? color : 'rgba(170, 179, 204, 0.9)';
    context.fillText(tag, x + padX, cursorY + 2);

    const pipStartX = x + padX + 66;
    for (let index = 0; index < 3; index += 1) {
      const pipX = pipStartX + index * 15;
      const pipY = cursorY + 8;
      context.beginPath();
      context.arc(pipX, pipY, 4.5, 0, Math.PI * 2);
      if (index < count) {
        context.fillStyle = color;
        context.fill();
      } else {
        context.strokeStyle = 'rgba(120, 130, 160, 0.6)';
        context.lineWidth = 1;
        context.stroke();
      }
    }

    context.textAlign = 'right';
    context.font = '700 11px "Segoe UI", "Malgun Gothic", sans-serif';
    context.fillStyle = done ? color : HUD_COLORS.label;
    context.fillText(done ? '★완성' : `${count}/3`, x + panelWidth - padX, cursorY + 2);
    cursorY += rowHeight;
  }

  context.textAlign = 'left';
}

function drawButton(
  context: CanvasRenderingContext2D,
  button: UiButton,
  label: string,
  options: { fill?: string; text?: string; border?: string; fontSize?: number } = {},
): void {
  context.fillStyle = options.fill ?? '#26304a';
  context.fillRect(button.x, button.y, button.w, button.h);
  context.strokeStyle = options.border ?? '#4a5678';
  context.lineWidth = 1.5;
  context.strokeRect(button.x, button.y, button.w, button.h);

  context.fillStyle = options.text ?? HUD_COLORS.overlayText;
  context.font = `600 ${options.fontSize ?? 17}px "Segoe UI", "Malgun Gothic", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, button.x + button.w / 2, button.y + button.h / 2);
}

// ── 3택 1 보상 ──────────────────────────────────────────────

function drawRewardScreen(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, session: Session): void {
  drawDimBackground(context, canvas);

  context.fillStyle = HUD_COLORS.overlayText;
  context.font = '800 40px "Segoe UI", "Malgun Gothic", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText('승리!  파츠 3택 1', canvas.width / 2, 60);

  context.fillStyle = HUD_COLORS.overlaySubText;
  context.font = '500 17px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText('카드를 클릭하거나 1 / 2 / 3 키로 선택 · R 키로 리롤', canvas.width / 2, 116);

  // 좌상단 빌드 개요 — "이 카드를 고르면 어느 세트에 가까워지나"를 현재 진행도와 대조하며 판단.
  // 카드 색/글리프(세트 축)와 같은 SET_COLORS 를 써서 카드와 개요가 색으로 연결된다(ce682be).
  drawBuildOverviewPanel(context, 20, 30, session.run.build);

  const buttons = rewardButtons(canvas);
  session.rewards.forEach((card, index) => {
    const button = buttons[index];
    if (button) drawRewardCard(context, button, card, session, index);
  });

  // 리롤 버튼(§17-D) — 남은 횟수 표시, 0 이면 비활성.
  const remaining = session.run.rerollsRemaining;
  const enabled = remaining > 0;
  const rerollButton = rewardRerollButton(canvas);
  drawButton(
    context,
    rerollButton,
    enabled ? `↻ 리롤 — 3택 다시 뽑기   (남은 ${remaining}회)` : '리롤 소진 (남은 0회)',
    enabled
      ? { fill: '#2b3a52', border: '#5b7bb0', text: '#cfe0ff' }
      : { fill: '#20242f', border: '#3a3f4a', text: '#6b7280' },
  );
}

function drawRewardCard(
  context: CanvasRenderingContext2D,
  button: UiButton,
  card: RewardCard,
  session: Session,
  index: number,
): void {
  const tag = card.part.set ?? null;
  context.fillStyle = CARD_BG;
  context.fillRect(button.x, button.y, button.w, button.h);
  context.strokeStyle = setColor(tag);
  context.lineWidth = 2.5;
  context.strokeRect(button.x, button.y, button.w, button.h);

  const padX = button.x + 16;
  let cursorY = button.y + 16;
  context.textAlign = 'left';
  context.textBaseline = 'top';

  // 번호 배지 + 강화/교체 배지
  context.fillStyle = HUD_COLORS.label;
  context.font = '700 13px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText(`[${index + 1}]`, padX, cursorY);
  const badge = card.kind === 'enhance' ? (card.atCap ? '강화 최대' : `강화 +${card.resultLevel}`) : '새 파츠';
  context.textAlign = 'right';
  context.fillStyle = card.kind === 'enhance' ? '#ffd166' : '#9fe6b0';
  context.fillText(badge, button.x + button.w - 16, cursorY);
  context.textAlign = 'left';
  cursorY += 26;

  // 파츠 이름 + 슬롯
  context.fillStyle = HUD_COLORS.overlayText;
  context.font = '700 19px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText(card.part.name, padX, cursorY);
  cursorY += 26;
  context.fillStyle = setColor(tag);
  context.font = '600 13px "Segoe UI", "Malgun Gothic", sans-serif';
  const slotLabel = { layer: '레이어', disk: '디스크', driver: '드라이버' }[card.part.slot];
  context.fillText(`${slotLabel}${tag ? ` · ${tag}` : ' · 무소속'}`, padX, cursorY);
  cursorY += 28;

  // 스탯 델타
  context.font = '500 14px "Segoe UI", "Malgun Gothic", sans-serif';
  const deltas = statDeltaLines(card);
  for (const line of deltas) {
    context.fillStyle = line.positive ? '#9fe6b0' : '#ff9a9a';
    context.fillText(line.text, padX, cursorY);
    cursorY += 20;
  }
  if (card.part.knockback > 0) {
    context.fillStyle = '#ffb14e';
    context.fillText(`넉백 +${card.part.knockback}`, padX, cursorY);
    cursorY += 20;
  }
  cursorY += 4;

  // F1 세트 미리보기
  const preview = setPreviewForCard(session.run.build, card);
  if (preview) {
    context.fillStyle = setColor(preview.tag);
    context.font = '700 14px "Segoe UI", "Malgun Gothic", sans-serif';
    const completeMark = preview.completes ? '  ★완성' : '';
    context.fillText(`${preview.tag} ${preview.from}/3 → ${preview.to}/3${completeMark}`, padX, cursorY);
    cursorY += 22;
  }

  // 장착 시 팽이 외형 미리보기 — "무엇이 어떻게 세지는가"를 그림으로(PT-1-A·D).
  const summary = buildSetSummary(session.run.build);
  const willComplete = (preview?.completes ?? false) || (summary.completed && summary.tag === tag);
  drawCardBeybladePreview(context, button, tag, willComplete);

  // 특성 설명
  if (card.part.trait) {
    context.fillStyle = '#c9d2ea';
    context.font = '500 12px "Segoe UI", "Malgun Gothic", sans-serif';
    wrapText(context, card.part.trait.description, padX, cursorY, button.w - 32, 16);
    cursorY += 34;
  }

  // 블러브(하단)
  context.fillStyle = '#8792ad';
  context.font = '400 12px "Segoe UI", "Malgun Gothic", sans-serif';
  wrapText(context, card.part.blurb, padX, button.y + button.h - 44, button.w - 32, 15);
}

/**
 * 카드 하단의 팽이 외형 미리보기. 세트 색으로 물든 날 + 완성 시 오라 링을 그려
 * "이 파츠를 끼면 내 팽이가 이렇게 보인다"를 선택 전에 노출한다(F1→F2 연결).
 */
function drawCardBeybladePreview(
  context: CanvasRenderingContext2D,
  button: UiButton,
  tag: SetTag | null,
  willComplete: boolean,
): void {
  // 스탯 텍스트가 왼쪽 정렬이라 우측 중단 여백에 배치한다(하단 블러브·특성과 겹치지 않게).
  const centerX = button.x + button.w - 42;
  const centerY = button.y + 168;
  const radius = 20;
  const rim = setColor(tag);

  context.save();
  context.translate(centerX, centerY);

  if (willComplete) {
    // 완성 오라 링(F2 예고).
    context.globalAlpha = 0.6;
    context.beginPath();
    context.arc(0, 0, radius + 6, 0, Math.PI * 2);
    context.strokeStyle = rim;
    context.lineWidth = 2;
    context.stroke();
    context.globalAlpha = 1;
  }

  // 5날 별 실루엣.
  const blades = 5;
  context.beginPath();
  for (let vertex = 0; vertex < blades * 2; vertex += 1) {
    const isOuter = vertex % 2 === 0;
    const r = isOuter ? radius : radius * 0.56;
    const angle = (Math.PI * vertex) / blades - Math.PI / 2;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (vertex === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
  context.fillStyle = tag ? 'rgba(30, 38, 58, 1)' : 'rgba(40, 46, 62, 1)';
  context.fill();
  context.strokeStyle = rim;
  context.lineWidth = willComplete ? 3 : 2;
  context.stroke();

  // 중심축.
  context.beginPath();
  context.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
  context.fillStyle = rim;
  context.fill();
  context.restore();

  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillStyle = willComplete ? rim : '#8792ad';
  context.font = '600 11px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText(willComplete ? '장착 → 세트 완성 외형' : '장착 시 외형', centerX, centerY + radius + 8);
  context.textAlign = 'left';
}

interface StatDeltaLine {
  text: string;
  positive: boolean;
}

function statDeltaLines(card: RewardCard): StatDeltaLine[] {
  const labels: Record<keyof BeybladeStats, string> = {
    attack: 'atk',
    weight: 'wgt',
    stamina: 'sta',
    control: 'ctl',
  };
  const lines: StatDeltaLine[] = [];
  (Object.keys(labels) as (keyof BeybladeStats)[]).forEach((key) => {
    const value = card.part.statDelta[key];
    if (value !== undefined && value !== 0) {
      lines.push({ text: `${labels[key]} ${value > 0 ? '+' : ''}${value}`, positive: value > 0 });
    }
  });
  return lines;
}

// ── 완주 / 패배 결과 ────────────────────────────────────────

function drawRunResultScreen(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, session: Session): void {
  drawDimBackground(context, canvas);
  const won = session.run.phase === 'won';

  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillStyle = won ? '#9fe6b0' : '#ff9a9a';
  context.font = '800 52px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText(won ? '런 완주!  12 / 12' : '런 종료 — 패배', canvas.width / 2, 70);

  context.fillStyle = HUD_COLORS.overlaySubText;
  context.font = '500 18px "Segoe UI", "Malgun Gothic", sans-serif';
  const summary = buildSetSummary(session.run.build);
  const setText = summary.completed && summary.tag ? `${summary.tag} 세트 완성` : `${summary.tag ?? '무소속'} ${summary.count}/3`;
  const detail = won
    ? `최종 빌드 — ${setText} · 강화 총 +${enhanceTotal(session.run.build)}`
    : `${session.run.battleNumber} / 12 판에서 탈락 · 획득 파츠 소실 (로그라이크)`;
  context.fillText(detail, canvas.width / 2, 140);

  if (won && session.savePhase === 'pending') {
    context.fillStyle = HUD_COLORS.overlayText;
    context.font = '600 22px "Segoe UI", "Malgun Gothic", sans-serif';
    context.fillText('격납고에 저장하시겠습니까?  (슬롯 클릭 = 저장/덮어쓰기)', canvas.width / 2, 250);

    const buttons = runResultButtons(canvas, session);
    session.hangar.forEach((entry, index) => {
      const button = buttons[index];
      if (button) drawHangarSlot(context, button, entry, index);
    });
    const skip = buttons[HANGAR_SLOT_COUNT];
    if (skip) drawButton(context, skip, '저장 안 함', { fill: '#33283a', border: '#6a4a6a' });
    return;
  }

  const buttons = runResultButtons(canvas, session);
  if (buttons[0]) drawButton(context, buttons[0], '새 런 시작', { fill: '#264a30', border: '#4a7856' });
  if (buttons[1]) drawButton(context, buttons[1], '온라인 대전', { fill: '#26304a', border: '#4a5678' });
}

function drawHangarSlot(
  context: CanvasRenderingContext2D,
  button: UiButton,
  entry: HangarEntry | null,
  index: number,
): void {
  context.fillStyle = entry ? 'rgba(40, 52, 40, 0.96)' : 'rgba(28, 32, 44, 0.96)';
  context.fillRect(button.x, button.y, button.w, button.h);
  context.strokeStyle = entry ? '#6a8a5a' : '#3a445e';
  context.lineWidth = 1.5;
  context.strokeRect(button.x, button.y, button.w, button.h);

  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillStyle = HUD_COLORS.label;
  context.font = '700 12px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText(`슬롯 ${index + 1}`, button.x + 10, button.y + 8);

  if (!entry) {
    context.fillStyle = '#6b748c';
    context.font = '500 15px "Segoe UI", "Malgun Gothic", sans-serif';
    context.fillText('빈 슬롯', button.x + 10, button.y + 34);
    context.fillText('(여기에 저장)', button.x + 10, button.y + 56);
    return;
  }
  context.fillStyle = HUD_COLORS.overlayText;
  context.font = '600 14px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText(entry.name, button.x + 10, button.y + 30);
  context.fillStyle = setColor(entry.completedSet);
  context.font = '600 12px "Segoe UI", "Malgun Gothic", sans-serif';
  const tagLine = entry.completedSet ? `${entry.completedSet} 완성` : '무소속';
  context.fillText(`${tagLine} · +${entry.enhanceTotal}`, button.x + 10, button.y + 52);
  context.fillStyle = '#9aa4c0';
  context.font = '500 11px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText('클릭 시 덮어쓰기', button.x + 10, button.y + 72);
}

// ── PvP 출전 선택 / 방 대기실 ─────────────────────────────────

function drawPvpScreen(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, session: Session): void {
  drawDimBackground(context, canvas);

  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillStyle = HUD_COLORS.overlayText;
  context.font = '800 36px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText('온라인 대전 — 출전 선택', canvas.width / 2, 52);

  context.fillStyle = HUD_COLORS.overlaySubText;
  context.font = '500 15px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText('프리셋 3종 + 격납고 저장 팽이. 출전 팽이를 고른 뒤 방 코드 대기실로 간다.', canvas.width / 2, 104);

  const buttons = pvpButtons(canvas, session);
  session.pvpEntries.forEach((entry, index) => {
    const button = buttons[index];
    if (button) drawPvpEntryCard(context, button, entry);
  });
  const back = buttons[session.pvpEntries.length];
  if (back) drawButton(context, back, '뒤로', { fill: '#2a3145', border: '#4a5678' });

  if (session.pvpMessage) {
    context.textAlign = 'center';
    context.fillStyle = '#ffd166';
    context.font = '600 16px "Segoe UI", "Malgun Gothic", sans-serif';
    context.fillText(session.pvpMessage, canvas.width / 2, 520);
  }
}

function drawPvpLobbyScreen(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, session: Session): void {
  drawDimBackground(context, canvas);

  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillStyle = HUD_COLORS.overlayText;
  context.font = '800 34px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText('온라인 대전 — 방 대기실', canvas.width / 2, 48);

  const entry = session.selectedPvpEntry;
  if (entry) {
    drawPvpEntryCard(context, { id: 'pvp:selected', x: canvas.width / 2 - 110, y: 120, w: 220, h: 132 }, entry);
  } else {
    context.fillStyle = '#ff9a9a';
    context.font = '600 16px "Segoe UI", "Malgun Gothic", sans-serif';
    context.fillText('출전 팽이를 먼저 선택해야 합니다.', canvas.width / 2, 168);
  }

  context.fillStyle = HUD_COLORS.overlaySubText;
  context.font = '500 15px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText('방 만들기: 코드 발급 후 공유  ·  방 참가: 받은 6자리 코드 입력', canvas.width / 2, 304);
  context.fillText('PvP에서는 강화 수치가 0으로 정규화되고 세트 완성 효과만 유지됩니다.', canvas.width / 2, 330);

  const buttons = pvpLobbyButtons(canvas);
  drawButton(context, buttons[0], '방 만들기', { fill: '#2c5d7b', border: '#66c7f4' });
  drawButton(context, buttons[1], '방 참가', { fill: '#403269', border: '#b9a0ff' });
  drawButton(context, buttons[2], '출전 선택으로', { fill: '#2a3145', border: '#4a5678' });

  const status = session.pvpMessage ?? '연결 대기';
  context.fillStyle = session.pvpMessage ? '#ffd166' : '#9aa8c5';
  context.font = '600 15px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText(status, canvas.width / 2, 382);
}
function drawPvpEntryCard(
  context: CanvasRenderingContext2D,
  button: UiButton,
  entry: Session['pvpEntries'][number],
): void {
  context.fillStyle = CARD_BG;
  context.fillRect(button.x, button.y, button.w, button.h);
  context.strokeStyle = setColor(entry.setTag);
  context.lineWidth = 2;
  context.strokeRect(button.x, button.y, button.w, button.h);

  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillStyle = HUD_COLORS.overlayText;
  context.font = '700 16px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText(entry.name, button.x + 12, button.y + 12);

  context.fillStyle = entry.kind === 'preset' ? '#8792ad' : '#9fe6b0';
  context.font = '500 12px "Segoe UI", "Malgun Gothic", sans-serif';
  const tagLine = entry.completedSet && entry.setTag ? `${entry.setTag} 완성` : '세트 미완성';
  context.fillText(`${entry.kind === 'preset' ? '프리셋' : '저장'} · ${tagLine} · +${entry.enhanceTotal}`, button.x + 12, button.y + 36);

  context.fillStyle = '#c9d2ea';
  context.font = '500 12px "Segoe UI", "Malgun Gothic", sans-serif';
  const s = entry.stats;
  context.fillText(`atk ${s.attack}  wgt ${s.weight}`, button.x + 12, button.y + 64);
  context.fillText(`sta ${s.stamina}  ctl ${s.control}`, button.x + 12, button.y + 84);
}

function drawBattlePvpButton(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const button = battleButtons(canvas)[0];
  if (button) drawButton(context, button, '온라인 대전', { fill: 'rgba(38,48,74,0.9)', border: '#4a5678', fontSize: 13 });
}

// ── 유틸 ────────────────────────────────────────────────────

/** 폭 제한 줄바꿈. 심사자 판독용 짧은 문장에만 쓴다. */
function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(' ');
  let line = '';
  let cursorY = y;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = candidate;
    }
  }
  if (line) context.fillText(line, x, cursorY);
}
