'use strict';
/* 3차: 사진 — 내 사진 업로드(IndexedDB), 끼니별 대표 사진 선택(웹 예시 ↔ 내 사진), 웹 이미지 URL 추출 */

/* ============ IndexedDB ============ */
const DB_NAME = 'iyusik-photos', STORE = 'photos';
let _db = null;
function idb() {
  if (_db) return _db;
  _db = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('이 브라우저는 사진 저장소(IndexedDB)를 지원하지 않아요'));
    const q = indexedDB.open(DB_NAME, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
  _db.catch(() => { _db = null; });
  return _db;
}
async function idbTx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), r = fn(t.objectStore(STORE));
    t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const idbPut = (id, blob) => idbTx('readwrite', s => s.put(blob, id));
const idbGet = id => idbTx('readonly', s => s.get(id));
const idbDel = id => idbTx('readwrite', s => s.delete(id));
const idbClear = () => idbTx('readwrite', s => s.clear());
async function idbStats() {
  const db = await idb();
  return new Promise((res, rej) => {
    let n = 0, size = 0; const q = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    q.onsuccess = () => { const c = q.result; if (c) { n++; size += c.value.size || 0; c.continue(); } else res({ n, size }); };
    q.onerror = () => rej(q.error);
  });
}

/* ============ 사진 데이터 ============ */
const _urlCache = {};
async function photoURL(id) {
  if (_urlCache[id]) return _urlCache[id];
  const b = await idbGet(id); if (!b) return null;
  return (_urlCache[id] = URL.createObjectURL(b));
}
function hydratePhotos(root = document) {
  root.querySelectorAll('img[data-pid]:not([src])').forEach(async img => {
    try { const u = await photoURL(img.dataset.pid); if (u) img.src = u; else img.classList.add('missing'); }
    catch (e) { img.classList.add('missing'); }
  });
}
const mealPhotos = (date, slot) => Object.values(S.photos).filter(p => p.kind === 'meal' && p.date === date && p.slot === slot).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
function webImgOf(meal) {
  if (meal.webImg) return { url: meal.webImg, src: '직접 지정한 이미지' };
  const r = meal.recipeId && recById(meal.recipeId);
  if (r?.img) return { url: r.img, src: '레시피 대표 이미지' };
  const id = (meal.ing || []).find(i => i !== 'rice') || (meal.ing || [])[0], u = id && REFD[id]?.img;
  return u ? { url: u, src: `${ING[id].name} 도감 이미지 (Wikipedia)` } : null;
}
// 대표 사진: 선택값 > (기본) 가장 최근 내 사진 > 웹 예시 사진
function repOf(date, slot) {
  const meal = S.plan[date]?.[slot]; if (!meal) return null;
  const ups = mealPhotos(date, slot), pk = S.photoPick[`${date}|${slot}`], web = webImgOf(meal);
  if (pk?.mode === 'web' && web) return { kind: 'web', url: web.url, src: web.src };
  if (pk?.mode === 'upload') { const p = ups.find(x => x.id === pk.id); if (p) return { kind: 'upload', id: p.id }; }
  if (ups.length) return { kind: 'upload', id: ups[0].id };
  return web ? { kind: 'web', url: web.url, src: web.src } : null;
}
const imgHtml = (rep, cls = '') => rep.kind === 'upload'
  ? `<img class="${cls}" data-pid="${rep.id}" alt="">`
  : `<img class="${cls}" src="${esc(rep.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add('missing')">`;
function photoThumb(date, slot) {
  const rep = repOf(date, slot);
  return `<button class="mphoto" data-act="photoOpen" data-d="${date}" data-s="${slot}" aria-label="사진 관리">${rep ? imgHtml(rep) + `<span class="mbadge">${rep.kind === 'upload' ? '📷 내 사진' : '🌐 예시'}</span>` : '<span class="mph-empty">📷<small>사진</small></span>'}</button>`;
}
function cellThumb(date) {
  const s = filledSlots(date).find(sl => repOf(date, sl)); if (!s) return '';
  return `<span class="cthumb">${imgHtml(repOf(date, s))}</span>`;
}

