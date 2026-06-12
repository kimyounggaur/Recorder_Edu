/* ============================================================
   리코더 교실 — 코어 (상태 · 오디오 · SVG · 전역 컨트롤 · 팔레트)
   바닐라 JS, 외부 라이브러리 없음. file:// 에서도 동작.
   ============================================================ */
'use strict';

/* ---------- 안전한 저장소 (localStorage 예외 처리 + 메모리 폴백) ---------- */
const Store = (() => {
  let ok = true;
  try {
    localStorage.setItem('rcd.__t', '1');
    localStorage.removeItem('rcd.__t');
  } catch (e) { ok = false; }
  const mem = {};
  return {
    ok,
    get(key, fallback) {
      try {
        const raw = ok ? localStorage.getItem(key) : (key in mem ? mem[key] : null);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try {
        const raw = JSON.stringify(value);
        if (ok) localStorage.setItem(key, raw); else mem[key] = raw;
        return true;
      } catch (e) {
        toast('저장 공간이 부족해요. 보관함에서 데이터를 정리해 주세요.');
        return false;
      }
    },
    remove(key) {
      try { if (ok) localStorage.removeItem(key); delete mem[key]; } catch (e) { /* 무시 */ }
    },
  };
})();

/* ---------- 전역 상태 ---------- */
const State = {
  theme:   Store.get('rcd.theme', null),        // null=시스템 따름 | 'light' | 'dark'
  sound:   Store.get('rcd.sound', true),
  motion:  Store.get('rcd.motion', false),      // true = 모션 줄이기
  system:  Store.get('rcd.system', 'G'),        // 'G' 독일식(학교 표준) | 'B' 바로크식
  favs:    new Set(Store.get('rcd.favs', [])),
  recent:  Store.get('rcd.recent', []),         // [{type,id}]
  collections: Store.get('rcd.collections', []),// [{id,name,items:[noteId]}]
  progress: Object.assign({ prep: [], sets: [], seen: [], songs: [] }, Store.get('rcd.progress', {})),
  quizBest: Store.get('rcd.quizBest', {}),
  toured:  Store.get('rcd.toured', false),
};
function saveState() {
  Store.set('rcd.theme', State.theme);
  Store.set('rcd.sound', State.sound);
  Store.set('rcd.motion', State.motion);
  Store.set('rcd.system', State.system);
  Store.set('rcd.favs', [...State.favs]);
  Store.set('rcd.recent', State.recent);
  Store.set('rcd.collections', State.collections);
  Store.set('rcd.progress', State.progress);
  Store.set('rcd.quizBest', State.quizBest);
  Store.set('rcd.toured', State.toured);
}

/* ---------- 짧은 도우미 ---------- */
const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const reducedMotion = () =>
  State.motion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 현재 표기 체계의 운지 가져오기 */
function fingeringOf(note, system) {
  const sys = system || State.system;
  return (sys === 'G' && note.fG) ? note.fG : note.f;
}

/* 운지를 말로 풀기 (접근성 + 설명) */
function fingeringText(note, system) {
  const f = fingeringOf(note, system);
  const parts = [];
  if (f.t === 1) parts.push('뒤 구멍');
  else if (f.t === 0.5) parts.push('뒤 구멍 반만(핀치)');
  const nums = [];
  f.h.forEach((v, i) => {
    if (v === 1) nums.push(String(i + 1));
    else if (v === 0.5) nums.push((i + 1) + '번 반만');
  });
  if (nums.length) parts.push(nums.join('·') + '번');
  if (!parts.length) return '모든 구멍을 열어요';
  return parts.join(' + ') + ' 막기';
}

/* ---------- 토스트 (aria-live) ---------- */
let toastTimer = null;
function toast(msg) {
  const region = $('#toastRegion');
  if (!region) return;
  region.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  region.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), reducedMotion() ? 0 : 260);
  }, 2200);
}

/* ---------- 오디오 엔진 (Web Audio — 리코더 톤 합성) ---------- */
const AudioEngine = (() => {
  let ctx = null, master = null, comp = null;
  let activeNodes = new Set();
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      comp = ctx.createDynamicsCompressor();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  /* 한 음 재생: 삼각파 + 위 배음 + 로우패스 + 입김(chiff) */
  function play(freq, dur = 0.9) {
    if (!State.sound) return false;
    const c = ensure(); if (!c) return false;
    const t0 = c.currentTime + 0.01;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(0.9, t0 + 0.035);
    out.gain.setValueAtTime(0.9, t0 + Math.max(0.05, dur - 0.12));
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = Math.min(6500, freq * 4);
    const o1 = c.createOscillator();
    o1.type = 'triangle'; o1.frequency.value = freq;
    const g1 = c.createGain(); g1.gain.value = 0.8;
    const o2 = c.createOscillator();
    o2.type = 'sine'; o2.frequency.value = freq * 2;
    const g2 = c.createGain(); g2.gain.value = 0.10;
    /* 부드러운 비브라토 */
    const lfo = c.createOscillator(); lfo.frequency.value = 5.2;
    const lfoG = c.createGain(); lfoG.gain.value = freq * 0.004;
    lfo.connect(lfoG); lfoG.connect(o1.frequency);
    o1.connect(g1); o2.connect(g2);
    g1.connect(lp); g2.connect(lp);
    lp.connect(out); out.connect(master);
    /* 입김 소리 (시작 순간의 숨) */
    const nLen = 0.06;
    const buf = c.createBuffer(1, c.sampleRate * nLen, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = c.createBufferSource(); noise.buffer = buf;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = freq * 2; nf.Q.value = 1.2;
    const ng = c.createGain(); ng.gain.value = 0.12;
    noise.connect(nf); nf.connect(ng); ng.connect(out);
    o1.start(t0); o2.start(t0); lfo.start(t0); noise.start(t0);
    const stopAt = t0 + dur + 0.05;
    o1.stop(stopAt); o2.stop(stopAt); lfo.stop(stopAt); noise.stop(stopAt);
    const handle = { nodes: [o1, o2, lfo, noise], gain: out };
    activeNodes.add(handle);
    o1.onended = () => activeNodes.delete(handle);
    return true;
  }
  function stopAll() {
    if (!ctx) return;
    activeNodes.forEach(h => {
      try {
        h.gain.gain.cancelScheduledValues(ctx.currentTime);
        h.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02);
        h.nodes.forEach(n => { try { n.stop(ctx.currentTime + 0.06); } catch (e) {} });
      } catch (e) { /* 이미 멈춤 */ }
    });
    activeNodes.clear();
  }
  return { play, stopAll };
})();

