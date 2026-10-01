import { api, ApiError } from './api.js';
import { t, setLang, getLang, initLang, locale } from './i18n.js';

const $app = document.getElementById('app');
const $nav = document.getElementById('nav');
const $topUser = document.getElementById('topbar-user');
const $banner = document.getElementById('banner');
const TZ = 'America/Chicago';

const state = { config: null, user: null, pushSubscribed: false, ownerKey: '' };
try { state.ownerKey = sessionStorage.getItem('pcb.ownerKey') || ''; } catch {}

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
function fmtDate(d, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd, 12)).toLocaleDateString(locale(), { timeZone: 'UTC', ...opts });
}
const fmtTime = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—');
const spaceName = (id) => (id ? t(`space.${id}`) : t('act.closureAll'));
function addDays(d, n) { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n, 12)).toISOString().slice(0, 10); }
function toast(msg) {
  document.querySelectorAll('.toast').forEach((e) => e.remove());
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg; document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
const errorMsg = (err) => (err instanceof ApiError ? err.message : navigator.onLine === false ? t('common.offline') : t('common.error'));
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', q: new URLSearchParams(qs) };
}
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };
window.addEventListener('hashchange', route);
function holidayName(h) { return getLang() === 'en' ? h.name : h.nameEs || h.name; }
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast(t('inv.copied')); } catch { window.prompt('URL', text); }
}

// ---------- navegación ----------
const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>',
  mine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 19h16M4 15l4-4 4 3 8-8"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  gcal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>',
};
function renderLangSwitch() {
  document.querySelectorAll('#langswitch [data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
}
// Cambia el idioma al instante. Con sesión iniciada también lo guarda en la cuenta,
// así las notificaciones push llegan en ese idioma y se respeta en otros dispositivos.
let langChosenWhileLoggedOut = false;
document.getElementById('langswitch').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b || b.dataset.lang === getLang()) return;
  const lang = b.dataset.lang;
  setLang(lang);
  route(); // la pantalla cambia al instante; el guardado va en segundo plano
  if (state.user) {
    api.post('me', { lang }).then((r) => { if (state.user) state.user = r.user; }).catch((err) => toast(errorMsg(err)));
  } else langChosenWhileLoggedOut = true;
});

function renderChrome(path) {
  document.getElementById('subtitle').textContent = t('app.subtitle');
  renderLangSwitch();
  if (!state.user || path === '/admin') {
    $nav.innerHTML = ''; $nav.classList.add('hidden');
    $topUser.textContent = '';
    document.body.classList.add('no-nav');
    return;
  }
  document.body.classList.remove('no-nav');
  $nav.classList.remove('hidden');
  const items = [['/', 'home'], ['/calendario', 'calendar'], ['/mis-apartados', 'mine'], ['/actividad', 'activity'], ['/ajustes', 'settings']];
  $nav.innerHTML = items.map(([href, k]) => `<a href="#${href}" class="${path === href ? 'active' : ''}" ${path === href ? 'aria-current="page"' : ''}>${ICONS[k]}<span>${t('nav.' + k)}</span></a>`).join('');
  $topUser.innerHTML = `<div>${esc(state.user.name)}</div><div class="small" style="opacity:.75">${esc(state.user.company || state.user.suite || '')}</div>`;
}
function renderBanner() {
  const off = navigator.onLine === false ? `<div class="banner">${t('common.offline')}</div>` : '';
  const { path } = parseHash();
  const reqs = state.user && path !== '/solicitud' ? (state.config?.pendingRequests || []) : [];
  $banner.innerHTML = off + reqs.map((r) => `<a class="reqbanner" href="#/solicitud?id=${r.id}">
      <b>${t('req.bannerTitle', { who: esc(r.requester_name), space: spaceName(r.space_id) })}</b>
      <span>${t('req.bannerAction')} ›</span></a>`).join('');
}
window.addEventListener('online', renderBanner);
window.addEventListener('offline', renderBanner);

// ---------- router ----------
async function route() {
  const { path, q } = parseHash();
  $app.style.paddingBottom = '';
  stopRequestPoll();
  renderChrome(path);
  renderBanner();
  window.scrollTo(0, 0);
  try {
    if (path === '/registro') return await viewRegister(q.get('invite') || '');
    if (path === '/restablecer') return viewReset(q.get('token') || '');
    if (path === '/admin') return await viewAdmin(q.get('tab') || 'inv');
    if (!state.user) return viewLogin();
    if (path === '/solicitud') return await viewRequest(Number(q.get('id')));
    if (path === '/calendario') return await viewCalendar(q);
    if (path === '/mis-apartados') return await viewMine();
    if (path === '/actividad') return await viewActivity();
    if (path === '/ajustes') return viewSettings();
    return await viewHome();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) { state.user = null; return viewLogin(); }
    $app.innerHTML = `<div class="card error">${esc(errorMsg(err))}</div>`;
  }
}

// ---------- autenticación ----------
const authShell = (inner) => `<div class="auth"><div class="logo"><img src="icons/plaza-city-logo.png" alt="Plaza City" width="148" height="148"><h1 class="sr-only">Plaza City</h1><div class="muted">${t('app.subtitle')}</div></div>${inner}</div>`;
function bindForm(sel, fn) {
  const f = $app.querySelector(sel);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button[type=submit], button:not([type])');
    if (btn) btn.disabled = true;
    try { await fn(Object.fromEntries(new FormData(f)), f); } catch (err) {
      const box = f.querySelector('.err');
      if (box) box.innerHTML = `<div class="error" role="alert">${esc(errorMsg(err))}</div>`; else toast(errorMsg(err));
    } finally { if (btn) btn.disabled = false; }
  };
}
async function signedIn(user) {
  if (langChosenWhileLoggedOut && user.lang !== getLang()) {
    try { user = (await api.post('me', { lang: getLang() })).user; } catch {}
  }
  langChosenWhileLoggedOut = false;
  state.user = user; setLang(user.lang);
  await refreshConfig();
}

function viewLogin() {
  $app.innerHTML = authShell(`<div class="card"><h2>${t('auth.login')}</h2>
    <form id="f"><label class="field"><span>${t('auth.email')}</span><input name="email" type="email" required autocomplete="email"></label>
    <label class="field"><span>${t('auth.password')}</span><input name="password" type="password" required autocomplete="current-password"></label>
    <div class="err"></div><button class="btn primary block">${t('auth.enter')}</button></form>
    <p class="muted small" style="margin-top:14px">${t('auth.onlyInvite')}</p></div>`);
  bindForm('#f', async (data) => { const r = await api.post('login', data); await signedIn(r.user); go('#/'); });
}

