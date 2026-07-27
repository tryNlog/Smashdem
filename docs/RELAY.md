# RELAY.md — Smashdem 릴레이 바통

> Claude ↔ Codex 세션 제한 릴레이의 인계 상태 파일. **작업 시작 전 읽고, 손 떼기 전 갱신한다.** 규칙 전문은 리포 루트 `AGENTS.md`.

## 현재 상태 (last updated: 2026-07-27, by Codex)
- **현재 담당:** Codex (Claude의 월간 사용량 한도로 인계받음)
- **Claude 제한 해제 예정 시각:** `[UNSUPPORTED]` — 마지막 메시지는 "monthly spend limit"만 표시했고, 복귀 시각을 제공하지 않았다. 다음 Claude 제한 메시지에 시각이 있으면 이 줄에 기록한다.
- **Codex 복귀 가능 시각:** 현재 세션에서 인계 시 기입.
- **브랜치:** s2-run (S3 Task 4 browser client 작성됨, 커밋 직전; Task 3b `7c501d2`; Task 3a `8331e5c`; Task 2 `ab07a84`; Task 1 `ffe121f`). remote 있음, **push 금지**.
- **트리:** Task 4 코드·로그·바통 기록을 같은 컴파일 조각으로 커밋 예정 (Codex 확인: 2026-07-27).

## 진행 중 작업
- **Codex S3 Task 4 작성됨, 커밋 직전:** `src/net/onlineClient.ts`와 `smoke:online-client`이 생성/참가·역할별 전송·서버 frame 파싱을 관측했다. 다음은 Task 5 Canvas lobby/main 통합이다. 공개 Cloudflare Worker URL은 PM 계정 작업으로 미설정이다.