/* ============ 이미지 압축/저장 ============ */
async function toBitmap(file) {
  try { if (window.createImageBitmap) return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* 아래 Image 로 대체 */ }
  return new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); }; im.src = u; });
}
async function compress(file, max = 1280, q = 0.82) {
  const bmp = await toBitmap(file), w0 = bmp.width, h0 = bmp.height, k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => b ? res({ blob: b, w: c.width, h: c.height }) : rej(new Error('encode')), 'image/jpeg', q));
}
async function addPhotos(files, meta) {
  const ids = []; let fail = 0;
  for (const f of files) {
    if (!f.type.startsWith('image/')) { fail++; continue; }
    try {
      const { blob, w, h } = await compress(f), id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await idbPut(id, blob);
      S.photos[id] = { id, ...meta, createdAt: new Date().toISOString(), size: blob.size, w, h }; ids.push(id);
    } catch (e) { fail++; }
  }
  if (ids.length) save();
  if (fail) toast(`${fail}장은 올리지 못했어요 (이미지 형식을 확인해 주세요)`);
  return ids;
}
async function removePhoto(id) {
  try { await idbDel(id); } catch (e) { /* 저장소 접근 불가여도 메타는 정리 */ }
  if (_urlCache[id]) { URL.revokeObjectURL(_urlCache[id]); delete _urlCache[id]; }
  delete S.photos[id];
  Object.keys(S.photoPick).forEach(k => { if (S.photoPick[k].id === id) delete S.photoPick[k]; });
  S.react.forEach(r => { if (r.photos) r.photos = r.photos.filter(x => x !== id); });
}

/* ============ 웹 이미지 URL 추출 ============ */
const IMG_SKIP = /\.svg(\?|$)|\/(logo|icon|ico|btn|sprite|blank|spacer|pixel|badge|avatar|emoji)[^/]*$|[?&/](logo|icon|btn_|sprite)/i;
let _picker = null;
function openImgPicker(opts) {
  _picker = { ...opts, cands: [] };
  modal(`<h3>🔗 웹 이미지 가져오기</h3><div class="stack">
    <div><label class="f">이미지 주소 또는 웹페이지 주소</label><input type="text" id="ip_url" placeholder="https://" value="${esc(opts.url || '')}">
      <div class="muted small" style="margin-top:4px">블로그·레시피 페이지 주소를 넣으면 페이지 안의 이미지를 골라 쓸 수 있어요. 이미지 주소를 넣으면 바로 사용해요.</div></div>
    <div class="row wrap"><button class="btn pri" data-act="pickerGo">이미지 가져오기</button>
      <a class="btn" href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent((opts.query || '') + ' 이유식')}" target="_blank" rel="noopener">🔎 구글 이미지 검색</a></div>
    <div id="ip_status" class="muted small"></div><div id="ip_grid" class="candgrid"></div>
    <div class="muted small">⚠ 주소를 입력하면 가져오기 위해 Microlink·Jina Reader 같은 외부 서비스로 주소가 전송돼요. 이미지 저작권은 원 출처에 있어요(개인 기록용으로만 사용하세요).</div></div>
    <div class="actions"><button class="btn" data-act="pickerCancel">취소</button></div>`);
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
async function fetchCandidates(url, onStatus) {
  if (!/^https?:\/\//i.test(url)) throw new Error('http:// 또는 https:// 로 시작하는 주소를 입력해 주세요');
  if (/\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i.test(url)) return [url];
  const base = new URL(url), out = [], seen = new Set();
  const add = (u, front) => {
    if (!u) return; let abs;
    try { abs = new URL(u.replace(/&amp;/g, '&'), base).href; } catch (e) { return; }
    if (!/^https?:/i.test(abs) || IMG_SKIP.test(abs) || seen.has(abs)) return;
    seen.add(abs); front ? out.unshift(abs) : out.push(abs);
  };
  onStatus('이미지를 찾는 중… (최대 15초)');
  const [ml, jr] = await Promise.allSettled([
    withTimeout(fetch('https://api.microlink.io/?url=' + encodeURIComponent(url)).then(r => r.json()), 12000),
    withTimeout(fetch('https://r.jina.ai/' + url, { headers: { 'X-Return-Format': 'markdown' } }).then(r => r.text()), 15000)
  ]);
  if (ml.status === 'fulfilled') add(ml.value?.data?.image?.url);
  if (jr.status === 'fulfilled') [...jr.value.matchAll(/!\[[^\]]*\]\((https?:[^)\s]+)/g)].forEach(m => add(m[1]));
  if (!out.length) {   // 대체 경로: 공개 프록시로 HTML 직접 파싱
    onStatus('다른 방법으로 다시 시도하는 중…');
    const tmpl = (S.profile.proxy || '').includes('{url}') ? S.profile.proxy : 'https://api.allorigins.win/raw?url={url}';
    try {
      const html = await withTimeout(fetch(tmpl.replace('{url}', encodeURIComponent(url))).then(r => r.text()), 10000);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]').forEach(m => add(m.content));
      doc.querySelectorAll('img').forEach(i => add(i.getAttribute('src') || i.getAttribute('data-src') || i.getAttribute('data-original')));
    } catch (e) { /* 아래에서 안내 */ }
  }
  return out.slice(0, 48);
}

