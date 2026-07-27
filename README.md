# SMASHDEM — 로그라이크 팽이 배틀

상대를 밀어 회전력을 깎는 2D 팽이 배틀. 한 판을 이길 때마다 파츠를 **3택 1**로 골라
빌드를 쌓아 12판 런 완주를 노리는 싱글플레이(대전 상대는 봇) 로그라이크입니다.

> **WIP (개발 중)** — NAN 2026 사전과제로 제작 중인 프로토타입입니다.
> 게임 로직/밸런스/연출은 계속 바뀔 수 있고, 실시간 PvP(S3)는 아직 포함되지 않았습니다.
> 현재 브랜치의 대전은 서버 없이 로컬에서 도는 봇전이라 즉시 실행됩니다.

## 플레이 링크

<!-- TODO: 배포 후 https://<user>.github.io/smashdem/ 기입 -->

## 조작법

| 입력 | 동작 | 근거 |
|---|---|---|
| `← ↑ → ↓` / `W A S D` | 이동 | `src/game/playerInput.ts:18-21` |
| `Space` | 대시 버스트(스킬) | `src/game/playerInput.ts:22` |
| 클릭 또는 `1` `2` `3` | 보상 파츠 3택 1 선택 | `src/main.ts:58-61` |
| `R` | 보상 화면에서 리롤(남은 횟수 있을 때) | `src/main.ts:62-66` |
| `M` | 음소거 토글 | `src/main.ts:54` |

마우스 클릭이 1차 조작이고 숫자키/방향키는 보조입니다 (`index.html:57-61`).

## 로컬 실행

```bash
npm install
npm run dev
```

Vite 개발 서버가 로컬 주소를 출력합니다(기본 `http://localhost:5173`).

프로덕션 빌드:

```bash
npm run build     # tsc --noEmit && vite build → dist/
npm run preview   # 빌드 결과 미리보기
```

## 구조 요약

```
src/
  engine/   고정 스텝 루프 · 시드 PRNG · 벡터 (순수)
  game/     시뮬레이션 · 런 · 보상 · 봇 · 밸런스 (순수, 결정론)
  app/      세션(화면 전환) · 프리셋 · 행어
  render/   캔버스 렌더 · 연출 · 오디오 (상태 읽기 전용)
  main.ts   입력·렌더·오디오·세션 연결 (엔트리 포인트)
tools/      헤드리스 스모크 테스트 (npm run smoke*)
```

시뮬레이션 계층(`src/game/`)은 부작용 없는 결정론 코드이며, DOM/난수 주입은 바깥
계층에서만 합니다 (`src/main.ts:1-11` 계층 경계 설명).

## 배포

`main` 브랜치 push 시 GitHub Actions(`.github/workflows/deploy.yml`)가
`npm ci → npm run build → dist/` 를 GitHub Pages 로 배포합니다.
Vite `base: './'`(`vite.config.ts:7`)로 리포 하위 경로(`/smashdem/`) 배포에서
에셋 경로가 상대경로가 되도록 설정돼 있습니다.