/* 음 재생 + 시각 피드백 + 기록 */
function playNote(noteId, dur, fxEl) {
  const note = NOTE_MAP[noteId];
  if (!note) return;
  const played = AudioEngine.play(note.freq, dur || 0.9);
  if (!played && !State.sound) toast('소리가 꺼져 있어요. 오른쪽 위 스피커를 켜 보세요.');
  if (fxEl && !reducedMotion()) {
    fxEl.classList.remove('play-feedback');
    void fxEl.offsetWidth; /* 리플로우로 애니메이션 재시작 */
    fxEl.classList.add('play-feedback');
  }
  markSeen(noteId);
  pushRecent('note', noteId);
  announce(`${note.ko} — ${fingeringText(note)}`);
}

/* 스크린리더 알림 */
function announce(msg) {
  const live = $('#srLive');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => { live.textContent = msg; }, 30);
}

/* ---------- 진행/기록 ---------- */
function markSeen(noteId) {
  if (!State.progress.seen.includes(noteId)) {
    State.progress.seen.push(noteId);
    saveState();
    window.Views && Views.refreshProgress();
  }
}
function pushRecent(type, id) {
  State.recent = State.recent.filter(r => !(r.type === type && r.id === id));
  State.recent.unshift({ type, id });
  State.recent = State.recent.slice(0, 12);
  saveState();
  window.Views && Views.renderRecent();
}
function toggleFav(noteId) {
  const on = State.favs.has(noteId);
  if (on) State.favs.delete(noteId); else State.favs.add(noteId);
  saveState();
  $$(`[data-star="${noteId}"]`).forEach(b => {
    b.setAttribute('aria-pressed', String(!on));
    b.setAttribute('aria-label', (!on ? '즐겨찾기에서 빼기' : '즐겨찾기에 담기') + ' — ' + (NOTE_MAP[noteId] ? NOTE_MAP[noteId].ko : noteId));
  });
  toast(!on ? `⭐ ${NOTE_MAP[noteId].ko} — 즐겨찾기에 담았어요` : `즐겨찾기에서 뺐어요`);
  window.Views && Views.renderFavs();
  if (window.Views && Views.chartFilter.favOnly) Views.renderChart();
}

/* ---------- SVG 아이콘 ---------- */
const ICONS = {
  search:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  sun:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M19.2 4.8l-1.8 1.8M6.6 17.4l-1.8 1.8"/></svg>',
  moon:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12"/></svg>',
  soundOff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="m16 9 5 5M21 9l-5 5"/></svg>',
  motion:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 12c3-7 7 7 9 0s7-7 9 0"/></svg>',
  star:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6L12 16.7 6.6 19.6l1.1-6L3.2 9.4l6.1-.8L12 3Z"/></svg>',
  play:    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11-7.2a1 1 0 0 0 0-1.7l-11-7.2c-.7-.5-1.6 0-1.6.8Z"/></svg>',
  pause:   '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/></svg>',
  restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5v5h5"/><path d="M4.6 10A8 8 0 1 1 4 14"/></svg>',
  prev:    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 4.8v14.4c0 .8-.9 1.3-1.6.9l-11-7.2a1 1 0 0 1 0-1.7l11-7.2c.7-.5 1.6 0 1.6.8Z" transform="translate(2.5 0)"/><rect x="3.5" y="4" width="2.6" height="16" rx="1"/></svg>',
  next:    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11-7.2a1 1 0 0 0 0-1.7l-11-7.2c-.7-.5-1.6 0-1.6.8Z" transform="translate(-2.5 0)"/><rect x="17.9" y="4" width="2.6" height="16" rx="1"/></svg>',
  close:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  menu:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  grid:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  list:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="5" cy="18" r="1.4" fill="currentColor" stroke="none"/></svg>',
  check:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  home:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m4 11 8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-5v6h-4A1.5 1.5 0 0 1 4 19.5V11Z"/></svg>',
  book:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 1 5 18.5v-14Z"/><path d="M5 17h14M9 3v13"/></svg>',
  chart:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="5.5" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="2" stroke-width="1.8"/></svg>',
  quiz:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 9a3 3 0 1 1 4.2 2.7c-.9.5-1.2 1-1.2 2.1"/><circle cx="12" cy="17.6" r="0.4" fill="currentColor"/><circle cx="12" cy="12" r="9.2"/></svg>',
  box:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z"/><path d="M4 8.5 12 13l8-4.5M12 13v7"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v10m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></svg>',
  upload:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 14V4m0 0 4 4m-4-4-4 4"/><path d="M5 19h14"/></svg>',
  trash:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2m-7.5 0 .7 12h9.6l.7-12"/></svg>',
  note:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M9 18.5V6l10-2v12.5"/><circle cx="6.5" cy="18.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>',
  arrowR:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  plus:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15Z" opacity=".6"/></svg>',
};

