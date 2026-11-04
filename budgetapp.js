/* Abeer's money book lol — app.js
   Everything is stored in this browser's localStorage, so it survives reloads and restarts. */
(() => {
'use strict';

/* ================= constants ================= */
const USERS_KEY = 'mb_users';
const SESSION_KEY = 'mb_session';
const LAST_KEY = 'mb_lastuser';
const DATA_PREFIX = 'mb_data_';
const PALETTE = ['#4ade80', '#fbbf24', '#60a5fa', '#f472b6', '#a78bfa', '#2dd4bf', '#fb923c', '#94a3b8'];
const DANGER = '#ef4444';
const MAX_MONEY = 10000000;

/* ================= helpers ================= */
const $ = (id) => document.getElementById(id);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const money = (n) => { n = round2(n); return (n < 0 ? '−' : '') + '₹' + nf.format(Math.abs(n)); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const genId = (p) => p + '_' + uid();
const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayStr = () => toDateStr(new Date());
const monthOf = (s) => s.slice(0, 7);
const currentMonthKey = () => monthOf(todayStr());
const fmtDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); };
const daysInMonth = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const has3D = typeof THREE !== 'undefined';

function isDateStr(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}
function cleanMoney(v, o) {
  o = o || {};
  const min = o.min != null ? o.min : 0, max = o.max != null ? o.max : MAX_MONEY, def = o.def != null ? o.def : 0;
  const n = Number(v);
  if (!isFinite(n)) return def;
  return round2(Math.min(max, Math.max(min, n)));
}
const cleanStr = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const cleanId = (v, p) => (typeof v === 'string' && new RegExp('^' + p + '_[a-z0-9]{3,30}$', 'i').test(v) ? v : null);
const clampInt = (v, min, max, def) => { const n = Math.round(Number(v)); return isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const safeParse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

/* Build DOM without innerHTML so user text can never be treated as markup. */
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.style.cssText = v; // only ever fed sanitized colours / numbers
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}
function fillSelect(sel, opts, value) {
  sel.replaceChildren(...opts.map((o) => el('option', { value: o.value, text: o.label })));
  if (opts.some((o) => o.value === value)) sel.value = value;
  else if (opts.length) sel.value = opts[0].value;
}
function bar(frac, color) {
  const pct = Math.min(100, Math.max(0, frac * 100));
  return el('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)) },
    el('div', { class: 'fill', style: 'width:' + pct + '%;background:' + (frac > 1 ? DANGER : color) }));
}

/* ================= storage ================= */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
const sess = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
function storageOK() {
  try { localStorage.setItem('mb_test', '1'); localStorage.removeItem('mb_test'); return true; } catch (e) { return false; }
}

/* ================= data model ================= */
function defaultCategories() {
  return [
    { id: 'c_travel', name: 'Travel', color: PALETTE[0] },
    { id: 'c_food', name: 'Food', color: PALETTE[1] },
    { id: 'c_stuff', name: 'Stuff', color: PALETTE[2] },
  ];
}
function defaultRoutes() {
  return [
    { id: 'r_metrogo', dir: 'go', name: 'Metro (mom drops me at the station)', legs: [
      { label: 'Mom drops me to the station', cost: 0 }, { label: 'Metro ticket', cost: 20 }, { label: 'Metro station → college', cost: 60 } ] },
    { id: 'r_autogo', dir: 'go', name: 'Auto straight to college', legs: [ { label: 'Auto, home → college', cost: 240 } ] },
    { id: 'r_metroback', dir: 'back', name: 'Metro (Rapido to the station)', legs: [
      { label: 'Rapido to the metro station', cost: 60 }, { label: 'Metro ticket', cost: 20 }, { label: 'Metro station → home', cost: 40 } ] },
    { id: 'r_localback', dir: 'back', name: 'Local train', legs: [
      { label: 'Ride to the local station', cost: 15 }, { label: 'Train ticket', cost: 40 }, { label: 'Auto, station → home', cost: 80 } ] },
    { id: 'r_autoback', dir: 'back', name: 'Auto straight home', legs: [ { label: 'Auto, college → home', cost: 240 } ] },
  ];
}
function defaultData() {
  return {
    v: 1,
    categories: defaultCategories(),
    months: { [currentMonthKey()]: { total: 8000, cats: { c_travel: 4500, c_food: 2000, c_stuff: 1500 } } },
    expenses: [],
    routes: defaultRoutes(),
    goals: [],
    settings: { collegeDays: 22, daysPerWeek: 5 },
  };
}
/* Rebuild a clean object from anything (corrupt storage, imported files). */
function sanitizeData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = { v: 1, categories: [], months: {}, expenses: [], routes: [], goals: [], settings: { collegeDays: 22, daysPerWeek: 5 } };
  const seen = new Set();
  (Array.isArray(raw.categories) ? raw.categories : []).slice(0, 40).forEach((c) => {
    if (!c || typeof c !== 'object') return;
    const id = cleanId(c.id, 'c'), name = cleanStr(c.name, 24);
    if (!id || !name || seen.has(id)) return;
    seen.add(id);
    const color = typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : PALETTE[out.categories.length % PALETTE.length];
    out.categories.push({ id, name, color });
  });
  if (!out.categories.length) out.categories = defaultCategories();
  const catIds = new Set(out.categories.map((c) => c.id));

  if (raw.months && typeof raw.months === 'object') {
    for (const [k, m] of Object.entries(raw.months)) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(k) || !m || typeof m !== 'object') continue;
      const cats = {};
      if (m.cats && typeof m.cats === 'object') for (const [id, v] of Object.entries(m.cats)) if (catIds.has(id)) cats[id] = cleanMoney(v);
      const alloc = round2(Object.values(cats).reduce((s, v) => s + v, 0));
      out.months[k] = { total: Math.max(cleanMoney(m.total), alloc), cats };
    }
  }
  const eids = new Set();
  (Array.isArray(raw.expenses) ? raw.expenses : []).slice(0, 50000).forEach((e) => {
    if (!e || typeof e !== 'object') return;
    const amount = cleanMoney(e.amount);
    if (amount <= 0 || !isDateStr(e.date)) return;
    let id = cleanId(e.id, 'e');
    if (!id || eids.has(id)) id = genId('e');
    eids.add(id);
    const ex = { id, date: e.date, catId: catIds.has(e.catId) ? e.catId : out.categories[0].id, amount, note: cleanStr(e.note, 80), ts: Number.isFinite(e.ts) ? e.ts : 0 };
    if (e.tag === 'commute') ex.tag = 'commute';
    out.expenses.push(ex);
  });
  if (Array.isArray(raw.routes)) {
    const rids = new Set();
    raw.routes.slice(0, 60).forEach((r) => {
      if (!r || typeof r !== 'object' || (r.dir !== 'go' && r.dir !== 'back') || !Array.isArray(r.legs)) return;
      const name = cleanStr(r.name, 60);
      const legs = r.legs.slice(0, 10).filter((l) => l && typeof l === 'object')
        .map((l) => ({ label: cleanStr(l.label, 40) || 'Leg', cost: cleanMoney(l.cost, { max: 100000 }) }));
      if (!name || !legs.length) return;
      let id = cleanId(r.id, 'r');
      if (!id || rids.has(id)) id = genId('r');
      rids.add(id);
      out.routes.push({ id, dir: r.dir, name, legs });
    });
  } else out.routes = defaultRoutes();
  if (Array.isArray(raw.goals)) {
    const gids = new Set();
    raw.goals.slice(0, 100).forEach((g) => {
      if (!g || typeof g !== 'object') return;
      const name = cleanStr(g.name, 40), target = cleanMoney(g.target);
      if (!name || target <= 0) return;
      let id = cleanId(g.id, 'g');
      if (!id || gids.has(id)) id = genId('g');
      gids.add(id);
      out.goals.push({ id, name, target, saved: cleanMoney(g.saved) });
    });
  }
  if (raw.settings && typeof raw.settings === 'object') {
    out.settings.collegeDays = clampInt(raw.settings.collegeDays, 1, 31, 22);
    out.settings.daysPerWeek = clampInt(raw.settings.daysPerWeek, 1, 7, 5);
  }
  return out;
}