async function viewRegister(token) {
  $app.innerHTML = authShell(`<div class="card">${t('common.loading')}</div>`);
  let inv;
  try { inv = await api.get('invite&token=' + encodeURIComponent(token)); } catch {
    $app.innerHTML = authShell(`<div class="card"><div class="error">${t('auth.inviteInvalid')}</div><a class="btn block" href="#/">${t('auth.login')}</a></div>`);
    return;
  }
  $app.innerHTML = authShell(`<div class="card"><h2>${t('auth.register')}</h2>
    ${inv.label ? `<div class="notice">${t('auth.inviteFor')}: <b>${esc(inv.label)}</b>${inv.access_until ? '<br>' + t('auth.accessUntil', { date: fmtDate(inv.access_until, { day: 'numeric', month: 'long', year: 'numeric' }) }) : ''}</div>` : ''}
    <form id="f"><input type="hidden" name="token" value="${esc(token)}">
    <label class="field"><span>${t('auth.name')}</span><input name="name" required autocomplete="name"></label>
    <label class="field"><span>${t('auth.company')}</span><input name="company" autocomplete="organization"></label>
    <label class="field"><span>${t('auth.suite')}</span><input name="suite"></label>
    <label class="field"><span>${t('auth.email')}</span><input name="email" type="email" required autocomplete="email"></label>
    <label class="field"><span>${t('auth.password8')}</span><input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
    <label class="field"><span>${t('set.lang')}</span><select name="lang"><option value="es" ${getLang() === 'es' ? 'selected' : ''}>Español</option><option value="en" ${getLang() === 'en' ? 'selected' : ''}>English</option></select></label>
    <div class="err"></div><button class="btn primary block">${t('auth.register')}</button></form>
    <p class="small" style="margin-top:12px">${t('auth.haveAccount')} <a href="#/">${t('auth.login')}</a></p></div>`);
  bindForm('#f', async (data) => { const r = await api.post('register', data); await signedIn(r.user); go('#/ajustes'); });
}

function viewReset(token) {
  $app.innerHTML = authShell(`<div class="card"><h2>${t('auth.reset')}</h2>
    <form id="f"><input type="hidden" name="token" value="${esc(token)}">
    <label class="field"><span>${t('auth.password8')}</span><input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
    <div class="err"></div><button class="btn primary block">${t('auth.resetBtn')}</button></form></div>`);
  bindForm('#f', async (data) => { const r = await api.post('reset', data); await signedIn(r.user); toast(t('auth.resetDone')); go('#/'); });
}