/* ============ 모달 ============ */
function photoModal(date, slot) {
  const meal = S.plan[date]?.[slot]; if (!meal) return toast('식단이 있는 끼니에만 사진을 올릴 수 있어요');
  const ups = mealPhotos(date, slot), web = webImgOf(meal), rep = repOf(date, slot), k = `${date}|${slot}`, d = `data-d="${date}" data-s="${slot}"`;
  modal(`<h3>📷 ${fmtKo(date)} ${slotLabel(date, slot)} 사진</h3><div class="muted small" style="margin-bottom:8px">${esc(meal.title || mealNames(meal).join('·'))}</div>
    <div class="repbox">${rep ? imgHtml(rep, 'repimg') : '<div class="mph-empty big">사진 없음</div>'}
      <div class="small"><b>대표 사진</b>: ${rep ? (rep.kind === 'upload' ? '내 사진' : '웹 예시 사진') : '없음'}${rep?.src ? `<br><span class="muted">${esc(rep.src)}</span>` : ''}</div></div>
    <div class="dtitle" style="margin-top:14px">🌐 웹 예시 사진</div>
    ${web ? `<div class="row" style="align-items:flex-start"><img class="webprev" src="${esc(web.url)}" alt="" referrerpolicy="no-referrer" onerror="this.classList.add('missing')"><div class="small muted" style="flex:1">${esc(web.src)}</div></div>` : '<div class="muted small">연결된 예시 사진이 없어요.</div>'}
    <div class="row wrap" style="margin-top:8px">
      <button class="btn sm" data-act="webImgPick" ${d}>🔗 URL에서 가져오기</button>
      <a class="btn sm" href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent((meal.title || '') + ' 이유식')}" target="_blank" rel="noopener">🔎 이미지 검색</a>
      ${meal.webImg ? `<button class="btn sm ghost" data-act="webImgReset" ${d}>기본값으로</button>` : ''}
      ${web && S.photoPick[k]?.mode !== 'web' ? `<button class="btn sm" data-act="photoRepWeb" ${d}>이 사진을 대표로</button>` : ''}</div>
    <div class="dtitle" style="margin-top:16px">📷 내 사진 <span style="opacity:.8">(${ups.length})</span></div>
    <div class="pgrid">${ups.map(p => { const isRep = rep?.kind === 'upload' && rep.id === p.id; return `<div class="pitem ${isRep ? 'rep' : ''}">
      <img class="pimg" data-pid="${p.id}" alt="" data-act="photoView" data-id="${p.id}">
      <div class="row" style="justify-content:space-between"><button class="btn sm ${isRep ? 'pri' : ''}" data-act="photoRep" data-id="${p.id}" ${d}>${isRep ? '⭐ 대표' : '대표로'}</button>
        <button class="btn sm ghost" data-act="photoDel" data-id="${p.id}" aria-label="삭제">🗑</button></div></div>`; }).join('') || '<div class="muted small" style="grid-column:1/-1">아직 올린 사진이 없어요. 직접 찍은 사진을 올리면 대표 사진이 돼요.</div>'}</div>
    <input type="file" id="pf" accept="image/*" multiple hidden data-chg="pfile" ${d}>
    <div class="row wrap" style="margin-top:10px"><button class="btn pri" data-act="photoUpload">📷 사진 올리기 / 촬영</button></div>
    <div class="muted small" style="margin-top:6px">사진은 이 기기의 브라우저에만 저장돼요(긴 변 1280px로 자동 압축). 다른 기기로 옮기려면 설정에서 [사진 포함 내보내기]를 사용하세요.</div>
    <div class="actions"><button class="btn" data-act="closeModal">닫기</button></div>`);
  hydratePhotos();
}