/* ================= app state ================= */
let user = null;
let data = null;
let viewMonth = currentMonthKey();
let loginMode = 'login';
let towersApi = { update() {}, resize() {}, step() {} };
let bgApi = { step() {} };

let saveWarned = 0;
function save() {
  if (!user || !data) return;
  const ok = store.set(DATA_PREFIX + user.key, JSON.stringify(data));
  if (!ok && Date.now() - saveWarned > 5000) {
    saveWarned = Date.now();
    toast("Couldn't save: browser storage is blocked or full. Export a backup from the Backup tab.");
  }
}
const catById = (id) => data.categories.find((c) => c.id === id);
const routeById = (id) => data.routes.find((r) => r.id === id);

/* months inherit the budget of the latest earlier month */
function getMonth(key) {
  if (!hasOwn(data.months, key)) {
    const keys = Object.keys(data.months).sort();
    const earlier = keys.filter((k) => k < key).pop();
    const src = earlier ? data.months[earlier] : (keys.length ? data.months[keys[0]] : null);
    const cats = {};
    for (const c of data.categories) cats[c.id] = src && hasOwn(src.cats, c.id) ? src.cats[c.id] : 0;
    data.months[key] = { total: src ? src.total : 0, cats };
  }
  return data.months[key];
}
function monthStats(key) {
  const m = getMonth(key);
  const spentBy = {};
  let spent = 0;
  for (const c of data.categories) spentBy[c.id] = 0;
  for (const e of data.expenses) {
    if (monthOf(e.date) !== key) continue;
    spentBy[e.catId] = round2((spentBy[e.catId] || 0) + e.amount);
    spent = round2(spent + e.amount);
  }
  const allocated = round2(data.categories.reduce((s, c) => s + (m.cats[c.id] || 0), 0));
  return { m, total: m.total, spent, remaining: round2(m.total - spent), spentBy, allocated, unallocated: round2(m.total - allocated) };
}
/* component budgets can never add up to more than the overall budget */
function ensureTotal(m) {
  const alloc = round2(data.categories.reduce((s, c) => s + (m.cats[c.id] || 0), 0));
  if (alloc > m.total) { const diff = round2(alloc - m.total); m.total = alloc; return diff; }
  return 0;
}

/* ================= commute maths ================= */
const routeCost = (r) => round2(r.legs.reduce((s, l) => s + l.cost, 0));
function commuteCombos() {
  const go = data.routes.filter((r) => r.dir === 'go');
  const back = data.routes.filter((r) => r.dir === 'back');
  const combos = [];
  for (const g of go) for (const b of back) combos.push({ go: g, back: b, day: round2(routeCost(g) + routeCost(b)) });
  combos.sort((a, b) => a.day - b.day || a.go.name.localeCompare(b.go.name) || a.back.name.localeCompare(b.back.name));
  return combos;
}

/* ================= toast ================= */
let toastTimer = null;
function hideToast() { $('toast').classList.remove('show'); }
function toast(msg, action) {
  const t = $('toast');
  t.replaceChildren(msg);
  if (action) t.append(el('button', { class: 'toast-act', type: 'button', onclick: () => { action.fn(); hideToast(); } }, action.label));
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 7000 : 4200);
}