/* ---------- 리코더 SVG 빌더 ----------
   opts: { width, interactive, labels, state(놀이터용 현재 상태), idPrefix } */
function recorderSVG(noteOrState, opts = {}) {
  const W = opts.width || 96;
  const H = Math.round(W * (470 / 120));
  let t, h;
  if (noteOrState && noteOrState.f !== undefined) { /* note 객체 */
    const f = fingeringOf(noteOrState, opts.system);
    t = f.t; h = f.h;
  } else { /* {t, h} 상태 객체 */
    t = noteOrState.t; h = [...noteOrState.h];
  }
  const cx = 60;
  const holeY = [158, 192, 226, 270, 304, 338, 372];
  const colors = i => (HOLE_HAND[i] === 'left'
    ? 'var(--left)' : 'var(--right)');
  const inter = !!opts.interactive;
  const lab = opts.labels !== false;
  const uid = String(opts.idPrefix || 'main').replace(/[^A-Za-z0-9_-]/g, '');
  const showFingers = inter && opts.fingers !== false;
  const activeFinger = opts.activeFinger == null ? null : String(opts.activeFinger);
  const isMovingFinger = which => activeFinger === 'all' || activeFinger === String(which);

  /* 구멍 그리기 */
  function holeSVG(i) {
    const y = holeY[i];
    const v = h[i];
    const isDouble = (i === 5 || i === 6); /* 6·7번은 두 개짜리 구멍 */
    const fillMain = v >= 0.5 ? colors(i) : 'var(--recorder-bore)';
    const fillSub  = v === 1 ? colors(i) : 'var(--recorder-bore)';
    const strokeC  = v > 0 ? colors(i) : 'var(--recorder-rim)';
    const handKo = HOLE_HAND[i] === 'left' ? '왼손' : '오른손';
    const stateKo = v === 1 ? '막음' : (v === 0.5 ? '반만 막음' : '열림');
    const a11y = `${i + 1}번 구멍 (${handKo}) — ${stateKo}`;
    const interAttrs = inter
      ? ` role="button" tabindex="0" data-hole="${i}" aria-pressed="${v > 0}" aria-label="${a11y}" class="hole" style="cursor:pointer"`
      : ` class="hole"`;
    let g = `<g${interAttrs} aria-label="${a11y}">`;
    if (inter) g = `<g${interAttrs}><title>${a11y}</title>`;
    /* 터치하기 쉽게 — 보이지 않는 히트 영역 */
    if (inter) g += `<circle cx="${cx}" cy="${y}" r="19" fill="transparent" stroke="none"/>`;
    if (isDouble) {
      g += `<ellipse cx="${cx - 4}" cy="${y + 1}" rx="10.8" ry="9.8" fill="var(--recorder-hole-seat)" opacity=".55"/>`;
      g += `<ellipse cx="${cx + 11}" cy="${y + 7}" rx="6.8" ry="6.1" fill="var(--recorder-hole-seat)" opacity=".55"/>`;
      g += `<circle cx="${cx - 4}" cy="${y}" r="8.7" fill="${fillMain}" stroke="${strokeC}" stroke-width="2.1"/>`;
      g += `<circle cx="${cx + 11}" cy="${y + 7}" r="5.3" fill="${fillSub}" stroke="${strokeC}" stroke-width="1.9"/>`;
      if (v > 0) g += `<circle cx="${cx - 7.2}" cy="${y - 3.4}" r="2" fill="var(--on-signal)" opacity=".35"/>`;
    } else {
      g += `<ellipse cx="${cx}" cy="${y + 1}" rx="11.8" ry="10.8" fill="var(--recorder-hole-seat)" opacity=".55"/>`;
      if (v === 0.5) {
        g += `<circle cx="${cx}" cy="${y}" r="9.6" fill="var(--recorder-bore)" stroke="${strokeC}" stroke-width="2.1"/>`;
        g += `<path d="M${cx - 9.6} ${y}a9.6 9.6 0 0 0 19.2 0Z" fill="${colors(i)}"/>`;
      } else {
        g += `<circle cx="${cx}" cy="${y}" r="9.6" fill="${fillMain}" stroke="${strokeC}" stroke-width="2.1"/>`;
      }
      if (v > 0) g += `<circle cx="${cx - 3.5}" cy="${y - 3.7}" r="2.2" fill="var(--on-signal)" opacity=".35"/>`;
    }
    if (lab) g += `<text x="${cx + 25}" y="${y + 4}" font-size="10.5" fill="var(--ink-faint)" text-anchor="start">${i + 1}</text>`;
    g += '</g>';
    return g;
  }

  /* 엄지(뒤) 구멍 */
  const tFill = t >= 0.5 ? 'var(--left)' : 'var(--recorder-bore)';
  const tStroke = t > 0 ? 'var(--left)' : 'var(--recorder-rim)';
  const tState = t === 1 ? '막음' : (t === 0.5 ? '반만 막음(핀치)' : '열림');
  const tInter = inter
    ? ` role="button" tabindex="0" data-hole="t" aria-pressed="${t > 0}" aria-label="뒤 구멍 (왼손 엄지) — ${tState} · 누를 때마다 막기, 반만, 열기 순서로 바뀜" class="hole" style="cursor:pointer"`
    : ' class="hole"';
  let thumb = `<g${tInter} aria-label="뒤 구멍 (왼손 엄지) — ${tState}">`;
  if (inter) thumb = `<g${tInter}><title>뒤 구멍 (왼손 엄지) — ${tState} · 누를 때마다 막기→반만→열기</title>
    <circle cx="26" cy="132" r="18" fill="transparent" stroke="none"/>`;
  if (t === 0.5) {
    thumb += `<path d="M36 120 C30 116 21 118 17 125 C13 134 19 144 29 144 C36 144 41 139 42 132" fill="var(--recorder-hole-seat)" opacity=".48"/>
              <circle cx="26" cy="132" r="10" fill="var(--recorder-bore)" stroke="var(--left)" stroke-width="2.1"/>
              <path d="M16 132a10 10 0 0 0 20 0Z" fill="var(--left)"/>`;
  } else {
    thumb += `<path d="M36 120 C30 116 21 118 17 125 C13 134 19 144 29 144 C36 144 41 139 42 132" fill="var(--recorder-hole-seat)" opacity=".48"/>
              <circle cx="26" cy="132" r="10" fill="${tFill}" stroke="${tStroke}" stroke-width="2.1"/>`;
    if (t > 0) thumb += `<circle cx="22.5" cy="128.3" r="2.2" fill="var(--on-signal)" opacity=".35"/>`;
  }
  if (lab) thumb += `<text x="26" y="113" font-size="10.5" fill="var(--ink-faint)" text-anchor="middle">뒤</text>`;
  thumb += '</g>';

  function fingerVisual(width, height) {
    const x = -width / 2, y = -height / 2;
    return `
      <rect class="finger-shadow" x="${x + 1.5}" y="${y + 2}" width="${width}" height="${height}" rx="${height / 2}"/>
      <rect class="finger-pad" x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}"/>
      <path class="finger-crease" d="M${x + 7} ${y + height - 4} C${x + 13} ${y + height - 1.5} ${x + width - 12} ${y + height - 1.5} ${x + width - 6} ${y + height - 4}"/>
      <ellipse class="finger-nail" cx="${x + width - 8}" cy="${y + 6}" rx="${Math.min(5.2, width / 6)}" ry="${Math.min(3.8, height / 4.2)}"/>
      <circle class="finger-accent" cx="${x + 6.2}" cy="${y + height - 5.5}" r="2.3"/>`;
  }

  function fingerClasses(which, v, hand, extra = '') {
    const state = v >= 1 ? 'is-closed' : (v === 0.5 ? 'is-half' : 'is-open');
    const moving = (activeFinger == null || isMovingFinger(which)) ? ' is-moving' : '';
    return `finger finger-${hand} ${state}${moving}${extra ? ' ' + extra : ''}`;
  }

  function fingerStyle(hand, halfX, halfY) {
    const dir = hand === 'left' ? -1 : 1;
    const rot = hand === 'left' ? '-10deg' : '10deg';
    return `--finger-from-x:${dir * 19}px;--finger-from-y:-13px;--finger-rest-x:${halfX}px;--finger-rest-y:${halfY}px;--finger-lift-rot:${rot}`;
  }

  function frontFingerSVG(i) {
    if (!showFingers) return '';
    const v = h[i];
    const hand = HOLE_HAND[i];
    const side = hand === 'left' ? -1 : 1;
    const y = holeY[i];
    const isDouble = i === 5 || i === 6;
    const fullDouble = isDouble && v === 1;
    const x = isDouble ? (fullDouble ? cx + 3.5 : cx - 4) : cx;
    const fy = isDouble ? (fullDouble ? y + 3.5 : y) : y;
    const angle = side * (isDouble ? 12 : 7);
    const width = isDouble ? (fullDouble ? 38 : 28) : 34;
    const height = isDouble ? 18 : 19;
    const halfX = v === 0.5 ? side * -5 : 0;
    const halfY = v === 0.5 ? 4 : 0;
    const style = fingerStyle(hand, halfX, halfY);
    return `<g class="finger-anchor" transform="translate(${x} ${fy}) rotate(${angle})">
      <g class="${fingerClasses(i, v, hand, isDouble ? 'finger-double' : '')}" style="${style}">
        ${fingerVisual(width, height)}
      </g>
    </g>`;
  }

  function thumbFingerSVG() {
    if (!showFingers) return '';
    const style = '--finger-from-x:-21px;--finger-from-y:-11px;--finger-rest-x:-6px;--finger-rest-y:4px;--finger-lift-rot:-12deg';
    return `<g class="finger-anchor" transform="translate(26 132) rotate(-13)">
      <g class="${fingerClasses('t', t, 'left', 'finger-thumb')}" style="${style}">
        ${fingerVisual(36, 21)}
      </g>
    </g>`;
  }

  const fingers = showFingers
    ? `<g class="finger-layer" aria-hidden="true">${thumbFingerSVG()}${h.map((v, i) => frontFingerSVG(i)).join('')}</g>`
    : '';

  return `
  <svg class="recorder-svg${inter ? ' interactive' : ''}" viewBox="0 0 120 470" width="${W}" height="${H}"
       role="img" aria-label="리코더 운지 그림" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="rcdBody${uid}" x1="34" y1="0" x2="86" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="var(--recorder-body-shadow)"/>
        <stop offset=".18" stop-color="var(--recorder-body)"/>
        <stop offset=".48" stop-color="var(--recorder-body-light)"/>
        <stop offset=".69" stop-color="var(--recorder-body)"/>
        <stop offset="1" stop-color="var(--recorder-body-deep)"/>
      </linearGradient>
      <linearGradient id="rcdJoint${uid}" x1="34" y1="0" x2="86" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="var(--recorder-rim)"/>
        <stop offset=".16" stop-color="var(--recorder-joint-shadow)"/>
        <stop offset=".5" stop-color="var(--recorder-joint-light)"/>
        <stop offset=".84" stop-color="var(--recorder-joint-shadow)"/>
        <stop offset="1" stop-color="var(--recorder-rim)"/>
      </linearGradient>
      <filter id="rcdShadow${uid}" x="-18%" y="-4%" width="136%" height="112%">
        <feDropShadow dx="4" dy="4" stdDeviation="2.2" flood-color="var(--recorder-cast-shadow)" flood-opacity=".38"/>
      </filter>
    </defs>
    <g class="recorder-instrument" filter="url(#rcdShadow${uid})">
      <!-- 머리: 부리형 취구와 윈드웨이 -->
      <path class="rcd-outline" d="M45 16 C50 8 60 5 70 8 C77 11 81 18 78 25 C74 35 76 43 80 52 C78 62 72 68 61 68 C51 68 43 62 42 52 L45 16Z" fill="url(#rcdBody${uid})" stroke-width="4"/>
      <path d="M52 19 C58 14 68 15 74 21 L72 50 C68 45 57 41 47 45 L49 27 C50 24 51 21 52 19Z" fill="var(--recorder-body-light)" opacity=".5"/>
      <path d="M50 45 C58 42 69 45 75 52" fill="none" stroke="var(--recorder-rim)" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M51 31 C57 29 66 30 72 34" fill="none" stroke="var(--recorder-bore)" stroke-width="4" stroke-linecap="round" opacity=".82"/>
      <!-- 라비움 창 -->
      <path class="rcd-outline" d="M48 63 L73 67 L67 91 L43 86 Z" fill="var(--recorder-window)" stroke-width="3"/>
      <path d="M52 69 L67 72 L62 83 L48 80 Z" fill="var(--recorder-body-light)" opacity=".88"/>
      <path d="M54 71 L67 73" stroke="var(--recorder-rim)" stroke-width="2" stroke-linecap="round"/>
      <!-- 머리 관 -->
      <path class="rcd-outline" d="M42 52 C49 63 72 64 80 52 L74 116 C72 128 49 128 46 116 Z" fill="url(#rcdBody${uid})" stroke-width="4"/>
      <path d="M64 68 C61 87 59 104 57 121" fill="none" stroke="var(--recorder-highlight)" stroke-width="7" stroke-linecap="round" opacity=".34"/>
      <path class="rcd-detail" d="M45 98 C54 104 68 104 75 98"/>

      <!-- 헤드-바디 연결부 -->
      <path class="rcd-outline" d="M39 113 C49 120 72 120 81 113 L82 124 C72 132 49 132 38 124 Z" fill="url(#rcdJoint${uid})" stroke-width="4"/>
      <path class="rcd-detail" d="M40 124 C50 131 71 131 80 124"/>

      <!-- 몸통 -->
      <path class="rcd-outline" d="M43 126 C48 136 72 136 77 126 L79 390 C71 397 49 397 41 390 Z" fill="url(#rcdBody${uid})" stroke-width="4"/>
      <path d="M63 139 C61 204 59 280 56 382" fill="none" stroke="var(--recorder-highlight)" stroke-width="8" stroke-linecap="round" opacity=".36"/>
      <path d="M74 138 C73 216 73 308 75 384" fill="none" stroke="var(--recorder-side-shade)" stroke-width="4" stroke-linecap="round" opacity=".3"/>

      <!-- 발 관과 벨 -->
      <path class="rcd-outline" d="M38 386 C49 395 71 395 82 386 L83 399 C73 407 47 407 37 399 Z" fill="url(#rcdJoint${uid})" stroke-width="4"/>
      <path class="rcd-outline" d="M41 399 C49 405 71 405 79 399 L75 432 C70 442 50 442 45 432 Z" fill="url(#rcdBody${uid})" stroke-width="4"/>
      <path class="rcd-outline" d="M35 427 C44 437 76 437 85 427 C83 444 73 457 60 459 C47 457 37 444 35 427 Z" fill="url(#rcdJoint${uid})" stroke-width="4"/>
      <ellipse cx="60" cy="445" rx="23" ry="9" fill="var(--recorder-joint-light)" stroke="var(--recorder-rim)" stroke-width="4"/>
      <ellipse cx="60" cy="447" rx="14" ry="5.5" fill="var(--recorder-bore)" opacity=".95"/>
      <path d="M52 433 C57 436 65 436 70 433" fill="none" stroke="var(--recorder-highlight)" stroke-width="4" stroke-linecap="round" opacity=".35"/>
    </g>
    ${thumb}
    ${h.map((v, i) => holeSVG(i)).join('')}
    ${fingers}
  </svg>`;
}

