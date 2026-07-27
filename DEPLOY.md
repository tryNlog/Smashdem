# Smashdem 공개 배포 · 실시간 PvP relay 절차 (PM 실행용)

이 문서는 공개 GitHub Pages와 Cloudflare Worker relay를 연결할 때 PM이 실행하는 순서입니다. 로컬 구현은 `s2-run` 브랜치에 있고, push·GitHub/Cloudflare 로그인·원격 설정은 PM 계정 작업입니다.

## 역할 경계

| 구성 요소 | 담당 | 하는 일 | 하지 않는 일 |
|---|---|---|---|
| GitHub Pages | GitHub Actions | 정적 웹 build 배포 | WebSocket 방·물리 계산 |
| Cloudflare Worker + Durable Object | PM Cloudflare 계정 | 방 코드별 host/guest frame 중계 | 물리·승패·밸런스 계산 |
| 브라우저 host | 플레이어 1명 | 60Hz 시뮬레이션·snapshot 전송 | guest 입력 권한 부여 |
| 브라우저 guest | 플레이어 1명 | 입력 전송·새 snapshot 렌더 | 물리 재계산 |

근거: `src/app/onlineBattle.ts`, `relay/src/router.ts`, `relay/src/index.ts`.

## 0. push 전 공개 노출 확인

Public 리포의 커밋 author name/email은 외부에 보입니다. 현재 설정은 다음 명령으로 확인합니다.

```bash
git config user.name
git config user.email
git remote -v
```

이력의 author를 바꾸는 일은 rebase가 필요할 수 있으므로, 범위·원격 이력 영향을 PM이 판단합니다. 이 절차에서 토큰을 리포 파일·커밋·GitHub Variables에 기록하지 않습니다.

## 1. Cloudflare relay 배포 (PM Cloudflare 로그인 필요)

`relay/wrangler.jsonc`의 Worker 이름은 `smashdem-relay`, Durable Object binding은 `SMASHDEM_ROOM`입니다. PM의 Cloudflare 계정에서 다음을 실행합니다.

```bash
npm install
npm run relay:deploy
```

Wrangler가 출력하는 Worker public origin을 기록합니다. 예시 형태는 `https://smashdem-relay.<account-subdomain>.workers.dev`입니다. 브라우저 WebSocket 값으로는 **같은 origin의 scheme만 `wss://`로 바꾼 값**을 사용합니다.

```text
https://smashdem-relay.<account-subdomain>.workers.dev
wss://smashdem-relay.<account-subdomain>.workers.dev
```

Worker origin 뒤에 `/create`나 `/room/<코드>`를 붙이지 않습니다. 클라이언트가 방 만들기에는 `/create`, 참가에는 `/room/<코드>`를 붙입니다 (`src/net/onlineClient.ts:93-125`).