/* ================= auth ================= */
const ukey = (name) => 'u_' + name.toLowerCase();
function loadUsers() {
  const o = safeParse(store.get(USERS_KEY) || '{}');
  return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
}
const enc = new TextEncoder();
const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const canPbkdf2 = () => typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.deriveBits === 'function';
function randomSalt() {
  const a = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
  return toHex(a);
}
async function hashPassword(pw, saltHex, alg) {
  if (alg === 'pbkdf2') {
    if (!canPbkdf2()) return null;
    const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
    return toHex(bits);
  }
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  const s = saltHex + pw;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
function setLoginMsg(text, ok) { const m = $('loginMsg'); m.textContent = text || ''; m.classList.toggle('ok', !!ok); }
function setMode(mode) {
  loginMode = mode;
  const create = mode === 'create';
  $('loginSub').textContent = create ? 'First time? Pick a username and password. They stay on this device.' : 'Log in to see where your money went.';
  $('loginBtn').textContent = create ? 'Create account' : 'Log in';
  $('toggleMode').textContent = create ? 'Already have an account? Log in' : 'New here? Create an account';
  $('password').setAttribute('autocomplete', create ? 'new-password' : 'current-password');
  setLoginMsg('');
}
async function onLogin(ev) {
  ev.preventDefault();
  setLoginMsg('');
  const name = $('username').value.trim();
  const pw = $('password').value;
  if (!/^[A-Za-z0-9_.-]{2,30}$/.test(name)) return setLoginMsg('Username: 2–30 characters, letters, numbers, _ . - only.');
  if (pw.length < 4) return setLoginMsg('Password must be at least 4 characters.');
  const btn = $('loginBtn');
  btn.disabled = true;
  try {
    const users = loadUsers();
    const key = ukey(name);
    if (loginMode === 'create') {
      if (hasOwn(users, key)) return setLoginMsg('That username already exists on this device. Log in instead.');
      const salt = randomSalt();
      const alg = canPbkdf2() ? 'pbkdf2' : 'basic';
      users[key] = { name, salt, alg, hash: await hashPassword(pw, salt, alg) };
      if (!store.set(USERS_KEY, JSON.stringify(users))) return setLoginMsg('Could not save the account. Browser storage looks blocked.');
      enterApp({ key, name }, $('remember').checked);
    } else {
      const u = hasOwn(users, key) ? users[key] : null;
      if (!u) return setLoginMsg('Wrong username or password.');
      const h = await hashPassword(pw, u.salt, u.alg);
      if (h === null) return setLoginMsg("This browser can't check the password the way this page was opened. Open it the same way you created the account.");
      if (h !== u.hash) return setLoginMsg('Wrong username or password.');
      enterApp({ key, name: u.name }, $('remember').checked);
    }
  } catch (e) {
    setLoginMsg('Something went wrong while logging in.');
  } finally {
    btn.disabled = false;
  }
}
function enterApp(u, remember) {
  user = u;
  const txt = store.get(DATA_PREFIX + u.key);
  const loaded = txt ? sanitizeData(safeParse(txt)) : null;
  if (txt && !loaded) store.set(DATA_PREFIX + u.key + '_corrupt', txt);
  data = loaded || defaultData();
  if (!loaded) save();
  const val = JSON.stringify({ key: u.key, name: u.name });
  if (remember === true) { store.set(SESSION_KEY, val); store.set(LAST_KEY, u.name); sess.del(SESSION_KEY); }
  else if (remember === false) { sess.set(SESSION_KEY, val); store.del(SESSION_KEY); store.del(LAST_KEY); }
  viewMonth = currentMonthKey();
  $('password').value = '';
  setLoginMsg('');
  $('whoami').textContent = u.name;
  $('loginView').hidden = true;
  $('appView').hidden = false;
  showTab('dashboard');
  renderAll();
  towersApi.resize();
}
function logout() {
  store.del(SESSION_KEY);
  sess.del(SESSION_KEY);
  user = null;
  data = null;
  $('appView').hidden = true;
  $('loginView').hidden = false;
  const last = store.get(LAST_KEY);
  $('username').value = last || '';
  $('password').value = '';
  setMode('login');
  ($('username').value ? $('password') : $('username')).focus();
}
function restoreSession() {
  const s = safeParse(store.get(SESSION_KEY)) || safeParse(sess.get(SESSION_KEY));
  if (!s || typeof s.key !== 'string') return false;
  const users = loadUsers();
  if (!hasOwn(users, s.key)) return false;
  enterApp({ key: s.key, name: users[s.key].name }, undefined);
  return true;
}

/* ================= tabs ================= */
function showTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + name));
  $('fab').hidden = name === 'log';
  if (name === 'dashboard') towersApi.resize();
}

/* ================= rendering ================= */
function renderAll() {
  if (!data) return;
  getMonth(viewMonth);
  renderMonthSel();
  renderSelects();
  renderDashboard();
  renderLog();
  renderBudgets();
  renderCommute();
  renderGoals();
}
function renderMonthSel() {
  const keys = new Set([currentMonthKey(), viewMonth, ...Object.keys(data.months), ...data.expenses.map((e) => monthOf(e.date))]);
  const list = [...keys].sort().reverse();
  fillSelect($('monthSel'), list.map((k) => ({ value: k, label: monthLabel(k) })), viewMonth);
}
function renderSelects() {
  const opts = data.categories.map((c) => ({ value: c.id, label: c.name }));
  const travel = (data.categories.find((c) => /travel|commute/i.test(c.name)) || data.categories[0]).id;
  fillSelect($('expCat'), opts, $('expCat').value || data.categories[0].id);
  fillSelect($('commuteCat'), opts, $('commuteCat').value || travel);
  if (!$('expDate').value) $('expDate').value = todayStr();
  if (!$('commuteDate').value) $('commuteDate').value = todayStr();
}
const byRecent = (a, b) => b.date.localeCompare(a.date) || b.ts - a.ts;
function stat(label, value, sub, cls, extra) {
  return el('div', { class: 'stat' }, el('div', { class: 'label', text: label }), el('div', { class: 'value' + (cls ? ' ' + cls : ''), text: value }),
    extra || null, el('div', { class: 'sub', text: sub }));
}

function renderDashboard() {
  const s = monthStats(viewMonth);
  const isNow = viewMonth === currentMonthKey();
  const pct = s.total > 0 ? Math.round((s.spent / s.total) * 100) : 0;
  let safe = '—', safeSub = 'Switch to the current month';
  if (isNow) {
    const daysLeft = daysInMonth(viewMonth) - new Date().getDate() + 1;
    safe = s.remaining > 0 ? money(s.remaining / daysLeft) : money(0);
    safeSub = daysLeft + (daysLeft === 1 ? ' day' : ' days') + ' left this month';
  }
  $('stats').replaceChildren(
    stat('Overall budget', money(s.total), money(s.allocated) + ' assigned to components'),
    stat('Spent', money(s.spent), pct + '% of the overall budget'),
    stat('Left overall', money(s.remaining), s.remaining < 0 ? 'Over budget' : 'Still available', s.remaining < 0 ? 'neg' : '',
      bar(s.total > 0 ? s.spent / s.total : (s.spent > 0 ? 1 : 0), '#4ade80')),
    stat('Safe to spend per day', safe, safeSub)
  );

  $('catBars').replaceChildren(...data.categories.map((c) => {
    const budget = s.m.cats[c.id] || 0, spent = s.spentBy[c.id] || 0, left = round2(budget - spent);
    return el('div', { class: 'cat-row' },
      el('div', { class: 'cat-head' }, el('span', { class: 'dot', style: 'background:' + c.color }), el('strong', { text: c.name }),
        el('span', { class: 'cat-nums' + (left < 0 ? ' neg' : ''), text: money(spent) + ' of ' + money(budget) + (left < 0 ? ' · ' + money(-left) + ' over' : ' · ' + money(left) + ' left') })),
      bar(budget > 0 ? spent / budget : (spent > 0 ? 1 : 0), c.color));
  }));

  const recent = data.expenses.filter((e) => monthOf(e.date) === viewMonth).sort(byRecent).slice(0, 5);
  $('recent').replaceChildren(...(recent.length ? recent.map((e) =>
    el('div', { class: 'recent-row' },
      el('div', {}, e.note || (catById(e.catId) || {}).name || 'Expense', el('small', { text: fmtDate(e.date) + ' · ' + ((catById(e.catId) || {}).name || '') })),
      el('strong', { text: money(e.amount) }))) : [el('p', { class: 'empty', text: 'No expenses in this month yet.' })]));

  const tips = [];
  if (!data.expenses.some((e) => monthOf(e.date) === viewMonth)) tips.push('Nothing logged for ' + monthLabel(viewMonth) + ' yet. Use "Log expense" to add the first one.');
  if (s.remaining < 0) tips.push('You are ' + money(-s.remaining) + ' over your overall budget.');
  data.categories.forEach((c) => {
    const b = s.m.cats[c.id] || 0, sp = s.spentBy[c.id] || 0;
    if (sp > b) tips.push(c.name + ' is ' + money(sp - b) + ' over its budget.');
    else if (b > 0 && sp / b >= 0.85) tips.push(c.name + ' is ' + Math.round((sp / b) * 100) + '% used, with ' + money(b - sp) + ' left.');
  });
  if (isNow && s.spent > 0 && new Date().getDate() >= 3) {
    const proj = round2((s.spent / new Date().getDate()) * daysInMonth(viewMonth));
    tips.push(proj > s.total
      ? 'At this pace you will spend about ' + money(proj) + ' this month, which is ' + money(proj - s.total) + ' over budget.'
      : 'At this pace you will finish around ' + money(proj) + ', leaving about ' + money(s.total - proj) + '.');
  }
  if (s.unallocated > 0) tips.push(money(s.unallocated) + ' of your budget is not assigned to any component yet.');
  const best = commuteCombos()[0];
  if (best) tips.push('Cheapest commute: ' + best.go.name + ' + ' + best.back.name + ' at ' + money(best.day) + ' a day.');
  $('insights').replaceChildren(...tips.map((t) => el('li', { text: t })));

  towersApi.update(data.categories.map((c) => ({ id: c.id, name: c.name, color: c.color, budget: s.m.cats[c.id] || 0, spent: s.spentBy[c.id] || 0 })));
}

