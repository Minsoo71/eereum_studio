/*
 * 스튜디오 연결 스크립트 (M2 · PC11) — 미리보기 창 안의 쇼핑몰 사본 화면에만 끼움(proxy.mjs).
 * 사이트 코드 변화 0 · 운영 사이트에는 절대 들어가지 않음.
 * 미리보기 창(다른 포트 = 다른 출처)과 postMessage로만 대화한다.
 *
 * 받는 것(부모 → 이 화면):
 *   { type: 'studio:select', key }                         → 그 칸으로 스크롤 + 1.5초 테두리
 *   { type: 'studio:update', key, lane, url, version }      → 그 칸 그림(또는 영상)을 url?v=version으로 바꿔 끼움
 *   { type: 'studio:scrollTo', ratio }                      → 나란히 보기 스크롤 맞추기
 *   { type: 'studio:hello' }                                → 지금 칸 목록 다시 보냄
 * 보내는 것(이 화면 → 부모):
 *   { type: 'studio:ready', path, slots: [{ key, kind, count }] }
 *   { type: 'studio:missing', key }                         → 이 화면에 없는 칸
 *   { type: 'studio:scroll', ratio }                        → 사용자가 스크롤함
 *   { type: 'studio:applied', key, version, count }         → 바꿔 끼움 끝
 */
