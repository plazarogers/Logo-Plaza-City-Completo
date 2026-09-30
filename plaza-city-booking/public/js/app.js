import { api, ApiError } from './api.js';
import { t, setLang, getLang, initLang, locale } from './i18n.js';

const $app = document.getElementById('app');
const $nav = document.getElementById('nav');
const $topUser = document.getElementById('topbar-user');

const state = { config: null, user: null, pushSubscribed: false, ownerKey: sessionStorage.getItem('pc.ownerKey') || '' };

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const TZ = 'America/Chicago';
function fmtDate(dateStr, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(locale(), { timeZone: 'UTC', ...opts });
}
function fmtTime(iso) { return new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', timeZone: TZ }); }
function fmtDateTime(iso) { return new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }); }
function spaceName(id) { return t(`space.${id}`); }
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
  return dt.toISOString().slice(0, 10);
}
let toastTimer;
function toast(msg) {
  document.querySelectorAll('.toast').forEach((e) => e.remove());
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; document.body.appendChild(el);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 3500);
}
function errorMsg(err) { return err instanceof ApiError ? err.message : t('common.error'); }
function navigate(path) { history.pushState({}, '', path); route(); }
window.addEventListener('popstate', route);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/"]');
  if (a && !a.hasAttribute('download') && !a.target && !e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate(a.getAttribute('href')); }
});

// ---------- navegación ----------
const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>',
  mine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19h16M4 15l4-4 4 3 8-8"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};
function renderNav() {
  document.querySelector('[data-i18n="app.subtitle"]').textContent = t('app.subtitle');
  if (!state.user) { $nav.innerHTML = ''; $nav.classList.add('hidden'); $topUser.textContent = ''; return; }
  $nav.classList.remove('hidden');
  const items = [['/', 'home'], ['/calendario', 'calendar'], ['/mis-apartados', 'mine'], ['/actividad', 'activity'], ['/ajustes', 'settings']];
  const path = location.pathname;
  $nav.innerHTML = items.map(([href, k]) => `<a href="${href}" class="${(href === '/' ? path === '/' : path.startsWith(href)) ? 'active' : ''}">${ICONS[k]}<span>${t('nav.' + k)}</span></a>`).join('');
  $topUser.innerHTML = `<div>${esc(state.user.name)}</div><div class="small" style="opacity:.75">${esc(state.user.company || state.user.suite || '')}</div>`;
}

// ---------- router ----------
async function route() {
  const path = location.pathname;
  const q = new URLSearchParams(location.search);
  renderNav();
  window.scrollTo(0, 0);
  if (path === '/registro') return viewRegister(q.get('invite') || '');
  if (path === '/invitaciones') return viewInvites();
  if (!state.user) return viewLogin();
  if (path.startsWith('/calendario')) return viewCalendar(q);
  if (path.startsWith('/mis-apartados')) return viewMine();
  if (path.startsWith('/actividad')) return viewActivity();
  if (path.startsWith('/ajustes')) return viewSettings();
  return viewHome();
}

// ---------- vistas ----------
function authShell(inner) {
  return `<div class="auth"><div class="logo"><img src="/icons/logo.svg" alt="Plaza City"><h1>Plaza City</h1><div class="muted">${t('app.subtitle')}</div></div>${inner}</div>`;
}

function viewLogin() {
  $app.innerHTML = authShell(`<div class="card"><h2>${t('auth.login')}</h2>
    <form id="f"><label class="field"><span>${t('auth.email')}</span><input name="email" type="email" required autocomplete="email"></label>
    <label class="field"><span>${t('auth.password')}</span><input name="password" type="password" required autocomplete="current-password"></label>
    <div id="err"></div><button class="btn primary block">${t('auth.enter')}</button></form>
    <p class="muted small" style="margin-top:14px">${t('auth.onlyInvite')}</p></div>`);
  $app.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api.post('/api/login', Object.fromEntries(fd));
      state.user = r.user; setLang(r.user.lang); await loadMe(); navigate('/');
    } catch (err) { $app.querySelector('#err').innerHTML = `<div class="error">${esc(errorMsg(err))}</div>`; }
  };
}

