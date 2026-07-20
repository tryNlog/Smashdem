/**
 * 고정 타임스텝 루프.
 *
 * 시뮬레이션은 항상 같은 dt(=1/60초)로만 전진하고, 렌더는 화면 주사율대로 돈다.
 * 이걸 분리하는 이유:
 *  1) 프레임레이트가 게임플레이(물리 결과)를 바꾸면 안 된다. 144Hz 모니터에서 팽이가
 *     더 빨리 죽는 식의 문제를 원천 차단한다.
 *  2) S3 의 실시간 PvP 는 "틱 번호 + 입력" 을 주고받는다. 틱 길이가 가변이면 동기화가 불가능하다.
 *
 * 시간 소스(performance.now)와 requestAnimationFrame 은 여기(엔진 계층)에만 있고
 * 시뮬레이션 계층으로는 들어가지 않는다.
 */

export interface FixedTimestepOptions {
  /** 시뮬레이션 한 스텝의 길이(초). */
  readonly fixedDeltaSeconds: number;
  /**
   * 한 프레임에서 따라잡을 수 있는 최대 스텝 수.
   * 탭이 백그라운드에 있다가 돌아왔을 때 수천 스텝을 한 번에 돌려 멈춰버리는 것(death spiral) 방지.
   */
  readonly maximumStepsPerFrame: number;
  /** 시뮬레이션 한 스텝 전진. */
  update: (fixedDeltaSeconds: number) => void;
  /**
   * 화면 그리기.
   * interpolationAlpha 는 마지막 스텝 이후 남은 시간의 비율(0~1)이며,
   * 렌더가 스텝 사이를 보간해 부드럽게 그릴 때 쓴다.
   */
  render: (interpolationAlpha: number) => void;
}

export interface FixedTimestepLoop {
  stop: () => void;
}

export function startFixedTimestepLoop(options: FixedTimestepOptions): FixedTimestepLoop {
  const { fixedDeltaSeconds, maximumStepsPerFrame, update, render } = options;

  let accumulatorSeconds = 0;
  let previousTimeMilliseconds = performance.now();
  let animationFrameHandle = 0;
  let running = true;

  function frame(currentTimeMilliseconds: number): void {
    if (!running) return;
    animationFrameHandle = requestAnimationFrame(frame);

    let elapsedSeconds = (currentTimeMilliseconds - previousTimeMilliseconds) / 1000;
    previousTimeMilliseconds = currentTimeMilliseconds;

    // 탭 복귀·브레이크포인트 등으로 생긴 거대한 간격은 잘라낸다.
    const maximumElapsedSeconds = fixedDeltaSeconds * maximumStepsPerFrame;
    if (elapsedSeconds > maximumElapsedSeconds) elapsedSeconds = maximumElapsedSeconds;
    if (elapsedSeconds < 0) elapsedSeconds = 0;

    accumulatorSeconds += elapsedSeconds;

    let stepsThisFrame = 0;
    while (accumulatorSeconds >= fixedDeltaSeconds && stepsThisFrame < maximumStepsPerFrame) {
      update(fixedDeltaSeconds);
      accumulatorSeconds -= fixedDeltaSeconds;
      stepsThisFrame += 1;
    }

    render(accumulatorSeconds / fixedDeltaSeconds);
  }

  animationFrameHandle = requestAnimationFrame(frame);

  return {
    stop(): void {
      running = false;
      cancelAnimationFrame(animationFrameHandle);
    },
  };
}
