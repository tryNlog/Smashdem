# 배포 절차 (PM 실행용)

이 문서는 김현우 PM이 직접 실행할 순서입니다. 파일 준비는 build-release 역할이
s2-run 브랜치에 커밋해 두었고, **push/리포 생성/GitHub 인증은 PM만** 할 수 있습니다.

로컬 상태(이 문서 작성 시점): 브랜치 `s2-run`, remote 없음.

---

## ⚠ push 전에 반드시 확인 — 커밋 identity 공개 노출

Public 리포로 push 하면 **모든 커밋의 author name/email 이 공개**됩니다.
현재 로컬 git identity는 다음과 같습니다 (근거: `git config user.name` / `user.email` 실행 결과):

```
user.name  = tryNlog
user.email = snltpdua@gmail.com
```

- 이 이메일을 외부에 공개하고 싶지 않다면 push **전에** 바꾸세요.
- 이미 쌓인 커밋의 author 를 바꾸려면 히스토리 재작성(rebase)이 필요합니다. 새 커밋만
  바꾸는 것으로는 과거 커밋의 노출을 막지 못합니다.
- GitHub 의 no-reply 이메일(`<ID>@users.noreply.github.com`)로 바꾸는 방법:

```bash
git config user.email "<본인ID>@users.noreply.github.com"
git config user.name  "<공개해도 되는 이름>"
```

  (과거 커밋까지 반영하려면 별도 히스토리 재작성이 필요 — 판단은 PM 몫입니다.)

---

## 순서

### 1. GitHub 에서 빈 public 리포 생성
- New repository → 리포 이름 **`Smashdem`** → **Public** 선택
  - 배포 URL 이 `https://<user>.github.io/Smashdem/` 가 되므로 리포명이 URL 경로가 됨.
  - **URL 경로는 실제 만든 리포 이름의 대소문자를 그대로 따른다** (github.io 경로는 대소문자 구분). 아래 예시는 리포명을 `Smashdem` 으로 만든 경우 기준.
- **"Add a README" / "Add .gitignore" / license 는 모두 체크 해제**
  (README·.gitignore 는 이미 로컬에 있음 — 체크하면 push 시 충돌)

### 2. 로컬에 remote 연결
```bash
git remote add origin https://github.com/<user>/Smashdem.git
```

### 3. s2-run 을 원격 main 으로 push
```bash
git push origin s2-run:main
```
- 워크플로(`.github/workflows/deploy.yml`)는 **main** push 에서 돌도록 돼 있으므로
  원격 브랜치 이름이 `main` 이어야 합니다.

### 4. Pages 소스 설정
- 리포 **Settings > Pages > Build and deployment > Source = "GitHub Actions"** 선택
  (기본값인 "Deploy from a branch" 가 아니라 GitHub Actions 여야 워크플로가 배포함)

### 5. 배포 완료 확인 → URL 획득
- **Actions** 탭 → "Deploy to GitHub Pages" 워크플로 실행이 끝날 때까지 대기
  (build → deploy 두 잡)
- 성공하면 deploy 잡 또는 Settings > Pages 상단에 URL 표시:
  `https://<user>.github.io/Smashdem/`

---

## push 후 검증 체크리스트 (시크릿 창 기준)

self-declaration 금지 — 아래는 PM이 직접 열어 관찰할 항목입니다.

| # | 확인 | 방법 |
|---|---|---|
| L1 | 게임 로딩 · 콘솔 에러 | 시크릿 창에서 `https://<user>.github.io/Smashdem/` 열기, F12 콘솔 확인 |
| L2 | 리포 public | 로그아웃/시크릿 창에서 리포 URL 열림 |
| L3 | 전체 소스 포함 | 리포에 `src/` 전체 + `tools/` 보이는지 (이 브랜치엔 별도 WS 서버 없음, 아래 참고) |
| L4 | 에셋 404 없음 | 시크릿 창 Network 탭에서 `assets/*.js` 200 인지 |
| L5 | WS 연결 | **해당 없음** — 이 브랜치는 서버 없는 봇전(아래 참고) |
| L6 | 모바일 | 폰 브라우저에서 로딩되는지 (캔버스는 `max-width:100%`, `index.html:32-38`) |

### WS 서버 / L5 관련 참고
- 이 브랜치(`s2-run`)에는 WebSocket 서버 코드가 없습니다. 소스 전역에
  `ws://` / `wss://` / `WebSocket` / `localhost` 하드코딩이 코드에 존재하지 않음
  (근거: 코드 검색 결과, `docs/ai-log.md` 안의 dev 서버 주소 언급만 있고 실행 코드 아님).
- 대전 상대는 로컬 봇(`src/game/bot.ts`)이라 서버·콜드스타트 없이 즉시 실행됩니다.
  실시간 PvP(S3)는 아직 미포함 (`src/main.ts:10`).
- 따라서 이번 배포에는 무료 티어 WS 호스팅이 필요 없습니다. PvP 도입 시 별도 작업 필요.