// ---------- inicio ----------
async function viewHome() {
  const r = state.config.rules;
  $app.innerHTML = `<h1>${t('home.title', { name: esc(state.user.name.split(' ')[0]) })}</h1>
    <div id="pushtip"></div>
    <div class="card" id="next">${t('common.loading')}</div>
    <div class="card week"><h2>${t('home.week')}</h2><div id="overview">${t('common.loading')}</div></div>
    <div class="card"><h2>${t('home.rules')}</h2><ul class="small stack" style="padding-left:18px;margin:0">
      <li>${t('rules.hours')}</li><li>${t('rules.conference')}</li><li>${t('rules.atrium')}</li><li>${t('rules.sunday')}</li>
      <li>${t('rules.window', { days: r.booking_window_days, max: r.max_hours_per_booking, quota: r.max_hours_per_user_per_day })}</li>
      <li>${t('rules.checkin', { before: r.checkin_opens_minutes_before, grace: r.checkin_grace_minutes })}</li><li>${t('rules.cancel')}</li></ul></div>`;
  if (!state.pushSubscribed && state.config.push.enabled && pushSupported() && Notification.permission !== 'denied') {
    $app.querySelector('#pushtip').innerHTML = `<div class="card tight row between"><span class="small">${t('home.pushTip')}</span><button class="btn primary sm" id="ptb">${t('home.pushTipBtn')}</button></div>`;
    $app.querySelector('#ptb').onclick = async () => { try { await subscribePush(); route(); } catch (e) { toast(e.message); } };
  }
  const [mine, ov] = await Promise.all([api.get('bookings/mine'), api.get('overview&days=7')]);
  const next = mine.bookings.filter((b) => b.status === 'active').sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
  $app.querySelector('#next').innerHTML = `<h2>${t('home.next')}</h2>` + (next ? bookingCard(next) : `<p class="muted">${t('home.none')}</p>`) +
    `<a class="btn primary block" style="margin-top:10px" href="#/calendario">${t('home.book')}</a>`;
  $app.querySelector('#overview').innerHTML = `<div class="tablewrap"><table class="overview"><thead><tr><th>${t('home.day')}</th>${state.config.spaces.map((s) => `<th title="${spaceName(s.id)}">${t('spaceShort.' + s.id)}</th>`).join('')}</tr></thead><tbody>
    ${ov.days.map((d) => `<tr><td><b>${fmtDate(d.date, { weekday: 'short', day: 'numeric' })}</b></td>${d.spaces.map((s) => {
      if (!s.open) {
        const free = ['sunday', 'holiday', 'closure_free'].includes(s.reason);
        const sub = s.holiday ? holidayName(s.holiday) : s.closure ? s.closure.reason : '';
        return `<td><a class="cell" href="#/calendario?space=${s.id}&date=${d.date}"><span class="chip ${free ? 'free' : 'past'}">${free ? t('home.freeUse') : t('home.closed')}</span>${sub ? `<span class="small muted clamp">${esc(sub)}</span>` : ''}</a></td>`;
      }
      const full = s.booked >= s.total;
      return `<td><a class="cell" href="#/calendario?space=${s.id}&date=${d.date}" aria-label="${spaceName(s.id)}: ${t('home.hoursBookedLong', { booked: s.booked, total: s.total })}"><span>${t('home.hoursBooked', { booked: s.booked, total: s.total })}</span><span class="bar ${full ? 'full' : ''}" aria-hidden="true"><i style="width:${Math.round((s.booked / s.total) * 100)}%"></i></span></a></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
  bindBookingActions();
}

// ---------- calendario ----------
const cal = { space: 'conference', date: null, sel: [], weekFrom: null, week: [], view: null };
async function viewCalendar(q) {
  const today = state.config.today;
  if (state.config.spaces.some((s) => s.id === q.get('space'))) cal.space = q.get('space');
  cal.date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : cal.date || today;
  if (cal.date < today) cal.date = today;
  if (!cal.weekFrom || cal.date < cal.weekFrom || cal.date > addDays(cal.weekFrom, 6)) cal.weekFrom = cal.date;
  cal.sel = [];
  $app.innerHTML = `<h1>${t('cal.title')}</h1>
    <div class="tabs" id="tabs" role="tablist">${state.config.spaces.map((s) => `<button class="tab ${s.id === cal.space ? 'active' : ''}" role="tab" aria-selected="${s.id === cal.space}" data-space="${s.id}">${spaceName(s.id)}</button>`).join('')}</div>
    <div class="row between" style="margin-top:10px"><button class="btn sm" id="prev" aria-label="${t('cal.prevWeek')}">‹ ${t('cal.prevWeek')}</button><button class="btn sm ghost" id="today">${t('cal.today')}</button><button class="btn sm" id="next" aria-label="${t('cal.nextWeek')}">${t('cal.nextWeek')} ›</button></div>
    <div class="daystrip" id="strip"></div>
    <div class="card" id="day">${t('common.loading')}</div>
    <div class="card tight small"><b>${t('cal.legend')}:</b> <span class="chip free">${t('cal.free')}</span> <span class="chip busy">${t('cal.busy')}</span> <span class="chip mine">${t('cal.mine')}</span> <span class="chip past">${t('cal.past')}</span> <span class="chip special">${t('cal.special')}</span></div>
    <div id="confirm"></div>`;
  $app.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('[data-space]'); if (b) { cal.space = b.dataset.space; syncHash(); } };
  $app.querySelector('#prev').onclick = () => { const p = addDays(cal.weekFrom, -7); cal.weekFrom = p < today ? today : p; cal.date = cal.weekFrom; cal.sel = []; syncHash(true); loadWeek(); };
  $app.querySelector('#next').onclick = () => { cal.weekFrom = addDays(cal.weekFrom, 7); cal.date = cal.weekFrom; cal.sel = []; syncHash(true); loadWeek(); };
  $app.querySelector('#today').onclick = () => { cal.weekFrom = today; cal.date = today; cal.sel = []; syncHash(true); loadWeek(); };
  await loadWeek();
}
function syncHash(silent) {
  const h = `#/calendario?space=${cal.space}&date=${cal.date}`;
  if (silent) history.replaceState(null, '', h); else go(h);
}
async function loadWeek() {
  const r = await api.get(`week&space=${cal.space}&from=${cal.weekFrom}`);
  cal.week = r.days;
  renderStrip(); renderDay();
}
function renderStrip() {
  const today = state.config.today;
  const $s = $app.querySelector('#strip');
  $s.innerHTML = cal.week.map((d) => {
    const booked = d.hours.filter((h) => h.booking).length;
    const dot = !d.open ? (d.freeUse ? 'free-day' : 'closed') : booked === 0 ? '' : booked >= d.hours.length ? 'full' : 'some';
    return `<button data-date="${d.date}" class="${d.date === cal.date ? 'active' : ''} ${d.date === today ? 'today' : ''}" aria-pressed="${d.date === cal.date}"><small>${fmtDate(d.date, { weekday: 'short' })}</small><b>${d.date.slice(8)}</b><span class="dot ${dot}"></span></button>`;
  }).join('');
  $s.onclick = (e) => { const b = e.target.closest('[data-date]'); if (b) { cal.date = b.dataset.date; cal.sel = []; syncHash(true); renderStrip(); renderDay(); } };
}
function renderDay() {
  const d = cal.week.find((x) => x.date === cal.date) || cal.week[0];
  cal.view = d;
  const $day = $app.querySelector('#day');
  const head = `<div class="row between"><h2 style="margin:0">${fmtDate(d.date)}</h2><span class="muted small">${spaceName(cal.space)}</span></div>`;
  if (!d.open) {
    const msg = d.reason === 'sunday' ? t('cal.sunday')
      : d.reason === 'holiday' ? t('cal.holiday', { name: esc(holidayName(d.holiday)) })
      : d.reason === 'closure' ? t('cal.closure', { reason: esc(d.closure.reason || '—') })
      : d.reason === 'closure_free' ? t('cal.closureFree', { reason: esc(d.closure.reason || '—') })
      : t('cal.closedDay');
    $day.innerHTML = head + `<div class="freeuse">${d.freeUse ? `<div class="chip free">${t('home.freeUse')}</div><div class="big">${t('cal.freeUseTitle')}</div>` : `<div class="chip past">${t('home.closed')}</div>`}<p class="muted">${msg}</p></div>`;
    renderConfirm(); return;
  }
  const myHold = d.hours.find((h) => h.hold && h.hold.mine);
  $day.innerHTML = head + (myHold ? `<div class="success small">${t('req.holdMine', { time: myHold.hold.until })}</div>` : '') + requestPanel(d)
    + `<p class="muted small">${t('cal.tapHours', { max: state.config.rules.max_hours_per_booking })}</p><div class="hours">` + hourRows(d) + '</div>';
  $day.querySelectorAll('.hour.free').forEach((el) => { el.onclick = () => toggleHour(Number(el.dataset.hour)); });
  bindRequestPanel($day);
  renderConfirm();
}

// Las horas de un mismo apartado se pintan como un solo bloque del mismo color (2 h = alto de 2 horas, etc.).
function hourRows(d) {
  const out = [];
  for (let i = 0; i < d.hours.length; i++) {
    const h = d.hours[i];
    const b = h.booking;
    if (b) {
      const run = [h];
      while (d.hours[i + 1]?.booking?.id === b.id) run.push(d.hours[++i]);
      out.push(bookingBlock(b, run));
      continue;
    }
    const heldOther = h.hold && !h.hold.mine;
    const cls = heldOther ? 'busy' : h.past ? 'past' : 'free';
    const who = heldOther ? t('req.heldFor', { name: esc(h.hold.name), time: h.hold.until })
      : h.hold && h.hold.mine ? t('req.heldForYou', { time: h.hold.until })
      : h.past ? t('cal.past') : t('cal.free');
    const tag = h.kind === 'special' ? `<span class="kind" title="${t('cal.special')}">${t('cal.specialShort')}</span>` : '';
    out.push(`<button class="hour ${cls} ${cal.sel.includes(h.hour) ? 'selected' : ''}" data-hour="${h.hour}" ${cls !== 'free' ? 'disabled' : ''} aria-pressed="${cal.sel.includes(h.hour)}"><span class="t">${hh(h.hour)}</span><span class="who">${who}</span>${tag}</button>`);
  }
  return out.join('');
}
function bookingBlock(b, run) {
  const n = run.length;
  const from = run[0].hour, to = run[n - 1].hour + 1;
  const who = `${esc(b.user_name)}${b.user_company ? ' · ' + esc(b.user_company) : ''}${b.note ? ' — ' + esc(b.note) : ''}`;
  const tag = b.checked_in ? `<span class="chip info">${t('cal.checkedIn')}</span>` : run[0].kind === 'special' ? `<span class="kind" title="${t('cal.special')}">${t('cal.specialShort')}</span>` : '';
  // Un solo botón de Google Calendar por apartado, dentro del bloque.
  const link = b.mine && b.calendar ? `<a class="gcal" href="${esc(gcalUrl(b))}" target="_blank" rel="noopener" aria-label="${t('cal.gcalLong')}" title="${t('cal.gcalLong')}">${ICONS.gcal}<span>${t('cal.gcal')}</span></a>` : '';
  const times = run.map((x, i) => `<span class="t" style="grid-row:${i + 1}">${hh(x.hour)}</span>`).join('');
  return `<div class="hour block ${b.mine ? 'mine' : 'busy'}" style="--n:${n}" data-hour="${from}" role="group" aria-label="${hh(from)}–${hh(to)}">${times}<span class="info"><span class="who">${who}</span>${tag}</span>${link}</div>`;
}

// Abre Google Calendar con el evento ya lleno; las horas van en UTC para que no dependa de la zona del teléfono.
function gcalUrl(b) {
  const utc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const name = `Plaza City · ${spaceName(cal.space)}`;
  const checkin = new URL('#/mis-apartados', location.href).href;
  const details = `${b.note ? b.note + '\n\n' : ''}${t('cal.gcalDetails')}: ${checkin}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: name, dates: `${utc(b.calendar.start_at)}/${utc(b.calendar.end_at)}`, location: name, details, ctz: state.config.timezone || 'America/Chicago' });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// ---------- solicitudes de espacio (quien pide) ----------
let reqPoll = null;
let reqTick = null;
function stopRequestPoll() { clearInterval(reqPoll); clearInterval(reqTick); reqPoll = reqTick = null; }
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
function requestPanel(d) {
  if (d.date !== state.config.today) return '';
  const h = d.hours.find((x) => x.booking && !x.booking.mine && (x.booking.requestable || x.booking.my_request));
  if (!h) return '';
  const b = h.booking;
  const name = esc(b.user_name);
  const mins = state.config.rules.request_response_minutes;
  if (b.my_request && b.my_request.status === 'pending') {
    return `<div class="reqpanel" data-req="${b.my_request.id}"><b>${t('req.waitingTitle', { name })}</b>
      <p class="small">${t('req.waitingText', { mins })}</p><div class="countdown" aria-live="polite">…</div></div>`;
  }
  if (b.my_request && b.my_request.status === 'declined') {
    return `<div class="reqpanel done"><b>${t('req.declinedTitle', { name })}</b><p class="small">${t('req.declinedText')}</p></div>`;
  }
  if (b.requestable) {
    return `<div class="reqpanel"><b>${t('req.askTitle', { space: spaceName(cal.space) })}</b>
      <p class="small">${t('req.askText', { name, mins, hold: state.config.rules.request_hold_minutes })}</p>
      <button class="btn primary" id="askBtn" data-booking="${b.id}">${t('req.askBtn')}</button></div>`;
  }
  return '';
}
function bindRequestPanel(root) {
  root.querySelector('#askBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const r = await api.post(`bookings/${btn.dataset.booking}/request`);
      toast(t('req.sent', { name: r.request.holder_name }));
      await loadWeek();
    } catch (err) { toast(errorMsg(err)); btn.disabled = false; }
  });
  const panel = root.querySelector('.reqpanel[data-req]');
  if (panel && !reqPoll) watchRequest(Number(panel.dataset.req), () => loadWeek());
}
function watchRequest(id, onChange) {
  stopRequestPoll();
  let left = null;
  const paint = () => { const el = document.querySelector(`[data-req="${id}"] .countdown`); if (el && left !== null) el.textContent = t('req.countdown', { t: mmss(left) }); };
  const check = async () => {
    try {
      const { request } = await api.get(`requests/${id}`);
      if (request.status !== 'pending') {
        stopRequestPoll();
        if (request.role === 'requester') toast(request.status === 'declined' ? t('req.declinedToast', { name: request.holder_name }) : t('req.grantedToast'));
        onChange(request);
        return;
      }
      left = request.seconds_left; paint();
    } catch { /* sin conexión: se reintenta */ }
  };
  reqPoll = setInterval(check, 4000);
  reqTick = setInterval(() => { if (left !== null && left > 0) { left -= 1; paint(); if (left === 0) check(); } }, 1000);
  check();
}

// ---------- solicitudes de espacio (quien apartó) ----------
async function viewRequest(id) {
  $app.innerHTML = `<h1>${t('req.title')}</h1><div id="reqbox" class="card">${t('common.loading')}</div>`;
  const { request: r } = await api.get(`requests/${id}`);
  if (r.role === 'requester') { go(`#/calendario?space=${r.space_id}&date=${r.date}`); return; }
  const $b = $app.querySelector('#reqbox');
  const who = esc(r.requester_name) + (r.requester_company ? ` (${esc(r.requester_company)})` : '');
  const when = `${spaceName(r.space_id)} · ${fmtDate(r.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${hh(r.start_hour)}–${hh(r.end_hour)}`;
  if (r.status === 'pending') {
    $b.dataset.req = r.id;
    $b.innerHTML = `<h2>${t('req.holderTitle', { who, space: spaceName(r.space_id) })}</h2><p class="muted small">${when}</p>
      <p>${t('req.holderText', { mins: state.config.rules.request_response_minutes })}</p>
      <div class="countdown big" aria-live="polite">…</div>
      <div class="row"><button class="btn primary" id="relBtn">${t('req.release')}</button><button class="btn" id="keepBtn">${t('req.keep')}</button></div>`;
    const act = async (action) => {
      $b.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      try { await api.post(`requests/${id}/${action}`); toast(action === 'release' ? t('req.releasedToast') : t('req.keptToast')); } catch (err) { toast(errorMsg(err)); }
      await refreshConfig(); viewRequest(id);
    };
    $b.querySelector('#relBtn').onclick = () => act('release');
    $b.querySelector('#keepBtn').onclick = () => act('keep');
    watchRequest(id, async () => { await refreshConfig(); viewRequest(id); });
  } else {
    const msg = { released: 'req.doneReleased', declined: 'req.doneKept', expired: 'req.doneExpired', closed: 'req.doneClosed' }[r.status] || 'req.doneClosed';
    $b.innerHTML = `<h2>${t(msg, { who })}</h2><p class="muted small">${when}</p><a class="btn" href="#/mis-apartados">${t('mine.title')}</a>`;
  }
  renderBanner();
}
function toggleHour(h) {
  const max = state.config.rules.max_hours_per_booking;
  const free = cal.view.hours.filter((x) => !x.booking && !x.past).map((x) => x.hour);
  if (cal.sel.includes(h)) {
    const lo = Math.min(...cal.sel), hi = Math.max(...cal.sel);
    cal.sel = h === lo || h === hi ? cal.sel.filter((x) => x !== h) : [h];
  } else if (!cal.sel.length) cal.sel = [h];
  else {
    const lo = Math.min(...cal.sel, h), hi = Math.max(...cal.sel, h);
    const range = []; for (let x = lo; x <= hi; x++) range.push(x);
    cal.sel = range.length <= max && range.every((x) => free.includes(x)) ? range : [h];
  }
  renderDay();
}
function renderConfirm() {
  const $c = $app.querySelector('#confirm');
  if (!cal.sel.length) { $c.innerHTML = ''; $app.style.paddingBottom = ''; return; }
  const lo = Math.min(...cal.sel), hi = Math.max(...cal.sel) + 1;
  $c.innerHTML = `<div class="confirmbar" role="region" aria-label="${t('cal.confirm')}"><div class="inner"><div class="txt"><b>${t('cal.selected', { space: spaceName(cal.space), date: fmtDate(cal.date, { weekday: 'short', day: 'numeric', month: 'short' }), from: hh(lo), to: hh(hi), n: hi - lo })}</b></div>
    <input id="note" class="input" maxlength="120" placeholder="${t('cal.note')}" aria-label="${t('cal.note')}">
    <div class="actions"><button class="btn ghost" id="clear">${t('cal.clear')}</button><button class="btn primary" id="ok">${t('cal.confirm')}</button></div></div></div>`;
  // Reserva espacio al final de la página para que la barra no tape las últimas horas.
  $app.style.paddingBottom = `${$c.querySelector('.confirmbar').offsetHeight + 16}px`;
  $c.querySelector('#clear').onclick = () => { cal.sel = []; renderDay(); };
  $c.querySelector('#ok').onclick = async () => {
    const btn = $c.querySelector('#ok'); btn.disabled = true;
    try {
      await api.post('bookings', { space: cal.space, date: cal.date, startHour: lo, endHour: hi, note: $c.querySelector('#note').value });
      toast(t('cal.booked')); cal.sel = []; await loadWeek();
    } catch (err) { toast(errorMsg(err)); btn.disabled = false; cal.sel = []; await loadWeek(); }
  };
}

// ---------- mis apartados ----------
function bookingCard(b) {
  const now = Date.now();
  const started = now >= Date.parse(b.start_at);
  const canCheckin = b.status === 'active' && !b.checked_in_at && now >= b.checkin.opens && now <= b.checkin.closes;
  const reasonKey = b.released_reason && ['no_show', 'ended_early', 'closure', 'user_disabled', 'request', 'request_timeout'].includes(b.released_reason) ? b.released_reason : b.status;
  const chip = b.status === 'active' ? (b.checked_in_at ? 'info' : 'mine') : b.status === 'completed' ? 'free' : 'past';
  let actions = '';
  if (b.status === 'active') {
    if (b.checked_in_at) actions += `<span class="chip info">${t('mine.checkedIn')}</span>`;
    else if (canCheckin) actions += `<button class="btn primary sm" data-act="checkin" data-id="${b.id}">${t('mine.checkin')}</button>`;
    else if (now < b.checkin.opens) actions += `<span class="muted small">${t('mine.checkinAt', { time: fmtTime(b.checkin.opens) })}</span>`;
    actions += started ? `<button class="btn danger sm" data-act="release" data-id="${b.id}">${t('mine.release')}</button>` : `<button class="btn danger sm" data-act="cancel" data-id="${b.id}">${t('mine.cancel')}</button>`;
    if (!started) actions += `<a class="btn ghost sm" href="api.php?r=bookings/${b.id}/ics" download>${t('mine.ics')}</a>`;
  }
  const warn = b.status === 'active' && !b.checked_in_at && now < b.checkin.closes ? `<div class="small warn">${t('mine.noShowWarning', { time: fmtTime(b.checkin.closes) })}</div>` : '';
  return `<div class="item"><div class="row between"><div class="title">${spaceName(b.space_id)}</div><span class="chip ${chip}">${t('status.' + reasonKey)}</span></div>
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
        await api.post(`bookings/${id}/${act}`);
        toast(act === 'checkin' ? t('cal.checkedIn') : act === 'cancel' ? t('mine.cancelled') : t('mine.released'));
        route();
      } catch (err) { toast(errorMsg(err)); btn.disabled = false; }
    };
  });
}
async function viewMine() {
  $app.innerHTML = `<h1>${t('mine.title')}</h1><div id="list">${t('common.loading')}</div>`;
  const r = await api.get('bookings/mine');
  const active = r.bookings.filter((b) => b.status === 'active').sort((a, b) => a.start_at.localeCompare(b.start_at));
  const past = r.bookings.filter((b) => b.status !== 'active');
  $app.querySelector('#list').innerHTML = r.bookings.length
    ? `<div class="card"><h2>${t('mine.upcoming')}</h2><div class="list">${active.map(bookingCard).join('') || `<p class="muted">${t('home.none')}</p>`}</div></div>
       ${past.length ? `<div class="card"><h2>${t('mine.history')}</h2><div class="list">${past.map(bookingCard).join('')}</div></div>` : ''}`
    : `<div class="card"><p class="muted">${t('mine.none')}</p><a class="btn primary" href="#/calendario">${t('home.book')}</a></div>`;
  bindBookingActions();
}

// ---------- bitácora ----------
async function viewActivity() {
  $app.innerHTML = `<h1>${t('act.title')}</h1><p class="muted small">${t('act.desc')}</p><div class="list" id="list"></div><div style="margin-top:12px"><button class="btn block" id="more">${t('act.more')}</button></div>`;
  let before = 0;
  const load = async () => {
    const r = await api.get(`activity&limit=50${before ? '&before=' + before : ''}`);
    const $l = $app.querySelector('#list');
    if (!r.items.length && !before) $l.innerHTML = `<p class="muted">${t('act.none')}</p>`;
    for (const it of r.items) {
      const who = `<b>${esc(it.user_name || '—')}</b>${it.user_company ? ' (' + esc(it.user_company) + ')' : ''}`;
      const space = `<b>${spaceName(it.space_id)}</b>`;
      let text;
      if (it.type === 'closure') {
        const [kind, ...rest] = String(it.detail || '').split(': ');
        text = t('act.closure', { space, kind: t('act.kind_' + (kind === 'free_use' ? 'free_use' : 'closed')) }) + (rest.length ? ` — ${esc(rest.join(': '))}` : '');
      } else if (it.type === 'cancelled' && (it.detail === 'closure' || it.detail === 'user_disabled')) {
        text = t('act.cancelled_' + it.detail, { who, space });
      } else if (it.type.startsWith('request_')) {
        text = t('act.' + it.type, { who, space, other: `<b>${esc(it.detail || '—')}</b>` });
      } else text = t('act.' + it.type, { who, space });
      const when = it.date ? `${fmtDate(it.date, { weekday: 'short', day: 'numeric', month: 'short' })}${it.start_hour !== null ? ` · ${hh(it.start_hour)}–${hh(it.end_hour)} · ${t('act.duration', { n: it.hours })}` : ''}` : '';
      $l.insertAdjacentHTML('beforeend', `<div class="item act-${esc(it.type)}"><div>${text}</div><div class="meta">${when}${when ? ' · ' : ''}${fmtDateTime(it.created_at)}</div></div>`);
      before = it.id;
    }
    if (r.items.length < 50) $app.querySelector('#more').classList.add('hidden');
  };
  $app.querySelector('#more').onclick = () => load().catch((e) => toast(errorMsg(e)));
  await load();
}

// ---------- ajustes ----------
const pushSupported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function viewSettings() {
  const u = state.user;
  $app.innerHTML = `<h1>${t('set.title')}</h1>
    <div class="card"><h2>${t('set.push')}</h2><p class="muted small">${t('set.pushDesc')}</p><div id="push"></div></div>
    <div class="card hidden" id="install"><h2>${t('set.install')}</h2><p class="muted small">${t('set.installDesc')}</p><div id="installBody"></div></div>
    <div class="card"><h2>${t('set.profile')}</h2><form id="pf">
      <label class="field"><span>${t('auth.name')}</span><input name="name" value="${esc(u.name)}" required></label>
      <label class="field"><span>${t('auth.company')}</span><input name="company" value="${esc(u.company)}"></label>
      <label class="field"><span>${t('auth.suite')}</span><input name="suite" value="${esc(u.suite)}"></label>
      <label class="field"><span>${t('set.lang')}</span><select name="lang"><option value="es" ${getLang() === 'es' ? 'selected' : ''}>Español</option><option value="en" ${getLang() === 'en' ? 'selected' : ''}>English</option></select></label>
      <div class="err"></div><div class="row"><button class="btn primary">${t('set.save')}</button><span class="muted small">${esc(u.email)}</span></div></form></div>
    <div class="card"><h2>${t('set.password')}</h2><form id="pw">
      <label class="field"><span>${t('set.current')}</span><input name="current" type="password" required autocomplete="current-password"></label>
      <label class="field"><span>${t('set.new')}</span><input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
      <div class="err"></div><button class="btn">${t('set.save')}</button></form></div>
    <div class="card"><h2>${t('set.admin')}</h2><a class="btn" href="#/admin">${t('set.adminLink')}</a></div>
    <div class="card"><button class="btn danger block" id="logout">${t('auth.logout')}</button></div>`;
  const $push = $app.querySelector('#push');
  const renderPush = () => {
    if (!state.config.push.enabled) return ($push.innerHTML = `<div class="notice">${t('set.pushDisabledServer')}</div>`);
    if (!window.isSecureContext) return ($push.innerHTML = `<div class="notice">${t('set.pushInsecure')}</div>`);
    if (!pushSupported()) return ($push.innerHTML = `<div class="notice">${t('set.pushUnsupported')}</div>`);
    if (Notification.permission === 'denied') return ($push.innerHTML = `<div class="error">${t('set.pushDenied')}</div>`);
    $push.innerHTML = state.pushSubscribed
      ? `<div class="success">${t('set.pushActive')}</div><div class="row"><button class="btn" id="pushOff">${t('set.pushOff')}</button><button class="btn ghost" id="pushTest">${t('set.pushTest')}</button></div>`
      : `<button class="btn primary" id="pushOn">${t('set.pushOn')}</button>`;
    $push.querySelector('#pushOn')?.addEventListener('click', async () => { try { await subscribePush(); renderPush(); } catch (e) { toast(e.message); } });
    $push.querySelector('#pushOff')?.addEventListener('click', async () => { await unsubscribePush(); renderPush(); });
    $push.querySelector('#pushTest')?.addEventListener('click', async () => { try { const r = await api.post('push/test'); toast(`OK ${r.sent}/${r.sent + r.failed}`); } catch (e) { toast(errorMsg(e)); } });
  };
  renderPush();
  if (!isStandalone() && (deferredInstall || isIos())) {
    $app.querySelector('#install').classList.remove('hidden');
    $app.querySelector('#installBody').innerHTML = deferredInstall ? `<button class="btn" id="installBtn">${t('set.install')}</button>` : `<p class="small">${t('set.installIos')}</p>`;
    $app.querySelector('#installBtn')?.addEventListener('click', () => deferredInstall.prompt());
  }
  bindForm('#pf', async (data) => { const r = await api.post('me', data); state.user = r.user; setLang(r.user.lang); toast(t('set.saved')); route(); });
  bindForm('#pw', async (data, f) => { await api.post('password', data); f.reset(); toast(t('set.changed')); });
  $app.querySelector('#logout').onclick = async () => { try { await unsubscribePush(); } catch {} await api.post('logout'); state.user = null; state.pushSubscribed = false; go('#/'); };
}

// ---------- administración (dueño) ----------
const ownerH = () => ({ 'X-Owner-Key': state.ownerKey });
function forgetOwner() { state.ownerKey = ''; try { sessionStorage.removeItem('pcb.ownerKey'); } catch {} }
async function viewAdmin(tab) {
  if (!state.ownerKey) return adminLogin();
  try { await api.get('owner/check', ownerH()); } catch (err) { forgetOwner(); return adminLogin(errorMsg(err)); }
  const tabs = [['inv', 'adm.tabInv'], ['users', 'adm.tabUsers'], ['closures', 'adm.tabClosures'], ['stats', 'adm.tabStats']];
  $app.innerHTML = `<div class="row between"><h1>${t('adm.title')}</h1><div class="row"><a class="btn sm ghost" href="#/">${t('nav.home')}</a><button class="btn sm" id="leave">${t('adm.leave')}</button></div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a class="tab ${tab === k ? 'active' : ''}" role="tab" href="#/admin?tab=${k}">${t(l)}</a>`).join('')}</div>
    <div id="panel" style="margin-top:12px">${t('common.loading')}</div>`;
  $app.querySelector('#leave').onclick = () => { forgetOwner(); go(state.user ? '#/ajustes' : '#/'); };
  const $p = $app.querySelector('#panel');
  if (tab === 'users') return adminUsers($p);
  if (tab === 'closures') return adminClosures($p);
  if (tab === 'stats') return adminStats($p);
  return adminInvites($p);
}
function adminLogin(msg = '') {
  $app.innerHTML = authShell(`<div class="card"><h2>${t('adm.title')}</h2><p class="muted small">${t('adm.desc')}</p>${msg ? `<div class="error">${esc(msg)}</div>` : ''}
    <form id="k"><label class="field"><span>${t('adm.key')}</span><input name="key" type="password" required autocomplete="current-password"></label><button class="btn primary block">${t('adm.unlock')}</button></form>
    <p class="small" style="margin-top:10px"><a href="#/">${t('nav.home')}</a></p></div>`);
  $app.querySelector('#k').onsubmit = (e) => {
    e.preventDefault();
    state.ownerKey = new FormData(e.target).get('key');
    try { sessionStorage.setItem('pcb.ownerKey', state.ownerKey); } catch {}
    route();
  };
}
async function adminInvites($p) {
  const { invites } = await api.get('owner/invites', ownerH());
  const badge = (s) => `<span class="chip ${s === 'active' ? 'free' : s === 'used' ? 'info' : 'past'}">${t('inv.' + s)}</span>`;
  $p.innerHTML = `<div class="card"><p class="muted small">${t('inv.desc')}</p><form id="c" class="grid cols-2">
      <label class="field span-2"><span>${t('inv.label')}</span><input name="label" maxlength="120"></label>
      <label class="field"><span>${t('inv.uses')}</span><input name="maxUses" type="number" min="1" max="500" value="1"></label>
      <label class="field"><span>${t('inv.days')}</span><input name="days" type="number" min="1" max="365" value="${state.config.rules.invite_default_days}"></label>
      <label class="field"><span>${t('inv.accessUntil')}</span><input name="accessUntil" type="date" min="${state.config.today}"></label>
      <div class="field" style="display:flex;align-items:end"><button class="btn primary block">${t('inv.create')}</button></div><div class="err span-2"></div></form><div id="new"></div></div>
    <div class="card"><div class="list">${invites.length ? '' : `<p class="muted">${t('inv.none')}</p>`}${invites.map((i) => `<div class="item"><div class="row between"><div class="title">${esc(i.label) || '#' + i.id}</div>${badge(i.status)}</div>
      <div class="meta">${t('inv.uses')}: ${i.uses}/${i.max_uses} · ${t('inv.expires')}: ${fmtDateTime(i.expires_at)}${i.access_until ? ` · ${t('usr.until')}: ${i.access_until}` : ''}</div>
      ${i.users.length ? `<div class="small muted">${t('inv.registered')}: ${i.users.map((u) => esc(u.name) + (u.company ? ' (' + esc(u.company) + ')' : '')).join(', ')}</div>` : ''}
      ${i.status === 'active' ? `<input class="input small" readonly value="${esc(i.url)}" style="margin-top:6px" aria-label="URL"><div class="row" style="margin-top:8px">${shareButtons(i.url)}<button class="btn sm danger" data-revoke="${i.id}">${t('inv.revoke')}</button></div>` : ''}</div>`).join('')}</div></div>`;
  bindForm('#c', async (data) => {
    const r = await api.post('owner/invites', data, ownerH());
    await adminInvites($p);
    $p.querySelector('#new').innerHTML = `<div class="success"><b>${t('inv.new')}:</b><input class="input" readonly value="${esc(r.invite.url)}" style="margin-top:6px"><div class="row" style="margin-top:6px">${shareButtons(r.invite.url)}</div></div>`;
    bindShare($p);
  });
  bindShare($p);
  $p.querySelectorAll('[data-revoke]').forEach((b) => { b.onclick = async () => { if (!confirm(t('inv.revoke') + '?')) return; await api.post(`owner/invites/${b.dataset.revoke}/revoke`, {}, ownerH()); adminInvites($p); }; });
}
function shareButtons(url) {
  return `<button class="btn sm" data-copy="${esc(url)}">${t('inv.copy')}</button>${navigator.share ? `<button class="btn sm" data-share="${esc(url)}">${t('inv.share')}</button>` : ''}`;
}
function bindShare(root) {
  root.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => copy(b.dataset.copy); });
  root.querySelectorAll('[data-share]').forEach((b) => { b.onclick = () => navigator.share({ title: 'Plaza City', url: b.dataset.share }).catch(() => {}); });
}
async function adminUsers($p) {
  const { users } = await api.get('owner/users', ownerH());
  $p.innerHTML = `<div class="card"><div class="list">${users.length ? '' : `<p class="muted">${t('usr.none')}</p>`}${users.map((u) => `<div class="item">
    <div class="row between"><div class="title">${esc(u.name)}</div><span class="chip ${u.disabled_at ? 'past' : 'free'}">${u.disabled_at ? t('usr.disabled') : t('usr.active')}</span></div>
    <div class="meta">${esc(u.email)}${u.company ? ' · ' + esc(u.company) : ''}${u.suite ? ' · ' + esc(u.suite) : ''}</div>
    <div class="meta">${t('usr.until')}: ${u.access_until || t('usr.noLimit')} · ${t('usr.lastSeen')}: ${fmtDateTime(u.last_seen_at)} · ${u.bookings} ${t('usr.bookings')} · ${u.no_shows} ${t('usr.noShows')} · ${u.devices} ${t('usr.devices')}</div>
    <div class="row" style="margin-top:8px">${u.disabled_at ? `<button class="btn sm" data-u="enable" data-id="${u.id}">${t('usr.enable')}</button>` : `<button class="btn sm danger" data-u="disable" data-id="${u.id}" data-name="${esc(u.name)}">${t('usr.disable')}</button><button class="btn sm" data-u="reset" data-id="${u.id}">${t('usr.reset')}</button>`}<button class="btn sm ghost" data-u="access" data-id="${u.id}" data-until="${esc(u.access_until || '')}">${t('usr.setUntil')}</button></div>
    <div class="resetbox"></div></div>`).join('')}</div></div>`;
  $p.querySelectorAll('[data-u]').forEach((b) => {
    b.onclick = async () => {
      const { u: act, id } = b.dataset;
      try {
        if (act === 'disable') { if (!confirm(t('usr.confirmDisable', { name: b.dataset.name }))) return; await api.post(`owner/users/${id}/disable`, {}, ownerH()); }
        if (act === 'enable') await api.post(`owner/users/${id}/enable`, {}, ownerH());
        if (act === 'access' || act === 'enable') {
          if (act === 'access') {
            const v = prompt(t('usr.promptUntil'), b.dataset.until);
            if (v === null) return;
            await api.post(`owner/users/${id}/access`, { accessUntil: v.trim() }, ownerH());
          }
        }
        if (act === 'reset') {
          const r = await api.post(`owner/users/${id}/reset`, {}, ownerH());
          const box = b.closest('.item').querySelector('.resetbox');
          box.innerHTML = `<div class="success small" style="margin-top:8px">${t('usr.resetLink')}<input class="input" readonly value="${esc(r.url)}" style="margin-top:6px"><div class="row" style="margin-top:6px">${shareButtons(r.url)}</div></div>`;
          bindShare(box);
          return;
        }
        adminUsers($p);
      } catch (err) { toast(errorMsg(err)); }
    };
  });
}
async function adminClosures($p) {
  const { closures } = await api.get('owner/closures', ownerH());
  $p.innerHTML = `<div class="card"><p class="muted small">${t('clo.desc')}</p><form id="c" class="grid cols-2">
      <label class="field"><span>${t('clo.date')}</span><input name="date" type="date" min="${state.config.today}" required></label>
      <label class="field"><span>${t('clo.space')}</span><select name="space"><option value="">${t('clo.all')}</option>${state.config.spaces.map((s) => `<option value="${s.id}">${spaceName(s.id)}</option>`).join('')}</select></label>
      <label class="field"><span>${t('clo.kind')}</span><select name="kind"><option value="closed">${t('clo.closed')}</option><option value="free_use">${t('clo.free')}</option></select></label>
      <label class="field"><span>${t('clo.reason')}</span><input name="reason" maxlength="120"></label>
      <div class="err span-2"></div><button class="btn primary span-2">${t('clo.add')}</button></form></div>
    <div class="card"><div class="list">${closures.length ? '' : `<p class="muted">${t('clo.none')}</p>`}${closures.map((c) => `<div class="item row between">
      <div><div class="title">${fmtDate(c.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</div><div class="meta">${spaceName(c.space_id)} · ${c.kind === 'free_use' ? t('clo.free') : t('clo.closed')}${c.reason ? ' · ' + esc(c.reason) : ''}</div></div>
      ${c.date >= state.config.today ? `<button class="btn sm danger" data-del="${c.id}">${t('clo.delete')}</button>` : ''}</div>`).join('')}</div></div>`;
  bindForm('#c', async (data) => { const r = await api.post('owner/closures', data, ownerH()); toast(t('clo.added', { n: r.cancelled })); adminClosures($p); });
  $p.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { await api.post(`owner/closures/${b.dataset.del}/delete`, {}, ownerH()); adminClosures($p); }; });
}
async function adminStats($p) {
  const s = await api.get('owner/stats&days=30', ownerH());
  $p.innerHTML = `<div class="card"><p class="muted small">${t('sta.desc')} (${s.from} → ${s.to})</p>
    <div class="stat-tiles"><div class="stat"><b>${s.users}</b><span>${t('sta.users')}</span></div><div class="stat"><b>${s.push_devices}</b><span>${t('sta.devices')}</span></div></div>
    <div class="list occ-list">${s.spaces.map((x) => {
      const pct = Math.round(x.occupancy * 100);
      return `<div class="item"><div class="row between"><b>${spaceName(x.id)}</b><b class="num">${pct}%</b></div>
        <div class="bar" role="img" aria-label="${t('sta.occ')} ${pct}%"><i style="width:${pct}%"></i></div>
        <div class="meta num">${t('sta.hours')}: ${x.hours} / ${x.available_hours} · ${t('sta.noShows')}: ${x.no_shows} · ${t('sta.cancelled')}: ${x.cancelled}</div></div>`;
    }).join('')}</div></div>
    <div class="card"><h2>${t('sta.byCompany')}</h2><div class="list">${s.companies.map((c) => `<div class="item row between"><span>${esc(c.company)}</span><b>${c.hours} h</b></div>`).join('') || '<p class="muted">—</p>'}</div></div>
    <div class="card"><button class="btn" id="csv">${t('sta.export')}</button></div>
    <div class="card"><h2>${t('hlt.title')}</h2><div class="list" id="health">${t('common.loading')}</div></div>`;
  api.get('owner/health', ownerH()).then((h) => {
    const mins = (s) => (s === null ? '—' : s < 120 ? `${s} s` : `${Math.round(s / 60)} min`);
    const row = (ok, label, detail) => `<div class="item row between"><span>${label}${detail ? `<div class="small muted">${detail}</div>` : ''}</span><span class="chip ${ok === true ? 'free' : ok === false ? 'busy' : 'past'}">${ok === true ? 'OK' : ok === false ? t('hlt.fix') : '?'}</span></div>`;
    const cronOk = h.last_cron_seconds !== null && h.last_cron_seconds < 15 * 60;
    $p.querySelector('#health').innerHTML = [
      row(h.https, t('hlt.https'), h.https ? '' : t('hlt.httpsFix')),
      row(h.push, t('hlt.push')),
      row(cronOk, t('hlt.cron'), h.last_cron_seconds === null ? t('hlt.cronNever') : t('hlt.cronAgo', { t: mins(h.last_cron_seconds) })),
      row(h.db_exposed === null ? null : !h.db_exposed, t('hlt.db'), h.db_exposed ? t('hlt.dbFix') : h.db_exposed === null ? t('hlt.dbUnknown') : h.db_inside_web ? t('hlt.dbInside') : t('hlt.dbOutside')),
      row(h.outbox_pending < 50, t('hlt.outbox'), String(h.outbox_pending)),
      `<div class="small muted">v${esc(h.version)} · PHP ${esc(h.php)} · SQLite ${esc(h.sqlite)} · ${h.db_size_kb ?? '—'} KB</div>`,
    ].join('');
  }).catch((err) => { $p.querySelector('#health').textContent = errorMsg(err); });
  $p.querySelector('#csv').onclick = async () => {
    try {
      const blob = await api.get('owner/export', ownerH());
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `plaza-city-apartados-${state.config.today}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) { toast(errorMsg(err)); }
  };
}

// ---------- push ----------
function urlB64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function subscribePush() {
  if (!pushSupported()) throw new Error(t('set.pushUnsupported'));
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(t('set.pushDenied'));
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(state.config.push.publicKey) });
  await api.post('push/subscribe', { subscription: sub.toJSON() });
  state.pushSubscribed = true;
}
async function unsubscribePush() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) { await api.post('push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
  state.pushSubscribed = false;
}

// ---------- arranque ----------
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
async function refreshConfig() {
  state.config = await api.get('config');
  state.user = state.config.user;
  state.pushSubscribed = state.config.pushSubscribed;
  if (state.user) setLang(state.user.lang);
  // Si el navegador ya tiene una suscripción que el servidor no conoce, la re-registramos.
  if (state.user && state.config.push.enabled && !state.pushSubscribed && pushSupported() && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await api.post('push/subscribe', { subscription: sub.toJSON() }); state.pushSubscribed = true; }
    } catch {}
  }
}
(async function boot() {
  if (window.top !== window.self) { document.body.innerHTML = ''; return; } // no permitir que otro sitio la incruste
  initLang();
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
  try { await refreshConfig(); } catch (err) {
    $app.innerHTML = `<div class="card error">${esc(errorMsg(err))}</div>`;
    return;
  }
  route();
  // Cada minuto: refresca "hoy" y re-dibuja vistas con tiempos (check-in, no-show).
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const c = await api.get('config');
      state.config.today = c.today;
      state.config.pendingRequests = c.pendingRequests || [];
      renderBanner();
      const { path } = parseHash();
      if (path === '/mis-apartados' || path === '/') route();
      // El calendario abierto se actualiza solo (p. ej. aparece "Pedir el espacio" al pasar los 15 min),
      // salvo que la persona esté seleccionando horas.
      else if (path === '/calendario' && cal.week.length && !cal.sel.length && !reqPoll) loadWeek().catch(() => {});
    } catch {}
  }, 30_000);
  // El service worker avisa cuando llega una notificación con la app abierta.
  navigator.serviceWorker?.addEventListener('message', async (e) => {
    if (e.data?.type !== 'push' || !state.user) return;
    try { await refreshConfig(); renderBanner(); } catch {}
    const { path } = parseHash();
    if (path === '/calendario' && cal.week.length) loadWeek().catch(() => {});
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || !state.user) return;
    try { await refreshConfig(); } catch {}
    const { path } = parseHash();
    if (['/', '/mis-apartados', '/calendario', '/solicitud'].includes(path)) route(); else renderBanner();
  });
})();
