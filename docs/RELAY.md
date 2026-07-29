# RELAY.md — Smashdem 릴레이 바통

> Claude ↔ Codex 세션 제한 릴레이의 인계 상태 파일. **작업 시작 전 읽고, 손 떼기 전 갱신한다.** 규칙 전문은 리포 루트 `AGENTS.md`.

## 현재 상태 (last updated: 2026-07-29, by Codex)
- **현재 담당:** Task 4 독립 검토에서 발견한 링아웃 귀속 수정 대기. `5575878`은 가드·카운터·링아웃·타임아웃 판정과 character combat smoke를 추가했다. 검토 결과, `actionHasHit`가 빗나감·가드됨 뒤에도 recovery 동안 남아 이후 자력 링아웃을 상대 귀속으로 오분류할 수 있다. 수정 커밋은 현재 로컬 `git log --oneline -8`에 없으며, Task 5는 시작하지 않았다.
- **코어 상태:** `7715a53`은 aim/state 이행, `0efaf93`은 포인터 입력 경계, `ca95c13`은 mouse-button chord 보정이다. `30bc060`·`ae08f4a`은 lifecycle과 순서 보정, `5575878`은 hit·가드·카운터·링아웃·타임아웃 판정이다. 세션·렌더·장비·봇·네트워크 v2 연결은 여전히 범위 밖이다.
- **조작·가드 보완 계약:** `docs/superpowers/specs/2026-07-28-mouse-aim-guard-matchup-design.md` — PM이 키보드 이동/마우스 조준 분리, 좌클릭 공격, `E` 스킬, 우클릭 무제한 전면 가드, 이동방향 대시, 256단계 조준, 대시 가드브레이크 넉백 증폭, 좌클릭 반격을 결정했다. 서면 검토 발견 사항은 §8 보정 규칙으로 반영됐고, PM이 2026-07-28 재검토에서 옵션 1(§8.6 봇 순서 명시, §8.1 리셋 동결 이동 거부, RELAY 참조 정리)을 승인했다. 대체 구현 계획은 `docs/superpowers/plans/2026-07-28-mouse-aim-combat-core.md`로 작성됐다(보완 문서 §8 인용, §8.8 요건 충족 — Codex 구현·PM 판정 대기).
- **전환 기준:** 기본 계약은 `docs/superpowers/specs/2026-07-28-character-arena-design.md`, 입력·관성·상성 가드 보완 계약은 `docs/superpowers/specs/2026-07-28-mouse-aim-guard-matchup-design.md`다. 후자의 서면 검토와 PM 승인은 2026-07-28에 기록됐다. 새 구현 계획은 보완 문서 §8을 인용해야 하며, 두 문서가 충돌하면 보완 문서 §8이 우선한다.
- **로컬 복귀선:** `spinner-baseline-2026-07-28` → `f97bca1` (원격 전송 금지). 8/2 23:00에는 기본 계약 문서(`2026-07-28-character-arena-design.md`) §8.2의 4개 관측으로 캐릭터 후보/태그 기준을 PM이 선택한다(보완 문서의 §8.2와 다른 절이니 혼동 금지).
- **Claude 제한 해제 예정 시각:** `[UNSUPPORTED]` — 마지막 메시지는 "monthly spend limit"만 표시했고, 복귀 시각을 제공하지 않았다. 다음 Claude 제한 메시지에 시각이 있으면 이 줄에 기록한다.
- **Codex 복귀 가능 시각:** `[UNSUPPORTED]` — 현재 세션에서 제한 해제 시각이 제공되지 않았다.
- **브랜치:** `s2-run`; 최신 로컬 커밋은 Task 4 인계 문서 `99c6bae`, 최신 기능 커밋은 `5575878`이다. remote `origin`은 `https://github.com/tryNlog/Smashdem.git`이고, **push 금지**.
- **트리:** 작업 시작 전 `git log --oneline -5`·`git status`로 코드·문서 커밋을 함께 확인한다. remote push는 PM 전용이다.
## 진행 중 작업
- **S3 공개 relay 배선:** `1ad9f62`에 GitHub Actions `VITE_RELAY_URL` 주입, direct Vite env access, local relay build smoke, PM Cloudflare/Pages 절차가 있다. 공개 Worker endpoint와 Canvas 두 브라우저 관찰은 PM 게이트다.
- **PM 게이트:** Cloudflare 로그인·`npm run relay:deploy`·GitHub Actions 변수 등록·원격 push·공개 Worker/Canvas 두 브라우저 관찰은 PM 계정과 브라우저가 필요한 작업이다. PM 부재 시 모바일 조작·제출물 큐로 이동한다.
## 다음 작업 큐 (우선순위 순, 각 완료 기준 포함)
0. **[Task 4 review fix] 링아웃 귀속 윈도우** — `actionHasHit` 기반 귀속을 제거한다. 비가드 hit가 실제 넉백을 준 뒤에만 defender-owned `lastKnockbackSourceIndex`와 명시적 남은 시간을 설정하고, reset·clone·tick에서 결정론적으로 관리한다. (a) miss/blocked action 뒤 자력 링아웃은 self-inflicted, (b) 윈도우 안의 확인된 넉백 뒤 링아웃은 opponent-inflicted, (c) 윈도우 만료 뒤 자력 링아웃은 self-inflicted를 smoke로 고정한다. 시간 상수는 `[UNSUPPORTED]`로 기록한다. 이 수정의 독립 재검토 기록 전에는 Task 5를 시작하지 않는다.
1. **[대기] 장비·12판 런 이행** — 독립 검토 기록 뒤에만 `equipment.ts`와 무기/방어구/장신구 보상·강화·격납고 변환을 시작한다. 싱글플레이 플랜에는 보완 문서 §8.5 대체표(counterWindow 등)가 선행돼야 한다.
2. **봇·링아웃·측정** — 새 봇 4티어와 링아웃 체력 페널티. 봇 결정 순서는 보완 문서 §8.6의 7단계를 따른다. 미러봇은 활성화하지 않는다.
3. **PvP v2** — 새 입력·장비 ID를 protocol/relay/two-tab 경로에 반영한다. 8/2 23:00 전 관측이 없으면 로컬 2인 범위로 강등한다.
4. **제출물** — 게임 소개·실행 방법 PDF(#3), AI 활용 기술 PDF(#4), 30~60초 영상.
## 인계 로그 (append-only, 최신이 위)
### 2026-07-29 — 퇴근/집 작업 인계 준비
- 실제 확인(2026-07-29 콘솔): `git log --oneline -8`의 최상단은 `99c6bae docs: hand off matchup guard combat`, 기능 최상단은 `5575878 feat(character): resolve matchup guard combat`이다. `git status --short` 출력은 비어 있었다. 따라서 Task 4 귀속 수정 라운드는 아직 로컬 커밋에 없다.
- 독립 검토 발견: `src/game/character/combatResolution.ts`의 `actionHasHit` 스캔은 miss/blocked 뒤 recovery까지 남는 flag를 inflictor 근거로 사용한다. 다음 구현은 action flag가 아니라 defender-owned confirmed knockback source + 명시적 attribution window를 써야 한다.
- 집 동기화: PM이 회사 PC에서 `git push origin s2-run`을 실행하면 현재 개발 브랜치만 origin에 보낸다. `main`을 갱신하지 않으므로 Pages 라이브 화면은 이 명령으로 바뀌지 않는다. 집 절차는 리포 밖 `../04_집작업_셋업.md`에 기록한다. Codex는 push하지 않는다.
- 다음: 집 Codex는 이 문서와 `AGENTS.md`를 읽고 큐 0의 Task 4 review fix부터 TDD로 이어간다. Claude 제한 해제 시각은 여전히 `[UNSUPPORTED]`이다.

### 2026-07-28 — Codex Task 4 matchup guard resolution → independent review
- 코드 커밋: `5575878 feat(character): resolve matchup guard combat`. 경로: `src/game/character/combatResolution.ts`, `src/game/character/simulation.ts`, `tools/characterCombat.ts`. remote/remote push는 변경하지 않았다.
- TDD red: production `combatResolution.ts`를 만들기 전 `npm run smoke:character-combat`은 exit 1과 `[UNRESOLVED_IMPORT] Could not resolve '../src/game/character/combatResolution' in tools/characterCombat.ts`을 출력했다.
- 실제 관측(2026-07-28 콘솔): `smoke:character-state` 21/21, `smoke:character-input` 30/30, `smoke:character-combat` 68/68, scripted byte-equal 8/8, `npm run build` exit 0, `smoke:run` 동일 시드 8/8. `git diff --check`은 공백 오류를 출력하지 않았고, `src/game/character` 금지 API 정적 검색은 매치를 출력하지 않았다.
- 판정 배선: 전면 공격/스킬은 피해·넉백 0과 counter refresh, 후면은 bypass, guarded dash는 각도와 무관하게 health damage + 1.60 knockback, reinforced counter만 stagger, ring-out은 health penalty 뒤 중앙 spawn/reset freeze, timeout은 health→center→draw 순서다. 수치 적합성은 전부 `[UNSUPPORTED]`이다.
- 리뷰 경계: `actionHasHit`만 현재 hit inflictor 분류의 근거라, 한 action recovery를 넘는 밀려남의 self/opponent attribution은 미측정 `[UNSUPPORTED]`이다. 장비·봇·session/renderer·PvP v2·push는 시작하지 않았다.
- 다음: `5575878` 독립 검토 후, 리뷰 결과를 이 문서와 `docs/ai-log.md`에 기록한다. Claude 제한 해제 시각은 여전히 `[UNSUPPORTED]`이다.
### 2026-07-28 — Codex Task 3 scoped re-review 기록 → Task 4 전환
- fix 범위: `a5fe6ae..eb21a70`. re-review는 dash impulse의 hit-phase clamp 제거와 rejected action 뒤 guard transition 두 항목을 각각 ADDRESSED로 기록했고, fix diff의 새 Critical·Important 항목을 보고하지 않았다.
- controller 재실행(2026-07-28 콘솔): `npm run smoke:character-combat` 27/27, `npm run smoke:run` 동일 시드 8/8, `npm run build` exit 0.
- review 보류 확인: `src/game/character` 금지 API 경계 검색은 `rg -P` 결과 0건이었다. `createCharacterBattleState()`가 배열을 0/1 인덱스 순서로 구성하고, `src`/`tools`의 `combatants.sort|reverse|splice|unshift` 및 직접 재할당 검색도 0건이었다. 외부가 public state 배열을 임의 재배열하는 경우는 현재 contract 밖 `[UNSUPPORTED]`이다.
- 다음: Task 4는 Task 3 simulation의 placeholder를 combat resolution으로 교체한다. 장비·봇·세션/렌더·push는 범위 밖이다.

### 2026-07-28 — Codex Task 3 review fix round 1 handoff → re-review
- 리뷰 입력: (1) dash impulse 직후 global clamp가 movement drag보다 앞섰고, (2) rejected non-none action이 guard held/release 처리를 막았다.
- 코드 커밋: `ae08f4a fix(character): honor lifecycle ordering on rejected dash`. `applyDashImpulses()`의 immediate clamp를 제거해 movement 단계가 drag 후 shared global clamp를 수행하게 했고, rejected action 뒤의 early return을 제거해 같은 tick의 guard 전이가 평가되게 했다. Task 4 resolution은 건드리지 않았다.
- TDD red 1: `npm run smoke:character-combat` → `Error: a rejected zero-direction dash must still release guard in the same tick`. 해당 반환 제거 뒤 같은 smoke는 다음 red로 진행했다.
- TDD red 2: `npm run smoke:character-combat` → `Error: a dash impulse must reach movement drag before the shared global clamp`.
- 관측(2026-07-28 콘솔): `smoke:character-combat` 27/27, `smoke:character-state` 21/21, `npm run build` exit 0, `smoke:run` 동일 시드 8/8. 수치 적합성과 사람 조작감은 `[UNSUPPORTED]`이다.
- 다음: `30bc060..ae08f4a` re-review를 먼저 기록한다. Task 4, session/renderer/network, remote push는 시작하지 않는다.
### 2026-07-28 — Codex Task 3 fixed-tick lifecycle handoff → independent review
- 구현 커밋: `30bc060 feat(character): add aim-step simulation lifecycle`. remote push·remote 변경은 하지 않았다.
- 범위: events clear → tick/clock → timer → validated input/action/guard → dash impulse placeholder → movement 순서를 `src/game/character/simulation.ts`에 기록했다. hit/guard cone/damage/ring-out/time-limit resolution은 Task 4 자리표시자로 남았다.
- TDD red: production 모듈 전 `npm run smoke:character-combat`은 exit 1과 `[UNRESOLVED_IMPORT] Could not resolve '../src/game/character/simulation'`을 출력했다. 후속 회귀 red는 ready phase의 invalid `actionAimStep`이 무시되는 경로로, `Error: invalid action aim steps must throw before a non-fighting phase can ignore them`을 출력했다.
- 관측(2026-07-28 콘솔): `npm run smoke:character-combat` 25/25, `npm run smoke:character-state` 21/21, `npm run build` exit 0, `npm run smoke:run` 동일 시드 8/8. 수치 적합성과 사람 조작감은 `[UNSUPPORTED]`이다.
- 다음: `30bc060` 독립 리뷰를 먼저 기록한다. Task 4, session/renderer/network, remote push는 시작하지 않는다.
### 2026-07-28 — Codex Task 2 chord fix re-review 기록 → Task 3 전환
- 이전 Important 항목: RMB held 중 LMB action과 LMB held 중 RMB release의 button transition이 `pointerdown`/`pointerup`에 의존해 누락될 수 있었다.
- fix 범위: `bcb76bc..9675b6a`. scoped re-review는 `mousedown`/`mouseup` 전이와 chord smoke를 대조해 해당 항목을 ADDRESSED로 기록했고, fix diff의 새 Critical·Important 항목을 보고하지 않았다.
- controller 재실행(2026-07-28 콘솔): `npm run smoke:character-input` 30/30, `npm run build` exit 0. Task 2 agent가 기록한 `smoke:touch-input` 19/19 및 `smoke:character-state` 21/21은 구현 보고에 있으며, 이번 controller 재실행에서는 focus scope 밖이라 반복하지 않았다.
- 다음: Task 3은 `src/game/character/simulation.ts`와 `tools/characterCombat.ts`를 새로 도입한다. Task 4 판정·세션/렌더 연결·push는 범위 밖이다.

### 2026-07-28 — Codex Task 2 review fix round 1 handoff
- 리뷰 지적: 이전 `pointerdown`/`pointerup`은 multi-button chord의 각 버튼 전이를 받지 않아, RMB held 중 LMB action과 LMB held 중 RMB release가 누락될 수 있었다.
- TDD red: `tools/characterInput.ts`을 `mousedown`/`mouseup` fake event model로 바꾸고 RMB→LMB chord assertion을 추가했다. 수정 전 `npm run smoke:character-input`은 exit 1과 `Error: holding RMB while LMB is pressed must keep guard held and queue an attack`을 출력했다.
- 코드 커밋: `ca95c13 fix(character): handle mouse button chords`. `src/app/characterInput.ts`의 action/guard button listeners만 `mousedown`/`mouseup`으로 교체했고, pointer 좌표는 기존 `pointermove`와 mouse-down record 경로에 유지한다. `pointerdown`/`pointerup` listener는 남기지 않아 action double-queue를 피한다.
- 관측(2026-07-28 콘솔): `smoke:character-input` 30/30, `smoke:touch-input` 19/19, `smoke:character-state` 21/21, `npm run build` exit 0. `src/game/`은 수정하지 않았고 `smoke:run`은 실행하지 않았다.
- 다음: reviewer는 `0efaf93..ca95c13` fix diff만 재검토한다. Task 3/4·session/renderer·push는 범위 밖이다.

### 2026-07-28 — Codex Task 2 pointer input boundary handoff
- 구현 커밋: `0efaf93 feat(character): replace input with pointer aim boundary`. remote push·remote 변경은 하지 않았다.
- 범위: `src/app/characterInput.ts`은 `CharacterPointerInputSource`를 내보내고, raw pointer 좌표를 모듈 안에만 저장한다. `consumeCommand()`은 WASD/방향키 이동축, 256-step `aimStep`, 좌클릭/E action aim snapshot, zero-direction 거부가 있는 Space dash movement snapshot, 우클릭 held guard만 반환한다. `J/K/L`은 action binding이 아니다.
- TDD red: `npm run smoke:character-input`이 exit 1과 `[MISSING_EXPORT] "createCharacterPointerInputSource" is not exported by "src/app/characterInput.ts"` (`tools/characterInput.ts:8:10`)을 출력했다.
- green 관측(2026-07-28 콘솔): `smoke:character-input` 28/28, `smoke:touch-input` 19/19, `smoke:character-state` 21/21, `npm run build` exit 0. `src/game/character` 대상 `rg`에서 DOM/clock/random/pointer-coordinate API 매치는 0건이었다. `git diff --check`은 공백 오류를 출력하지 않았다.
- 계획 예시의 고정 포인터 좌표 `(pointer 200,100; origin 100,200)`은 §8.2 양자화 식에서 step 224(우상향)다. Task 2 smoke는 step 192(상향)를 검증하려고 origin `(200,200)`을 사용했다. 구현은 계획의 `Math.atan2` 식을 그대로 따른다.
- 다음: Task 2 독립 검토를 먼저 기록한다. Task 3/4는 미착수이며, session/renderer가 `setFighterScreenOrigin()`을 호출하는 연결도 다음 범위다.

### 2026-07-28 — Codex Task 1 독립 리뷰 기록 → Task 2 전환
- 리뷰 범위: `2c3fa2d..28181a1`, Task 1 brief·보완 명세 §8.2~§8.5·구현 보고·생성된 diff package를 대조했다. reviewer는 Critical·Important·Minor 항목을 보고하지 않았고, 실제 실행/remote push 여부는 diff만으로 판정할 수 없다고 분리했다.
- controller 재실행(2026-07-28 콘솔): `npm run smoke:character-state` 21/21, `npm run smoke:character-input` 14/14, `npm run build` exit 0, `npm run smoke:run` 동일 시드 8/8. `git status --short` 출력은 비어 있었다.
- 다음: Task 2는 `src/app/characterInput.ts`과 `tools/characterInput.ts`을 포인터 조준 경계로 교체한다. `LegacyCharacterInputCommand` 및 `actionDirectionX/Y`는 Task 2 이행 대상이다. push 금지.
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