/* ============ 액션 ============ */
Object.assign(ACT, {
  photoOpen: el => photoModal(el.dataset.d, el.dataset.s),
  photoUpload: () => $('#pf').click(),
  photoRep: el => { S.photoPick[`${el.dataset.d}|${el.dataset.s}`] = { mode: 'upload', id: el.dataset.id }; commit(); photoModal(el.dataset.d, el.dataset.s); },
  photoRepWeb: el => { S.photoPick[`${el.dataset.d}|${el.dataset.s}`] = { mode: 'web' }; commit(); photoModal(el.dataset.d, el.dataset.s); },
  photoDel: el => ask('사진 삭제', '이 사진을 삭제할까요? 삭제하면 복구할 수 없어요.', [{ label: '취소' }, { label: '삭제', cls: 'dan', fn: async () => { await removePhoto(el.dataset.id); commit(); toast('사진을 삭제했어요'); } }]),
  photoView: el => {
    const p = S.photos[el.dataset.id]; if (!p) return;
    modal(`<h3>📷 ${fmtKo(p.date)}</h3><img class="bigimg" data-pid="${p.id}" alt=""><div class="muted small" style="margin-top:6px">${p.kind === 'meal' ? `${slotLabel(p.date, p.slot)} 식단 사진` : '이상반응 사진'} · ${fmtNum(p.size / 1024, 0)}KB · ${p.w}×${p.h}</div>
      <div class="actions"><button class="btn" data-act="closeModal">닫기</button><button class="btn dan" data-act="photoDel" data-id="${p.id}">삭제</button></div>`);
    hydratePhotos();
  },
  webImgPick: el => {
    const { d, s } = el.dataset, meal = S.plan[d][s];
    openImgPicker({ query: meal.title || '', onPick: url => { meal.webImg = url; S.photoPick[`${d}|${s}`] = { mode: 'web' }; commit(); photoModal(d, s); toast('웹 예시 사진을 바꿨어요'); }, onCancel: () => photoModal(d, s) });
  },
  webImgReset: el => { const { d, s } = el.dataset; delete S.plan[d][s].webImg; commit(); photoModal(d, s); },
  pickerGo: async () => {
    const url = $('#ip_url').value.trim(), st = $('#ip_status'), grid = $('#ip_grid'); grid.innerHTML = '';
    try {
      const c = await fetchCandidates(url, t => { st.textContent = t; });
      _picker.cands = c;
      if (!c.length) { st.innerHTML = '이미지를 자동으로 찾지 못했어요(사이트가 차단했거나 서비스 장애일 수 있어요). 이미지에서 <b>우클릭 → 이미지 주소 복사</b> 후 위 칸에 붙여넣어 보세요.'; return; }
      st.textContent = `이미지 ${c.length}개를 찾았어요. 사용할 사진을 눌러 주세요.`;
      grid.innerHTML = c.map((u, i) => `<button class="cand" data-act="pickerUse" data-i="${i}"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="if(this.naturalWidth<120||this.naturalHeight<120)this.closest('.cand').remove()" onerror="this.closest('.cand').remove()"></button>`).join('');
    } catch (e) { st.textContent = '⚠ ' + (e.message === 'timeout' ? '응답이 늦어요. 잠시 후 다시 시도해 주세요.' : e.message); }
  },
  pickerUse: el => { const u = _picker.cands[+el.dataset.i], cb = _picker.onPick; closeModal(); cb(u); },
  pickerCancel: () => { const cb = _picker?.onCancel; closeModal(); cb && cb(); },
  recImg: el => { const r = recById(el.dataset.id); openImgPicker({ query: r.title, url: r.img || '', onPick: url => { r.img = url; commit(); toast('레시피 대표 이미지를 설정했어요'); } }); },
  recImgDel: el => { delete recById(el.dataset.id).img; commit(); },
  photoClearAll: () => ask('사진 전체 삭제', '이 기기에 저장된 모든 사진을 삭제할까요? 복구할 수 없어요. (먼저 [사진 포함 내보내기]로 백업하세요)', [{ label: '취소' }, { label: '모두 삭제', cls: 'dan', fn: async () => { try { await idbClear(); } catch (e) { } Object.values(_urlCache).forEach(u => URL.revokeObjectURL(u)); Object.keys(_urlCache).forEach(k => delete _urlCache[k]); S.photos = {}; S.photoPick = {}; S.react.forEach(r => delete r.photos); commit(); toast('사진을 모두 삭제했어요'); } }]),
  exportPhotos: async () => {
    toast('사진을 묶는 중이에요…');
    try {
      const photoData = {};
      for (const id of Object.keys(S.photos)) { const b = await idbGet(id); if (b) photoData[id] = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); }
      const blob = new Blob([JSON.stringify({ ...S, photoData })], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `iyusik-backup-photos-${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(`사진 ${Object.keys(photoData).length}장 포함해 내보냈어요`);
    } catch (e) { toast('사진을 내보내지 못했어요: ' + e.message); }
  }
});
Object.assign(CHG, {
  pfile: async el => {
    const { d, s } = el.dataset, files = [...el.files]; if (!files.length) return;
    toast(`사진 ${files.length}장을 처리하는 중…`);
    let ids = [];
    try { ids = await addPhotos(files, { kind: 'meal', date: d, slot: s }); } catch (e) { toast('사진 저장소를 열 수 없어요: ' + e.message); return; }
    if (ids.length) { S.photoPick[`${d}|${s}`] = { mode: 'upload', id: ids[ids.length - 1] }; commit(); photoModal(d, s); toast(`${ids.length}장을 저장했어요. 대표 사진으로 표시돼요.`); }
  }
});
// 불러온 백업의 사진 복원
async function restorePhotos(photoData) {
  let n = 0;
  for (const [id, url] of Object.entries(photoData || {})) { try { await idbPut(id, await (await fetch(url)).blob()); n++; } catch (e) { } }
  return n;
}
// 이상반응 사진
const reactPhotoField = () => `<div><label class="f">사진 (선택)</label><input type="file" id="x_files" accept="image/*" multiple></div>`;
async function attachReactPhotos(entry) {
  const files = [...($('#x_files')?.files || [])]; if (!files.length) return;
  try { const ids = await addPhotos(files, { kind: 'react', ref: entry.id, date: entry.date }); if (ids.length) { entry.photos = ids; commit(); } } catch (e) { toast('사진을 저장하지 못했어요'); }
}
const reactThumbs = r => (r.photos || []).filter(id => S.photos[id]).map(id => `<img class="rth" data-pid="${id}" alt="" data-act="photoView" data-id="${id}">`).join('');
async function afterRenderPhotos() {
  hydratePhotos();
  const box = $('#photostat'); if (!box) return;
  try {
    const st = await idbStats(); let q = '';
    try { const e = await navigator.storage.estimate(); q = ` · 브라우저 저장공간 ${fmtNum(e.usage / 1048576, 0)}MB / ${fmtNum(e.quota / 1048576, 0)}MB 사용`; } catch (e) { }
    box.textContent = `사진 ${st.n}장 · 약 ${fmtNum(st.size / 1048576, 1)}MB${q}`;
  } catch (e) { box.textContent = '사진 저장소를 사용할 수 없어요 (시크릿 모드이거나 브라우저 설정 때문일 수 있어요)'; }
}