function renderLog() {
  $('logMonth').textContent = monthLabel(viewMonth);
  const cur = $('filterCat').value || 'all';
  fillSelect($('filterCat'), [{ value: 'all', label: 'All components' }, ...data.categories.map((c) => ({ value: c.id, label: c.name }))], cur);
  const fc = $('filterCat').value, q = $('filterText').value.trim().toLowerCase();
  const rows = data.expenses.filter((e) => monthOf(e.date) === viewMonth && (fc === 'all' || e.catId === fc) && (!q || e.note.toLowerCase().includes(q))).sort(byRecent);
  const total = round2(rows.reduce((s, e) => s + e.amount, 0));
  $('logBody').replaceChildren(...(rows.length ? rows.map((e) => {
    const c = catById(e.catId) || { name: '?', color: '#94a3b8' };
    return el('tr', {},
      el('td', { text: fmtDate(e.date) }),
      el('td', {}, el('span', { class: 'dot', style: 'background:' + c.color }), ' ' + c.name),
      el('td', {}, e.note || '—', e.tag === 'commute' ? el('span', { class: 'badge', text: 'commute' }) : null),
      el('td', { class: 'num', text: money(e.amount) }),
      el('td', {}, el('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Delete ' + money(e.amount) + ' expense', onclick: () => deleteExpense(e.id) }, 'Delete')));
  }) : [el('tr', {}, el('td', { colspan: '5', class: 'empty', text: 'Nothing logged here yet.' }))]));
  $('logTotal').textContent = rows.length + (rows.length === 1 ? ' entry' : ' entries') + ' · ' + money(total);
}

function renderBudgets() {
  const s = monthStats(viewMonth);
  $('totalNow').textContent = money(s.total) + ' for ' + monthLabel(viewMonth);
  $('totalInput').value = s.total;
  $('allocInfo').textContent = 'Assigned to components: ' + money(s.allocated) + ' · Not assigned: ' + money(s.unallocated) + ' · Spent: ' + money(s.spent) + ' · Left overall: ' + money(s.remaining);
  $('catList').replaceChildren(...data.categories.map((c) => {
    const budget = s.m.cats[c.id] || 0, spent = s.spentBy[c.id] || 0, left = round2(budget - spent);
    const amt = el('input', { type: 'number', min: '0', step: '1', placeholder: '₹ amount', inputmode: 'decimal', 'aria-label': 'Amount for ' + c.name });
    return el('div', { class: 'cat-row' },
      el('div', { class: 'cat-head' }, el('span', { class: 'dot', style: 'background:' + c.color }), el('strong', { text: c.name }),
        el('span', { class: 'cat-nums' + (left < 0 ? ' neg' : ''), text: money(spent) + ' of ' + money(budget) + (left < 0 ? ' · ' + money(-left) + ' over' : ' · ' + money(left) + ' left') })),
      bar(budget > 0 ? spent / budget : (spent > 0 ? 1 : 0), c.color),
      el('div', { class: 'cat-actions' }, amt,
        el('button', { class: 'btn small primary', type: 'button', onclick: () => adjustCat(c.id, 'add', amt.value) }, '+ Add to budget'),
        el('button', { class: 'btn small', type: 'button', onclick: () => adjustCat(c.id, 'set', amt.value) }, 'Set budget'),
        el('button', { class: 'btn small', type: 'button', onclick: () => renameCat(c.id) }, 'Rename'),
        el('button', { class: 'btn small danger', type: 'button', onclick: () => deleteCat(c.id) }, 'Delete')));
  }));
}

