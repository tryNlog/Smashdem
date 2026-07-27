# Smashdem — 로그라이크 팽이 배틀

상대를 밀어 회전력을 깎는 2D 팽이 배틀입니다. 한 판을 이길 때마다 파츠를 **3택 1**로 골라 빌드를 쌓고, 12판 런 완주를 노리는 싱글플레이(봇전) 로그라이크입니다.

**▶ 플레이: https://trynlog.github.io/Smashdem/**

> **WIP (개발 중)** — NAN 2026 사전과제로 제작 중인 프로토타입입니다. 게임 로직·밸런스·연출은 변경될 수 있습니다.
>
> 실시간 PvP의 로컬 relay 소스는 `relay/`에 있으며, 공개 Pages에서 실제 연결하려면 PM이 Cloudflare Worker를 배포하고 `VITE_RELAY_URL`을 GitHub Actions 변수로 등록해야 합니다. 절차는 [DEPLOY.md](DEPLOY.md)에 있습니다.

## 플레이 링크

https://trynlog.github.io/Smashdem/

현재 공개 build에 relay 주소가 없으면 온라인 대전 대기실은 `공개 relay 주소가 아직 설정되지 않았습니다.`를 표시하고, 싱글 봇전은 그대로 시작할 수 있습니다 (`src/main.ts:103-129`).

## 조작법

| 입력 | 동작 | 근거 |
|---|---|---|
| `← ↑ → ↓` / `W A S D` | 이동 | `src/game/playerInput.ts:18-21` |
| `Space` | 대시 버스트 | `src/game/playerInput.ts:22` |
| 클릭 또는 `1` `2` `3` | 보상 파츠 3택 1 선택 | `src/main.ts:168-176,187-204` |
| `R` | 보상 화면에서 리롤(남은 횟수 있을 때) | `src/main.ts:172-176` |
| `M` | 음소거 토글 | `src/main.ts:164-166` |
| `Enter` | 온라인 대기실에서 6자리 방 코드로 참가 | `src/main.ts:143-152` |
| `Esc` | 온라인 대기실에서 출전 선택으로 돌아가기 | `src/main.ts:143-152` |

온라인 대전은 `온라인 대전` → 출전 팽이 선택 → `방 만들기` 또는 `방 참가` 순서입니다. 방장은 표시된 6자리 코드를 상대에게 전달하고, 참가자는 대기실 입력칸에 붙여 넣습니다 (`src/render/screens.ts`, `src/main.ts:103-129`).

## 로컬 실행

싱글 봇전:

```bash
npm install
npm run dev
```

Vite 개발 서버가 로컬 주소를 출력합니다.

로컬 두 브라우저 PvP relay 시험:

```bash
# 터미널 A
npm run relay:dev -- --port 8787

# 터미널 B
npm run dev
```

서로 다른 브라우저 프로필 또는 기기에서 Vite 주소를 열어 방 만들기 → 코드 전달 → 방 참가 → 이동·버스트 → 나가기 순서로 확인합니다. `localhost`와 `127.0.0.1`에서는 relay 주소를 지정하지 않아도 `ws://127.0.0.1:8787`을 사용합니다 (`src/net/onlineClient.ts:66-70`). host 탭이 물리를 계산하므로, 이 시험에서는 host 탭을 백그라운드로 보내지 않습니다 (`src/app/onlineBattle.ts`, `src/engine/fixedTimestep.ts:46-59`).

프로덕션 build와 relay URL 주입 점검:

```bash
npm run build
npm run smoke:relay-build
```

`smoke:relay-build`은 placeholder `wss://relay.example`을 넣어 Vite 산출물에 주소가 포함되는지를 확인하고, 임시 산출물은 스크립트 종료 시 제거합니다 (`tools/relayBuild.mjs`).

## 구조 요약

```
src/
  engine/   고정 스텝 루프 · 시드 PRNG · 벡터
  game/     시뮬레이션 · 런 · 보상 · 봇 · 밸런스 (순수·결정론)
  app/      세션 · 온라인 매치 오케스트레이션 · 격납고
  net/      릴레이 프로토콜 · 브라우저 WebSocket 경계
  render/   캔버스 렌더 · 연출 · 오디오
  main.ts   입력 · 렌더 · 세션 · 온라인 매치 연결
relay/      Cloudflare Durable Object 기반 2인 room relay
tools/      헤드리스 스모크 및 배포 경계 점검
```

`src/game/`은 DOM·시간·전역 난수에 의존하지 않는 결정론 계층입니다. relay는 guest 입력과 host snapshot만 중계하며 물리·승패를 계산하지 않습니다 (`relay/src/router.ts`, `src/app/onlineBattle.ts`).

## 배포

`main` 브랜치 push 시 GitHub Actions(`.github/workflows/deploy.yml`)가 `npm ci → npm run build → dist/`를 GitHub Pages로 올립니다. Vite `base: './'`(`vite.config.ts:7`)는 `/Smashdem/` 하위 경로의 에셋 상대경로를 만듭니다.

Pages에서 온라인 대전을 열려면 Workflow의 Build 단계에 GitHub Actions 변수 `VITE_RELAY_URL`이 있어야 합니다. 이 값은 공개 `wss://...workers.dev` origin만 사용하며 토큰·계정 ID·비밀값을 넣지 않습니다. PM 실행 절차와 확인 항목은 [DEPLOY.md](DEPLOY.md)를 참조합니다.