/* ---------- 오선보 SVG (8va 높은음자리표) ---------- */
function staffSVG(note, opts = {}) {
  const W = opts.width || 140, H = 96;
  const top = 22, gap = 9;             /* 다섯 줄: y=22..58 */
  const lineY = i => top + i * gap;    /* i=0(F6 윗줄)~4(E5 아랫줄) */
  const bottom = lineY(4);
  const yOf = step => bottom - step * (gap / 2);
  const y = yOf(note.step);
  let ledgers = '';
  if (note.step <= -2) ledgers += `<line x1="${W - 52}" x2="${W - 24}" y1="${yOf(-2)}" y2="${yOf(-2)}" stroke="var(--ink)" stroke-width="1.6"/>`;
  if (note.step >= 10) ledgers += `<line x1="${W - 52}" x2="${W - 24}" y1="${yOf(10)}" y2="${yOf(10)}" stroke="var(--ink)" stroke-width="1.6"/>`;
  if (note.step >= 12) ledgers += `<line x1="${W - 52}" x2="${W - 24}" y1="${yOf(12)}" y2="${yOf(12)}" stroke="var(--ink)" stroke-width="1.6"/>`;
  const accGlyph = note.acc === 'sharp' ? `<text x="${W - 54}" y="${y + 5}" font-size="17" fill="var(--ink)" text-anchor="end">♯</text>` : '';
  return `
  <svg viewBox="0 0 ${W} ${H}" width="100%" role="img"
       aria-label="악보: ${esc(note.ko)} (${esc(note.en)})" xmlns="http://www.w3.org/2000/svg">
    ${[0,1,2,3,4].map(i => `<line x1="6" x2="${W - 6}" y1="${lineY(i)}" y2="${lineY(i)}" stroke="var(--line-strong)" stroke-width="1.4"/>`).join('')}
    <text x="10" y="${bottom + 4}" font-size="46" fill="var(--ink)"
          font-family="Bravura, 'Noto Music', 'Segoe UI Symbol', serif">𝄞</text>
    <text x="14" y="${top - 6}" font-size="11" fill="var(--ink-soft)" font-family="var(--font-mono)">8</text>
    ${ledgers}${accGlyph}
    <ellipse cx="${W - 38}" cy="${y}" rx="7.6" ry="5.4" fill="none" stroke="var(--ink)" stroke-width="2"
             transform="rotate(-14 ${W - 38} ${y})"/>
  </svg>`;
}

