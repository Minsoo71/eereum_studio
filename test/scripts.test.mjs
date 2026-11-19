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