function renderCommute() {
  const st = data.settings;
  $('collegeDays').value = st.collegeDays;
  $('daysPerWeek').value = st.daysPerWeek;
  const combos = commuteCombos();
  const best = combos[0];
  const banner = $('bestBanner');
  if (!best) {
    banner.replaceChildren(el('p', { text: 'Add at least one route going and one coming back to compare combinations.' }));
  } else {
    const kids = [
      el('div', {}, 'Cheapest: ', el('strong', { text: best.go.name }), ' + ', el('strong', { text: best.back.name })),
      el('div', { class: 'banner-big', text: money(best.day) + ' a day · ' + money(best.day * st.collegeDays) + ' a month' }),
    ];
    if (combos.length > 1) {
      const next = combos[1], worst = combos[combos.length - 1];
      const gap = round2(next.day - best.day), save1 = round2(worst.day - best.day);
      kids.push(el('div', { class: 'banner-sub', text: (gap > 0 ? money(gap) + ' a day cheaper than the runner-up. ' : 'Tied with the runner-up, so pick the less hassle one. ')
        + 'Versus the priciest combo you save ' + money(save1) + ' a day, about ' + money(save1 * st.collegeDays) + ' a month.' }));
    }
    banner.replaceChildren(...kids);
  }
  $('comboBody').replaceChildren(...combos.map((c, i) => el('tr', { class: i === 0 ? 'best' : null },
    el('td', { text: String(i + 1) }),
    el('td', {}, c.go.name, el('small', { text: money(routeCost(c.go)) })),
    el('td', {}, c.back.name, el('small', { text: money(routeCost(c.back)) })),
    el('td', { class: 'num', text: money(c.day) }),
    el('td', { class: 'num', text: money(c.day * st.daysPerWeek) }),
    el('td', { class: 'num', text: money(c.day * st.collegeDays) }))));

  const catId = $('commuteCat').value;
  const cat = catById(catId);
  if (best && cat) {
    const budget = getMonth(viewMonth).cats[catId] || 0;
    const covers = best.day > 0 ? Math.floor(budget / best.day) : 0;
    let t = 'Your ' + cat.name + ' budget for ' + monthLabel(viewMonth) + ' is ' + money(budget) + '. At ' + money(best.day) + ' a day that covers ' + covers + ' college days; you plan ' + st.collegeDays + '.';
    if (covers < st.collegeDays) t += ' You would need ' + money(best.day * st.collegeDays - budget) + ' more.';
    $('projection').textContent = t;
  } else $('projection').textContent = '';

  const goOpts = data.routes.filter((r) => r.dir === 'go').map((r) => ({ value: r.id, label: r.name + ' — ' + money(routeCost(r)) }));
  const backOpts = data.routes.filter((r) => r.dir === 'back').map((r) => ({ value: r.id, label: r.name + ' — ' + money(routeCost(r)) }));
  fillSelect($('logGoSel'), goOpts, $('logGoSel').value || (best ? best.go.id : ''));
  fillSelect($('logBackSel'), backOpts, $('logBackSel').value || (best ? best.back.id : ''));

  const box = $('routeList');
  box.replaceChildren(...['go', 'back'].flatMap((dir) => {
    const rs = data.routes.filter((r) => r.dir === dir);
    return [el('h3', { text: dir === 'go' ? 'Going to college' : 'Coming back home' }),
      ...(rs.length ? rs.map(routeCard) : [el('p', { class: 'empty', text: 'None yet.' })])];
  }));
}
function routeCard(r) {
  return el('div', { class: 'route' },
    el('div', { class: 'route-head' }, el('strong', { text: r.name }), el('span', { class: 'route-total', text: money(routeCost(r)) }),
      el('button', { class: 'btn small danger', type: 'button', 'aria-label': 'Delete route ' + r.name, onclick: () => deleteRoute(r.id) }, 'Delete')),
    ...r.legs.map((l) => el('label', { class: 'leg' }, el('span', { text: l.label }),
      el('input', { type: 'number', min: '0', step: '1', value: String(l.cost), 'aria-label': l.label + ' cost', onchange: (ev) => {
        const v = parseFloat(ev.target.value);
        if (!isFinite(v) || v < 0) { toast('Enter 0 or more.'); ev.target.value = l.cost; return; }
        l.cost = cleanMoney(v, { max: 100000 });
        save(); renderAll();
      } }))));
}

function renderGoals() {
  const box = $('goalList');
  if (!data.goals.length) { box.replaceChildren(el('p', { class: 'empty', text: 'No goals yet. Add one on the left.' })); return; }
  box.replaceChildren(...data.goals.map((g) => {
    const amt = el('input', { type: 'number', min: '0', step: '1', placeholder: '₹ amount', inputmode: 'decimal', 'aria-label': 'Amount to add to ' + g.name });
    const done = g.saved >= g.target;
    return el('div', { class: 'goal' },
      el('div', { class: 'goal-head' }, el('strong', { text: g.name }), done ? el('span', { class: 'badge', text: 'reached' }) : null,
        el('span', { class: 'cat-nums', text: money(g.saved) + ' of ' + money(g.target) })),
      bar(g.target > 0 ? Math.min(1, g.saved / g.target) : 0, '#4ade80'),
      el('div', { class: 'cat-actions' }, amt,
        el('button', { class: 'btn small primary', type: 'button', onclick: () => {
          const v = parseFloat(amt.value);
          if (!isFinite(v) || v <= 0) return toast('Enter an amount above 0.');
          g.saved = cleanMoney(g.saved + v); save(); renderGoals();
        } }, 'Add savings'),
        el('button', { class: 'btn small danger', type: 'button', onclick: async () => {
          if (!(await ask({ title: 'Delete "' + g.name + '"?', okLabel: 'Delete', danger: true }))) return;
          data.goals = data.goals.filter((x) => x.id !== g.id); save(); renderGoals();
        } }, 'Delete')));
  }));
}