async function viewRegister(token) {
  $app.innerHTML = authShell(`<div class="card">${t('common.loading')}</div>`);
  let inv;
  try { inv = await api.get(`/api/invites/${encodeURIComponent(token)}`); }
  catch { $app.innerHTML = authShell(`<div class="card"><div class="error">${t('auth.inviteInvalid')}</div><a class="btn block" href="/">${t('auth.login')}</a></div>`); return; }
  $app.innerHTML = authShell(`<div class="card"><h2>${t('auth.register')}</h2>
    ${inv.label ? `<div class="notice">${t('auth.inviteFor')}: <b>${esc(inv.label)}</b></div>` : ''}
    <form id="f"><input type="hidden" name="token" value="${esc(token)}">
    <label class="field"><span>${t('auth.name')}</span><input name="name" required autocomplete="name"></label>
    <label class="field"><span>${t('auth.company')}</span><input name="company" autocomplete="organization"></label>
    <label class="field"><span>${t('auth.suite')}</span><input name="suite"></label>
    <label class="field"><span>${t('auth.email')}</span><input name="email" type="email" required autocomplete="email"></label>
    <label class="field"><span>${t('auth.password8')}</span><input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
    <label class="field"><span>${t('set.lang')}</span><select name="lang"><option value="es" ${getLang() === 'es' ? 'selected' : ''}>Español</option><option value="en" ${getLang() === 'en' ? 'selected' : ''}>English</option></select></label>
    <div id="err"></div><button class="btn primary block">${t('auth.register')}</button></form>
    <p class="small" style="margin-top:12px">${t('auth.haveAccount')} <a href="/">${t('auth.login')}</a></p></div>`);
  $app.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api.post('/api/register', Object.fromEntries(new FormData(e.target)));
      state.user = r.user; setLang(r.user.lang); await loadMe(); navigate('/ajustes');
    } catch (err) { $app.querySelector('#err').innerHTML = `<div class="error">${esc(errorMsg(err))}</div>`; }
  };
}

