// 사본(next dev)을 켤 때 NODE_OPTIONS --import로 끼우는 "swc 대역" 훅 (PC2-스튜디오-5 · 6)
// 왜: @swc/core 1.16은 실행 때 진짜 부품을 AppData\Local\swc\…\<해시>.node에 새로 풀어 놓고 읽음
//     → Windows 스마트 앱 컨트롤이 "처음 보는 서명 없는 파일"이라 막음(노트북 11-22 · ERR_SWC_NATIVE_LOAD)
//     → next-intl/plugin이 맨 위에서 require('@swc/core') 하다 터져 next.config.ts를 못 읽음
// 무엇: next-intl이 @swc/core를 부를 때 먼저 진짜를 읽어 보고, 실패할 때만 대역(swc-stub.cjs)으로 바꿈
//     next-intl은 @swc/core를 메시지 추출(experimental.extract)에만 씀 → 쇼핑몰은 안 씀 → 대역이어도 같은 동작
//     막힘 없는 PC = 진짜 그대로(바뀜 0) · 쇼핑몰 저장소 0줄
import { registerHooks, createRequire } from 'node:module';

export const STUB_URL = new URL('./swc-stub.cjs', import.meta.url).href;
export const GUARD_MARK = '[studio] swc-guard';

let nativeOk; // 한 번만 확인
let checking = false; // 확인하는 동안 이 훅이 다시 불려도 그대로 통과

export function fromNextIntl(parentURL) {
  return /[\/]next-intl[@\/]/.test(decodeURIComponent(String(parentURL || '')));
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const r = nextResolve(specifier, context);
    if (checking || specifier !== '@swc/core' || !fromNextIntl(context.parentURL)) return r;
    if (nativeOk === undefined) {
      checking = true;
      try { createRequire(context.parentURL)('@swc/core'); nativeOk = true; }
      catch (e) {
        nativeOk = false;
        process.stderr.write(`${GUARD_MARK}: @swc/core 네이티브를 못 읽음 → 대역으로 켬 (${e.code || e.message})\n`);
      }
      finally { checking = false; }
    }
    return nativeOk ? r : { url: STUB_URL, format: 'commonjs', shortCircuit: true };
  },
});
