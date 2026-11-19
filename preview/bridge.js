/*
 * 스튜디오 연결 스크립트 (M2 · PC11) — 미리보기 창 안의 쇼핑몰 사본 화면에만 끼움(proxy.mjs).
 * 사이트 코드 변화 0 · 운영 사이트에는 절대 들어가지 않음.
 * 미리보기 창(다른 포트 = 다른 출처)과 postMessage로만 대화한다.
 *
 * 받는 것(부모 → 이 화면):
 *   { type: 'studio:select', key }                         → 그 칸으로 스크롤 + 1.5초 테두리
 *   { type: 'studio:update', key, lane, url, version }      → 그 칸 그림(또는 영상)을 url?v=version으로 바꿔 끼움
 *     (+ focus {x,y}: 한 파일 칸은 object-position · 배경은 background-position · PC11-스튜디오-3)
 *   { type: 'studio:scrollTo', ratio }                      → 나란히 보기 스크롤 맞추기
 *   { type: 'studio:hello' }                                → 지금 칸 목록 다시 보냄
 * 보내는 것(이 화면 → 부모):
 *   { type: 'studio:ready', path, slots: [{ key, kind, count, visible }] }
 *   { type: 'studio:missing', key }                         → 이 화면에 없는 칸
 *   { type: 'studio:hidden', key, width }                   → 칸은 있지만 이 폭에서 숨음(예: PC에서만 보이는 칸)
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
      if (!map[key]) map[key] = { key: key, kind: kind, count: 0, visible: 0 };
      map[key].count++;
      if (isVisible(el)) map[key].visible++;
    });
    return Object.keys(map).map(function (k) {
      return map[k];
    });
  }

  /** 이 화면 폭에서 실제로 보이는지 (0×0 · display:none이면 숨음 · PC8 B-1: home.story는 휴대폰에서 숨는 칸) */
  function isVisible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
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
    var shown = els.filter(isVisible);
    if (!shown.length) {
      // 칸은 있지만 이 폭에서 숨음 → 미리보기 창이 다른 기기 보기로 바꾸도록 알림
      post({ type: 'studio:hidden', key: key, width: innerWidth });
      return;
    }
    muteScrollUntil = Date.now() + 800;
    shown[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(function () {
      shown.forEach(function (el) {
        outline(el, el.getAttribute('data-slot-kind'));
      });
    }, 350);
  }

  /** 초점 점 { x, y }(0~1) → CSS 위치 글자 · 이상하면 null (PC11-스튜디오-3) */
  function focusCss(f) {
    if (!f || typeof f !== 'object') return null;
    var x = Number(f.x);
    var y = Number(f.y);
    if (!isFinite(x) || !isFinite(y)) return null;
    var p = function (n) { return Math.round(Math.min(1, Math.max(0, n)) * 1000) / 10 + '%'; };
    return p(x) + ' ' + p(y);
  }

  /**
   * 그림 칸에 영상 미리보기(PC8 B-6): 칸의 그림(<picture> 또는 <img>) 자리에 <video muted loop playsinline autoplay>를 끼움.
   * 원래 그림은 숨겨 두고(지우지 않음) 포스터로 씀 · 배경 칸은 칸 맨 뒤에 꽉 차게 깔음. 사본 화면에서만 · 사이트 코드 변화 0
   */
  function injectVideo(el) {
    var img = el.querySelector('img');
    var hideTarget = el.querySelector('picture') || img;
    var v = document.createElement('video');
    ['muted', 'loop', 'playsinline', 'autoplay'].forEach(function (a) { v.setAttribute(a, ''); });
    v.muted = true;
    v.loop = true;
    v.autoplay = true;
    v.playsInline = true;
    v.setAttribute('data-studio-video', '');
    if (img) {
      v.className = img.className || '';
      v.poster = img.currentSrc || img.src || '';
      if (img.style && img.style.objectPosition) v.style.objectPosition = img.style.objectPosition;
    }
    var s = v.style;
    s.position = 'absolute';
    s.left = '0';
    s.top = '0';
    s.width = '100%';
    s.height = '100%';
    s.objectFit = 'cover';
    if (hideTarget && hideTarget.parentNode) {
      hideTarget.setAttribute('data-studio-hidden', '');
      hideTarget.style.display = 'none';
      hideTarget.parentNode.insertBefore(v, hideTarget);
    } else {
      // 배경 칸 등: 칸 맨 뒤에 꽉 차게
      if (!el.style.position) el.style.position = 'relative';
      el.style.isolation = 'isolate'; // 영상은 칸 배경 위 · 칸 글자 아래
      s.zIndex = '-1';
      el.insertBefore(v, el.firstChild || null);
    }
    return v;
  }

  /** 끼운 영상을 빼고 숨긴 그림을 다시 보임 · 뺀 게 있으면 true */
  function restoreVideo(el) {
    var v = el.querySelector('[data-studio-video]');
    if (!v) return false;
    if (v.pause) v.pause();
    if (v.parentNode) v.parentNode.removeChild(v);
    var hidden = el.querySelector('[data-studio-hidden]');
    if (hidden) {
      hidden.removeAttribute('data-studio-hidden');
      hidden.style.display = '';
    }
    return true;
  }

  /** <source>의 media 글자(속성 · 속성값 둘 다 봄) */
  function sourceMedia(s) {
    return String(s.media || (s.getAttribute && s.getAttribute('media')) || '');
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
    var pos = lane === 'image' ? focusCss(msg.focus) : null;
    els.forEach(function (el) {
      if (lane === 'video') {
        // PC8 B-6: 그림만 있는 칸에 mp4를 놓아도 그 자리에 <video>를 끼워 미리보기(전엔 <video>가 없으면 "0곳")
        if (!urls.video || msg.state === 'empty' || msg.state === 'live') {
          // 되돌림(영상 없음) → 끼운 영상을 빼고 원래 그림을 다시 보임
          if (restoreVideo(el)) count++;
          return;
        }
        var v = el.matches('video') ? el : el.querySelector('video');
        if (!v) v = injectVideo(el);
        v.src = withVersion(urls.video, version);
        if (msg.poster) v.poster = withVersion(msg.poster, version);
        if (v.load) v.load();
        if (v.play) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
        count++;
        return;
      }
      // 그림을 놓음: 앞서 끼운 영상이 있으면 빼고 그림으로
      restoreVideo(el);
      if ((el.getAttribute('data-slot-kind') || '') === 'background') {
        var bgUrl = urls.pc || urls.mobile;
        if (bgUrl) {
          el.style.backgroundImage = 'url("' + withVersion(bgUrl, version) + '")';
          count++;
        }
        if (pos) el.style.backgroundPosition = pos;
        return;
      }
      var sources = Array.prototype.slice.call(el.querySelectorAll('source'));
      var imgs = el.matches('img') ? [el] : Array.prototype.slice.call(el.querySelectorAll('img'));
      // <picture> 안 <img>가 무슨 그림인가(PC8 B-10): 사이트 Media · HeroPicture는
      //   <source media="(min-width:1280px)"> = PC 파일 · <img> = 휴대폰 파일(-m-) → img는 휴대폰 그림
      //   (반대로 <source media="(max-width…)"> = 휴대폰이면 img = PC 그림)
      var pcSource = sources.some(function (s) { return /min-width/.test(sourceMedia(s)); });
      var imgRole = !sources.length ? 'any' : pcSource ? 'mobile' : 'pc';
      imgs.forEach(function (img) {
        var u = imgRole === 'mobile' ? urls.mobile : imgRole === 'pc' ? urls.pc : urls.pc || urls.mobile;
        if (!u) return;
        img.removeAttribute('loading');
        if (img.srcset) img.srcset = rewriteSrcset(img.srcset, u, version);
        img.src = withVersion(u, version);
        count++;
      });
      // 초점: 한 파일을 같이 쓰는 칸만 화면 위치로(<picture> 칸은 도우미가 휴대폰 파일을 다시 자름 · PC 위치는 그대로)
      if (pos && !sources.length) imgs.forEach(function (img) { img.style.objectPosition = pos; });
      // <picture> 안 <source>: 모바일 · PC 따로 (약속 v1.1 urls.pc · urls.mobile)
      sources.forEach(function (s) {
        var media = sourceMedia(s);
        var u = /min-width/.test(media) ? urls.pc : media ? urls.mobile : urls.pc;
        if (!u) return;
        s.srcset = rewriteSrcset(s.srcset || u, u, version);
        count++;
      });
    });
    post({ type: 'studio:applied', key: key, version: version, count: count, lane: lane });
  }

  /**
   * 약속 v1.1: slot.updated.urls = { pc?, mobile?, video? } 를 먼저 씀.
   * (v1처럼 url 하나 + target만 오면 target대로 pc · mobile에 나눔)
   */
  function pickUrls(msg) {
    var u = msg.urls || {};
    // v1.1(urls가 있음)이면 urls만 믿음 — 되돌림 신호는 url = 그림 주소라 영상으로 읽으면 안 됨(PC8 B-6)
    if (msg.urls && typeof msg.urls === 'object') return { pc: u.pc, mobile: u.mobile, video: u.video };
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
  // 사본(next dev) 왼쪽 아래 "N" 개발 표시 숨기기(PC2-스튜디오-1) — 사이트 코드는 그대로 · 이 미리보기 창 안에서만
  // 표시는 <nextjs-portal>(열린 shadow DOM) 안 #devtools-indicator · [data-next-badge-root] · 오류 창(대화 상자)은 그대로 보임
  var HIDE_DEV = '#devtools-indicator,[data-next-badge-root]{display:none!important}';
  function hideDevIndicator() {
    try {
      var portal = document.querySelector('nextjs-portal');
      var root = portal && portal.shadowRoot;
      if (!root || root.querySelector('style[data-studio-hide]')) return;
      var s = document.createElement('style');
      s.setAttribute('data-studio-hide', '');
      s.textContent = HIDE_DEV;
      root.appendChild(s);
    } catch (e) { /* 표시를 못 숨겨도 미리보기는 그대로 */ }
  }
  var devMo = new MutationObserver(hideDevIndicator);

  function start() {
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-slot'] });
    devMo.observe(document.body, { childList: true, subtree: false }); // <nextjs-portal>은 body 바로 아래에 붙음
    hideDevIndicator();
    [500, 1500, 4000].forEach(function (ms) { setTimeout(hideDevIndicator, ms); }); // shadow DOM이 늦게 붙는 경우
    announce(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // 시험용으로 꺼내 둠 (node --test)
  window.__studioBridge = { withVersion: withVersion, rewriteSrcset: rewriteSrcset, matchesTarget: matchesTarget, pickUrls: pickUrls, hideDevIndicator: hideDevIndicator };
})();