/* ---------- 전역 컨트롤 (테마 · 소리 · 모션 · 운지 체계) ---------- */
function applyTheme() {
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const eff = State.theme || (sysDark ? 'dark' : 'light');
  document.documentElement.dataset.theme = eff;
  $$('#themeBtn, #drawerTheme').forEach(b => {
    if (!b) return;
    b.innerHTML = eff === 'dark' ? ICONS.sun : ICONS.moon;
    b.setAttribute('aria-label', eff === 'dark' ? '밝은 테마로 바꾸기' : '어두운 테마로 바꾸기');
  });
}
function applySound() {
  $$('#soundBtn, #drawerSound').forEach(b => {
    if (!b) return;
    b.innerHTML = State.sound ? ICONS.soundOn : ICONS.soundOff;
    b.setAttribute('aria-pressed', String(State.sound));
    b.setAttribute('aria-label', State.sound ? '소리 끄기' : '소리 켜기');
  });
  if (!State.sound) AudioEngine.stopAll();
}
function applyMotion() {
  if (State.motion) document.documentElement.dataset.motion = 'reduce';
  else delete document.documentElement.dataset.motion;
  $$('#motionBtn, #drawerMotion').forEach(b => {
    if (!b) return;
    b.setAttribute('aria-pressed', String(State.motion));
    b.setAttribute('aria-label', State.motion ? '모션 다시 켜기' : '모션 줄이기');
  });
}
function applySystem() {
  $$('.sys-toggle button').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.sys === State.system));
  });
  /* 운지가 그려진 모든 화면 갱신 */
  if (window.Views) {
    Views.renderLearn(); Views.renderChart(); Views.refreshPlayground();
    Views.refreshModal(); Views.refreshSongStage();
  }
}

