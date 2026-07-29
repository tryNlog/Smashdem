# Smashdem 집 작업 셋업

**작성일:** 2026-07-29  
**대상 브랜치:** `s2-run`  
**라이브 체험:** <https://trynlog.github.io/Smashdem/>  
**소스 리포:** <https://github.com/tryNlog/Smashdem>

## 1. 퇴근 전: 회사 PC에서 한 번만 실행

게임 리포 루트에서 아래 명령을 실행한다.

```powershell
cd "C:\Users\User\Desktop\task_claude\보고 관련\NAN2026\game"
git status --short
git push origin s2-run
```

- `git status --short` 출력이 비어 있는지 먼저 확인한다. 출력이 있으면 집으로 옮길 변경이 아직 커밋되지 않은 상태다.
- `git push origin s2-run`은 개발 브랜치만 origin으로 보낸다. `main`을 바꾸지 않으므로 GitHub Pages 라이브 URL은 이 명령만으로 갱신되지 않는다.
- 원격 push는 PM 계정으로만 수행한다. Codex와 Claude는 이 명령을 실행하지 않는다. (근거: `AGENTS.md` §3)

## 2. 집 PC 최초 설정

사전 설치: Git, Node.js 22 이상. 실제 의존성 기준은 `package-lock.json`과 Pages workflow의 Node 22이다. [UNSUPPORTED] 집 PC에 이미 설치되어 있는지는 여기서 판정할 수 없다.

```powershell
git clone https://github.com/tryNlog/Smashdem.git
cd Smashdem
git switch s2-run
npm ci
npm run dev
```

Vite가 출력한 `Local` 주소를 브라우저에서 연다. 개발 서버를 멈추려면 같은 PowerShell 창에서 `Ctrl+C`를 누른다.

## 3. 집 PC 재개

```powershell
cd <Smashdem-클론-경로>
git fetch origin
git switch s2-run
git pull --ff-only origin s2-run
npm ci
npm run dev
```

`npm ci`는 `node_modules`가 없거나 의존성이 바뀐 경우에 실행한다. 앱을 수정한 뒤에는 아래 범위로 확인한다.

```powershell
npm run build
npm run smoke:character-combat
npm run smoke:character-state
npm run smoke:character-input
npm run smoke:run
```

`src/game/character`를 수정했다면 `npm run smoke:run`은 필수다. (근거: `AGENTS.md` §3)

## 4. Codex 재개 프롬프트

집에서 Codex를 반드시 `Smashdem` 리포 루트로 열고 다음 내용을 전달한다.

```text
AGENTS.md와 docs/RELAY.md를 먼저 읽고, s2-run의 큐 0 Task 4 review fix부터 이어가.
actionHasHit 기반 링아웃 귀속을 defender-owned confirmed knockback source와 명시적 attribution window로 교체한다.
TDD smoke 3건(miss/blocked 뒤 self, 유효 윈도우 안 opponent, 만료 뒤 self)을 추가하고, 로컬 커밋만 한다. push하지 마.
```

`docs/RELAY.md`가 현재 코드 상태와 다음 작업의 최우선 근거다. 설계 문서는 `docs/superpowers/specs/2026-07-28-mouse-aim-guard-matchup-design.md`, 구현 순서는 `docs/superpowers/plans/2026-07-28-mouse-aim-combat-core.md`를 사용한다.

## 5. 회사 PC가 잠들기 전에 push할 수 없을 때

집 PC에서는 마지막으로 origin에 올라간 `s2-run`만 받을 수 있다. 회사 PC의 현재 작업은 커밋되어 있으나 원격 반영 여부는 `git push origin s2-run` 실행 전에는 보장할 수 없다. [UNSUPPORTED]

대안은 회사 PC가 다시 켜진 뒤 §1을 실행하는 것이다. 급하면 `NAN2026\game` 폴더의 소스와 `.git`을 보존한 복사본을 개인 저장공간으로 옮기고, 집에서 `npm ci`를 다시 실행한다. `node_modules`, `dist`, `dist-tools`는 `.gitignore` 대상이라 복사할 필요가 없다. (근거: `.gitignore`)

## 6. 작업 종료 인계

집에서 작업을 멈출 때에는 컴파일되는 단위로 로컬 커밋하고, `docs/RELAY.md`에 마지막 커밋·미해결 항목·다음 큐를 적는다. 원격으로 보내는 시점은 PM이 정한다. (근거: `AGENTS.md` §6)