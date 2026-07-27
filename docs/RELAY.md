# RELAY.md — Smashdem 릴레이 바통

> Claude ↔ Codex 세션 제한 릴레이의 인계 상태 파일. **작업 시작 전 읽고, 손 떼기 전 갱신한다.** 규칙 전문은 리포 루트 `AGENTS.md`.

## 현재 상태 (last updated: 2026-07-27, by Codex)
- **현재 담당:** Codex (Claude의 월간 사용량 한도로 인계받음)
- **Claude 제한 해제 예정 시각:** `[UNSUPPORTED]` — 마지막 메시지는 "monthly spend limit"만 표시했고, 복귀 시각을 제공하지 않았다. 다음 Claude 제한 메시지에 시각이 있으면 이 줄에 기록한다.
- **Codex 복귀 가능 시각:** 현재 세션에서 인계 시 기입.
- **브랜치:** `s2-run`; 최신 로컬 커밋 `6f6cb92`은 모바일 입력 문서이며, source는 `7f8bf9f`·`40a85cd`에 있다. remote `origin`은 있고, **push 금지**.
- **트리:** `6f6cb92`까지 로컬 커밋된 뒤 상태를 확인한다. remote push는 PM 전용이다.
## 진행 중 작업
- **S3 공개 relay 배선:** `1ad9f62`에 GitHub Actions `VITE_RELAY_URL` 주입, direct Vite env access, local relay build smoke, PM Cloudflare/Pages 절차가 있다. 공개 Worker endpoint와 Canvas 두 브라우저 관찰은 PM 게이트다.
- **PM 게이트:** Cloudflare 로그인·`npm run relay:deploy`·GitHub Actions 변수 등록·원격 push·공개 Worker/Canvas 두 브라우저 관찰은 PM 계정과 브라우저가 필요한 작업이다. PM 부재 시 모바일 조작·제출물 큐로 이동한다.
## 다음 작업 큐 (우선순위 순, 각 완료 기준 포함)
1. **[PM 게이트] STRIKE 가시화 재플레이 판정** — PM이 `npm run dev`로 STRIKE 세트 완성 타격이 "확 깎인다"로 읽히는지 확인. 과하거나 부족하면 튜닝값(`src/render/effects.ts`의 SPIN_LOSS_REFERENCE=6, 드레인/rate, 팝업 상한·폰트 범위) 조정. PM 부재면 큐로 두고 아래 항목 먼저.
2. **S3 실시간 PvP 넷코드** — Task 1~5b(프로토콜·coordinator·relay·browser client·Canvas lobby·main handoff)까지 로컬 소스가 있다. 다음은 로컬 사람 브라우저 2탭 실증 → PM 공개 Worker 배포·Pages endpoint 배선이다. 완료 기준: 브라우저 2탭이 실제로 붙어 한 판 종료까지. 킬 스위치 8/2 23:00(그때까지 안 붙으면 로컬 2인 대전으로 강등). **결정론 계층(src/game)을 흔들지 말 것** — 입력만 주고받고 물리는 host가 단독 계산.
3. **모바일 터치 조작** — 소스 `7f8bf9f`·화면 연결 `40a85cd`은 local commit에 있다. 다음 완료 기준은 폰 브라우저에서 런 진행(8방향 이동·버스트·보상 화면·회전/resize 후 숨김) 관찰이다. 자동 smoke는 명령 변환만 다룬다.
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
### 2026-07-27 — Codex S3 Task 5a
- red 관측: `tools/pvpLobby.ts`에서 출전 카드 선택 뒤 screen이 대기실이 아니라는 assertion 오류가 났다.
- 코드: `pvpLobby`·`selectedPvpEntry`·PvpLoadout 스냅샷, Canvas 대기실과 뒤로 가기 동선을 추가했다. `smoke:pvp-lobby`는 다음 package 기록 조각에 추가된다.
- 회귀 관측: `npm run build` 종료 코드 0, `smoke:run` 동일 시드 8/8, `smoke:online-client` 12/12 (2026-07-27).
- 다음: Task 5b. native 6자리 code input, relay URL 환경 해석, OnlineClient callback → OnlineBattle/main fixed loop을 연결한다. 연결된 브라우저 화면과 공개 Worker는 아직 미관측이다.
### 2026-07-27 — Codex S3 Task 5b
- red 관측: onlineMatch module 부재, `enterOnlineBattle` 부재, `resolveRelayUrl` export 부재를 각각 테스트가 잡았다. `npm run build`는 `ImportMeta.env` 타입 제외와 DOM closure narrowing 문제를 지적했고, 원인별 최소 수정 뒤 build 종료 코드 0을 관측했다.
- 코드: main에서 host만 onlineMatch fixed tick 물리·snapshot을 보내고 guest는 입력·신규 snapshot만 처리한다. native 6자리 room input과 Pages relay URL 차단 경계도 추가했다. `src/game`은 미수정이다.
- 회귀 관측: online match 11/11, online client 15/15, lobby 8/8, run 동일 시드 8/8, local relay 6/6 (2026-07-27).
- 현재 제한: Codex 내장 browser 초기화가 `Cannot redefine property: process`로 중단돼 실제 Canvas/2탭 UI는 아직 미관측이다. 로컬 relay는 127.0.0.1:8787, Vite는 127.0.0.1:5173에서 listener를 관측했다.
- 다음: 사람이 로컬 두 탭에서 create→code→join→움직임→finish→leave를 확인한다. 이후 PM Cloudflare Worker deploy와 Pages의 public `VITE_RELAY_URL` build를 수행한다.
### 2026-07-27 — Codex S3 local WebSocket smoke
- 코드: `tools/onlineMatchRelay.ts`와 npm script를 추가했다. Node 22 표준 WebSocket이 기본 OnlineClient 경로를 사용해 local Durable Object relay에 host/guest로 붙는다.
- 관측: create→6자리 code→양쪽 match-start→host tick 3 snapshot→guest tick 3→guest close→host opponent-left까지 `smoke:online-match-relay` 6/6. 기존 `smoke:relay-local`은 relay router 직접 경계, 이 스모크는 app/client 경계다.
- 다음: 여전히 사람 브라우저 Canvas 2탭 확인과 PM public Cloudflare Worker/Pages URL 주입이 필요하다. Codex browser 초기화 제한은 Task 5b 기록을 참조한다.
### 2026-07-27 — Codex S3 public relay build URL
- 코드: `1ad9f62` — Vite bundle에 public relay origin을 넣는 `import.meta.env.VITE_RELAY_URL` 경로, local `smoke:relay-build`, Pages workflow variable 배선, README/DEPLOY 절차를 기록했다. `src/game/`은 수정하지 않았다.
- red→green 관측: placeholder URL build는 optional-chain expression에서 `VITE_RELAY_URL was not embedded in the production bundle`을 냈다. direct expression 변경 뒤 `smoke:relay-build` 1/1을 관측했다.
- 회귀 관측: normal build 종료 코드 0; protocol 6/6, online client 15/15, lobby 8/8, online match 11/11, local Worker app/client 경로 6/6 (2026-07-27 콘솔).
- 실행 환경: 모든 항목을 한 PowerShell process로 묶은 명령은 protocol 출력 뒤 892.5초에 timeout이 났다. 이후 각 smoke를 분리 실행하면 위 수치가 나왔다. 원인은 `[UNSUPPORTED]`; 다음 담당은 스모크를 개별 실행해 시간을 기록한다.
- 다음: PM이 Cloudflare에서 `npm run relay:deploy` 후 출력된 public Worker origin을 `wss://`로 변환해 GitHub Actions `VITE_RELAY_URL`에 넣고 Pages를 재배포한다. 그 뒤 사람 브라우저 두 탭 Canvas 확인을 기록한다. PM 부재 시 큐 #3 모바일 터치 조작으로 이동한다.
### 2026-07-27 — Codex mobile touch controls
- 코드: `7f8bf9f`은 DOM Pointer Event를 `InputCommand`로 바꾸는 source와 fake-event smoke를, `40a85cd`은 canvas 하단의 가상 스틱·버스트 버튼과 battle/onlineBattle 화면 연결을 기록한다. `src/game/`은 수정하지 않았다.
- red→green 관측: source 생성 전 `smoke:touch-input`은 `UNRESOLVED_IMPORT`; battle screen visibility export 추가 전 `MISSING_EXPORT`을 냈다. 이후 touch smoke 13/13, normal build 종료 코드 0, online client 15/15, lobby 8/8, online match 11/11을 콘솔에서 관측했다.
- 동작 범위: `(pointer: coarse)`에서만 battle/onlineBattle 중 컨트롤을 보이고, 화면 전환·비활성에서 이동/버스트 큐를 지운다. 키보드 축과 터치 축은 `[-1, 1]`로 합산 clamp, burst는 OR다.
- 다음: 실제 Android/iOS 또는 coarse-pointer 기기에서 8방향·버스트·보상 화면·회전/resize·비전투 숨김을 관찰한다. visual browser automation은 이 환경에서 초기화 오류가 있었으므로, 이 항목은 사람 기기 기록이 필요하다.