async function viewHome() {
  const r = state.config.rules;
  $app.innerHTML = `<h1>${t('home.title', { name: esc(state.user.name.split(' ')[0]) })}</h1>
    <div class="card" id="next">${t('common.loading')}</div>
    <div class="card"><h2>${t('home.week')}</h2><div id="overview">${t('common.loading')}</div></div>
    <div class="card"><h2>${t('home.rules')}</h2><ul class="small stack" style="padding-left:18px">
      <li>${t('rules.hours')}</li><li>${t('rules.conference')}</li><li>${t('rules.atrium')}</li><li>${t('rules.sunday')}</li>
      <li>${t('rules.window', { days: r.bookingWindowDays, max: r.maxHoursPerBooking, quota: r.maxHoursPerUserPerDay })}</li>
      <li>${t('rules.checkin', { before: r.checkinOpensMinutesBefore, grace: r.checkinGraceMinutes })}</li><li>${t('rules.cancel')}</li></ul></div>`;
  const [mine, ov] = await Promise.all([api.get('/api/bookings/mine'), api.get('/api/overview?days=7')]);
  const next = mine.bookings.filter((b) => b.status === 'active').sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
  $app.querySelector('#next').innerHTML = `<h2>${t('home.next')}</h2>` + (next ? bookingCard(next, true) : `<p class="muted">${t('home.none')}</p>`) +
    `<a class="btn primary block" style="margin-top:10px" href="/calendario">${t('home.book')}</a>`;
  $app.querySelector('#overview').innerHTML = `<div style="overflow-x:auto"><table class="overview"><thead><tr><th>${t('home.day')}</th>${state.config.spaces.map((s) => `<th>${spaceName(s.id)}</th>`).join('')}</tr></thead><tbody>
    ${ov.days.map((d) => `<tr><td><b>${fmtDate(d.date, { weekday: 'short', day: 'numeric' })}</b></td>${d.spaces.map((s) => {
      if (!s.open) return `<td><span class="chip ${s.reason === 'closed' ? 'past' : 'free'}">${s.reason === 'closed' ? t('home.closed') : t('home.freeUse')}</span>${s.holiday ? `<div class="small muted">${esc(getLang() === 'en' ? s.holiday.name : s.holiday.nameEs || s.holiday.name)}</div>` : ''}</td>`;
      const full = s.booked >= s.total;
      return `<td><a href="/calendario?space=${s.id}&date=${d.date}">${t('home.hoursBooked', { booked: s.booked, total: s.total })}</a><div class="bar ${full ? 'full' : ''}"><i style="width:${Math.round((s.booked / s.total) * 100)}%"></i></div></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
  bindBookingActions();
}

// ---- calendario ----
const cal = { space: 'conference', date: null, sel: [], weekFrom: null, view: null };
async function viewCalendar(q) {
  const today = state.config.today;
  cal.space = state.config.spaces.some((s) => s.id === q.get('space')) ? q.get('space') : cal.space;
  cal.date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : cal.date || today;
  if (!cal.weekFrom || cal.date < cal.weekFrom || cal.date > addDays(cal.weekFrom, 6)) cal.weekFrom = cal.date;
  cal.sel = [];
  $app.innerHTML = `<h1>${t('cal.title')}</h1>
    <div class="tabs" id="tabs">${state.config.spaces.map((s) => `<button class="tab ${s.id === cal.space ? 'active' : ''}" data-space="${s.id}">${spaceName(s.id)}</button>`).join('')}</div>
    <div class="row between" style="margin-top:10px"><button class="btn sm" id="prev">‹ ${t('cal.prevWeek')}</button><button class="btn sm ghost" id="today">${t('cal.today')}</button><button class="btn sm" id="next">${t('cal.nextWeek')} ›</button></div>
    <div class="daystrip" id="strip"></div>
    <div class="card" id="day">${t('common.loading')}</div>
    <div class="card tight small"><b>${t('cal.legend')}:</b> <span class="chip free">${t('cal.free')}</span> <span class="chip busy">${t('cal.busy')}</span> <span class="chip mine">${t('cal.mine')}</span> <span class="chip past">${t('cal.past')}</span> <span class="chip special">${t('cal.special')}</span></div>
    <div id="confirm"></div>`;
  $app.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('[data-space]'); if (b) { cal.space = b.dataset.space; cal.sel = []; syncUrl(); viewCalendar(new URLSearchParams(location.search)); } };
  $app.querySelector('#prev').onclick = () => { cal.weekFrom = addDays(cal.weekFrom, -7); cal.date = cal.weekFrom; cal.sel = []; syncUrl(); loadWeek(); };
  $app.querySelector('#next').onclick = () => { cal.weekFrom = addDays(cal.weekFrom, 7); cal.date = cal.weekFrom; cal.sel = []; syncUrl(); loadWeek(); };
  $app.querySelector('#today').onclick = () => { cal.weekFrom = today; cal.date = today; cal.sel = []; syncUrl(); loadWeek(); };
  await loadWeek();
}
function syncUrl() { history.replaceState({}, '', `/calendario?space=${cal.space}&date=${cal.date}`); }
async function loadWeek() {
  const r = await api.get(`/api/calendar/${cal.space}?from=${cal.weekFrom}`);
  cal.week = r.days;
  renderStrip(); renderDay();
}
function renderStrip() {
  const today = state.config.today;
  $app.querySelector('#strip').innerHTML = cal.week.map((d) => {
    const booked = d.hours.filter((h) => h.booking).length;
    const dot = !d.open ? 'closed' : booked === 0 ? '' : booked >= d.hours.length ? 'full' : 'some';
    return `<button data-date="${d.date}" class="${d.date === cal.date ? 'active' : ''} ${d.date === today ? 'today' : ''}"><small>${fmtDate(d.date, { weekday: 'short' })}</small><b>${d.date.slice(8)}</b><span class="dot ${dot}"></span></button>`;
  }).join('');
  $app.querySelector('#strip').onclick = (e) => { const b = e.target.closest('[data-date]'); if (b) { cal.date = b.dataset.date; cal.sel = []; syncUrl(); renderStrip(); renderDay(); } };
}
function renderDay() {
  const d = cal.week.find((x) => x.date === cal.date);
  cal.view = d;
  const $day = $app.querySelector('#day');
  const head = `<div class="row between"><h2 style="margin:0">${fmtDate(d.date)}</h2><span class="muted small">${spaceName(cal.space)}</span></div>`;
  if (!d.open) {
    const msg = d.reason === 'sunday' ? t('cal.sunday') : d.reason === 'holiday' ? t('cal.holiday', { name: esc(getLang() === 'en' ? d.holiday.name : d.holiday.nameEs || d.holiday.name) }) : t('cal.closedDay');
    $day.innerHTML = head + `<div class="freeuse">${d.freeUse ? `<div class="chip free">${t('home.freeUse')}</div><div class="big">${t('cal.freeUseTitle')}</div>` : ''}<p class="muted">${msg}</p></div>`;
    renderConfirm(); return;
  }
  $day.innerHTML = head + `<p class="muted small">${t('cal.tapHours', { max: state.config.rules.maxHoursPerBooking })}</p><div class="hours">` + d.hours.map((h) => {
    const b = h.booking;
    const cls = b ? (b.mine ? 'mine' : 'busy') : h.past ? 'past' : 'free';
    const who = b ? `${esc(b.user_name)}${b.user_company ? ' · ' + esc(b.user_company) : ''}${b.note ? ' — ' + esc(b.note) : ''}` : h.past ? t('cal.past') : t('cal.free');
    const tag = b && b.checked_in ? `<span class="chip info">${t('cal.checkedIn')}</span>` : h.kind === 'special' ? `<span class="kind">${t('cal.special')}</span>` : '';
    return `<button class="hour ${cls} ${cal.sel.includes(h.hour) ? 'selected' : ''}" data-hour="${h.hour}" ${cls !== 'free' ? 'disabled' : ''}><span class="t">${hh(h.hour)}</span><span class="who">${who}</span>${tag}</button>`;
  }).join('') + '</div>';
  $day.querySelectorAll('.hour.free').forEach((el) => { el.onclick = () => toggleHour(Number(el.dataset.hour)); });
  renderConfirm();
}
function toggleHour(h) {
  const max = state.config.rules.maxHoursPerBooking;
  const freeHours = cal.view.hours.filter((x) => !x.booking && !x.past).map((x) => x.hour);
  if (cal.sel.includes(h)) {
    // Quitar: solo desde los extremos para que siga siendo contiguo
    const min = Math.min(...cal.sel), maxS = Math.max(...cal.sel);
    cal.sel = h === min || h === maxS ? cal.sel.filter((x) => x !== h) : [h];
  } else if (!cal.sel.length) cal.sel = [h];
  else {
    const min = Math.min(...cal.sel), maxS = Math.max(...cal.sel);
    if ((h === min - 1 || h === maxS + 1) && cal.sel.length < max) cal.sel.push(h);
    else {
      // Rango: rellenar si todas las horas intermedias están libres y cabe
      const lo = Math.min(min, h), hi = Math.max(maxS, h);
      const range = []; for (let x = lo; x <= hi; x++) range.push(x);
      cal.sel = range.length <= max && range.every((x) => freeHours.includes(x)) ? range : [h];
    }
  }
  renderDay();
}
function renderConfirm() {
  const $c = $app.querySelector('#confirm');
  if (!cal.sel.length) { $c.innerHTML = ''; return; }
  const lo = Math.min(...cal.sel), hi = Math.max(...cal.sel) + 1;
  $c.innerHTML = `<div class="confirmbar"><div class="inner"><div class="txt"><b>${t('cal.selected', { space: spaceName(cal.space), date: fmtDate(cal.date, { weekday: 'short', day: 'numeric', month: 'short' }), from: hh(lo), to: hh(hi), n: hi - lo })}</b>
    <input id="note" class="input" style="margin-top:6px" maxlength="120" placeholder="${t('cal.note')}"></div>
    <button class="btn ghost sm" id="clear">${t('cal.clear')}</button><button class="btn primary" id="ok">${t('cal.confirm')}</button></div></div>`;
  $c.querySelector('#clear').onclick = () => { cal.sel = []; renderDay(); };
  $c.querySelector('#ok').onclick = async () => {
    const btn = $c.querySelector('#ok'); btn.disabled = true;
    try {
      await api.post('/api/bookings', { space: cal.space, date: cal.date, startHour: lo, endHour: hi, note: $c.querySelector('#note').value });
      toast(t('cal.booked')); cal.sel = []; await loadWeek();
    } catch (err) { toast(errorMsg(err)); btn.disabled = false; await loadWeek(); }
  };
}

// ---- mis apartados ----
function bookingCard(b, compact = false) {
  const nowMs = Date.now();
  const canCheckin = b.status === 'active' && !b.checked_in_at && nowMs >= b.checkin.opens && nowMs <= b.checkin.closes;
  const started = nowMs >= Date.parse(b.start_at);
  const status = b.status === 'released' ? t('status.' + (b.released_reason || 'released')) : t('status.' + b.status);
  const chip = b.status === 'active' ? (b.checked_in_at ? 'info' : 'mine') : b.status === 'completed' ? 'free' : 'past';
  let actions = '';
  if (b.status === 'active') {
    if (b.checked_in_at) actions += `<span class="chip info">${t('mine.checkedIn')}</span> `;
    else if (canCheckin) actions += `<button class="btn primary sm" data-act="checkin" data-id="${b.id}">${t('mine.checkin')}</button> `;
    else if (nowMs < b.checkin.opens) actions += `<span class="muted small">${t('mine.checkinAt', { time: fmtTime(new Date(b.checkin.opens).toISOString()) })}</span> `;
    if (!started) actions += `<button class="btn danger sm" data-act="cancel" data-id="${b.id}">${t('mine.cancel')}</button>`;
    else actions += `<button class="btn danger sm" data-act="release" data-id="${b.id}">${t('mine.release')}</button>`;
  }
  const warn = b.status === 'active' && !b.checked_in_at && nowMs < b.checkin.closes ? `<div class="small" style="color:var(--pc-mine-ink);margin-top:4px">${t('mine.noShowWarning', { time: fmtTime(new Date(b.checkin.closes).toISOString()) })}</div>` : '';
  return `<div class="item"><div class="row between"><div class="title">${spaceName(b.space_id)}</div><span class="chip ${chip}">${status}</span></div>
    <div class="meta">${fmtDate(b.date)} · ${hh(b.start_hour)}–${hh(b.end_hour)} (${b.end_hour - b.start_hour} ${t('common.hours')})${b.note ? ' — ' + esc(b.note) : ''}</div>${warn}
    ${actions ? `<div class="row" style="margin-top:8px">${actions}</div>` : ''}</div>`;
}
function bindBookingActions() {
  $app.querySelectorAll('[data-act]').forEach((btn) => {
    btn.onclick = async () => {
      const { act, id } = btn.dataset;
      if (act === 'cancel' && !confirm(t('mine.confirmCancel'))) return;
      if (act === 'release' && !confirm(t('mine.confirmRelease'))) return;
      btn.disabled = true;
      try {
        await api.post(`/api/bookings/${id}/${act}`);
        toast(act === 'checkin' ? t('cal.checkedIn') : act === 'cancel' ? t('mine.cancelled') : t('mine.released'));
        route();
      } catch (err) { toast(errorMsg(err)); btn.disabled = false; }
    };
  });
}
async function viewMine() {
  $app.innerHTML = `<h1>${t('mine.title')}</h1><div id="list">${t('common.loading')}</div>`;
  const r = await api.get('/api/bookings/mine');
  const active = r.bookings.filter((b) => b.status === 'active').sort((a, b) => a.start_at.localeCompare(b.start_at));
  const past = r.bookings.filter((b) => b.status !== 'active');
  $app.querySelector('#list').innerHTML = r.bookings.length ? `<div class="card"><h2>${t('mine.upcoming')}</h2><div class="list">${active.map((b) => bookingCard(b)).join('') || `<p class="muted">${t('home.none')}</p>`}</div></div>
    ${past.length ? `<div class="card"><h2>${t('mine.history')}</h2><div class="list">${past.map((b) => bookingCard(b)).join('')}</div></div>` : ''}` : `<div class="card"><p class="muted">${t('mine.none')}</p><a class="btn primary" href="/calendario">${t('home.book')}</a></div>`;
  bindBookingActions();
}

// ---- bitácora ----
async function viewActivity() {
  $app.innerHTML = `<h1>${t('act.title')}</h1><p class="muted small">${t('act.desc')}</p><div class="list" id="list"></div><div style="margin-top:12px"><button class="btn block" id="more">${t('act.more')}</button></div>`;
  let before = null;
  const load = async () => {
    const r = await api.get(`/api/activity?limit=50${before ? '&before=' + before : ''}`);
    const $l = $app.querySelector('#list');
    if (!r.items.length && !before) $l.innerHTML = `<p class="muted">${t('act.none')}</p>`;
    for (const it of r.items) {
      const who = `<b>${esc(it.user_name || '—')}</b>${it.user_company ? ' (' + esc(it.user_company) + ')' : ''}`;
      const space = it.space_id ? `<b>${spaceName(it.space_id)}</b>` : '';
      const when = it.date ? `${fmtDate(it.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${hh(it.start_hour)}–${hh(it.end_hour)} · ${t('act.duration', { n: it.hours })}` : '';
      $l.insertAdjacentHTML('beforeend', `<div class="item act-${it.type}"><div>${t('act.' + it.type, { who, space })}</div><div class="meta">${when}${when ? ' · ' : ''}${fmtDateTime(it.created_at)}</div></div>`);
      before = it.id;
    }
    if (r.items.length < 50) $app.querySelector('#more').classList.add('hidden');
  };
  $app.querySelector('#more').onclick = load;
  await load();
}

// ---- ajustes ----
async function viewSettings() {
  const u = state.user;
  const pushServer = state.config.push.enabled;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  $app.innerHTML = `<h1>${t('set.title')}</h1>
    <div class="card"><h2>${t('set.push')}</h2><p class="muted small">${t('set.pushDesc')}</p><div id="push"></div></div>
    <div class="card"><h2>${t('set.profile')}</h2><form id="pf">
      <label class="field"><span>${t('auth.name')}</span><input name="name" value="${esc(u.name)}" required></label>
      <label class="field"><span>${t('auth.company')}</span><input name="company" value="${esc(u.company)}"></label>
      <label class="field"><span>${t('auth.suite')}</span><input name="suite" value="${esc(u.suite)}"></label>
      <label class="field"><span>${t('set.lang')}</span><select name="lang"><option value="es" ${getLang() === 'es' ? 'selected' : ''}>Español</option><option value="en" ${getLang() === 'en' ? 'selected' : ''}>English</option></select></label>
      <div class="row"><button class="btn primary">${t('set.save')}</button><span class="muted small">${esc(u.email)}</span></div></form></div>
    <div class="card hidden" id="install"><h2>${t('set.install')}</h2><p class="muted small">${t('set.installDesc')}</p><button class="btn" id="installBtn">${t('set.install')}</button></div>
    <div class="card"><h2>${t('set.owner')}</h2><a class="btn" href="/invitaciones">${t('set.ownerLink')}</a></div>
    <div class="card"><button class="btn danger block" id="logout">${t('auth.logout')}</button></div>`;
  const $push = $app.querySelector('#push');
  const renderPush = () => {
    if (!pushServer) return ($push.innerHTML = `<div class="notice">${t('set.pushDisabledServer')}</div>`);
    if (!supported) return ($push.innerHTML = `<div class="notice">${t('set.pushUnsupported')}</div>`);
    if (Notification.permission === 'denied') return ($push.innerHTML = `<div class="error">${t('set.pushDenied')}</div>`);
    $push.innerHTML = state.pushSubscribed
      ? `<div class="success">${t('set.pushActive')}</div><div class="row"><button class="btn" id="pushOff">${t('set.pushOff')}</button><button class="btn ghost" id="pushTest">${t('set.pushTest')}</button></div>`
      : `<button class="btn primary" id="pushOn">${t('set.pushOn')}</button>`;
    $push.querySelector('#pushOn')?.addEventListener('click', async () => { try { await subscribePush(); renderPush(); } catch (e) { toast(e.message); } });
    $push.querySelector('#pushOff')?.addEventListener('click', async () => { await unsubscribePush(); renderPush(); });
    $push.querySelector('#pushTest')?.addEventListener('click', async () => { const r = await api.post('/api/push/test'); toast(`OK ${r.sent}/${r.sent + r.failed}`); });
  };
  renderPush();
  $app.querySelector('#pf').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const r = await api.patch('/api/me', data);
    state.user = r.user; setLang(r.user.lang); toast(t('set.saved')); route();
  };
  $app.querySelector('#logout').onclick = async () => { await api.post('/api/logout'); state.user = null; navigate('/'); };
  const $inst = $app.querySelector('#install');
  if (deferredInstall) { $inst.classList.remove('hidden'); $app.querySelector('#installBtn').onclick = () => deferredInstall.prompt(); } else $inst.classList.add('hidden');
}

// ---- invitaciones (dueño) ----
async function viewInvites() {
  const H = () => ({ 'x-owner-key': state.ownerKey });
  const askKey = (msg = '') => {
    $app.innerHTML = `<h1>${t('inv.title')}</h1><div class="card" style="max-width:420px"><p class="muted small">${t('inv.desc')}</p>${msg ? `<div class="error">${esc(msg)}</div>` : ''}
      <form id="k"><label class="field"><span>${t('inv.key')}</span><input name="key" type="password" required autocomplete="off"></label><button class="btn primary block">${t('inv.unlock')}</button></form>
      ${state.user ? '' : `<p class="small" style="margin-top:10px"><a href="/">${t('auth.login')}</a></p>`}</div>`;
    $app.querySelector('#k').onsubmit = async (e) => {
      e.preventDefault();
      state.ownerKey = new FormData(e.target).get('key');
      try { await api.get('/api/owner/check', H()); sessionStorage.setItem('pc.ownerKey', state.ownerKey); viewInvites(); }
      catch (err) { state.ownerKey = ''; askKey(errorMsg(err)); }
    };
  };
  if (!state.ownerKey) return askKey();
  let data;
  try { data = await api.get('/api/owner/invites', H()); } catch (err) { state.ownerKey = ''; sessionStorage.removeItem('pc.ownerKey'); return askKey(errorMsg(err)); }
  const users = await api.get('/api/owner/users', H());
  const badge = (s) => `<span class="chip ${s === 'active' ? 'free' : s === 'used' ? 'info' : 'past'}">${t('inv.' + s)}</span>`;
  $app.innerHTML = `<div class="row between"><h1>${t('inv.title')}</h1><button class="btn sm ghost" id="forget">${t('inv.forget')}</button></div><p class="muted small">${t('inv.desc')}</p>
    <div class="card"><form id="c" class="grid cols-3"><label class="field" style="grid-column:1/-1"><span>${t('inv.label')}</span><input name="label" maxlength="120"></label>
      <label class="field"><span>${t('inv.uses')}</span><input name="maxUses" type="number" min="1" max="500" value="1"></label>
      <label class="field"><span>${t('inv.days')}</span><input name="days" type="number" min="1" max="365" value="${state.config.rules.inviteDefaultDays}"></label>
      <div class="field" style="display:flex;align-items:end"><button class="btn primary block">${t('inv.create')}</button></div></form><div id="new"></div></div>
    <div class="card"><div class="list" id="list">${data.invites.length ? '' : `<p class="muted">${t('inv.none')}</p>`}${data.invites.map((i) => `<div class="item"><div class="row between"><div class="title">${esc(i.label) || '#' + i.id}</div>${badge(i.status)}</div>
      <div class="meta">${t('inv.uses')}: ${i.uses}/${i.max_uses} · ${t('inv.expires')}: ${fmtDateTime(i.expires_at)}</div>
      ${i.status === 'active' ? `<input class="input small" readonly value="${esc(i.url)}" style="margin-top:6px">` : ''}
      ${i.users.length ? `<div class="small muted" style="margin-top:4px">${t('inv.registered')}: ${i.users.map((u) => esc(u.name) + (u.company ? ' (' + esc(u.company) + ')' : '')).join(', ')}</div>` : ''}
      ${i.status === 'active' ? `<div class="row" style="margin-top:8px"><button class="btn sm" data-copy="${esc(i.url)}">${t('inv.copy')}</button><button class="btn sm danger" data-revoke="${i.id}">${t('inv.revoke')}</button></div>` : ''}</div>`).join('')}</div></div>
    <div class="card"><h2>${t('inv.users')} (${users.users.length})</h2><div class="list">${users.users.map((u) => `<div class="item"><div class="title">${esc(u.name)}</div><div class="meta">${esc(u.email)} · ${esc(u.company || '')} ${u.suite ? '· ' + esc(u.suite) : ''} · ${fmtDateTime(u.created_at)}</div></div>`).join('')}</div></div>`;
  $app.querySelector('#forget').onclick = () => { state.ownerKey = ''; sessionStorage.removeItem('pc.ownerKey'); navigate(state.user ? '/ajustes' : '/'); };
  $app.querySelector('#c').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api.post('/api/owner/invites', Object.fromEntries(new FormData(e.target)), H());
      $app.querySelector('#new').innerHTML = `<div class="success"><b>${t('inv.active')}:</b><br><input class="input" readonly value="${esc(r.invite.url)}" style="margin-top:6px"><button class="btn sm" style="margin-top:6px" data-copy="${esc(r.invite.url)}">${t('inv.copy')}</button></div>`;
      bindCopy();
      setTimeout(viewInvites, 2500);
    } catch (err) { toast(errorMsg(err)); }
  };
  const bindCopy = () => $app.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast(t('inv.copied')); } catch { prompt('URL', b.dataset.copy); } }; });
  bindCopy();
  $app.querySelectorAll('[data-revoke]').forEach((b) => { b.onclick = async () => { if (!confirm(t('inv.revoke') + '?')) return; await api.post(`/api/owner/invites/${b.dataset.revoke}/revoke`, {}, H()); viewInvites(); }; });
}

// ---------- push ----------
function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function subscribePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(t('set.pushDenied'));
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(state.config.push.publicKey) });
  await api.post('/api/push/subscribe', { subscription: sub.toJSON() });
  state.pushSubscribed = true;
}
async function unsubscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
  state.pushSubscribed = false;
}

// ---------- arranque ----------
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
async function loadMe() {
  const me = await api.get('/api/me');
  state.user = me.user; state.pushSubscribed = me.pushSubscribed;
  if (state.user && 'serviceWorker' in navigator) {
    // Si el navegador ya tiene suscripción pero el servidor no, la re-registramos.
    try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub && !state.pushSubscribed && state.config.push.enabled) { await api.post('/api/push/subscribe', { subscription: sub.toJSON() }); state.pushSubscribed = true; } } catch {}
  }
}
(async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  initLang(null);
  try {
    state.config = await api.get('/api/config');
    state.user = state.config.user;
    if (state.user) { setLang(state.user.lang); await loadMe(); }
  } catch (err) { $app.innerHTML = `<div class="card error">${esc(errorMsg(err))}</div>`; return; }
  route();
  // Refresca "hoy" y re-renderiza cada minuto para que check-in/no-show se actualicen solos.
  setInterval(async () => { try { const c = await api.get('/api/config'); state.config.today = c.today; if (location.pathname === '/mis-apartados' || location.pathname === '/') route(); } catch {} }, 60_000);
})();
