'use strict';
/* 가족 실시간 동기화 (Firebase Anonymous Auth + Firestore)
   - 데이터를 '경로 단위 문서'(예: plan/2026-10-12, logs/2026-10-12, recipes/seed-1)로 나눠 올려서, 두 사람이 서로 다른 날짜·항목을 동시에 고쳐도 덮어쓰지 않아요.
   - 마지막 동기화 상태(shadow 해시)와 비교해 '내가 바꾼 것 / 상대가 바꾼 것'을 구분하고, 같은 항목을 동시에 고치면 나중에 도착한 쪽이 이겨요.
   - 동기화하지 않는 것: 사진 파일, AI 키, 프록시·AI 모델 설정, 프로필의 setup 표시 (기기별 설정).
   - 접근 통제: 길고 추측할 수 없는 '가족 코드'를 아는 사람만 families/{가족코드}/docs 를 읽고 쓸 수 있어요 (Firestore 규칙은 설정 카드 참고). */

const SYNC_STORE = 'iyusik-sync';
const FB_BASE = 'https://www.gstatic.com/firebasejs/11.10.0/';
const MAP_KEYS = ['plan', 'logs', 'body', 'ing', 'shopOv', 'shopStore', 'shopDone'];
const LIST_KEYS = ['recipes', 'stock', 'buys', 'react', 'shopExtra'];
const PROFILE_LOCAL = ['setup', 'proxy', 'aiModel'];

const FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /families/{family}/docs/{doc} {
      allow read, write: if request.auth != null;
    }
  }
}`;

/* ---------- 순수 함수 (테스트 가능) ---------- */
const stable = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
const syncHash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16) + '.' + s.length; };
function syncFlatten(st) {
  const m = {}, p = { ...st.profile }; PROFILE_LOCAL.forEach(k => delete p[k]);
  m.profile = stable(p);
  MAP_KEYS.forEach(k => Object.entries(st[k] || {}).forEach(([e, v]) => { m[k + '/' + e] = stable(v); }));
  LIST_KEYS.forEach(k => (st[k] || []).forEach(it => { m[k + '/' + it.id] = stable(it); }));
  return m;
}
function syncApply(st, path, json) {   // json === null → 삭제
  const k = path.split('/')[0], rest = path.split('/').slice(1).join('/');
  if (path === 'profile') { if (json == null) return; const keep = {}; PROFILE_LOCAL.forEach(x => { keep[x] = st.profile[x]; }); st.profile = { ...st.profile, ...JSON.parse(json), ...keep }; return; }
  if (MAP_KEYS.includes(k)) { st[k] = st[k] || {}; if (json == null) delete st[k][rest]; else st[k][rest] = JSON.parse(json); }
  else if (LIST_KEYS.includes(k)) {
    st[k] = st[k] || []; const i = st[k].findIndex(x => String(x.id) === rest);
    if (json == null) { if (i >= 0) st[k].splice(i, 1); } else { const v = JSON.parse(json); if (i >= 0) st[k][i] = v; else st[k].push(v); }
  }
}

/* ---------- 동기화 엔진 ---------- */
class SyncEngine {
  constructor(adapter, deviceId, hooks) {
    this.ad = adapter; this.dev = deviceId; this.h = hooks;   // hooks: getState(), persist(), refresh(), state(s, msg)
    this.shadow = {}; this.inflight = {}; this.ready = false; this.timer = null; this.stopped = false;
    try { this.shadow = JSON.parse(localStorage.getItem(SYNC_STORE + '-shadow-' + deviceId) || '{}'); } catch (e) { this.shadow = {}; }
  }
  saveShadow() { try { localStorage.setItem(SYNC_STORE + '-shadow-' + this.dev, JSON.stringify(this.shadow)); } catch (e) { } }
  async start() {
    this.h.state('connecting');
    await this.ad.open(batch => this.onRemote(batch), (s, m) => this.h.state(s, m));
  }
  stop() { this.stopped = true; clearTimeout(this.timer); this.ad.close && this.ad.close(); this.h.state('off'); }
  // 원격 문서 도착
  onRemote(batch) {
    if (this.stopped) return;
    if (!this.ready) { this.reconcile(batch.docs); this.ready = true; this.h.state('ok'); this.flush(); return; }
    const st = this.h.getState(), L = syncFlatten(st); let changed = false;
    batch.docs.forEach(d => {
      if (d.by === this.dev && d.pending) return;                    // 내가 방금 쓴 것의 로컬 에코
      const cur = L[d.path], next = d.del ? undefined : d.json;
      if (cur === next) { if (next !== undefined) this.shadow[d.path] = syncHash(next); else delete this.shadow[d.path]; return; }
      syncApply(st, d.path, d.del ? null : d.json); changed = true;
      if (next !== undefined) this.shadow[d.path] = syncHash(next); else delete this.shadow[d.path];
    });
    this.saveShadow();
    if (changed) { this.h.persist(); this.h.refresh(); }
    this.h.state('ok');
  }
  // 첫 연결: 로컬 ↔ 클라우드 3-way 병합
  reconcile(docs) {
    const st = this.h.getState(), L = syncFlatten(st), R = {}, T = new Set();
    docs.forEach(d => { if (d.del) T.add(d.path); else R[d.path] = d.json; });
    const paths = new Set([...Object.keys(L), ...Object.keys(R), ...T]); let changed = false;
    paths.forEach(p => {
      const l = L[p], r = R[p], s = this.shadow[p];
      if (r !== undefined) {
        if (l === r) { this.shadow[p] = syncHash(r); return; }
        if (l === undefined) {
          if (s !== undefined && syncHash(r) === s) { /* 내가 지운 것 → flush 가 삭제를 올림 */ return; }
          syncApply(st, p, r); this.shadow[p] = syncHash(r); changed = true; return;
        }
        const localChanged = syncHash(l) !== s, remoteChanged = syncHash(r) !== s;
        if (localChanged && !remoteChanged) return;                  // 내 변경만 있음 → flush 가 올림
        syncApply(st, p, r); this.shadow[p] = syncHash(r); changed = true; return;   // 원격 변경(또는 충돌) → 원격 우선
      }
      if (l !== undefined) {
        if (T.has(p)) {                                              // 상대가 지운 항목
          if (s === undefined || syncHash(l) === s) { syncApply(st, p, null); delete this.shadow[p]; changed = true; }
        }                                                            // 그 외(로컬 신규/변경)는 flush 가 올림
        return;
      }
      delete this.shadow[p];
    });
    this.saveShadow();
    if (changed) { this.h.persist(); this.h.refresh(); }
  }
  schedule() { if (this.stopped) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 900); }
  async flush() {
    if (this.stopped || !this.ready) return;
    const L = syncFlatten(this.h.getState()), ops = [];
    for (const p in L) { const hh = syncHash(L[p]); if (this.shadow[p] !== hh && this.inflight[p] !== hh) ops.push({ path: p, json: L[p], hh }); }
    for (const p in this.shadow) if (!(p in L) && this.inflight[p] !== 'del') ops.push({ path: p, del: true });
    if (!ops.length) return;
    this.h.state('syncing');
    for (let i = 0; i < ops.length; i += 400) {
      const chunk = ops.slice(i, i + 400); chunk.forEach(o => { this.inflight[o.path] = o.del ? 'del' : o.hh; });
      try {
        await this.ad.write(chunk.map(o => ({ path: o.path, json: o.json, del: !!o.del, by: this.dev })));
        chunk.forEach(o => { if (o.del) delete this.shadow[o.path]; else this.shadow[o.path] = o.hh; delete this.inflight[o.path]; });
        this.saveShadow();
      } catch (e) { chunk.forEach(o => delete this.inflight[o.path]); this.h.state('error', e.message || String(e)); return; }
    }
    this.h.state('ok');
  }
}

/* ---------- Firebase 어댑터 ---------- */
function firebaseAdapter(cfg, code) {
  let unsub = null, db = null, fs = null;
  return {
    async open(onBatch, onState) {
      let app, auth;
      try {
        const [A, Au, F] = await Promise.all([import(FB_BASE + 'firebase-app.js'), import(FB_BASE + 'firebase-auth.js'), import(FB_BASE + 'firebase-firestore.js')]);
        fs = F; const name = 'iyusik-' + code.slice(0, 6);
        app = A.getApps().find(a => a.name === name) || A.initializeApp(cfg, name);
        auth = Au.getAuth(app); await Au.signInAnonymously(auth);
      } catch (e) { throw new Error(syncErr(e)); }
      db = fs.getFirestore(app);
      const col = fs.collection(db, 'families', code, 'docs');
      unsub = fs.onSnapshot(col, snap => {
        const docs = snap.docChanges().filter(c => c.type !== 'removed').map(c => { const d = c.doc.data(); return { path: d.p, json: d.v, del: !!d.del, by: d.by, pending: c.doc.metadata.hasPendingWrites }; });
        onBatch({ docs });
      }, err => onState('error', syncErr(err)));
    },
    async write(ops) {
      const batch = fs.writeBatch(db), col = fs.collection(db, 'families', code, 'docs');
      ops.forEach(o => batch.set(fs.doc(col, encodeURIComponent(o.path)), { p: o.path, v: o.del ? '' : o.json, del: o.del, by: o.by, at: fs.serverTimestamp() }));
      await batch.commit();
    },
    close() { unsub && unsub(); }
  };
}
function syncErr(e) {
  const c = e && (e.code || ''), m = (e && e.message) || String(e);
  if (/auth\/operation-not-allowed|admin-restricted/.test(c + m)) return 'Firebase 콘솔 › Authentication 에서 “익명” 로그인을 켜 주세요.';
  if (/auth\/api-key|invalid-api-key/.test(c + m)) return 'Firebase 설정값(apiKey)이 올바르지 않아요.';
  if (/permission-denied/.test(c + m)) return 'Firestore 규칙이 막고 있어요. 설정 카드의 규칙을 붙여 넣고 게시해 주세요.';
  if (/Failed to fetch|network|offline|unavailable/i.test(c + m)) return '네트워크에 연결할 수 없어요.';
  if (/not-found|No Firebase App|project/i.test(c + m)) return 'Firebase 프로젝트 설정(projectId)을 확인해 주세요.';
  return '동기화 오류: ' + m.slice(0, 120);
}

/* ---------- 앱 연결 ---------- */
let SYNC = null;
const syncCfg = () => { try { return JSON.parse(localStorage.getItem(SYNC_STORE) || 'null'); } catch (e) { return null; } };
const syncSaveCfg = c => { try { c ? localStorage.setItem(SYNC_STORE, JSON.stringify(c)) : localStorage.removeItem(SYNC_STORE); } catch (e) { } };
const SYNC_LABEL = { off: '', connecting: '☁ 연결 중…', ok: '☁ 동기화됨', syncing: '☁ 동기화 중…', error: '☁ 오류', offline: '☁ 오프라인' };
let _syncState = { s: 'off', msg: '', at: null };
function syncState(s, msg) {
  _syncState = { s, msg: msg || '', at: s === 'ok' ? new Date() : _syncState.at };
  document.querySelectorAll('.sync-badge').forEach(el => { el.className = 'sync-badge ' + s; el.textContent = SYNC_LABEL[s] || ''; el.title = msg || ''; });
  const st = document.getElementById('syncstat'); if (st) st.innerHTML = syncStatusHtml();
}
const syncBadge = () => _syncState.s === 'off' ? '' : `<span class="sync-badge ${_syncState.s}" title="${esc(_syncState.msg)}">${SYNC_LABEL[_syncState.s]}</span>`;
function syncStatusHtml() {
  const c = syncCfg(); if (!c) return '<span class="badge s-none">꺼짐</span>';
  const t = _syncState.at ? ` · 마지막 ${_syncState.at.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : '';
  return `<span class="badge ${_syncState.s === 'ok' ? 's-pass' : _syncState.s === 'error' ? 's-caution' : 's-obs'}">${esc(SYNC_LABEL[_syncState.s] || '연결 안 됨')}</span><span class="muted small">${t} · 가족 코드 ${esc(c.code.slice(0, 4))}…${esc(c.code.slice(-3))}</span>${_syncState.msg ? `<div class="warnline">⚠ ${esc(_syncState.msg)}</div>` : ''}`;
}
let _refreshTimer = null;
function syncRefresh() {   // 입력 중이거나 창이 열려 있으면 화면 갱신을 미룬다
  clearTimeout(_refreshTimer);
  const busy = document.querySelector('.overlay') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if (busy) { _refreshTimer = setTimeout(syncRefresh, 1500); return; }
  const y = window.scrollY; render(); window.scrollTo(0, y);
}
function syncStartEngine(cfg) {
  if (SYNC) SYNC.stop();
  const dev = cfg.dev || (cfg.dev = 'd' + Math.random().toString(36).slice(2, 10)); syncSaveCfg(cfg);
  SYNC = new SyncEngine(firebaseAdapter(cfg.config, cfg.code), dev, { getState: () => S, persist: () => save(true), refresh: syncRefresh, state: syncState });
  SYNC.start().catch(e => syncState('error', e.message));
}
function syncSchedule() { SYNC && SYNC.schedule(); }
function syncBoot() {
  const c = syncCfg();
  window.addEventListener('online', () => SYNC && SYNC.flush());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') SYNC && SYNC.flush(); });
  if (c && c.config && c.code && c.enabled !== false) syncStartEngine(c);
}