/* ---------- 커맨드 팔레트 (Ctrl/Cmd + K) ---------- */
const Palette = (() => {
  let items = [];        /* {type,id,name,sub,keywords,group} */
  let filtered = [];
  let sel = 0;
  let lastFocus = null;

  function buildItems() {
    items = [];
    const secs = [
      ['home', '홈', '처음 화면'], ['prep', '준비하기', '자세·잡는 법·텅잉'],
      ['learn', '운지 배우기', '7개 연습 세트'], ['chart', '운지표', '전체 음 갤러리'],
      ['playground', '운지 놀이터', '구멍을 눌러 음 찾기'], ['practice', '연습하기', '퀴즈 · 따라 연주'],
      ['library', '보관함', '즐겨찾기 · 진행'], ['guide', '가이드', '독일식/바로크식 · 관리'],
    ];
    secs.forEach(([id, name, sub]) => items.push({ type: 'section', id, name, sub, group: '이동', keywords: name + sub }));
    NOTES.forEach(n => items.push({
      type: 'note', id: n.id, name: n.ko + (n.alt ? ` (${n.alt})` : ''), sub: n.en,
      group: '음 찾기', keywords: `${n.ko} ${n.en} ${n.alt || ''} ${NOTE_ALIASES[n.id] || ''}`,
    }));
    SETS.forEach(s => items.push({ type: 'set', id: s.id, name: s.name, sub: s.sub, group: '연습 세트', keywords: s.name + s.sub }));
    SONGS.forEach(s => items.push({ type: 'song', id: s.id, name: s.name, sub: '따라 연주', group: '연습곡', keywords: s.name }));
    PREP.forEach(p => items.push({ type: 'prep', id: p.id, name: p.name, sub: p.summary, group: '준비하기', keywords: p.name + p.summary }));
  }

  function score(item, q) {
    const hay = (item.name + ' ' + item.sub + ' ' + item.keywords).toLowerCase();
    if (hay.includes(q)) return 100 - hay.indexOf(q);
    /* 부분 일치(띄어쓰기로 나눠 모두 포함) */
    const parts = q.split(/\s+/).filter(Boolean);
    if (parts.length && parts.every(p => hay.includes(p))) return 40;
    return -1;
  }

  function render() {
    const list = $('#paletteList');
    const q = $('#paletteInput').value.trim().toLowerCase();
    if (!q) {
      const recents = State.recent.slice(0, 5).map(r => items.find(i => i.type === r.type && i.id === r.id)).filter(Boolean)
        .map(i => ({ ...i, group: '최근 본 항목' }));
      const favs = [...State.favs].slice(0, 5).map(id => items.find(i => i.type === 'note' && i.id === id)).filter(Boolean)
        .map(i => ({ ...i, group: '즐겨찾기' }));
      const sections = items.filter(i => i.type === 'section');
      filtered = [...recents, ...favs, ...sections];
    } else {
      filtered = items.map(i => ({ i, s: score(i, q) })).filter(x => x.s >= 0)
        .sort((a, b) => b.s - a.s).slice(0, 14).map(x => x.i);
    }
    sel = Math.min(sel, Math.max(0, filtered.length - 1));
    if (!filtered.length) {
      list.innerHTML = `<div class="empty-state" style="border:0;padding:28px 16px">
        <div class="face">🎵</div><div class="t">찾는 항목이 없어요</div>
        <div class="d">"솔", "파샵", "비행기", "퀴즈"처럼 검색해 보세요.</div></div>`;
      return;
    }
    let html = '', lastGroup = '';
    filtered.forEach((it, idx) => {
      if (it.group !== lastGroup) { html += `<div class="palette-group">${esc(it.group)}</div>`; lastGroup = it.group; }
      const ico = it.type === 'note' ? esc(NOTE_MAP[it.id].ko[0]) :
        it.type === 'song' ? '♪' : it.type === 'set' ? esc(String(SET_MAP[it.id].no)) : it.type === 'prep' ? '✦' : '→';
      html += `<button class="palette-item${idx === sel ? ' sel' : ''}" role="option" id="pi-${idx}"
        aria-selected="${idx === sel}" data-idx="${idx}">
        <span class="pi-ico" aria-hidden="true">${ico}</span>
        <span class="pi-name">${esc(it.name)}</span>
        <span class="pi-sub">${esc(it.sub)}</span></button>`;
    });
    list.innerHTML = html;
    const input = $('#paletteInput');
    input.setAttribute('aria-activedescendant', 'pi-' + sel);
    const selEl = $('#pi-' + sel);
    if (selEl) selEl.scrollIntoView({ block: 'nearest' });
  }

  function go(item) {
    close();
    if (!item) return;
    if (item.type === 'section') location.hash = '#' + item.id;
    else if (item.type === 'note') { Views.openNoteModal(item.id); }
    else if (item.type === 'set') { location.hash = '#set-' + item.id; }
    else if (item.type === 'song') { location.hash = '#practice'; Views.selectSong(item.id); Views.showPracticeTab('songs'); }
    else if (item.type === 'prep') { location.hash = '#prep'; Views.openPrep(item.id); }
  }

  function open() {
    if (!items.length) buildItems();
    lastFocus = document.activeElement;
    $('#paletteBackdrop').classList.add('open');
    $('#palette').classList.add('open');
    const input = $('#paletteInput');
    input.value = ''; sel = 0; render();
    input.focus();
  }
  function close() {
    $('#paletteBackdrop').classList.remove('open');
    $('#palette').classList.remove('open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function isOpen() { return $('#palette').classList.contains('open'); }

  function bind() {
    $('#searchBtn').addEventListener('click', open);
    $('#paletteBackdrop').addEventListener('click', close);
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); isOpen() ? close() : open(); }
      else if (e.key === 'Escape' && isOpen()) close();
    });
    $('#paletteInput').addEventListener('input', () => { sel = 0; render(); });
    $('#paletteInput').addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, filtered.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); go(filtered[sel]); }
    });
    $('#paletteList').addEventListener('click', e => {
      const btn = e.target.closest('.palette-item');
      if (btn) go(filtered[+btn.dataset.idx]);
    });
  }
  return { bind, open, close };
})();