이 단계는 Cloudflare 계정 인증과 외부 배포를 수행하므로 Codex/Claude가 자동 실행하지 않습니다. Cloudflare의 Wrangler 구성·deploy 문서는 [Cloudflare Workers configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) 및 [Wrangler deploy](https://developers.cloudflare.com/workers/wrangler/commands/workers/)를 참조합니다.

## 2. GitHub Actions 변수 등록 (PM GitHub 권한 필요)

GitHub `tryNlog/Smashdem` 리포에서 다음을 수행합니다.

1. **Settings → Secrets and variables → Actions → Variables**로 이동합니다.
2. **New repository variable**을 선택합니다.
3. Name: `VITE_RELAY_URL`
4. Value: 1단계의 `wss://smashdem-relay.<account-subdomain>.workers.dev`
5. 저장합니다.

이 값은 공개 접속 URL이므로 Actions **Variable**에 둡니다. Cloudflare API token, account ID, private key는 이 변수·소스·문서에 넣지 않습니다.

`.github/workflows/deploy.yml`의 Build 단계는 이 변수를 `npm run build`에 전달합니다. Vite는 `import.meta.env.VITE_RELAY_URL`을 정적 client bundle에 넣고, `tools/relayBuild.mjs`는 placeholder URL로 이 경계를 반복 점검합니다.

## 3. Pages build 재배포

현재 원격은 다음으로 확인합니다.

```bash
git remote -v
git branch --show-current
```

로컬 `s2-run`의 변경을 원격 Pages 트리거 브랜치 `main`에 보냅니다.

```bash
git push origin s2-run:main
```

Actions의 **Deploy to GitHub Pages** workflow에서 build/deploy 기록을 확인합니다. Pages URL은 다음 형태입니다.

```text
https://trynlog.github.io/Smashdem/
```

`VITE_RELAY_URL`이 비어 있는 build는 온라인 대기실에서 연결을 열지 않고 설정 누락 문구를 표시합니다 (`src/main.ts:103-129`). 싱글 봇전은 이 변수와 독립입니다.

## 4. 공개 두 브라우저 확인

시크릿 창 또는 서로 다른 브라우저 프로필 두 개를 준비합니다.

1. 양쪽에서 `https://trynlog.github.io/Smashdem/`을 엽니다.
2. 양쪽에서 `온라인 대전`을 선택하고 출전 팽이를 고릅니다.
3. host는 `방 만들기`를 눌러 6자리 코드를 상대에게 전달합니다.
4. guest는 코드를 입력하고 `방 참가` 또는 Enter를 누릅니다.
5. 양쪽에서 이동·Space 버스트를 입력합니다.
6. host에서 전투 종료 또는 한쪽의 `나가기`를 확인합니다.
7. 두 창의 DevTools Console/Network에서 WebSocket 연결 오류·mixed-content 오류를 기록합니다.

이 절차는 Canvas 입력 배치, Worker 공개 경로, host snapshot, guest 최신 snapshot 반영을 한 번에 관찰합니다. 자동 스모크는 이 UI 경계를 대체하지 않습니다 (`tools/onlineMatchRelay.ts`, `docs/RELAY.md`).

## 5. 로컬 사전 확인

공개 배포 전에 로컬 relay를 쓸 때는 두 터미널을 사용합니다.

```bash
# 터미널 A
npm run relay:dev -- --port 8787

# 터미널 B
npm run dev

# 별도 점검
npm run smoke:online-match-relay
npm run smoke:relay-build
```

`smoke:online-match-relay`은 실제 Node WebSocket으로 local Durable Object relay에 create → join → snapshot → leave frame을 보냅니다. Canvas pointer/keyboard와 공개 Worker URL은 사람 브라우저 점검 대상입니다.

## 확인 목록

| # | 관찰 대상 | 확인 방법 |
|---|---|---|
| L1 | Pages 기본 로딩 | 시크릿 창에서 Pages URL을 열고 Console 오류를 기록 |
| L2 | 상대경로 에셋 | Network에서 `assets/*.js` 응답 상태를 확인 |
| L3 | 공개 relay URL 주입 | `npm run smoke:relay-build`, Actions Build log, 온라인 대기실 상태 문구를 함께 확인 |
| L4 | 두 브라우저 대전 | 4절 create → join → 움직임 → 종료 절차 |
| L5 | 상대 이탈 | 한쪽 `나가기` 후 다른 쪽 문구와 대기실 복귀 관찰 |
| L6 | 모바일 | 모바일 브라우저에서 싱글 런 조작 가능 여부 관찰; 터치 조작은 `docs/RELAY.md` 큐 항목 |

## 알려진 범위

- host 탭이 물리 권위자입니다. host 탭이 브라우저 백그라운드 throttling을 받는 상황은 사람 시험에서 분리 기록합니다 (`src/engine/fixedTimestep.ts:46-59`).
- 방 코드 충돌, TTL, 재접속, host 이탈 후 권위 이전은 구현·운영 정책이 없습니다. 이 수치·정책은 `[UNSUPPORTED]`이며, 현재 host 이탈은 상대에게 이탈 상태를 전달합니다 (`relay/src/router.ts`).
- GitHub Pages만으로 WebSocket relay를 운영하지 않습니다. Durable Object relay가 별도 외부 endpoint입니다.