/* ---------- 설정 값 파싱 · 초대 링크 ---------- */
function parseFbConfig(text) {
  // 콘솔이 주는 코드에는 `import { initializeApp } ...` 같은 다른 중괄호도 있어서, apiKey 를 품은 가장 가까운 { } 만 잘라 읽는다
  const t = String(text), ai = t.indexOf('apiKey'); if (ai < 0) throw new Error('설정값을 찾지 못했어요 (apiKey 가 보이지 않아요)');
  const s0 = t.lastIndexOf('{', ai), e0 = t.indexOf('}', ai); if (s0 < 0 || e0 < 0) throw new Error('설정값 형식을 읽지 못했어요');
  let o; const raw = t.slice(s0, e0 + 1);
  try { o = JSON.parse(raw); } catch (e) { try { o = JSON.parse(raw.replace(/\/\/[^\n]*/g, '').replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/'/g, '"').replace(/,(\s*})/g, '$1')); } catch (e2) { throw new Error('설정값 형식을 읽지 못했어요'); } }
  if (!o.apiKey || !o.projectId || !o.appId) throw new Error('apiKey·projectId·appId 가 모두 있어야 해요');
  return { apiKey: o.apiKey, authDomain: o.authDomain, projectId: o.projectId, storageBucket: o.storageBucket, messagingSenderId: o.messagingSenderId, appId: o.appId };
}
const newFamilyCode = () => { const a = new Uint8Array(18); crypto.getRandomValues(a); return Array.from(a, b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join(''); };
const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
function inviteLink() { const c = syncCfg(); return location.href.split('#')[0] + '#join=' + b64u(JSON.stringify({ c: c.config, k: c.code })); }
function syncHandleJoin() {
  const m = location.hash.match(/^#join=(.+)$/); if (!m) return false;
  try { const j = JSON.parse(unb64u(m[1])); if (!j.c || !j.k) throw 0;
    history.replaceState(null, '', location.href.split('#')[0]);
    window.__pendingJoin = j; return true;
  } catch (e) { history.replaceState(null, '', location.href.split('#')[0]); return false; }
}
function syncAskJoin() {
  const j = window.__pendingJoin; if (!j) return; window.__pendingJoin = null;
  ask('👨‍👩‍👧 가족 공유에 참여할까요?', `초대 링크로 연결돼요.<br>이 기기의 기록과 가족 클라우드의 기록이 <b>합쳐지고</b>, 같은 항목은 클라우드 내용이 우선돼요. 이 기기에 아직 입력한 게 없다면 안심하고 참여하세요.<br><span class="muted small">초대 링크는 가족 코드가 들어 있는 비밀 링크예요. 가족 외에는 공유하지 마세요.</span>`,
    [{ label: '취소' }, { label: '참여하기', cls: 'pri', fn: () => { syncStartEngine({ config: j.c, code: j.k, enabled: true }); toast('가족 공유에 연결하는 중이에요'); render(); } }]);
}

/* ---------- 설정 카드 ---------- */
function syncSettingsCard() {
  const c = syncCfg();
  const guide = `<details class="card" style="margin-top:6px"><summary><b>처음 한 번만 하는 설정 (약 5분)</b></summary><ol class="srclist" style="margin-top:8px">
    <li><a href="https://console.firebase.google.com/" target="_blank" rel="noopener">Firebase 콘솔</a>에서 <b>프로젝트 추가</b> (이름 자유, Google 애널리틱스는 꺼도 돼요)</li>
    <li><b>빌드 › Authentication › 시작하기 › 로그인 방법</b>에서 <b>익명</b>을 사용 설정</li>
    <li><b>빌드 › Firestore Database › 데이터베이스 만들기</b> (위치는 <b>asia-northeast3(서울)</b>, 프로덕션 모드)</li>
    <li>Firestore <b>규칙</b> 탭에 아래 규칙을 붙여 넣고 <b>게시</b></li>
    <li><b>프로젝트 설정(톱니바퀴) › 일반 › 내 앱 › 웹(&lt;/&gt;)</b> 앱을 추가하고 나온 <b>firebaseConfig</b>를 복사</li>
    <li>아래 칸에 붙여 넣고 <b>가족 코드 만들기 › 켜기</b> → 나온 <b>초대 링크</b>를 아내에게 보내기</li></ol>
    <pre class="rules">${esc(FIRESTORE_RULES)}</pre><button class="btn sm" data-act="syncCopyRules">규칙 복사</button></details>`;
  if (!c) return `<div class="card stack" style="margin-top:14px" id="synccard"><h3>👨‍👩‍👧 가족 실시간 공유</h3>
    <div class="muted small">아내와 같은 식단·기록을 실시간으로 함께 써요. 본인 Firebase 프로젝트(무료)가 필요하고, 데이터는 그 프로젝트의 Firestore에 저장돼요. 사진 파일은 동기화되지 않아요.</div>${guide}
    <div><label class="f">firebaseConfig 붙여넣기</label><textarea id="sy_cfg" placeholder='const firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." };' style="min-height:110px"></textarea></div>
    <div><label class="f">가족 코드</label><div class="row"><input type="text" id="sy_code" placeholder="[만들기]를 누르세요 (아내는 초대 링크로 참여)" style="flex:1"><button class="btn" data-act="syncMakeCode">만들기</button></div></div>
    <div class="actions" style="display:flex"><button class="btn pri" data-act="syncEnable">연결하고 켜기</button></div></div>`;
  return `<div class="card stack" style="margin-top:14px" id="synccard"><h3>👨‍👩‍👧 가족 실시간 공유</h3>
    <div id="syncstat" class="row wrap">${syncStatusHtml()}</div>
    <div class="row wrap"><button class="btn pri" data-act="syncInvite">🔗 초대 링크 복사</button><button class="btn" data-act="syncNow">지금 동기화</button>
      ${c.enabled === false ? '<button class="btn" data-act="syncOn">켜기</button>' : '<button class="btn" data-act="syncOff">끄기</button>'}<button class="btn dan" data-act="syncForget">이 기기 연결 해제</button></div>
    <div class="banner warn" style="font-size:13px"><b>초대 링크는 비밀번호와 같아요.</b> 링크에 Firebase 설정과 가족 코드가 들어 있어서, 아는 사람은 누구나 우리 가족 기록을 보고 고칠 수 있어요. 카카오톡 개인 대화 등 안전한 곳으로만 보내세요.</div>
    <div class="muted small">동기화되지 않는 것: 사진 파일(각자 기기), AI 키·프록시·AI 모델 설정. 연결 해제는 이 기기에서만 끊고 클라우드 데이터는 그대로 둬요. 같은 항목을 동시에 고치면 나중에 저장한 쪽이 반영돼요.</div></div>`;
}
Object.assign(ACT, {
  syncCopyRules: () => navigator.clipboard.writeText(FIRESTORE_RULES).then(() => toast('규칙을 복사했어요'), () => toast('복사하지 못했어요. 직접 선택해 복사해 주세요')),
  syncMakeCode: () => { $('#sy_code').value = newFamilyCode(); },
  syncEnable: () => {
    let config; try { config = parseFbConfig($('#sy_cfg').value); } catch (e) { return toast('⚠ ' + e.message); }
    const code = ($('#sy_code').value || '').trim(); if (code.length < 16) return toast('가족 코드는 16자 이상이어야 해요. [만들기]를 눌러 주세요');
    ask('가족 공유 켜기', '이 기기의 식단·기록이 클라우드에 올라가요. 이미 클라우드에 가족 기록이 있다면 합쳐지고, 같은 항목은 클라우드 내용이 우선돼요.', [{ label: '취소' }, { label: '켜기', cls: 'pri', fn: () => { syncStartEngine({ config, code, enabled: true }); render(); toast('연결하는 중이에요'); } }]);
  },
  syncInvite: () => navigator.clipboard.writeText(inviteLink()).then(() => toast('초대 링크를 복사했어요. 안전한 곳으로만 보내세요'), () => modal(`<h3>초대 링크</h3><textarea style="min-height:120px">${esc(inviteLink())}</textarea><div class="actions"><button class="btn" data-act="closeModal">닫기</button></div>`)),
  syncNow: () => { SYNC ? SYNC.flush().then(() => toast('동기화했어요')) : toast('연결돼 있지 않아요'); },
  syncOff: () => { const c = syncCfg(); c.enabled = false; syncSaveCfg(c); SYNC && SYNC.stop(); SYNC = null; render(); toast('동기화를 껐어요'); },
  syncOn: () => { const c = syncCfg(); c.enabled = true; syncStartEngine(c); render(); },
  syncForget: () => ask('이 기기 연결 해제', '이 기기에서만 가족 공유 연결을 끊어요. 클라우드와 이 기기의 기록은 지워지지 않아요.', [{ label: '취소' }, { label: '해제', cls: 'dan', fn: () => { SYNC && SYNC.stop(); SYNC = null; syncSaveCfg(null); render(); toast('연결을 해제했어요'); } }])
});
