import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripLocale, testPageHtml } from '../../preview/dev/test-site.mjs';

const contract = JSON.parse(readFileSync(new URL('../../contract/slots.sample.json', import.meta.url), 'utf8'));

test('stripLocale: 언어 앞부분을 떼고 한국어 주소로', () => {
  assert.deepEqual(stripLocale('/'), { locale: 'ko', path: '/' });
  assert.deepEqual(stripLocale('/ja'), { locale: 'ja', path: '/' });
  assert.deepEqual(stripLocale('/zh-hant/ring/mine'), { locale: 'zh-hant', path: '/ring/mine' });
});

test('시험 페이지: 홈의 칸마다 data-slot · 배경은 data-slot-kind=background · 영상도 받는 칸은 빈 영상 칸', () => {
  const html = testPageHtml(contract, '/ja');
  const homeKeys = contract.slots.filter((s) => s.pageId === 'P01' && s.kind !== 'share' && !s.paths).map((s) => s.key);
  for (const k of homeKeys) assert.ok(html.includes(`data-slot="${k}"`), k);
  assert.match(html, /data-slot="home\.story\.bg" data-slot-kind="background"/);
  assert.match(html, /<video class="vid"/);
  assert.match(html, /<html lang="ja">/);
});
