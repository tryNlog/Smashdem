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
import { buildSetSummary, enhanceTotal } from '../game/run';
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

/** 배틀 화면에 상시 노출되는 [온라인 대전] 버튼(§1-3 "언제든"). */
function battleButtons(canvas: HTMLCanvasElement): UiButton[] {
  return [{ id: 'battle:pvp', x: canvas.width / 2 - 74, y: 588, w: 148, h: 26 }];
}

function buttonsFor(canvas: HTMLCanvasElement, session: Session): UiButton[] {
  switch (session.screen) {
    case 'reward':
      return rewardButtons(canvas);
    case 'runResult':
      return runResultButtons(canvas, session);
    case 'pvpSelect':
      return pvpButtons(canvas, session);
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
    case 'battle':
      drawBattlePvpButton(context, canvas);
      break;
  }
}

function drawDimBackground(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  context.fillStyle = 'rgba(6, 8, 14, 0.82)';
  context.fillRect(0, 0, canvas.width, canvas.height);
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
  context.fillText('카드를 클릭하거나 1 / 2 / 3 키로 선택 — 리롤 없음', canvas.width / 2, 116);

  const buttons = rewardButtons(canvas);
  session.rewards.forEach((card, index) => {
    const button = buttons[index];
    if (button) drawRewardCard(context, button, card, session, index);
  });
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

// ── PvP 출전 선택 (stub) ────────────────────────────────────

function drawPvpScreen(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, session: Session): void {
  drawDimBackground(context, canvas);

  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillStyle = HUD_COLORS.overlayText;
  context.font = '800 36px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText('온라인 대전 — 출전 선택', canvas.width / 2, 52);

  context.fillStyle = HUD_COLORS.overlaySubText;
  context.font = '500 15px "Segoe UI", "Malgun Gothic", sans-serif';
  context.fillText('프리셋 3종 + 격납고 저장 팽이. 클릭해 출전 팽이를 고른다 (온라인 연결은 S3 — 현재 stub)', canvas.width / 2, 104);

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