/* ================= actions ================= */
function commitExpenses(list) {
  data.expenses.push(...list);
  viewMonth = monthOf(list[0].date);
  getMonth(viewMonth);
  save();
  renderAll();
  const s = monthStats(viewMonth);
  const total = round2(list.reduce((a, e) => a + e.amount, 0));
  const warns = [];
  for (const id of new Set(list.map((x) => x.catId))) {
    const left = round2((s.m.cats[id] || 0) - (s.spentBy[id] || 0));
    if (left < 0) warns.push(catById(id).name + ' is ' + money(-left) + ' over budget');
  }
  if (s.remaining < 0) warns.push('the overall budget is ' + money(-s.remaining) + ' over');
  toast('Logged ' + money(total) + ' in ' + monthLabel(viewMonth) + '.' + (warns.length ? ' Heads up: ' + warns.join('; ') + '.' : ''));
}
/* Safe arithmetic for the amount box: + - * / ( ) and decimals, no eval. */
function evalMoney(str) {
  const s = String(str).replace(/[₹,\s]/g, '').replace(/×/g, '*').replace(/÷/g, '/');
  if (!s || !/^[0-9.+\-*/()]+$/.test(s)) return NaN;
  let i = 0;
  const fail = () => { throw new Error('bad'); };
  function num() {
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (!m) fail();
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function factor() {
    if (s[i] === '-') { i++; return -factor(); }
    if (s[i] === '+') { i++; return factor(); }
    if (s[i] === '(') { i++; const v = expr(); if (s[i] !== ')') fail(); i++; return v; }
    return num();
  }
  function term() {
    let v = factor();
    while (s[i] === '*' || s[i] === '/') { const op = s[i++]; const r = factor(); v = op === '*' ? v * r : v / r; }
    return v;
  }
  function expr() {
    let v = term();
    while (s[i] === '+' || s[i] === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  try { const v = expr(); return i === s.length && isFinite(v) ? round2(v) : NaN; } catch (e) { return NaN; }
}
function updateExpPreview() {
  const raw = $('expAmount').value.trim();
  const out = $('expPreview');
  if (!raw) { out.textContent = ''; return; }
  const v = evalMoney(raw);
  if (isNaN(v)) out.textContent = "Can't read that yet";
  else out.textContent = /[+\-*/()×÷]/.test(raw.replace(/^-/, '')) ? '= ' + money(v) : '';
}
function addExpense(ev) {
  ev.preventDefault();
  const date = $('expDate').value, catId = $('expCat').value, amount = evalMoney($('expAmount').value);
  if (!isDateStr(date)) return toast('Pick a valid date.');
  if (!isFinite(amount) || amount <= 0 || amount > MAX_MONEY) return toast('Enter an amount above 0. You can add up, like 60+20+40.');
  if (!catById(catId)) return toast('Pick a component.');
  commitExpenses([{ id: genId('e'), date, catId, amount, note: cleanStr($('expNote').value, 80), ts: Date.now() }]);
  $('expAmount').value = '';
  $('expNote').value = '';
  updateExpPreview();
  $('expAmount').focus();
}
function deleteExpense(id) {
  const i = data.expenses.findIndex((e) => e.id === id);
  if (i < 0) return;
  const removed = data.expenses.splice(i, 1)[0];
  save();
  renderAll();
  toast('Deleted ' + money(removed.amount) + '.', { label: 'Undo', fn: () => { data.expenses.push(removed); save(); renderAll(); } });
}
function adjustCat(id, mode, raw) {
  const v = parseFloat(raw);
  if (!isFinite(v) || v < 0 || (mode === 'add' && v <= 0) || v > MAX_MONEY) return toast('Enter an amount first.');
  const m = getMonth(viewMonth);
  const cur = m.cats[id] || 0;
  m.cats[id] = cleanMoney(mode === 'add' ? cur + v : v);
  const raised = ensureTotal(m);
  save(); renderAll();
  toast(raised ? 'Budget updated. The overall budget went up by ' + money(raised) + ' to fit.' : 'Budget updated.');
}
/* In-page dialog (browsers can silently block prompt()/confirm()).
   Resolves to the typed text (input dialogs), true (confirm dialogs), or null if cancelled. */
function ask(opts) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const input = opts.input ? el('input', { type: 'text', value: opts.value || '', maxlength: String(opts.max || 60), 'aria-label': opts.title }) : null;
    let overlay = null;
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } };
    function done(v) {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (prev && prev.focus) prev.focus();
      resolve(v);
    }
    const ok = el('button', { class: 'btn ' + (opts.danger ? 'danger' : 'primary'), type: 'submit' }, opts.okLabel || 'OK');
    const cancel = el('button', { class: 'btn', type: 'button', onclick: () => done(null) }, 'Cancel');
    const form = el('form', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modalTitle', onsubmit: (e) => { e.preventDefault(); done(input ? input.value : true); } },
      el('h2', { id: 'modalTitle', text: opts.title }),
      opts.message ? el('p', { text: opts.message }) : null,
      input,
      el('div', { class: 'modal-actions' }, cancel, ok));
    overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) done(null); } }, form);
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    (input || ok).focus();
    if (input) input.select();
  });
}
async function renameCat(id) {
  const c0 = catById(id);
  if (!c0) return;
  const v = await ask({ title: 'Rename component', input: true, value: c0.name, max: 24, okLabel: 'Rename' });
  if (v === null) return;
  const c = catById(id);
  const n = cleanStr(v, 24);
  if (!c || !n) return toast('The name can’t be empty.');
  if (n === c.name) return;
  if (data.categories.some((x) => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) return toast('You already have a component with that name.');
  c.name = n; save(); renderAll();
  toast('Renamed to ' + n + '.');
}
async function deleteCat(id) {
  const c = catById(id);
  if (data.categories.length <= 1) return toast('Keep at least one component.');
  if (data.expenses.some((e) => e.catId === id)) return toast(c.name + " has logged expenses, so it can't be deleted. Rename it instead.");
  if (!(await ask({ title: 'Delete "' + c.name + '"?', message: 'This removes the component and its budgets.', okLabel: 'Delete', danger: true }))) return;
  if (!catById(id)) return;
  data.categories = data.categories.filter((x) => x.id !== id);
  for (const m of Object.values(data.months)) delete m.cats[id];
  save(); renderAll();
}
function addCategory(ev) {
  ev.preventDefault();
  const name = cleanStr($('newCatName').value, 24), budget = parseFloat($('newCatBudget').value);
  if (!name) return toast('Give the component a name.');
  if (!isFinite(budget) || budget < 0 || budget > MAX_MONEY) return toast('Budget must be 0 or more.');
  if (data.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return toast('You already have a component with that name.');
  if (data.categories.length >= 40) return toast('That is plenty of components already.');
  const id = genId('c');
  data.categories.push({ id, name, color: PALETTE[data.categories.length % PALETTE.length] });
  const m = getMonth(viewMonth);
  m.cats[id] = cleanMoney(budget);
  const raised = ensureTotal(m);
  save();
  $('newCatName').value = '';
  $('newCatBudget').value = '0';
  renderAll();
  toast('Added ' + name + '.' + (raised ? ' The overall budget went up by ' + money(raised) + ' to fit.' : ''));
}
function setTotal(ev) {
  ev.preventDefault();
  const v = parseFloat($('totalInput').value);
  if (!isFinite(v) || v < 0 || v > MAX_MONEY) return toast('Enter a budget of 0 or more.');
  const s = monthStats(viewMonth);
  if (v < s.allocated) return toast('Component budgets already add up to ' + money(s.allocated) + '. Lower those first.');
  s.m.total = cleanMoney(v); save(); renderAll(); toast('Overall budget set.');
}
function appendTotal(ev) {
  ev.preventDefault();
  const v = parseFloat($('totalAppend').value);
  if (!isFinite(v) || v <= 0 || v > MAX_MONEY) return toast('Enter an amount above 0.');
  const m = getMonth(viewMonth);
  m.total = cleanMoney(m.total + v);
  save(); $('totalAppend').value = ''; renderAll(); toast('Added ' + money(v) + ' to the overall budget.');
}
function logCommute(which) {
  const date = $('commuteDate').value;
  if (!isDateStr(date)) return toast('Pick a valid date.');
  const catId = $('commuteCat').value;
  if (!catById(catId)) return toast('Pick a component to charge.');
  const items = [];
  if (which !== 'back') items.push(['Going', routeById($('logGoSel').value)]);
  if (which !== 'go') items.push(['Coming back', routeById($('logBackSel').value)]);
  const list = [];
  for (const [label, r] of items) {
    if (!r) return toast('Add a ' + (label === 'Going' ? 'going' : 'return') + ' route first.');
    const cost = routeCost(r);
    if (cost > 0) list.push({ id: genId('e'), date, catId, amount: cost, note: label + ': ' + r.name, ts: Date.now(), tag: 'commute' });
  }
  if (!list.length) return toast('That route costs ₹0, so there is nothing to log.');
  commitExpenses(list);
}
async function deleteRoute(id) {
  const r = routeById(id);
  if (!r || !(await ask({ title: 'Delete "' + r.name + '"?', okLabel: 'Delete', danger: true }))) return;
  data.routes = data.routes.filter((x) => x.id !== id); save(); renderAll();
}
function addRoute(ev) {
  ev.preventDefault();
  const dir = $('rDir').value === 'back' ? 'back' : 'go';
  const name = cleanStr($('rName').value, 60);
  if (!name) return toast('Give the route a name.');
  const lines = $('rLegs').value.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length || lines.length > 10) return toast('Add between 1 and 10 legs, one per line.');
  const legs = [];
  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i].lastIndexOf(',');
    const label = idx > 0 ? cleanStr(lines[i].slice(0, idx), 40) : '';
    const rawCost = idx > 0 ? lines[i].slice(idx + 1).trim() : '';
    const cost = rawCost === '' ? NaN : Number(rawCost);
    if (!label || !isFinite(cost) || cost < 0) return toast('Line ' + (i + 1) + ': use "label, cost" like "Metro ticket, 20".');
    legs.push({ label, cost: cleanMoney(cost, { max: 100000 }) });
  }
  data.routes.push({ id: genId('r'), dir, name, legs });
  save();
  $('rName').value = '';
  $('rLegs').value = '';
  renderAll();
  toast('Route added.');
}
function addGoal(ev) {
  ev.preventDefault();
  const name = cleanStr($('gName').value, 40), target = parseFloat($('gTarget').value);
  if (!name) return toast('Name your goal.');
  if (!isFinite(target) || target <= 0 || target > MAX_MONEY) return toast('Target must be above 0.');
  data.goals.push({ id: genId('g'), name, target: cleanMoney(target), saved: 0 });
  save(); $('gName').value = ''; $('gTarget').value = ''; renderGoals();
}
function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'abeers-money-book', exported: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: 'money-book-' + todayStr() + '.json' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function importData(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return toast('That file is too big to be a backup.');
  const reader = new FileReader();
  reader.onload = async () => {
    const raw = safeParse(String(reader.result));
    const clean = sanitizeData(raw && raw.data ? raw.data : raw);
    if (!clean) return toast("That doesn't look like a money book backup.");
    if (!(await ask({ title: 'Restore this backup?', message: 'This replaces everything in this account with the backup.', okLabel: 'Restore', danger: true }))) return;
    data = clean; viewMonth = currentMonthKey(); save(); renderAll(); toast('Backup restored.');
  };
  reader.onerror = () => toast('Could not read that file.');
  reader.readAsText(file);
}
async function resetData() {
  if (!(await ask({ title: 'Reset all data?', message: 'This deletes every budget, expense, route and goal in this account.', okLabel: 'Reset', danger: true }))) return;
  data = defaultData(); viewMonth = currentMonthKey(); save(); renderAll(); toast('Data reset.');
}

