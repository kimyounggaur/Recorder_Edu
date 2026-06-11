/* ============================================================
   리코더 교실 — 화면 (홈 · 준비 · 배우기 · 운지표 · 놀이터 ·
   연습(퀴즈/연주) · 보관함 · 가이드 · 투어)
   ============================================================ */
'use strict';

const Views = (() => {

  /* ====================================================
     공용: 음 카드 (표준 레이아웃 — 프리뷰 / 태그 / 컨트롤)
     ==================================================== */
  function noteCardHTML(note) {
    const fav = State.favs.has(note.id);
    const hand = noteHands(note, State.system);
    const sysBadge = note.sys ? `<span class="chip mono">${State.system === 'G' ? '독일식' : '바로크식'}</span>` : '';
    return `
    <article class="card lift note-card" data-notecard="${note.id}">
      <div class="nc-head">
        <span class="nc-name">${esc(note.ko)}</span>
        <span class="nc-en">${esc(note.en)}</span>
        <button class="star" data-star="${note.id}" aria-pressed="${fav}"
          aria-label="${fav ? '즐겨찾기에서 빼기' : '즐겨찾기에 담기'} — ${esc(note.ko)}">${ICONS.star}</button>
      </div>
      <div class="nc-preview">
        <div class="staff-box">${staffSVG(note, { width: 140 })}</div>
        ${recorderSVG(note, { width: 52, labels: false, idPrefix: 'c' + note.id })}
      </div>
      <div class="nc-tags">
        <span class="chip ${hand}">${HAND_KO[hand]}</span>
        <span class="chip">${esc(note.diff)}</span>
        ${note.alt ? `<span class="chip">= ${esc(note.alt)}</span>` : ''}
        ${sysBadge}
      </div>
      <div class="nc-controls">
        <button class="btn btn-soft btn-sm" data-play="${note.id}">${ICONS.play}들어보기</button>
        <button class="btn btn-ghost btn-sm" data-open="${note.id}">자세히</button>
      </div>
    </article>`;
  }

  /* ====================================================
     홈 (히어로 + 추천 시작점 + 이어서 학습)
     ==================================================== */
  function renderHome() {
    $('#curatedGrid').innerHTML = CURATED.map(c => {
      let title = '', desc = c.desc;
      if (c.type === 'prep') title = PREP_MAP[c.id].name;
      if (c.type === 'note') title = NOTE_MAP[c.id].ko + ' 불어보기';
      if (c.type === 'set') title = SET_MAP[c.id].name;
      if (c.type === 'song') title = SONG_MAP[c.id].name;
      return `<button class="card lift curated-card" data-curated="${c.type}:${c.id}">
        <span class="badge">${c.badge}</span>
        <span><span class="t">${esc(c.label)}</span><br><span class="d">${esc(desc)}</span></span>
      </button>`;
    }).join('');
    renderResume();
  }

  function renderResume() {
    const wrap = $('#resumeStrip');
    const last = State.recent[0];
    if (!last) { wrap.hidden = true; return; }
    let name = '', action = '';
    if (last.type === 'note' && NOTE_MAP[last.id]) { name = NOTE_MAP[last.id].ko + ' (' + NOTE_MAP[last.id].en + ')'; action = '이어서 연습하기'; }
    else if (last.type === 'set' && SET_MAP[last.id]) { name = SET_MAP[last.id].name; action = '이어서 배우기'; }
    else if (last.type === 'song' && SONG_MAP[last.id]) { name = SONG_MAP[last.id].name; action = '이어서 연주하기'; }
    else if (last.type === 'prep' && PREP_MAP[last.id]) { name = PREP_MAP[last.id].name; action = '이어서 보기'; }
    else { wrap.hidden = true; return; }
    wrap.hidden = false;
    $('#resumeText').innerHTML = `<span class="t">지난번에 <b>${esc(name)}</b>까지 봤어요.</span>
      <span class="d">멈춘 곳부터 가볍게 이어가요.</span>`;
    $('#resumeBtn').textContent = action;
    $('#resumeBtn').dataset.resume = last.type + ':' + last.id;
  }

  function goItem(type, id) {
    if (type === 'note') openNoteModal(id);
    else if (type === 'set') location.hash = '#set-' + id;
    else if (type === 'song') { location.hash = '#practice'; showPracticeTab('songs'); selectSong(id); }
    else if (type === 'prep') { location.hash = '#prep'; openPrep(id); }
  }

  /* ====================================================
     놀이터 (히어로 + 섹션 — 인터랙티브 리코더)
     ==================================================== */
  function makePlayground(rootId, opts = {}) {
    const root = $('#' + rootId);
    if (!root) return null;
    const pg = {
      state: { t: 1, h: [1, 1, 1, 0, 0, 0, 0] }, /* 시작: 솔 */
      lastMatch: 'G5',
      render(userAction) {
        const focusHole = document.activeElement && root.contains(document.activeElement)
          ? document.activeElement.getAttribute('data-hole') : null;
        $('.pg-svg', root).innerHTML = recorderSVG(pg.state, {
          width: opts.width || 120, interactive: true, labels: true, idPrefix: rootId,
        });
        if (focusHole != null) {
          const el = $(`[data-hole="${focusHole}"]`, root);
          if (el) el.focus();
        }
        pg.match(userAction);
      },
      match(userAction) {
        const m = NOTES.find(n => {
          const f = fingeringOf(n);
          return f.t === pg.state.t && f.h.every((v, i) => v === pg.state.h[i]);
        });
        const nameEl = $('.note-name', root), enEl = $('.note-en', root), guideEl = $('.guide', root);
        if (m) {
          pg.lastMatch = m.id;
          nameEl.textContent = m.ko;
          nameEl.style.color = noteHands(m) === 'left' ? 'var(--left)' : 'var(--ink)';
          enEl.textContent = m.en + (m.alt ? ' · ' + m.alt : '');
          if (guideEl) guideEl.innerHTML = esc(fingeringText(m));
          $$('.pg-need-match', root).forEach(b => { b.disabled = false; });
          if (userAction) {
            announce(`${m.ko} 운지가 완성됐어요`);
            if (opts.autoPlay && State.sound) AudioEngine.play(m.freq, 0.7);
            markSeen(m.id);
          }
        } else {
          pg.lastMatch = null;
          nameEl.textContent = '…';
          nameEl.style.color = 'var(--ink-faint)';
          enEl.textContent = ' ';
          $$('.pg-need-match', root).forEach(b => { b.disabled = true; });
          if (guideEl) {
            const near = nearestNote(pg.state);
            guideEl.innerHTML = near
              ? `혹시 <b>${esc(near.note.ko)}</b>를 만들고 있나요? <b>${esc(near.hint)}</b>만 바꾸면 돼요!`
              : '이 운지에 맞는 음이 없어요. 다른 모양을 시도해 보세요!';
          }
        }
      },
    };
    function nearestNote(st) {
      let best = null;
      NOTES.forEach(n => {
        const f = fingeringOf(n);
        let diff = 0, hintIdx = null, hintT = false;
        if (f.t !== st.t) { diff++; hintT = true; }
        f.h.forEach((v, i) => { if (v !== st.h[i]) { diff++; hintIdx = i; } });
        if (diff === 1 && !best) best = { note: n, hint: hintT ? '뒤 구멍' : `${hintIdx + 1}번 구멍` };
      });
      return best;
    }
    root.addEventListener('click', e => {
      const hole = e.target.closest('[data-hole]');
      if (hole) { toggleHole(hole.getAttribute('data-hole')); return; }
      const act = e.target.closest('[data-pg]');
      if (!act) return;
      const kind = act.dataset.pg;
      if (kind === 'listen' && pg.lastMatch) playNote(pg.lastMatch, 0.9, root);
      if (kind === 'reset') { pg.state = { t: 1, h: [1, 1, 1, 0, 0, 0, 0] }; pg.render(true); }
      if (kind === 'learn' && pg.lastMatch) openNoteModal(pg.lastMatch);
    });
    root.addEventListener('keydown', e => {
      const hole = e.target.closest('[data-hole]');
      if (hole && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        toggleHole(hole.getAttribute('data-hole'));
      }
    });
    function toggleHole(which) {
      if (which === 't') {
        pg.state.t = pg.state.t === 1 ? 0.5 : (pg.state.t === 0.5 ? 0 : 1);
      } else {
        const i = +which;
        if (i >= 5) pg.state.h[i] = pg.state.h[i] === 1 ? 0.5 : (pg.state.h[i] === 0.5 ? 0 : 1);
        else pg.state.h[i] = pg.state.h[i] === 1 ? 0 : 1;
      }
      pg.render(true);
    }
    pg.render();
    return pg;
  }

  let heroPg = null, labPg = null;
  function refreshPlayground() {
    if (heroPg) heroPg.render();
    if (labPg) labPg.render();
  }

  /* ====================================================
     준비하기
     ==================================================== */
  const PREP_ICONS = {
    posture: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="10" r="5" fill="var(--left)"/><path d="M24 16v14M24 20l-7 5M24 20l7 5M24 30l-6 10M24 30l6 10" stroke="var(--ink-soft)" stroke-width="3" stroke-linecap="round"/></svg>`,
    hold: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="21" y="4" width="6" height="40" rx="3" fill="var(--surface-2)" stroke="var(--line-strong)" stroke-width="2"/><circle cx="24" cy="16" r="2.4" fill="var(--left)"/><circle cx="24" cy="23" r="2.4" fill="var(--left)"/><circle cx="24" cy="30" r="2.4" fill="var(--right)"/><circle cx="24" cy="37" r="2.4" fill="var(--right)"/></svg>`,
    mouth: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M8 26c8-3 16-3 24 0" stroke="var(--ink-soft)" stroke-width="3" stroke-linecap="round"/><path d="M8 30c8 3 16 3 24 0" stroke="var(--ink-soft)" stroke-width="3" stroke-linecap="round"/><rect x="30" y="24" width="14" height="7" rx="3.5" fill="var(--surface-2)" stroke="var(--line-strong)" stroke-width="2"/></svg>`,
    finger: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M20 42V20a4 4 0 0 1 8 0v22" stroke="var(--ink-soft)" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="14" r="7" stroke="var(--right)" stroke-width="3"/></svg>`,
    tongue: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M6 18c6-8 20-8 28-2l8 6-8 4c-8 5-22 4-28-2" fill="var(--right-soft)" stroke="var(--right)" stroke-width="2.4" stroke-linejoin="round"/><path d="M14 10v4M22 8v4" stroke="var(--ink-soft)" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  };

  function renderPrep() {
    $('#prepGrid').innerHTML = PREP.map(p => {
      const done = State.progress.prep.includes(p.id);
      return `
      <article class="card lift prep-card" id="prep-${p.id}" data-prep="${p.id}">
        <div class="head">
          <div class="icon-wrap">${PREP_ICONS[p.icon] || ''}</div>
          <div><h3>${esc(p.name)}</h3><p class="summary">${esc(p.summary)}</p></div>
        </div>
        <div class="points" id="prepPoints-${p.id}">
          ${p.points.map(sec => `<div><h4>${esc(sec.h)}</h4><ul>${sec.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}
          <p class="why"><b>왜 중요할까요?</b> ${esc(p.why)}</p>
        </div>
        <div class="foot">
          <button class="btn btn-ghost btn-sm toggle-detail" data-preptoggle="${p.id}" aria-expanded="false" aria-controls="prepPoints-${p.id}">자세히 보기</button>
          <button class="done-check" data-prepdone="${p.id}" aria-pressed="${done}">${ICONS.check}<span>${done ? '완료!' : '다 했어요'}</span></button>
        </div>
      </article>`;
    }).join('');
  }

  function openPrep(id) {
    const card = $('#prep-' + id);
    if (!card) return;
    card.classList.add('open');
    const btn = $(`[data-preptoggle="${id}"]`, card);
    if (btn) { btn.setAttribute('aria-expanded', 'true'); btn.textContent = '접기'; }
    card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    pushRecent('prep', id);
  }

  /* ====================================================
     운지 배우기 (7세트)
     ==================================================== */
  function renderLearn() {
    $('#learnSets').innerHTML = SETS.map(s => {
      const done = State.progress.sets.includes(s.id);
      return `
      <div class="set-block" id="set-${s.id}">
        <div class="set-head">
          <span class="set-no" aria-hidden="true">${s.no}</span>
          <div>
            <h3>${esc(s.name)}</h3>
            <span class="set-sub">${esc(s.sub)}</span>
          </div>
          <span class="chip ${s.hand}">${HAND_KO[s.hand]}</span>
          <span class="chip">${esc(s.diff)}</span>
          <button class="done-check" style="margin-left:auto" data-setdone="${s.id}" aria-pressed="${done}">
            ${ICONS.check}<span>${done ? '세트 완료!' : '이 세트 다 했어요'}</span></button>
        </div>
        <p class="set-desc">${esc(s.desc)}</p>
        <div class="note-grid">${s.notes.map(id => noteCardHTML(NOTE_MAP[id])).join('')}</div>
      </div>`;
    }).join('');
  }

  /* ====================================================
     운지표 (검색 + 필터 + 갤러리/목록)
     ==================================================== */
  const chartFilter = { q: '', oct: 'all', hand: 'all', diff: 'all', favOnly: false, view: 'grid' };

  function chartMatches() {
    const q = chartFilter.q.trim().toLowerCase();
    return NOTES.filter(n => {
      if (chartFilter.oct !== 'all' && n.oct !== chartFilter.oct) return false;
      if (chartFilter.diff !== 'all' && n.diff !== chartFilter.diff) return false;
      if (chartFilter.hand !== 'all' && noteHands(n) !== chartFilter.hand) return false;
      if (chartFilter.favOnly && !State.favs.has(n.id)) return false;
      if (q) {
        const hay = `${n.ko} ${n.en} ${n.alt || ''} ${NOTE_ALIASES[n.id] || ''}`.toLowerCase();
        if (!q.split(/\s+/).every(p => hay.includes(p))) return false;
      }
      return true;
    });
  }

  function renderChart() {
    const list = chartMatches();
    $('#chartCount').textContent = `${list.length} / ${NOTES.length}개`;
    const wrap = $('#chartBody');
    if (!list.length) {
      wrap.innerHTML = `
      <div class="empty-state">
        <div class="face" aria-hidden="true">🔍</div>
        <div class="t">조건에 맞는 음이 없어요</div>
        <div class="d">${chartFilter.favOnly ? '아직 즐겨찾기한 음이 없네요. 카드의 별(☆)을 눌러 담아 보세요!' : '검색어나 필터를 바꿔 보세요. 이런 음은 어때요?'}</div>
        <div class="actions">
          <button class="btn btn-primary btn-sm" id="chartReset">필터 초기화</button>
          <button class="btn btn-ghost btn-sm" data-open="G5">솔 보기</button>
          <button class="btn btn-ghost btn-sm" data-open="C5">도 보기</button>
          <button class="btn btn-ghost btn-sm" data-open="Fs5">파♯ 보기</button>
        </div>
      </div>`;
      const rs = $('#chartReset');
      if (rs) rs.addEventListener('click', resetChartFilter);
      return;
    }
    if (chartFilter.view === 'grid') {
      wrap.innerHTML = `<div class="note-grid">${list.map(noteCardHTML).join('')}</div>`;
    } else {
      /* 목록(문서) 뷰 — 세트 순서대로 묶기 */
      let html = '<div class="chart-list">';
      SETS.forEach(s => {
        const ours = list.filter(n => n.set === s.id);
        if (!ours.length) return;
        html += `<div class="group-title"><span class="set-no" style="width:24px;height:24px;font-size:12px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--ink);color:var(--paper)">${s.no}</span> ${esc(s.name)}</div>`;
        html += ours.map(n => `
          <div class="card chart-row">
            <span class="nm">${esc(n.ko)}<span class="en">${esc(n.en)}${n.alt ? ' · ' + esc(n.alt) : ''}</span></span>
            <span class="mini-fing">${recorderSVG(n, { width: 26, labels: false, idPrefix: 'r' + n.id })}</span>
            <span class="meta">
              <span class="chip ${noteHands(n)}">${HAND_KO[noteHands(n)]}</span>
              <button class="btn btn-soft btn-sm" data-play="${n.id}">${ICONS.play}<span class="sr-only">${esc(n.ko)}</span> 듣기</button>
              <button class="btn btn-ghost btn-sm" data-open="${n.id}">자세히</button>
            </span>
          </div>`).join('');
      });
      html += '</div>';
      wrap.innerHTML = html;
    }
  }

  function resetChartFilter() {
    chartFilter.q = ''; chartFilter.oct = 'all'; chartFilter.hand = 'all';
    chartFilter.diff = 'all'; chartFilter.favOnly = false;
    $('#chartSearch').value = '';
    $('#chartSearchClear').classList.remove('show');
    syncFilterChips();
    renderChart();
  }

  function syncFilterChips() {
    $$('#chartFilters [data-filter]').forEach(chip => {
      const [key, val] = chip.dataset.filter.split(':');
      const on = key === 'fav' ? chartFilter.favOnly : String(chartFilter[key]) === val;
      chip.setAttribute('aria-pressed', String(on));
    });
    $$('#chartView button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === chartFilter.view)));
  }

  let searchDebounce = null;
  function bindChart() {
    $('#chartSearch').addEventListener('input', e => {
      clearTimeout(searchDebounce);
      $('#chartSearchClear').classList.toggle('show', !!e.target.value);
      searchDebounce = setTimeout(() => { chartFilter.q = e.target.value; renderChart(); }, 140);
    });
    $('#chartSearchClear').addEventListener('click', () => {
      $('#chartSearch').value = ''; chartFilter.q = '';
      $('#chartSearchClear').classList.remove('show');
      renderChart(); $('#chartSearch').focus();
    });
    $('#chartFilters').addEventListener('click', e => {
      const chip = e.target.closest('[data-filter]');
      if (!chip) return;
      const [key, val] = chip.dataset.filter.split(':');
      if (key === 'fav') chartFilter.favOnly = !chartFilter.favOnly;
      else chartFilter[key] = (String(chartFilter[key]) === val) ? 'all' : val;
      syncFilterChips(); renderChart();
    });
    $('#chartView').addEventListener('click', e => {
      const b = e.target.closest('button[data-view]');
      if (!b) return;
      chartFilter.view = b.dataset.view;
      syncFilterChips(); renderChart();
    });
  }

  /* ====================================================
     음 상세 모달
     ==================================================== */
  let modalNote = null, modalLastFocus = null;

  function openNoteModal(id) {
    const note = NOTE_MAP[id];
    if (!note) return;
    modalNote = id;
    modalLastFocus = document.activeElement;
    renderModal();
    $('#modalBackdrop').classList.add('open');
    $('#noteModal').classList.add('open');
    $('#modalClose').focus();
    pushRecent('note', id);
    markSeen(id);
  }

  function renderModal() {
    const note = NOTE_MAP[modalNote];
    if (!note) return;
    const fav = State.favs.has(note.id);
    const f = fingeringOf(note);
    const sysRow = note.sys ? `
      <div style="display:flex;gap:8px;justify-content:center;align-items:center">
        <span style="font-size:13px;color:var(--ink-faint);font-weight:700">운지 방식</span>
        <div class="sys-toggle" role="group" aria-label="운지 체계 고르기">
          <button data-modalsys="G" aria-pressed="${State.system === 'G'}">독일식 G</button>
          <button data-modalsys="B" aria-pressed="${State.system === 'B'}">바로크식 B</button>
        </div>
      </div>` : '';
    const accInfo = note.alt ? `<p style="text-align:center;font-size:13.5px;color:var(--ink-soft)">
      <b>${esc(note.ko)}</b>${note.ko.endsWith('♯') ? '과' : '와'} <b>${esc(note.alt)}</b>은 같은 소리예요 — 이름만 두 가지!</p>` : '';
    $('#modalBody').innerHTML = `
      <div class="nm-stage">
        <div style="flex:1;min-width:150px;max-width:190px">${staffSVG(note, { width: 170 })}</div>
        ${recorderSVG(note, { width: 100, labels: true, idPrefix: 'm' })}
      </div>
      <p class="fing-text">${fingeringTextRich(note)}</p>
      ${accInfo}
      ${sysRow}
      <div class="nm-tip"><b>왜 이렇게 불까요?</b> ${esc(note.tip)}</div>
    `;
    $('#modalTitle').textContent = note.ko;
    $('#modalEn').textContent = note.en + (note.alt ? ' · ' + note.alt : '');
    const star = $('#modalStar');
    star.dataset.star = note.id;
    star.setAttribute('aria-pressed', String(fav));
    star.setAttribute('aria-label', (fav ? '즐겨찾기에서 빼기' : '즐겨찾기에 담기') + ' — ' + note.ko);
    $('#modalPlay').dataset.play = note.id;
    renderAddMenu();
  }

  function fingeringTextRich(note) {
    const f = fingeringOf(note);
    const parts = [];
    if (f.t === 1) parts.push('<b>뒤 구멍</b>');
    else if (f.t === 0.5) parts.push('<b>뒤 구멍 반만</b> (핀치!)');
    const left = [], right = [];
    f.h.forEach((v, i) => {
      if (v === 0) return;
      const txt = (i + 1) + (v === 0.5 ? '번 반만' : '번');
      (HOLE_HAND[i] === 'left' ? left : right).push(txt);
    });
    if (left.length) parts.push('<b>' + left.join(' · ') + '</b>');
    if (right.length) parts.push('<b class="r">' + right.join(' · ') + '</b>');
    if (!parts.length) return '모든 구멍을 활짝 열어요';
    return parts.join(' + ') + ' 막아요';
  }

  function renderAddMenu() {
    const list = $('#addMenuList');
    const note = NOTE_MAP[modalNote];
    if (!State.collections.length) {
      list.innerHTML = `<button data-newcol="1">${ICONS.plus} 새 모음 만들기</button>`;
    } else {
      list.innerHTML = State.collections.map(c => {
        const has = c.items.includes(modalNote);
        return `<button data-addcol="${c.id}">${has ? '✓ ' : ''}${esc(c.name)} <span style="color:var(--ink-faint)">(${c.items.length})</span></button>`;
      }).join('') + `<button data-newcol="1" style="color:var(--left)">${ICONS.plus} 새 모음 만들기</button>`;
    }
  }

  function closeModal() {
    $('#modalBackdrop').classList.remove('open');
    $('#noteModal').classList.remove('open');
    $('#addMenuList').classList.remove('open');
    modalNote = null;
    if (modalLastFocus && modalLastFocus.focus) modalLastFocus.focus();
  }

  function refreshModal() { if (modalNote) renderModal(); }

  function bindModal() {
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalBackdrop').addEventListener('click', closeModal);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modalNote) closeModal();
      /* 포커스 트랩 */
      if (e.key === 'Tab' && modalNote) {
        const focusables = $$('#noteModal button, #noteModal [tabindex="0"]').filter(el => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    $('#noteModal').addEventListener('click', e => {
      const sysBtn = e.target.closest('[data-modalsys]');
      if (sysBtn && State.system !== sysBtn.dataset.modalsys) {
        State.system = sysBtn.dataset.modalsys; saveState(); applySystem();
      }
      const addBtn = e.target.closest('#addMenuBtn');
      if (addBtn) {
        const list = $('#addMenuList');
        list.classList.toggle('open');
        return;
      }
      const colBtn = e.target.closest('[data-addcol]');
      if (colBtn) {
        const col = State.collections.find(c => c.id === colBtn.dataset.addcol);
        if (col) {
          const i = col.items.indexOf(modalNote);
          if (i >= 0) { col.items.splice(i, 1); toast(`'${col.name}'에서 뺐어요`); }
          else { col.items.push(modalNote); toast(`'${col.name}'에 담았어요`); }
          saveState(); renderAddMenu(); renderCollections();
        }
        return;
      }
      const newBtn = e.target.closest('[data-newcol]');
      if (newBtn) {
        const name = prompt('새 모음의 이름을 지어 주세요 (예: 내가 좋아하는 음)');
        if (name && name.trim()) {
          const col = { id: 'c' + Date.now(), name: name.trim().slice(0, 20), items: [modalNote] };
          State.collections.push(col); saveState();
          renderAddMenu(); renderCollections();
          toast(`'${col.name}' 모음을 만들었어요`);
        }
      }
    });
  }

  /* ====================================================
     연습하기 — 탭 (퀴즈 / 운지 고르기 / 따라 연주)
     ==================================================== */
  function showPracticeTab(tab) {
    $$('#practiceTabs .filter-chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
    $('#quizPanel').hidden = tab !== 'quiz';
    $('#songsPanel').hidden = tab !== 'songs';
    if (tab !== 'songs') pauseSong();
    if (tab === 'quiz' && !Quiz.active) Quiz.renderSetup();
  }

  /* ---------- 퀴즈 ---------- */
  const Quiz = {
    active: false, mode: 'f2n', poolId: 'left',
    qs: [], idx: 0, score: 0, answered: false, results: [],

    renderSetup() {
      Quiz.active = false;
      $('#quizPanel').innerHTML = `
      <div class="quiz-setup">
        <div>
          <h3 style="font-size:17px;font-weight:800;margin-bottom:6px">어떤 퀴즈를 풀까요?</h3>
          <div class="opt-row" role="group" aria-label="퀴즈 종류">
            <button class="filter-chip" data-qmode="f2n" aria-pressed="${Quiz.mode === 'f2n'}">운지 보고 음 맞히기</button>
            <button class="filter-chip" data-qmode="n2f" aria-pressed="${Quiz.mode === 'n2f'}">음 보고 운지 고르기</button>
          </div>
        </div>
        <div>
          <h3 style="font-size:15px;font-weight:800;margin-bottom:6px">범위</h3>
          <div class="opt-row" role="group" aria-label="문제 범위">
            ${QUIZ_POOLS.map(p => `<button class="filter-chip" data-qpool="${p.id}" aria-pressed="${Quiz.poolId === p.id}">${p.name}</button>`).join('')}
          </div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary" id="quizStart">${ICONS.play}10문제 도전!</button>
          <span style="font-size:13px;color:var(--ink-faint)">${Quiz.bestText()}</span>
        </div>
      </div>`;
    },
    bestText() {
      const key = Quiz.mode + ':' + Quiz.poolId;
      const b = State.quizBest[key];
      return b != null ? `최고 기록: ${b}/10` : '첫 도전이에요!';
    },
    start() {
      const pool = NOTES.filter(QUIZ_POOLS.find(p => p.id === Quiz.poolId).filter);
      const qs = [];
      let bag = [];
      for (let i = 0; i < 10; i++) {
        if (!bag.length) bag = shuffle([...pool]);
        qs.push(bag.pop());
      }
      Quiz.qs = qs; Quiz.idx = 0; Quiz.score = 0; Quiz.results = []; Quiz.active = true;
      Quiz.renderQ();
    },
    renderQ() {
      const note = Quiz.qs[Quiz.idx];
      Quiz.answered = false;
      const opts = Quiz.makeOptions(note);
      const stage = Quiz.mode === 'f2n'
        ? `${recorderSVG(note, { width: 72, labels: true, idPrefix: 'q' })}
           <div class="prompt">이 운지는<br>무슨 음일까요?</div>`
        : `<div class="prompt">${esc(note.ko)}<br><span style="font-size:15px;font-family:var(--font-mono);color:var(--ink-faint)">${esc(note.en)}</span></div>
           <div style="max-width:170px;flex:1;min-width:140px">${staffSVG(note, { width: 160 })}</div>`;
      const optHTML = Quiz.mode === 'f2n'
        ? opts.map((o, i) => `<button class="quiz-opt" data-qopt="${i}"><span style="font-size:19px">${esc(o.ko)}</span><span style="font-family:var(--font-mono);font-size:11.5px;color:var(--ink-faint)">${esc(o.en)}</span></button>`).join('')
        : opts.map((o, i) => `<button class="quiz-opt" data-qopt="${i}" aria-label="운지 보기 ${i + 1}">${recorderSVG(o, { width: 46, labels: false, idPrefix: 'qo' + i })}</button>`).join('');
      $('#quizPanel').innerHTML = `
      <div class="quiz-q">
        <div class="quiz-meta">
          <div class="quiz-step-dots" aria-label="진행: ${Quiz.idx + 1}/10">
            ${Quiz.qs.map((_, i) => `<i class="${i === Quiz.idx ? 'cur' : (Quiz.results[i] === true ? 'good' : Quiz.results[i] === false ? 'bad' : '')}"></i>`).join('')}
          </div>
          <span class="quiz-score">${Quiz.idx + 1} / 10 · 맞힌 수 ${Quiz.score}</span>
        </div>
        <div class="quiz-stage">${stage}</div>
        <div class="quiz-options">${optHTML}</div>
        <div class="quiz-foot" id="quizFoot"></div>
      </div>`;
      Quiz._opts = opts; Quiz._note = note;
    },
    makeOptions(note) {
      const pool = NOTES.filter(n => n.id !== note.id);
      /* 비슷한 음(같은 그룹)을 우선 섞어 도전적으로 */
      const near = shuffle(pool.filter(n => n.oct === note.oct)).slice(0, 2);
      const rest = shuffle(pool.filter(n => !near.includes(n)));
      const distract = [...near, ...rest].slice(0, 3);
      return shuffle([note, ...distract]);
    },
    answer(i) {
      if (Quiz.answered) return;
      Quiz.answered = true;
      const correct = Quiz._opts[i].id === Quiz._note.id;
      Quiz.results[Quiz.idx] = correct;
      if (correct) Quiz.score++;
      $$('#quizPanel .quiz-opt').forEach((b, bi) => {
        b.disabled = true;
        if (Quiz._opts[bi].id === Quiz._note.id) b.classList.add('correct');
        else if (bi === i) b.classList.add('wrong');
      });
      AudioEngine.play(Quiz._note.freq, 0.7);
      markSeen(Quiz._note.id);
      const foot = $('#quizFoot');
      foot.innerHTML = `
        <span class="fb ${correct ? 'good' : 'bad'}">${correct ? '딩동댕! 정답이에요 🎉' : `아쉬워요! 정답은 ${esc(Quiz._note.ko)}`}</span>
        <button class="btn btn-primary btn-sm" id="quizNext">${Quiz.idx === 9 ? '결과 보기' : '다음 문제'}</button>`;
      announce(correct ? '정답입니다' : `오답입니다. 정답은 ${Quiz._note.ko}`);
      $('#quizNext').focus();
    },
    next() {
      if (Quiz.idx === 9) return Quiz.finish();
      Quiz.idx++; Quiz.renderQ();
    },
    finish() {
      Quiz.active = false;
      const key = Quiz.mode + ':' + Quiz.poolId;
      const prev = State.quizBest[key];
      const isBest = prev == null || Quiz.score > prev;
      if (isBest) { State.quizBest[key] = Quiz.score; saveState(); renderQuizBest(); }
      const msg = Quiz.score === 10 ? '완벽해요! 운지 박사님 🏆'
        : Quiz.score >= 7 ? '훌륭해요! 조금만 더 하면 만점!'
        : Quiz.score >= 4 ? '좋아요! 틀린 음은 운지표에서 다시 봐요.'
        : '괜찮아요, 처음엔 다 그래요. 천천히 다시 도전!';
      $('#quizPanel').innerHTML = `
      <div class="quiz-result">
        <div class="quiz-step-dots">${Quiz.results.map(r => `<i class="${r ? 'good' : 'bad'}"></i>`).join('')}</div>
        <div class="score-big">${Quiz.score} / 10</div>
        <p class="msg">${esc(msg)} ${isBest && prev != null ? '— 최고 기록 경신! ✨' : ''}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          <button class="btn btn-primary" id="quizRetry">${ICONS.restart}다시 도전</button>
          <button class="btn btn-ghost" id="quizSetup">범위 바꾸기</button>
        </div>
      </div>`;
    },
  };

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function bindQuiz() {
    $('#quizPanel').addEventListener('click', e => {
      const t = e.target;
      const modeBtn = t.closest('[data-qmode]');
      if (modeBtn) { Quiz.mode = modeBtn.dataset.qmode; Quiz.renderSetup(); return; }
      const poolBtn = t.closest('[data-qpool]');
      if (poolBtn) { Quiz.poolId = poolBtn.dataset.qpool; Quiz.renderSetup(); return; }
      if (t.closest('#quizStart')) { Quiz.start(); return; }
      const opt = t.closest('[data-qopt]');
      if (opt) { Quiz.answer(+opt.dataset.qopt); return; }
      if (t.closest('#quizNext')) { Quiz.next(); return; }
      if (t.closest('#quizRetry')) { Quiz.start(); return; }
      if (t.closest('#quizSetup')) { Quiz.renderSetup(); return; }
    });
  }

  /* ---------- 따라 연주 ---------- */
  const Song = { cur: null, idx: -1, playing: false, timer: null, tempo: 1 };

  function renderSongList() {
    $('#songGrid').innerHTML = SONGS.map(s => `
      <button class="card lift song-card${Song.cur === s.id ? ' active' : ''}" data-song="${s.id}">
        <span class="t">${ICONS.note} ${esc(s.name)}
          ${State.progress.songs.includes(s.id) ? '<span class="chip ok">완주!</span>' : ''}</span>
        <span class="d">${esc(s.desc)}</span>
        <span style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="chip ${s.hand}">${HAND_KO[s.hand]}</span>
          <span class="chip">${esc(s.diff)}</span>
          <span class="chip mono">♩=${s.bpm}</span>
        </span>
      </button>`).join('');
  }

  function selectSong(id) {
    pauseSong();
    Song.cur = id; Song.idx = -1;
    renderSongList();
    const song = SONG_MAP[id];
    $('#playerWrap').hidden = false;
    $('#songTitle').textContent = song.name;
    $('#noteRibbon').innerHTML = song.seq.map((n, i) => `
      <button class="ribbon-note" data-ribbon="${i}" aria-label="${i + 1}번째 음 ${esc(NOTE_MAP[n[0]].ko)}">
        <span class="n">${esc(NOTE_MAP[n[0]].ko.replace('높은 ', ''))}</span>
        <span class="ly">${esc(n[2] || '·')}</span>
      </button>`).join('');
    refreshSongStage();
    pushRecent('song', id);
    $('#playerWrap').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }

  function refreshSongStage() {
    if (!Song.cur) return;
    const song = SONG_MAP[Song.cur];
    const cur = Song.idx >= 0 && Song.idx < song.seq.length ? song.seq[Song.idx] : null;
    const note = cur ? NOTE_MAP[cur[0]] : NOTE_MAP[song.seq[0][0]];
    $('#songStage').innerHTML = `
      <div class="cur-name">${cur ? esc(note.ko) : '준비'}<small>${cur ? esc(note.en) : '재생을 눌러 시작해요'}</small></div>
      ${recorderSVG(note, { width: 86, labels: false, idPrefix: 's' })}
      <div style="max-width:160px;flex:1;min-width:130px">${staffSVG(note, { width: 150 })}</div>`;
    $$('#noteRibbon .ribbon-note').forEach((el, i) => {
      el.classList.toggle('cur', i === Song.idx);
      el.classList.toggle('played', i < Song.idx);
    });
    const curEl = $(`[data-ribbon="${Song.idx}"]`);
    if (curEl) {
      const rb = $('#noteRibbon');
      rb.scrollLeft = curEl.offsetLeft - rb.clientWidth / 2 + curEl.clientWidth / 2;
    }
  }

  function songBeat() {
    const song = SONG_MAP[Song.cur];
    return 60 / (song.bpm * Song.tempo);
  }

  function stepSong(idx) {
    const song = SONG_MAP[Song.cur];
    if (idx >= song.seq.length) return finishSong();
    Song.idx = idx;
    const [noteId, beats] = song.seq[idx];
    const dur = songBeat() * beats;
    AudioEngine.play(NOTE_MAP[noteId].freq, Math.max(0.18, dur * 0.92));
    markSeen(noteId);
    refreshSongStage();
    Song.timer = setTimeout(() => { if (Song.playing) stepSong(idx + 1); }, dur * 1000);
  }

  function playSong() {
    if (!Song.cur) return;
    Song.playing = true;
    updatePlayBtn();
    stepSong(Song.idx < 0 ? 0 : Song.idx);
  }
  function pauseSong() {
    Song.playing = false;
    clearTimeout(Song.timer);
    AudioEngine.stopAll();
    updatePlayBtn();
  }
  function finishSong() {
    Song.playing = false;
    clearTimeout(Song.timer);
    updatePlayBtn();
    if (!State.progress.songs.includes(Song.cur)) {
      State.progress.songs.push(Song.cur);
      saveState(); refreshProgress(); renderSongList();
    }
    toast('🎉 완주! 정말 멋져요!');
    announce('곡을 끝까지 연주했어요');
    Song.idx = -1;
    refreshSongStage();
  }
  function updatePlayBtn() {
    const b = $('#songPlay');
    if (!b) return;
    b.innerHTML = (Song.playing ? ICONS.pause : ICONS.play) + (Song.playing ? '잠깐 멈춤' : '재생');
    b.setAttribute('aria-label', Song.playing ? '잠깐 멈춤' : '재생');
  }

  function bindSongs() {
    $('#songGrid').addEventListener('click', e => {
      const b = e.target.closest('[data-song]');
      if (b) selectSong(b.dataset.song);
    });
    $('#songPlay').addEventListener('click', () => Song.playing ? pauseSong() : playSong());
    $('#songRestart').addEventListener('click', () => { pauseSong(); Song.idx = -1; refreshSongStage(); });
    $('#songPrev').addEventListener('click', () => {
      pauseSong();
      const song = SONG_MAP[Song.cur]; if (!song) return;
      Song.idx = Math.max(0, Song.idx - 1);
      AudioEngine.play(NOTE_MAP[song.seq[Song.idx][0]].freq, 0.7);
      refreshSongStage();
    });
    $('#songNext').addEventListener('click', () => {
      pauseSong();
      const song = SONG_MAP[Song.cur]; if (!song) return;
      Song.idx = Math.min(song.seq.length - 1, Song.idx + 1);
      AudioEngine.play(NOTE_MAP[song.seq[Song.idx][0]].freq, 0.7);
      refreshSongStage();
    });
    $('#noteRibbon').addEventListener('click', e => {
      const b = e.target.closest('[data-ribbon]');
      if (!b) return;
      pauseSong();
      Song.idx = +b.dataset.ribbon;
      const song = SONG_MAP[Song.cur];
      AudioEngine.play(NOTE_MAP[song.seq[Song.idx][0]].freq, 0.7);
      refreshSongStage();
    });
    $('#songTempo').addEventListener('input', e => {
      Song.tempo = +e.target.value / 100;
      $('#tempoOut').textContent = e.target.value + '%';
    });
    /* 화면 밖으로 나가면 자동 멈춤 (성능 + 배려) */
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (!en.isIntersecting && Song.playing) pauseSong(); });
    }, { threshold: 0 });
    io.observe($('#practice'));
  }

  /* ====================================================
     보관함 (즐겨찾기 · 최근 · 모음 · 진행 · 데이터)
     ==================================================== */
  function renderFavs() {
    const wrap = $('#favItems');
    $('#favCount').textContent = State.favs.size + '개';
    if (!State.favs.size) {
      wrap.innerHTML = `<div class="empty-state" style="padding:20px;width:100%">
        <div class="t">아직 비어 있어요</div>
        <div class="d">음 카드의 별(☆)을 누르면 여기에 모여요.</div>
        <div class="actions"><a class="btn btn-soft btn-sm" href="#chart">운지표 보러 가기</a></div></div>`;
      return;
    }
    wrap.innerHTML = [...State.favs].map(id => {
      const n = NOTE_MAP[id]; if (!n) return '';
      return `<span class="lib-note-chip">
        <button data-open="${id}" style="font-weight:700">${esc(n.ko)}</button>
        <button class="x" data-unfav="${id}" aria-label="${esc(n.ko)} 즐겨찾기에서 빼기">${ICONS.close.replace('width="2.2"', 'width="2.6"')}</button>
      </span>`;
    }).join('');
  }

  function renderRecent() {
    const wrap = $('#recentItems');
    if (!wrap) return;
    if (!State.recent.length) {
      wrap.innerHTML = `<p style="font-size:13.5px;color:var(--ink-faint)">아직 본 항목이 없어요. 어디든 눌러 보면 자동으로 기록돼요.</p>`;
      return;
    }
    wrap.innerHTML = State.recent.slice(0, 8).map(r => {
      let name = '', icon = '♪';
      if (r.type === 'note' && NOTE_MAP[r.id]) { name = NOTE_MAP[r.id].ko; icon = NOTE_MAP[r.id].ko[0]; }
      else if (r.type === 'set' && SET_MAP[r.id]) { name = SET_MAP[r.id].name; icon = String(SET_MAP[r.id].no); }
      else if (r.type === 'song' && SONG_MAP[r.id]) { name = SONG_MAP[r.id].name; icon = '♪'; }
      else if (r.type === 'prep' && PREP_MAP[r.id]) { name = PREP_MAP[r.id].name; icon = '✦'; }
      else return '';
      return `<button class="lib-note-chip" data-goitem="${r.type}:${r.id}">
        <span style="color:var(--ink-faint)">${esc(icon)}</span> ${esc(name)}</button>`;
    }).join('');
  }

  function renderCollections() {
    const wrap = $('#collectionList');
    if (!State.collections.length) {
      wrap.innerHTML = `<p style="font-size:13.5px;color:var(--ink-faint)">
        모음은 나만의 음 묶음이에요. 음 상세 화면에서 "모음에 담기"를 누르거나, 아래에서 새로 만들어 보세요.</p>`;
      return;
    }
    wrap.innerHTML = State.collections.map(c => `
      <div class="collection-box">
        <div class="c-head">
          <span class="c-name">${esc(c.name)}</span>
          <span class="c-cnt">${c.items.length}개</span>
          <button class="icon-btn c-del" data-delcol="${c.id}" aria-label="'${esc(c.name)}' 모음 지우기" style="width:32px;height:32px">${ICONS.trash}</button>
        </div>
        <div class="lib-items">
          ${c.items.length ? c.items.map(id => {
            const n = NOTE_MAP[id]; if (!n) return '';
            return `<span class="lib-note-chip">
              <button data-open="${id}">${esc(n.ko)}</button>
              <button class="x" data-colrm="${c.id}:${id}" aria-label="${esc(n.ko)} 빼기">${ICONS.close}</button></span>`;
          }).join('') : '<span style="font-size:13px;color:var(--ink-faint)">비어 있어요 — 음 상세에서 담아 보세요.</span>'}
        </div>
      </div>`).join('');
  }

  function renderQuizBest() {
    const wrap = $('#quizBestItems');
    const keys = Object.keys(State.quizBest);
    if (!keys.length) { wrap.innerHTML = `<p style="font-size:13.5px;color:var(--ink-faint)">아직 기록이 없어요. 퀴즈에 도전해 보세요!</p>`; return; }
    wrap.innerHTML = keys.map(k => {
      const [mode, pool] = k.split(':');
      const p = QUIZ_POOLS.find(x => x.id === pool);
      return `<span class="chip amber">🏆 ${mode === 'f2n' ? '음 맞히기' : '운지 고르기'} · ${p ? p.name : pool} — ${State.quizBest[k]}/10</span>`;
    }).join(' ');
  }

  function refreshProgress() {
    const total = PREP.length + SETS.length + NOTES.length + SONGS.length;
    const done = State.progress.prep.length + State.progress.sets.length
      + State.progress.seen.length + State.progress.songs.length;
    const pct = Math.round(done / total * 100);
    /* 사이드바: 운지 구멍이 채워지듯 (8개 도트) */
    const dots = $('#sidebarDots');
    if (dots) {
      const filled = pct / 100 * 8;
      dots.innerHTML = Array.from({ length: 8 }, (_, i) => {
        const cls = i < Math.floor(filled) ? 'fill' : (i < filled ? 'half' : '');
        return `<i class="${cls}"></i>`;
      }).join('');
      $('#sidebarPct').textContent = pct + '%';
    }
    const bars = $('#progressBars');
    if (bars) {
      const rows = [
        ['준비하기', State.progress.prep.length, PREP.length],
        ['운지 세트', State.progress.sets.length, SETS.length],
        ['들어본 음', State.progress.seen.length, NOTES.length],
        ['완주한 곡', State.progress.songs.length, SONGS.length],
      ];
      bars.innerHTML = rows.map(([lbl, v, max]) => `
        <div class="progress-line">
          <span class="lbl">${lbl}</span>
          <span class="bar"><i style="width:${Math.round(v / max * 100)}%"></i></span>
          <span class="val">${v}/${max}</span>
        </div>`).join('');
    }
  }

  function bindLibrary() {
    $('#newColBtn').addEventListener('click', () => {
      const input = $('#newColName');
      const name = input.value.trim();
      if (!name) { toast('모음 이름을 먼저 적어 주세요'); input.focus(); return; }
      State.collections.push({ id: 'c' + Date.now(), name: name.slice(0, 20), items: [] });
      saveState(); input.value = '';
      renderCollections();
      toast('새 모음을 만들었어요. 음 상세에서 담아 보세요!');
    });
    $('#newColName').addEventListener('keydown', e => { if (e.key === 'Enter') $('#newColBtn').click(); });
    $('#exportBtn').addEventListener('click', exportData);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) importData(e.target.files[0]);
      e.target.value = '';
    });
    $('#resetBtn').addEventListener('click', resetData);
  }

  /* ====================================================
     투어 (첫 방문 3스텝 — 건너뛰기 가능)
     ==================================================== */
  const TOUR_STEPS = [
    { target: '#heroPlayground', t: '구멍을 눌러 보세요', d: '리코더 구멍을 누르면 운지가 바뀌고, 맞는 음을 바로 알려줘요. 뒤 구멍은 누를 때마다 막기 → 반만 → 열기로 바뀌어요.' },
    { target: '#heroListen', t: '소리도 들어 봐요', d: '완성된 운지의 실제 소리를 들려줘요. 모든 음 카드에도 "들어보기" 버튼이 있어요.' },
    { target: '#searchBtn', t: '뭐든 빨리 찾기', d: '여기를 누르거나 Ctrl+K를 누르면 음·연습·노래 어디든 바로 갈 수 있어요.' },
  ];
  let tourIdx = -1, tourTarget = null;

  function startTour() {
    tourIdx = 0; showTourStep();
  }
  function showTourStep() {
    cleanupSpot();
    if (tourIdx >= TOUR_STEPS.length) return endTour(true);
    const step = TOUR_STEPS[tourIdx];
    const target = $(step.target);
    if (!target) return endTour(true);
    tourTarget = target;
    target.classList.add('tour-spot');
    $('#tourBackdrop').classList.add('open');
    const card = $('#tourCard');
    $('#tourStepNo').textContent = `${tourIdx + 1} / ${TOUR_STEPS.length} 단계`;
    $('#tourTitle').textContent = step.t;
    $('#tourDesc').textContent = step.d;
    $('#tourNext').textContent = tourIdx === TOUR_STEPS.length - 1 ? '시작하기!' : '다음';
    card.classList.add('open');
    const r = target.getBoundingClientRect();
    const ch = 210, cw = Math.min(330, window.innerWidth - 32);
    let top = r.bottom + 14;
    if (top + ch > window.innerHeight) top = Math.max(12, r.top - ch);
    let left = Math.min(Math.max(12, r.left), window.innerWidth - cw - 12);
    card.style.top = top + 'px'; card.style.left = left + 'px';
    $('#tourNext').focus();
  }
  function cleanupSpot() {
    if (tourTarget) tourTarget.classList.remove('tour-spot');
    tourTarget = null;
  }
  function endTour(done) {
    cleanupSpot();
    $('#tourBackdrop').classList.remove('open');
    $('#tourCard').classList.remove('open');
    tourIdx = -1;
    State.toured = true; saveState();
    if (done) toast('준비 끝! 솔(G5)부터 시작해 볼까요?');
  }
  function bindTour() {
    $('#tourNext').addEventListener('click', () => { tourIdx++; showTourStep(); });
    $('#tourSkip').addEventListener('click', () => endTour(false));
    $('#tourBackdrop').addEventListener('click', () => endTour(false));
    $('#tourReplay').addEventListener('click', () => {
      location.hash = '#home';
      setTimeout(startTour, 300);
    });
  }

  /* ====================================================
     공통 이벤트 (위임)
     ==================================================== */
  function bindDelegated() {
    document.addEventListener('click', e => {
      const play = e.target.closest('[data-play]');
      if (play) { playNote(play.dataset.play, 0.9, play.closest('.note-card') || play); return; }
      const open = e.target.closest('[data-open]');
      if (open) { openNoteModal(open.dataset.open); return; }
      const star = e.target.closest('[data-star]');
      if (star) { toggleFav(star.dataset.star); return; }
      const unfav = e.target.closest('[data-unfav]');
      if (unfav) { toggleFav(unfav.dataset.unfav); return; }
      const goi = e.target.closest('[data-goitem]');
      if (goi) { const [t, id] = goi.dataset.goitem.split(':'); goItem(t, id); return; }
      const cur = e.target.closest('[data-curated]');
      if (cur) { const [t, id] = cur.dataset.curated.split(':'); goItem(t, id); return; }
      const resume = e.target.closest('[data-resume]');
      if (resume) { const [t, id] = resume.dataset.resume.split(':'); goItem(t, id); return; }
      const pt = e.target.closest('[data-preptoggle]');
      if (pt) {
        const card = $('#prep-' + pt.dataset.preptoggle);
        const isOpen = card.classList.toggle('open');
        pt.setAttribute('aria-expanded', String(isOpen));
        pt.textContent = isOpen ? '접기' : '자세히 보기';
        if (isOpen) pushRecent('prep', pt.dataset.preptoggle);
        return;
      }
      const pd = e.target.closest('[data-prepdone]');
      if (pd) {
        const id = pd.dataset.prepdone;
        const arr = State.progress.prep;
        const i = arr.indexOf(id);
        if (i >= 0) arr.splice(i, 1); else arr.push(id);
        saveState();
        pd.setAttribute('aria-pressed', String(i < 0));
        pd.querySelector('span').textContent = i < 0 ? '완료!' : '다 했어요';
        if (i < 0) toast('참 잘했어요! ✦');
        refreshProgress();
        return;
      }
      const sd = e.target.closest('[data-setdone]');
      if (sd) {
        const id = sd.dataset.setdone;
        const arr = State.progress.sets;
        const i = arr.indexOf(id);
        if (i >= 0) arr.splice(i, 1); else arr.push(id);
        saveState();
        sd.setAttribute('aria-pressed', String(i < 0));
        sd.querySelector('span').textContent = i < 0 ? '세트 완료!' : '이 세트 다 했어요';
        if (i < 0) { toast('한 세트 클리어! 🎉'); pushRecent('set', id); }
        refreshProgress();
        return;
      }
      const delcol = e.target.closest('[data-delcol]');
      if (delcol) {
        const c = State.collections.find(x => x.id === delcol.dataset.delcol);
        if (c && confirm(`'${c.name}' 모음을 지울까요?`)) {
          State.collections = State.collections.filter(x => x.id !== c.id);
          saveState(); renderCollections(); toast('모음을 지웠어요');
        }
        return;
      }
      const colrm = e.target.closest('[data-colrm]');
      if (colrm) {
        const [cid, nid] = colrm.dataset.colrm.split(':');
        const c = State.collections.find(x => x.id === cid);
        if (c) {
          c.items = c.items.filter(x => x !== nid);
          saveState(); renderCollections();
        }
        return;
      }
      const tab = e.target.closest('#practiceTabs [data-tab]');
      if (tab) { showPracticeTab(tab.dataset.tab); return; }
    });
  }

  /* ====================================================
     초기화
     ==================================================== */
  function renderAll() {
    renderHome(); renderPrep(); renderLearn(); renderChart(); syncFilterChips();
    renderSongList(); renderFavs(); renderRecent(); renderCollections();
    renderQuizBest(); refreshProgress(); Quiz.renderSetup();
  }

  function init() {
    renderAll();
    heroPg = makePlayground('heroPlayground', { width: 118, autoPlay: true });
    labPg = makePlayground('labPlayground', { width: 142, autoPlay: true });
    bindChart(); bindModal(); bindQuiz(); bindSongs(); bindLibrary();
    bindTour(); bindDelegated();
    showPracticeTab('quiz');
  }

  return {
    init, renderAll, renderLearn, renderChart, renderFavs, renderRecent,
    renderCollections, refreshProgress, refreshPlayground, refreshModal,
    refreshSongStage, openNoteModal, openPrep, selectSong, showPracticeTab,
    pauseSong, startTour, chartFilter,
  };
})();
window.Views = Views;
