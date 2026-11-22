// @swc/core 대역(swc-guard.mjs가 진짜를 못 읽을 때만 씀): next-intl 메시지 추출이 쓰는 함수만 두고 불리면 분명한 오류
function fail() {
  throw new Error('[studio] swc-guard: 이 PC에서 @swc/core를 못 읽어(스마트 앱 컨트롤 등) next-intl 메시지 추출(experimental.extract)을 쓸 수 없어요.');
}
module.exports = {
  transform: async () => fail(), transformSync: fail,
  parse: async () => fail(), parseSync: fail,
  print: async () => fail(), printSync: fail,
  minify: async () => fail(), minifySync: fail,
  __studioStub: true,
};
