// 설치 · 열기 스크립트(PowerShell 5.1): 한글이 든 .ps1은 UTF-8 BOM이 있어야 함(없으면 ANSI로 읽혀 문법 오류 · G1 준비 때 찾음)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('scripts/*.ps1 = UTF-8 BOM(한글 있으면)', () => {
  for (const f of readdirSync('scripts').filter((n) => n.endsWith('.ps1'))) {
    const b = readFileSync(`scripts/${f}`);
    const nonAscii = b.some((x) => x > 0x7f);
    if (nonAscii) assert.deepEqual([...b.subarray(0, 3)], [0xef, 0xbb, 0xbf], `${f}에 BOM 없음`);
  }
});

// PC2-스튜디오-4(사용자 PC 11-21): WScript.Shell 바로 가기는 이름 · 인자를 ANSI 코드 페이지로 저장 → 그 설정이 한국어가 아닌 PC에서 한글이 ??? → 저장 실패
test('install.ps1 바로 가기: CreateShortcut에는 영문 이름만 · 인자에 한글 폴더(Share) 없음 · 실패해도 설치 안 멈춤', () => {
  const s = readFileSync('scripts/install.ps1', 'utf8');
  const make = s.match(/CreateShortcut\(([^)]*)\)/)[1];
  assert.equal(make, '$tmp');
  assert.match(s, /\$tmp = Join-Path \$Root 'eereum-studio-open\.lnk'/);
  const args = s.match(/\$sh\.Arguments = "([^\n]*)"/)[1];
  assert.doesNotMatch(args, /Share|[가-힣]/);
  assert.match(s, /Move-Item -LiteralPath \$tmp -Destination \(Join-Path \$desk '이미지 스튜디오 열기\.lnk'\)/);
  assert.match(s, /studio-settings\.json/);
  assert.match(s, /catch \{\s*\n\s*Write-Warning "바탕화면 바로 가기를 만들지 못했어요/);
});

test('start.ps1: 설치가 남긴 studio-settings.json에서 Root · Share를 읽음(직접 준 값이 먼저)', () => {
  const s = readFileSync('scripts/start.ps1', 'utf8');
  assert.match(s, /studio-settings\.json/);
  assert.match(s, /\$PSBoundParameters\.ContainsKey\('Share'\)/);
});