/* ---------- 스크롤: 진행률 바 + 스파이 ---------- */
function bindScroll() {
  const bar = $('#scrollProgress');
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? (window.scrollY / max) : 0})`;
      ticking = false;
    });
  }, { passive: true });

  const links = $$('.nav-link[data-spy], .tabbar a[data-spy]');
  const sections = $$('.section[id]');
  const spy = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        const id = en.target.id;
        links.forEach(l => l.classList.toggle('active', l.dataset.spy === id));
      }
    });
  }, { rootMargin: '-35% 0px -55% 0px' });
  sections.forEach(s => spy.observe(s));
}

/* ---------- 데이터 내보내기 / 가져오기 / 초기화 ---------- */
function exportData() {
  const data = {
    app: 'recorder-classroom', version: 1, exportedAt: new Date().toISOString(),
    favs: [...State.favs], recent: State.recent, collections: State.collections,
    progress: State.progress, quizBest: State.quizBest,
    settings: { theme: State.theme, sound: State.sound, motion: State.motion, system: State.system },
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = '리코더교실-내기록.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('내 기록을 파일로 저장했어요');
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (d.app !== 'recorder-classroom') throw new Error('format');
      if (Array.isArray(d.favs)) State.favs = new Set(d.favs.filter(id => NOTE_MAP[id]));
      if (Array.isArray(d.recent)) State.recent = d.recent.slice(0, 12);
      if (Array.isArray(d.collections)) State.collections = d.collections;
      if (d.progress) State.progress = Object.assign({ prep: [], sets: [], seen: [], songs: [] }, d.progress);
      if (d.quizBest) State.quizBest = d.quizBest;
      if (d.settings) {
        State.theme = d.settings.theme; State.sound = !!d.settings.sound;
        State.motion = !!d.settings.motion; State.system = d.settings.system === 'B' ? 'B' : 'G';
      }
      saveState();
      applyTheme(); applySound(); applyMotion(); applySystem();
      Views.renderAll();
      toast('기록을 불러왔어요! 이어서 연습해요 🎵');
    } catch (e) {
      toast('앗, 이 파일은 리코더 교실 기록이 아니에요.');
    }
  };
  reader.onerror = () => toast('파일을 읽지 못했어요. 다시 시도해 주세요.');
  reader.readAsText(file);
}
function resetData() {
  if (!confirm('즐겨찾기, 진행 기록, 모음을 모두 지울까요?\n이 작업은 되돌릴 수 없어요.')) return;
  ['rcd.favs', 'rcd.recent', 'rcd.collections', 'rcd.progress', 'rcd.quizBest', 'rcd.toured'].forEach(Store.remove);
  State.favs = new Set(); State.recent = []; State.collections = [];
  State.progress = { prep: [], sets: [], seen: [], songs: [] };
  State.quizBest = {}; State.toured = true; /* 다시 투어를 강제하지 않음 */
  saveState();
  Views.renderAll();
  toast('처음처럼 깨끗해졌어요');
}

/* ---------- 전역 이벤트 바인딩 ---------- */
function bindGlobal() {
  $('#themeBtn').addEventListener('click', () => {
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const eff = State.theme || (sysDark ? 'dark' : 'light');
    State.theme = eff === 'dark' ? 'light' : 'dark';
    saveState(); applyTheme();
  });
  $('#soundBtn').addEventListener('click', () => {
    State.sound = !State.sound; saveState(); applySound();
    toast(State.sound ? '소리를 켰어요 🔊' : '소리를 껐어요 🔇');
  });
  $('#motionBtn').addEventListener('click', () => {
    State.motion = !State.motion; saveState(); applyMotion();
    toast(State.motion ? '모션을 줄였어요' : '모션을 다시 켰어요');
  });
  $$('.sys-toggle button').forEach(b => {
    b.addEventListener('click', () => {
      if (State.system === b.dataset.sys) return;
      State.system = b.dataset.sys; saveState(); applySystem();
      toast(State.system === 'G'
        ? '독일식 운지로 바꿨어요 (학교에서 주로 써요)'
        : '바로크식 운지로 바꿨어요');
    });
  });
  /* 모바일 드로어 */
  const drawer = $('#drawer');
  $('#menuBtn').addEventListener('click', () => {
    drawer.classList.add('open');
    $('#drawerBackdrop').classList.add('open');
    $('#drawerClose').focus();
  });
  const closeDrawer = () => {
    drawer.classList.remove('open');
    $('#drawerBackdrop').classList.remove('open');
  };
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerBackdrop').addEventListener('click', closeDrawer);
  drawer.addEventListener('click', e => { if (e.target.closest('a')) closeDrawer(); });
  $('#drawerTheme').addEventListener('click', () => $('#themeBtn').click());
  $('#drawerSound').addEventListener('click', () => $('#soundBtn').click());
  $('#drawerMotion').addEventListener('click', () => $('#motionBtn').click());

  /* 시스템 테마 변경 따라가기 */
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!State.theme) applyTheme();
  });
  /* 탭이 안 보이면 소리 멈춤 (성능·예의) */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { AudioEngine.stopAll(); window.Views && Views.pauseSong(); }
  });
}

/* ---------- 시작 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(); applySound(); applyMotion();
  Views.init();
  Palette.bind();
  bindGlobal();
  bindScroll();
  applySystem();
  if (!State.toured) setTimeout(() => Views.startTour(), 700);
});