/* ================= three.js: floating coins backdrop ================= */
function initBackground() {
  const api = { step() {} };
  if (!has3D) return api;
  const canvas = $('bg');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { canvas.style.display = 'none'; return api; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.z = 14;
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const light = new THREE.DirectionalLight(0xffffff, 0.9);
  light.position.set(4, 6, 8);
  scene.add(light);
  const geo = new THREE.CylinderGeometry(0.6, 0.6, 0.12, 32);
  const mats = [0xf5c542, 0xcbd5e1].map((c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.45, roughness: 0.4, transparent: true, opacity: 0.5 }));
  const coins = [];
  for (let i = 0; i < 34; i++) {
    const m = new THREE.Mesh(geo, mats[i % 2]);
    m.position.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, -8 + Math.random() * 10);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    m.userData = { sx: 0.004 + Math.random() * 0.01, sy: 0.004 + Math.random() * 0.01, rise: 0.003 + Math.random() * 0.006 };
    scene.add(m);
    coins.push(m);
  }
  let dirty = true;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  window.addEventListener('resize', resize);
  resize();
  api.step = () => {
    if (!reduceMotion) {
      for (const c of coins) {
        c.rotation.x += c.userData.sx;
        c.rotation.y += c.userData.sy;
        c.position.y += c.userData.rise;
        if (c.position.y > 11) c.position.y = -11;
      }
      dirty = true;
    }
    if (dirty) { renderer.render(scene, camera); dirty = false; }
  };
  return api;
}