## 다음 작업 큐 (우선순위 순, 각 완료 기준 포함)
1. **[PM 게이트] STRIKE 가시화 재플레이 판정** — PM이 `npm run dev`로 STRIKE 세트 완성 타격이 "확 깎인다"로 읽히는지 확인. 과하거나 부족하면 튜닝값(`src/render/effects.ts`의 SPIN_LOSS_REFERENCE=6, 드레인/rate, 팝업 상한·폰트 범위) 조정. PM 부재면 큐로 두고 아래 항목 먼저.
2. **S3 실시간 PvP 넷코드** — Task 1~4(프로토콜·coordinator·router·Durable Object relay·browser client)까지 로컬 소스가 있다. 다음은 Task 5(로비·main 통합) → PM 공개 Worker 배포·두 브라우저 실증. 완료 기준: 브라우저 2탭이 실제로 붙어 한 판 종료까지. 킬 스위치 8/2 23:00(그때까지 안 붙으면 로컬 2인 대전으로 강등). **결정론 계층(src/game)을 흔들지 말 것** — 입력만 주고받고 물리는 host가 단독 계산.
3. **모바일 터치 조작** — 현재 키보드(방향키/Space)+클릭 기반이라 폰에서 막힌다. 가상 스틱/버튼 등으로 터치 조작 추가. 완료 기준: 폰 브라우저에서 런 진행 가능(심사자 폰 접속 대비, 계획서 V1).
4. **제출물** — 게임 소개·실행 방법 PDF(#3), AI 활용 기술 PDF(#4), 30~60초 영상. 구간 S5(8/8~9).

## 인계 로그 (append-only, 최신이 위)
### 2026-07-27 — Claude → (대기)
- 한 것: GitHub Pages 배포(https://trynlog.github.io/Smashdem/), 게임명 Smashdem 전면 반영(README/DEPLOY/package.json 소문자/index.html 탭 제목), STRIKE 타격 회전력 감소 가시화(PD-4). 결정론 `smoke:run` 동일 시드 8/8 일치 재확인.
- 멈춘 지점: §17 재플레이 前 구현 관문 종료, PM 재플레이 대기.
- 다음 담당에게: PM 재플레이 없이도 진행 가능한 최대 항목은 큐 #2(S3 넷코드) — 가장 크고 격리돼 있어 릴레이로 진척 내기 좋다. 배포 커밋들은 아직 로컬 s2-run에만 있고 push는 PM 몫.
### 2026-07-27 14:03 KST — Claude → Codex
- 인계 사유: Claude 세션이 아닌 **월간 사용량 한도**에 도달했다. 자동 복귀 시각은 메시지에 없으므로 Codex가 시간 기준으로 종료를 예약할 근거가 없다.
- Codex 확인: `npm run build`, `npm run smoke`, `npm run smoke:run`, `npm run smoke:tiers`, `npm run smoke:reroll`를 2026-07-27에 재실행했다. 각 결과는 콘솔 측정값이며, 사람 플레이·화면 판독은 별도다.
- 다음 담당에게: 화면 검토 결과와 사용자 재플레이 의견을 이 절 위에 추가한다. Claude가 다시 사용 가능해지면 이 문서의 현재 담당·복귀 시각을 Claude가 갱신한 뒤 바통을 가져간다.

### 2026-07-27 — Codex S3 Task 1
- red 관측: `npm run smoke:pvp-protocol`이 `src/net/protocol.ts` 부재로 `UNRESOLVED_IMPORT`을 냈다.
- 코드: `ffe121f` — 버전 1 릴레이 프로토콜과 6개 parser case 스모크. 이후 `smoke:pvp-protocol` 6/6, `npm run build` 종료 코드 0, `smoke:run` 동일 시드 8/8(2026-07-27 콘솔 측정).
- 다음: Task 2 `onlineBattle` coordinator. 로컬 Worker/배포는 아직 없고, 외부 두 기기 연결도 미관측이다.
### 2026-07-27 — Codex S3 Task 2
- red 관측: `npm run smoke:online-battle`이 `src/app/onlineBattle.ts` 부재로 `UNRESOLVED_IMPORT`을 냈다.
- 코드: `ab07a84` — host만 60Hz `stepBattle`을 호출하고 guest는 새 스냅샷만 수신하는 coordinator. 스모크 6/6, build 종료 코드 0, `smoke:run` 동일 시드 8/8(2026-07-27 콘솔 측정).
- 다음: Task 3 Worker Durable Object relay. socket·로비·실제 두 탭 접속은 아직 미관측이다.
### 2026-07-27 — Codex S3 Task 3a
- red 관측: `npm run smoke:pvp-relay`이 `relay/src/router.ts` 부재로 `UNRESOLVED_IMPORT`을 냈다.
- 코드: `8331e5c` — 2명 방·역할 필터·상대 이탈 router. 스모크 8/8, build 종료 코드 0, protocol/coordinator 스모크 각각 6/6(2026-07-27 콘솔 측정).
- 다음: Task 3b Durable Object adapter. 실제 socket·방 생성·외부 연결은 아직 미관측이다.
### 2026-07-27 — Codex S3 Task 3b
- 코드: `7c501d2` — Cloudflare Durable Object room relay, local Wrangler 구성, URL/router/2-socket smokes. `smoke:relay-endpoint` 5/5, `smoke:pvp-relay` 9/9, `smoke:relay-local` 6/6; build 종료 코드 0과 기존 protocol/coordinator/run 관측은 ai-log에 기록(2026-07-27).
- 현재: 로컬 relay는 `ws://127.0.0.1:8787`에서만 확인했다. Pages와 실제 게임 화면은 아직 이 relay에 연결되지 않았다.
- 다음: Task 4 browser WebSocket client. 공개 Worker deploy는 PM Cloudflare 계정 작업이며, endpoint와 토큰은 아직 없다.
### 2026-07-27 — Codex S3 Task 4
- red 관측: `npx vite build --ssr tools/onlineClient.ts --outDir dist-tools --logLevel warn`이 `src/net/onlineClient.ts` 부재로 `UNRESOLVED_IMPORT`을 냈다.
- 코드: browser WebSocket client와 `smoke:online-client`이 생성/참가의 open 이후 frame 전송, host/guest 역할 필터, 서버 frame callback, malformed frame 오류 보고를 12개 사례로 관측했다. 첫 build의 FakeSocket 타입 불일치는 테스트 더블 수정 후 해소됐다.
- 회귀 관측: `npm run build` 종료 코드 0, protocol 6/6, online coordinator 6/6, `smoke:run` 동일 시드 8/8 (2026-07-27).
- 다음: Task 5. 기존 PvP 출전 선택 화면에서 방 생성·6자리 코드 입력·match-start를 `createOnlineBattle`/Canvas 렌더 루프에 연결한다. 실제 브라우저와 공개 Worker는 아직 미관측이다.