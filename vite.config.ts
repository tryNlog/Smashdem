import { defineConfig } from 'vite';

// base 는 './' 로 둔다.
// GitHub Pages 는 사용자/리포 하위 경로(https://<user>.github.io/<repo>/)로 배포되므로
// 절대경로('/')로 두면 에셋 404 가 난다. 최종 배포 경로는 build-release 역할이 확정한다.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