/* ================= three.js: budget towers ================= */
function initTowers() {
  const api = { update() {}, resize() {}, step() {} };
  const canvas = $('towers');
  const wrap = canvas.parentElement;
  if (!has3D) {
    wrap.replaceChildren(el('p', { class: 'empty', text: 'The 3D view needs an internet connection to load three.js. The numbers on this page still work.' }));
    return api;
  }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) {
    wrap.replaceChildren(el('p', { class: 'empty', text: 'Your browser could not start WebGL, so the 3D view is off.' }));
    return api;
  }
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '3D towers showing the budget left in each component. Use the left and right arrow keys to rotate.');
  canvas.setAttribute('tabindex', '0');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(5, 10, 7);
  scene.add(key);
  const root = new THREE.Group();
  scene.add(root);
  root.add(new THREE.GridHelper(30, 30, 0x3a4a7a, 0x232c4d));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const edgeGeo = new THREE.EdgesGeometry(boxGeo);
  const items = new Map();
  const MAXH = 5;
  let dirty = true, dragging = false, lastX = 0;

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function fit(g, text, maxW) {
    if (g.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  function makeLabel() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.4, 1.2, 1);
    sprite.renderOrder = 10;
    return { sprite, c, tex, mat, sig: '' };
  }
  function drawLabel(l, name, sub, color) {
    const sig = name + '|' + sub + '|' + color;
    if (l.sig === sig) return;
    l.sig = sig;
    const g = l.c.getContext('2d');
    g.clearRect(0, 0, 256, 128);
    g.fillStyle = 'rgba(8,12,28,0.82)';
    roundRect(g, 8, 20, 240, 88, 16);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.stroke();
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.font = '600 32px system-ui, sans-serif';
    g.fillText(fit(g, name, 216), 128, 60);
    g.fillStyle = color;
    g.font = '600 26px system-ui, sans-serif';
    g.fillText(sub, 128, 94);
    l.tex.needsUpdate = true;
  }
  function makeItem() {
    const group = new THREE.Group();
    const solid = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.1 }));
    solid.scale.set(1.3, 0.001, 1.3);
    const outline = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    outline.scale.set(1.5, 0.5, 1.5);
    const label = makeLabel();
    group.add(solid, outline, label.sprite);
    root.add(group);
    return { group, solid, outline, label, curOut: 0.5, curFill: 0.001, tgtOut: 0.5, tgtFill: 0.001 };
  }
  function applyItem(it) {
    it.outline.scale.y = it.curOut;
    it.solid.scale.y = Math.max(0.001, it.curFill);
    it.label.sprite.position.y = Math.max(it.curOut, it.curFill) + 0.8;
  }

  api.update = (list) => {
    const maxBudget = Math.max(1, ...list.map((x) => x.budget));
    const alive = new Set();
    list.forEach((c, i) => {
      alive.add(c.id);
      let it = items.get(c.id);
      if (!it) { it = makeItem(); items.set(c.id, it); }
      const outH = Math.max(0.5, (c.budget / maxBudget) * MAXH);
      let fill, color, sub;
      if (c.spent <= c.budget) {
        fill = c.budget > 0 ? (outH * (c.budget - c.spent)) / c.budget : 0;
        color = c.color;
        sub = money(c.budget - c.spent) + ' left';
      } else {
        fill = outH + Math.min(2, ((c.spent - c.budget) / maxBudget) * MAXH) + 0.15;
        color = DANGER;
        sub = money(c.spent - c.budget) + ' over';
      }
      it.tgtOut = outH;
      it.tgtFill = Math.max(0.001, fill);
      it.solid.material.color.set(color);
      it.outline.material.color.set(color);
      it.group.position.x = (i - (list.length - 1) / 2) * 2.6;
      drawLabel(it.label, c.name, sub, color);
    });
    for (const [id, it] of items) {
      if (alive.has(id)) continue;
      root.remove(it.group);
      it.solid.material.dispose();
      it.outline.material.dispose();
      it.label.mat.dispose();
      it.label.tex.dispose();
      items.delete(id);
    }
    camera.position.set(0, 5 + list.length * 0.2, 9 + list.length * 1.6);
    camera.lookAt(0, 2, 0);
    if (reduceMotion) for (const it of items.values()) { it.curOut = it.tgtOut; it.curFill = it.tgtFill; applyItem(it); }
    dirty = true;
  };
  api.resize = () => {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  api.step = () => {
    if (!wrap.clientWidth) return;
    let moving = false;
    for (const it of items.values()) {
      const dO = it.tgtOut - it.curOut, dF = it.tgtFill - it.curFill;
      if (Math.abs(dO) > 0.002 || Math.abs(dF) > 0.002) { it.curOut += dO * 0.12; it.curFill += dF * 0.12; moving = true; }
      else { it.curOut = it.tgtOut; it.curFill = it.tgtFill; }
      applyItem(it);
    }
    if (!reduceMotion && !dragging) { root.rotation.y += 0.0015; moving = true; }
    if (moving || dirty) { renderer.render(scene, camera); dirty = false; }
  };

  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
  canvas.addEventListener('pointermove', (e) => { if (!dragging) return; root.rotation.y += (e.clientX - lastX) * 0.01; lastX = e.clientX; dirty = true; });
  const stop = () => { dragging = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { root.rotation.y -= 0.2; dirty = true; e.preventDefault(); }
    if (e.key === 'ArrowRight') { root.rotation.y += 0.2; dirty = true; e.preventDefault(); }
  });
  if ('ResizeObserver' in window) new ResizeObserver(api.resize).observe(wrap);
  else window.addEventListener('resize', api.resize);
  return api;
}

/* ================= boot ================= */
function loop() {
  requestAnimationFrame(loop);
  bgApi.step();
  towersApi.step();
}
function boot() {
  if (!storageOK()) setLoginMsg('Your browser is blocking site storage, so nothing could be saved. Allow site data and reload.');

  $('loginForm').addEventListener('submit', onLogin);
  $('toggleMode').addEventListener('click', (e) => { e.preventDefault(); setMode(loginMode === 'login' ? 'create' : 'login'); });
  $('logoutBtn').addEventListener('click', logout);
  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab-btn'); if (b) showTab(b.dataset.tab); });
  $('fab').addEventListener('click', () => { showTab('log'); $('expAmount').focus(); });
  $('monthSel').addEventListener('change', () => { viewMonth = $('monthSel').value; renderAll(); });

  $('expForm').addEventListener('submit', addExpense);
  $('expAmount').addEventListener('input', updateExpPreview);
  $('filterCat').addEventListener('change', renderLog);
  $('filterText').addEventListener('input', renderLog);
  $('totalSetForm').addEventListener('submit', setTotal);
  $('totalAddForm').addEventListener('submit', appendTotal);
  $('catForm').addEventListener('submit', addCategory);
  $('routeForm').addEventListener('submit', addRoute);
  $('goalForm').addEventListener('submit', addGoal);
  document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    logCommute(b.dataset.act === 'logGo' ? 'go' : b.dataset.act === 'logBack' ? 'back' : 'both');
  }));
  $('collegeDays').addEventListener('change', () => { data.settings.collegeDays = clampInt($('collegeDays').value, 1, 31, 22); save(); renderAll(); });
  $('daysPerWeek').addEventListener('change', () => { data.settings.daysPerWeek = clampInt($('daysPerWeek').value, 1, 7, 5); save(); renderAll(); });
  $('commuteCat').addEventListener('change', renderCommute);
  $('exportBtn').addEventListener('click', exportData);
  $('importFile').addEventListener('change', importData);
  $('resetBtn').addEventListener('click', resetData);

  window.addEventListener('storage', (e) => {
    if (!user || e.key !== DATA_PREFIX + user.key || !e.newValue) return;
    const d = sanitizeData(safeParse(e.newValue));
    if (d) { data = d; renderAll(); }
  });

  bgApi = initBackground();
  towersApi = initTowers();
  requestAnimationFrame(loop);

  const last = store.get(LAST_KEY);
  if (last) $('username').value = last;
  if (restoreSession()) return;
  setMode(Object.keys(loadUsers()).length ? 'login' : 'create');
  ($('username').value ? $('password') : $('username')).focus();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
