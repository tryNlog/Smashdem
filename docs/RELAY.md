# RELAY.md — Smashdem 릴레이 바통

> Claude ↔ Codex 세션 제한 릴레이의 인계 상태 파일. **작업 시작 전 읽고, 손 떼기 전 갱신한다.** 규칙 전문은 리포 루트 `AGENTS.md`.

## 현재 상태 (last updated: 2026-07-28, by Codex)
- **현재 담당:** Codex Task 1 구현 인계 → Task 1 리뷰 대기. 같은 `s2-run` 브랜치에 동시 작성자는 없다.
- **코어 상태:** `7715a53`은 `aim.ts`의 256-step 변환, 가드 자원/전역 hit cooldown 제거, `facingAimStep` 0/128 초기화, 카운터/대시 상태 필드를 기록한다. `src/app/characterInput.ts`은 Task 2 포인터 입력 교체 전, 기존 `tools/characterInput.ts`의 `actionDirectionX/Y` 판독만 유지하는 로컬 호환 반환형이다. 새 `CharacterInputCommand`에는 해당 필드가 없다. Task 2의 키보드 행동 입력 `7148034`은 새 조작 계약 이전의 로컬 코드이며, 검토·세션 연결 전 교체 대상으로 둔다.
- **조작·가드 보완 계약:** `docs/superpowers/specs/2026-07-28-mouse-aim-guard-matchup-design.md` — PM이 키보드 이동/마우스 조준 분리, 좌클릭 공격, `E` 스킬, 우클릭 무제한 전면 가드, 이동방향 대시, 256단계 조준, 대시 가드브레이크 넉백 증폭, 좌클릭 반격을 결정했다. 서면 검토 발견 사항은 §8 보정 규칙으로 반영됐고, PM이 2026-07-28 재검토에서 옵션 1(§8.6 봇 순서 명시, §8.1 리셋 동결 이동 거부, RELAY 참조 정리)을 승인했다. 대체 구현 계획은 `docs/superpowers/plans/2026-07-28-mouse-aim-combat-core.md`로 작성됐다(보완 문서 §8 인용, §8.8 요건 충족 — Codex 구현·PM 판정 대기).
- **전환 기준:** 기본 계약은 `docs/superpowers/specs/2026-07-28-character-arena-design.md`, 입력·관성·상성 가드 보완 계약은 `docs/superpowers/specs/2026-07-28-mouse-aim-guard-matchup-design.md`다. 후자의 서면 검토와 PM 승인은 2026-07-28에 기록됐다. 새 구현 계획은 보완 문서 §8을 인용해야 하며, 두 문서가 충돌하면 보완 문서 §8이 우선한다.
- **로컬 복귀선:** `spinner-baseline-2026-07-28` → `f97bca1` (원격 전송 금지). 8/2 23:00에는 기본 계약 문서(`2026-07-28-character-arena-design.md`) §8.2의 4개 관측으로 캐릭터 후보/태그 기준을 PM이 선택한다(보완 문서의 §8.2와 다른 절이니 혼동 금지).
- **Claude 제한 해제 예정 시각:** `[UNSUPPORTED]` — 마지막 메시지는 "monthly spend limit"만 표시했고, 복귀 시각을 제공하지 않았다. 다음 Claude 제한 메시지에 시각이 있으면 이 줄에 기록한다.
- **Codex 복귀 가능 시각:** 현재 세션에서 인계 시 기입.
- **브랜치:** `s2-run`; 최신 기능 코드 커밋 `ec1100c`는 모바일 버스트 방향 스냅샷이며, 방향 래치는 `ce03cba`, touch source/UI는 `7f8bf9f`·`40a85cd`에 있다. remote `origin`은 있고, **push 금지**.
- **트리:** 작업 시작 전 `git log --oneline -5`·`git status`로 코드·문서 커밋을 함께 확인한다. remote push는 PM 전용이다.
## 진행 중 작업
- **S3 공개 relay 배선:** `1ad9f62`에 GitHub Actions `VITE_RELAY_URL` 주입, direct Vite env access, local relay build smoke, PM Cloudflare/Pages 절차가 있다. 공개 Worker endpoint와 Canvas 두 브라우저 관찰은 PM 게이트다.
- **PM 게이트:** Cloudflare 로그인·`npm run relay:deploy`·GitHub Actions 변수 등록·원격 push·공개 Worker/Canvas 두 브라우저 관찰은 PM 계정과 브라우저가 필요한 작업이다. PM 부재 시 모바일 조작·제출물 큐로 이동한다.
## 다음 작업 큐 (우선순위 순, 각 완료 기준 포함)
0. **[Task 1 리뷰 대기] 마우스 조준 코어 구현** — `7715a53`을 `docs/superpowers/plans/2026-07-28-mouse-aim-combat-core.md` Task 1과 `task-1-brief.md`에 대조한다. 리뷰 범위는 `aim.ts`, 상태/상수/팩토리/clone, `tools/characterState.ts`, 그리고 Task 2 전 임시 `src/app/characterInput.ts` 호환 경계다. 리뷰 기록 후에만 Task 2(포인터 입력 경계)를 시작한다. R-3(틱 파이프라인 순서 normative 고정)·P-1(카운터 만료 스모크)은 Task 3/4 범위에 남는다.
1. **장비·12판 런 이행** — `equipment.ts`와 무기/방어구/장신구 보상·강화·격납고 변환. 착수 전에 싱글플레이 플랜에 보완 문서 §8.5 대체표(counterWindow 등)를 반영한다. 완료 기준: 11회 보상과 세 슬롯이 12판 흐름에서 보인다.
2. **봇·링아웃·측정** — 새 봇 4티어와 링아웃 체력 페널티. 봇 결정 순서는 보완 문서 §8.6의 7단계를 따른다. 완료 기준: 기본 계약 문서 §9의 bot/ring-out/timeout 스모크(가드 자원 항목은 보완 문서 §6·§8.7로 대체)와 한 런 관측을 기록한다. 미러봇은 활성화하지 않는다.
3. **PvP v2** — 새 입력·장비 ID를 protocol/relay/two-tab 경로에 반영한다. 입력 프레임은 8필드 `CharacterInputCommand`(`aimStep`/`actionAimStep` 정수 0..255 검증)로 개정한다. 8/2 23:00 전 관측이 없으면 로컬 2인 범위로 강등한다.
4. **제출물** — 게임 소개·실행 방법 PDF(#3), AI 활용 기술 PDF(#4), 30~60초 영상. 캐릭터 후보를 선택한 경우 영상 컷은 기본 계약 문서 §8.3을 쓴다.
## 인계 로그 (append-only, 최신이 위)
### 2026-07-28 — Codex Task 1 state and aim migration → reviewer handoff
- 코드 커밋: `7715a53 feat(character): migrate state to aim-step matchup guard` (local only; push/remote 변경 없음).
- red 관측: `npm run smoke:character-state`는 `src/game/character/aim` 부재로 `[UNRESOLVED_IMPORT] Could not resolve '../src/game/character/aim'`를 출력하고 exit 1이었다.
- 구현 범위: `src/game/character/aim.ts`, `types.ts`, `balance.ts`, `battleState.ts`, `tools/characterState.ts`, 그리고 build 호환을 위한 `src/app/characterInput.ts`의 임시 로컬 반환형. 기존 `tools/characterInput.ts`은 편집하지 않았다.
- green 관측(2026-07-28 콘솔): `smoke:character-state` 21/21, `smoke:character-input` 14/14, `npm run build` exit 0, `smoke:run` 동일 시드 8/8. `git diff --check`은 출력 없음이었다.
- [UNSUPPORTED]: 가드 이동 0.60, 가드브레이크 넉백 1.60, 기본/강화 반격 1.35/1.75, 강화 반격 경직 0.35초, 카운터 창 0.80초, 공격 아크 cos45, 드래그 3.5/s, 대시 임펄스 420, 속도 상한 640은 character harness/사람 플레이 근거가 없다.
- 다음: reviewer가 `7715a53`을 Task 1 brief와 명세 §8.1~§8.4에 대조한다. 리뷰 기록 전에는 Task 2를 시작하지 않는다.

### 2026-07-28 — Claude 대체 구현 계획 작성 → PM 경유 Codex 인계
- 산출물: `docs/superpowers/plans/2026-07-28-mouse-aim-combat-core.md` — 보완 문서 §8 인용(§8.8 요건), 기존 core 플랜 Task 1~5 대체. Task 1 상태·aim 이행(가드 게이지 필드 제거, `facingAimStep` 0/128, `aim.ts` 신설), Task 2 포인터 입력 경계(`7148034` 교체), Task 3 시뮬 파이프라인(틱 내 처리 순서 normative 고정 = 검토 R-3 종결), Task 4 가드/카운터/링아웃/타임아웃 판정(카운터 만료 스모크 = 검토 P-1 종결, §6-8 byte-equal 8회 루프), Task 5 인계.
- 범위 제외(후속 플랜 개정에서): 장비(§8.5), 봇(§8.6), PvP v2 프레임 검증, 렌더러/세션 연결.
- PM 결정(2026-07-28): 이 세션에서는 구현하지 않는다. PM이 계획과 변경점을 Codex에 직접 전달한다.
- 상태: 문서만 변경. 이 세션 커밋: `082c8b8`(명세 §8.1/§8.6 보정 + RELAY 참조 정리), 본 커밋(계획 + RELAY + ai-log). 코드·스모크·빌드는 미변경/미실행.
- 다음 담당(Codex)에게: 큐 #0 계획의 Task 1부터. 작업 전 보완 명세 §8과 계획 상단 Global Constraints를 함께 읽는다. push 금지.
### 2026-07-28 — Claude 서면 검토 2라운드 + §8 보정 (PM 옵션 1)
- 검토: 1차 발견 13건(스펙 공백 6·문서 정합 3·경미 4)은 Codex의 `f60dca4` §8에서 대응을 항목별로 대조했다. §8.2의 스폰 대면 주장은 `src/game/character/battleState.ts:56-70`(0번 -X 스폰·facing +X, 1번 +X 스폰·facing -X)과 일치했다.
- 본 커밋: 보완 명세 §8.6 봇 결정 순서를 림 위험 1순위를 유지한 7단계 목록으로 명시(R-1), §8.1에 reset-frozen 이동 거부·속도 0 유지 명시(R-2), Status 줄 갱신, 본 파일의 '명세 §N' 참조에 문서명 병기(H-1), 큐 #0 교체(H-2), ai-log 기록.
- PM 결정(2026-07-28): 옵션 1 — 보정 반영 승인 + §8 인용 대체 구현 계획 착수 허용. R-3(틱 내 처리 순서 고정)·P-1(카운터 만료 스모크)은 대체 계획에서 반영한다.
- 상태: 문서만 변경, `src/`·`tools/`·`package.json` 미수정. 문서 변경이라 스모크·빌드는 실행하지 않았다.
- 다음 담당에게: 큐 #0(대체 구현 계획 작성)부터. 실행 방식(서브에이전트 구동/단계 실행)은 계획 착수 시 확정한다.
### 2026-07-28 — PM approved character-arena pivot (design only)
- PM 결정: Smashdem을 팽이 게임이 아니라 원작 IP를 차용하지 않는 2D 캐릭터 아레나 액션으로 전환한다. 장비 슬롯은 무기·방어구·장신구, 무기는 액티브 스킬, 방어구·장신구는 패시브, 3/3 세트는 강한 시너지를 제공한다.
- 전투 요구: 수동 기본 공격·돌진/가드브레이크·무기 스킬·가드. STRIKE=체력 피해, BREAK=누적 링아웃, GUARD=가드 후 반격의 세 루트를 둔다.
- 설계: `docs/superpowers/specs/2026-07-28-character-arena-design.md`. 12판 런·3택1·리롤·강화·로컬 격납고 5슬롯·호스트 권위 PvP 경계는 유지한다. 현재 팽이 밸런스 수치는 새 전투의 근거로 쓰지 않는다.
- 상태: 코드 변경 없음. PM 명세 검토가 다음 관문이다. 승인 뒤 action input/combat state부터 TDD로 교체한다.
### 2026-07-28 — Codex mobile burst direction snapshot
- PM 관찰: 터치에서 가리킨 방향과 다른 쪽으로 버스트가 나가는 듯하고 전체 조작이 불안정하다.
- 원인 추적: 기존 `handleBurst`는 boolean만 큐에 저장했고, main의 다음 60Hz tick에서 `consumeCommand()`가 당시의 최신 스틱 방향을 함께 반환했다. 오른쪽 스틱→버스트 탭→왼쪽 스틱 이동 순서의 red는 `burst must use the held direction at button press...` 오류를 냈다.
- 코드: `ec1100c`는 터치 버스트 탭 시 `moveX/moveY`를 저장하고, 다음 한 tick의 burst command만 그 값을 반환한다. 다음 tick부터는 최신 스틱 방향을 쓴다. `src/game/`·밸런스 상수·네트워크 protocol은 수정하지 않았다.
- 관측: `npm run smoke:touch-input` 19/19, `npm run build` 종료 코드 0, `npm run smoke:run` 동일 시드 8/8 (2026-07-28 콘솔).
- 남는 분리 항목: 고속 역방향 관성·충돌 후 속도와 버스트 임펄스의 벡터 합은 별도 물리 설계다. 실제 모바일 재시험에서 계속 보이면 그 사례를 재현해 PM 판단 없이 밸런스를 바꾸지 않는다. 현재 기기 감각은 `[UNSUPPORTED]`이다.
### 2026-07-27 — Codex mobile direction latch
- PM 관찰: 모바일에서 빠른 방향 전환이 둔하게 느껴지고, 가상 스틱을 길게 유지할 때 미세한 손가락 이동이 입력을 흔든다.
- 원인 추적: `src/app/touchInput.ts`의 기존 구현은 매 `pointermove`마다 22% dead zone 안이면 즉시 중립, 밖이면 축 부호를 즉시 갱신했다. `tools/touchInput.ts`에서 오른쪽 홀드 후 `(53, 59)` 드리프트가 중립이 되는 red 관측을 남겼다.
- 코드: `ce03cba`는 최초 입력 22% 밖에서만 방향을 잡고, 잡힌 뒤에는 중심 대비 32% 이상 이동해야 새 방향으로 바꾼다. pointerup/cancel/비활성은 여전히 즉시 중립이다. 전투 물리·밸런스·`src/game/`은 수정하지 않았다.
- 관측: `npm run smoke:touch-input` 17/17, `npm run build` 종료 코드 0, `npm run smoke:run` 동일 시드 8/8 (2026-07-27 콘솔).
- 다음: PM이 공개 Pages에 `ce03cba`를 push한 뒤 모바일에서 오른쪽 홀드→미세 드리프트→반대/직각 드래그를 재시험한다. 실제 손가락 전환 감각은 `[UNSUPPORTED]`이며, 자동 smoke는 명령 변환만 다룬다.
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

### 2026-07-28 — Codex Core Plan Task 1 state boundary
- Red evidence: before implementation, `npx vite build --ssr tools/characterState.ts --outDir dist-tools --logLevel warn` exited 1 with `[UNRESOLVED_IMPORT]` for `src/game/character/battleState.ts` and `types.ts`.
- Code state: added only the separate `src/game/character/{types,balance,battleState}.ts` boundary, `tools/characterState.ts`, and the `smoke:character-state` script. The factory creates two deterministic central-spawn combatants with maximum health/guard; the clone copies combatants, seeded random state, hit cooldowns, and events. Legacy spinner source, `main.ts`, renderer, network, touch input, and balance files were not changed.
- Observations: `npm run smoke:character-state` printed `Character state cases: 5/5 observed`; `npm run build` exited 0; `npm run smoke:run` printed legacy same-seed `8/8` (2026-07-28 console).
- `[UNSUPPORTED]`: character numeric suitability, including migrated `90`, `0.30`, `150`, `0.6`, guard cone cosine, default stats, and action profile values in `src/game/character/balance.ts`, has no character-harness measurement yet.
- Next: Core Plan Task 2 may add the desktop action-input boundary. This Task 1 commit ID is recorded in `.superpowers/sdd/2026-07-28-character-arena-core/task-1-report.md` after the local commit. Claude return time remains `[UNSUPPORTED]`; Codex return time is this task handoff.

### 2026-07-28 — Codex Core Plan Task 1 review fix round 1/5
- Reviewer finding addressed: `positionCombatantsAtSpawn()` now rejects fewer or more than two combatants before position assignment; `smoke:character-state` observes both failure cases and reports `14/14`.
- Compatibility: `CharacterBattlePhase` changed from `active` to `fighting` to match Core Plan Task 3's approved lifecycle check.
- Factory smoke now observes maximum guard, `ready`, exact opposing central spawn coordinates, zero timers/cooldowns, neutral input, and independent random/event clone containers.
- Observations: `npm run smoke:character-state` 14/14; `npm run build` exit 0; legacy `npm run smoke:run` same seed 8/8 (2026-07-28 console). Fix-round local commit ID is in `.superpowers/sdd/2026-07-28-character-arena-core/task-1-report.md` after commit.
- `[UNSUPPORTED]`: character numeric suitability remains unmeasured; no legacy spinner or new character balance number was changed in this fix.

### 2026-07-28 — Codex Core Plan Task 2 desktop action input
- Red evidence: before implementation, `npx vite build --ssr tools/characterInput.ts --outDir dist-tools --logLevel warn` exited `1` with `[UNRESOLVED_IMPORT] Could not resolve '../src/app/characterInput' in tools/characterInput.ts:7:52`.
- Code: `src/app/characterInput.ts` is the desktop-DOM boundary only. It returns quantized Task 1 `CharacterInputCommand` data: WASD/arrows movement, `J` attack, `Space` dash, `K` skill, held `L` guard, and `R` restart. Non-repeated actions replace the pending action and snapshot movement at action keydown; `consumeCommand()` clears exactly one queued action. A zero snapshot remains `(0, 0)` for simulation facing fallback. Character state/simulation, legacy input/session/render/network/touch modules, balance, and plans/specs were not modified.
- Observations: `npm run smoke:character-input` 14/14; `npm run smoke:touch-input` 19/19; `npm run build` exit 0 (2026-07-28 console).
- `[UNSUPPORTED]`: the source remains unconnected to character UI/session, so browser and human-device behavior are unobserved. The headless smoke covers queue conversion only.
- Next: Core Plan Task 3 owns character simulation/action lifecycle. Claude return time remains `[UNSUPPORTED]`; Codex return time is this task handoff.