(function () {
  'use strict';
  var script = document.currentScript;
  var params = new URL(script ? script.src : location.href, location.href).searchParams;
  var PARENT = params.get('parent') || 'http://localhost:4300'; // 이 출처에서 온 메시지만 받음
  var versions = Object.create(null); // 칸마다 마지막으로 적용한 version (늦게 온 옛 신호 무시)
  var lastSlots = '';
  var muteScrollUntil = 0;

  function post(msg) {
    if (window.parent === window) return;
    window.parent.postMessage(msg, PARENT);
  }

  /** 버전 붙인 주소 (같은 파일 이름이어도 캐시를 피함 · V3) */
  function withVersion(url, version) {
    var u = new URL(url, location.href);
    u.searchParams.set('v', String(version));
    return u.origin === location.origin ? u.pathname + u.search : u.href;
  }

  /** Next 최적화 주소(/_next/image?url=…)도 원래 주소로 바꿔 끼움 (최적화 캐시가 옛 그림을 줌 · PC9 V3) */
  function rewriteSrcset(srcset, url, version) {
    if (!srcset) return srcset;
    return srcset
      .split(',')
      .map(function (part) {
        var bits = part.trim().split(/\s+/);
        bits[0] = withVersion(url, version);
        return bits.join(' ');
      })
      .join(', ');
  }

  function slotElements(key) {
    return Array.prototype.slice.call(document.querySelectorAll('[data-slot="' + cssEscape(key) + '"]'));
  }

  function cssEscape(s) {
    return window.CSS && window.CSS.escape ? window.CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
  }

  function collect() {
    var map = Object.create(null);
    document.querySelectorAll('[data-slot]').forEach(function (el) {
      var key = el.getAttribute('data-slot');
      var kind = el.getAttribute('data-slot-kind') || 'normal';
      if (!map[key]) map[key] = { key: key, kind: kind, count: 0 };
      map[key].count++;
    });
    return Object.keys(map).map(function (k) {
      return map[k];
    });
  }

  function announce(force) {
    var slots = collect();
    var sig = JSON.stringify(slots);
    if (!force && sig === lastSlots) return;
    lastSlots = sig;
    post({ type: 'studio:ready', path: location.pathname, slots: slots });
  }

  function outline(el, kind) {
    var color = kind === 'background' ? '#2b6370' : '#c4a468';
    var box = el.getBoundingClientRect();
    var o = document.createElement('div');
    o.setAttribute('data-studio-outline', '');
    o.style.cssText =
      'position:absolute;pointer-events:none;z-index:2147483647;border:4px solid ' +
      color +
      ';border-radius:4px;box-shadow:0 0 0 9999px rgba(0,0,0,.08);transition:opacity .3s;' +
      'left:' + (box.left + scrollX - 4) + 'px;top:' + (box.top + scrollY - 4) + 'px;' +
      'width:' + (box.width + 8) + 'px;height:' + (box.height + 8) + 'px;';
    if (box.width === 0 || box.height === 0) {
      // 비어 있는 칸(예: 영상 칸)도 보이게 최소 크기로
      o.style.width = '120px';
      o.style.height = '40px';
      o.textContent = el.getAttribute('data-slot');
      o.style.font = '600 11px system-ui';
      o.style.color = color;
      o.style.background = 'rgba(255,255,255,.85)';
    }
    document.body.appendChild(o);
    setTimeout(function () {
      o.style.opacity = '0';
    }, 1500);
    setTimeout(function () {
      o.remove();
    }, 1900);
  }

  function select(key) {
    var els = slotElements(key);
    if (!els.length) {
      post({ type: 'studio:missing', key: key });
      return;
    }
    muteScrollUntil = Date.now() + 800;
    els[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(function () {
      els.forEach(function (el) {
        outline(el, el.getAttribute('data-slot-kind'));
      });
    }, 350);
  }

  function apply(msg) {
    var key = msg.key;
    var version = Number(msg.version) || Date.now();
    if (versions[key] && versions[key] >= version) return; // 옛 신호
    var els = slotElements(key);
    if (!els.length) {
      post({ type: 'studio:missing', key: key });
      return;
    }
    versions[key] = version;
    var lane = msg.lane === 'video' ? 'video' : 'image';
    var urls = pickUrls(msg);
    var count = 0;
    els.forEach(function (el) {
      if ((el.getAttribute('data-slot-kind') || '') === 'background') {
        var bgUrl = urls.pc || urls.mobile;
        if (bgUrl) {
          el.style.backgroundImage = 'url("' + withVersion(bgUrl, version) + '")';
          count++;
        }
        return;
      }
      if (lane === 'video') {
        var v = el.matches('video') ? el : el.querySelector('video');
        if (v && urls.video) {
          v.src = withVersion(urls.video, version);
          if (msg.poster || urls.pc) v.poster = withVersion(msg.poster || urls.pc, version);
          v.load();
          count++;
        }
        return;
      }
      var sources = Array.prototype.slice.call(el.querySelectorAll('source'));
      var imgs = el.matches('img') ? [el] : Array.prototype.slice.call(el.querySelectorAll('img'));
      imgs.forEach(function (img) {
        // <picture>면 img = PC(기본) 그림 · 따로 쓰는 그림 하나뿐이면 받은 것 아무거나
        var u = sources.length ? urls.pc : urls.pc || urls.mobile;
        if (!u) return;
        img.removeAttribute('loading');
        if (img.srcset) img.srcset = rewriteSrcset(img.srcset, u, version);
        img.src = withVersion(u, version);
        count++;
      });
      // <picture> 안 <source>: 모바일 · PC 따로 (약속 v1.1 urls.pc · urls.mobile)
      sources.forEach(function (s) {
        var u = s.media && /min-width/.test(s.media) ? urls.pc : s.media ? urls.mobile : urls.pc;
        if (!u) return;
        s.srcset = rewriteSrcset(s.srcset || u, u, version);
        count++;
      });
    });
    post({ type: 'studio:applied', key: key, version: version, count: count });
  }

  /**
   * 약속 v1.1: slot.updated.urls = { pc?, mobile?, video? } 를 먼저 씀.
   * (v1처럼 url 하나 + target만 오면 target대로 pc · mobile에 나눔)
   */
  function pickUrls(msg) {
    var u = msg.urls || {};
    if (u.pc || u.mobile || u.video) return { pc: u.pc, mobile: u.mobile, video: u.video || (msg.lane === 'video' ? msg.url : undefined) };
    var t = msg.target || 'both';
    return {
      pc: t === 'mobile' ? undefined : msg.url,
      mobile: t === 'pc' ? undefined : msg.url,
      video: msg.lane === 'video' ? msg.url : undefined,
    };
  }

  /** target: 'mobile' | 'pc' | 'both' — <source media>가 그 화면용인지 대충 판단 */
  function matchesTarget(media, target) {
    if (target === 'both') return true;
    var isPc = /min-width/.test(media);
    return target === 'pc' ? isPc : !isPc;
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== PARENT || !e.data || typeof e.data.type !== 'string') return;
    var m = e.data;
    if (m.type === 'studio:select') select(m.key);
    else if (m.type === 'studio:update') apply(m);
    else if (m.type === 'studio:hello') announce(true);
    else if (m.type === 'studio:scrollTo') {
      muteScrollUntil = Date.now() + 300;
      var max = document.documentElement.scrollHeight - innerHeight;
      scrollTo(0, Math.max(0, max * (Number(m.ratio) || 0)));
    }
  });

  var scrollTimer = 0;
  window.addEventListener(
    'scroll',
    function () {
      if (Date.now() < muteScrollUntil) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        var max = document.documentElement.scrollHeight - innerHeight;
        post({ type: 'studio:scroll', ratio: max > 0 ? scrollY / max : 0 });
      }, 60);
    },
    { passive: true },
  );

  // 화면이 늦게 붙는 칸(DeferredMedia)도 잡도록 바뀔 때마다 다시 알림
  var mo = new MutationObserver(function () {
    clearTimeout(mo.t);
    mo.t = setTimeout(announce, 200);
  });
  function start() {
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-slot'] });
    announce(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // 시험용으로 꺼내 둠 (node --test)
  window.__studioBridge = { withVersion: withVersion, rewriteSrcset: rewriteSrcset, matchesTarget: matchesTarget, pickUrls: pickUrls };
})();
